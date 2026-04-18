/**
 * One-time data snapshot from production DB to staging DB.
 *
 * Usage:
 *   PROD_DB_URL="postgres://..." STAGING_DB_URL="postgres://..." npx tsx scripts/snapshot-to-staging.ts
 *
 * Get the URLs from Railway:
 *   - Switch to "production" environment → click Postgres → Variables → DATABASE_URL
 *   - Switch to "staging" environment → click Postgres → Variables → DATABASE_URL
 *
 * This copies ALL data (users, assessments, skills, levels, nudges, etc.)
 * from production to staging. Staging tables are truncated first.
 * Safe to run multiple times — each run is a fresh snapshot.
 */

import pg from "pg";

const PROD_URL = process.env.PROD_DB_URL;
const STAGING_URL = process.env.STAGING_DB_URL;

if (!PROD_URL || !STAGING_URL) {
  console.error("Usage: PROD_DB_URL=... STAGING_DB_URL=... npx tsx scripts/snapshot-to-staging.ts");
  process.exit(1);
}

if (PROD_URL === STAGING_URL) {
  console.error("ERROR: PROD_DB_URL and STAGING_DB_URL are the same! Aborting.");
  process.exit(1);
}

// Tables in dependency order (children before parents would break FK constraints,
// so we truncate in reverse order and insert in forward order)
const TABLES = [
  "levels",
  "skills",
  "assessment_questions",
  "ai_platforms",
  "system_config",
  "users",
  "organizations",
  "assessments",
  "user_skill_status",
  "nudges",
  "badges",
  "activity_feed",
  "email_logs",
  "live_sessions",
  "issue_reports",
  "verification_attempts",
  "password_reset_tokens",
  "coach_conversations",
  "challenge_reflections",
];

async function run() {
  const prod = new pg.Pool({ connectionString: PROD_URL });
  const staging = new pg.Pool({ connectionString: STAGING_URL });

  const prodClient = await prod.connect();
  const stagingClient = await staging.connect();

  try {
    console.log("[snapshot] Connected to both databases");

    // First, check which tables actually exist in production
    const { rows: existingTables } = await prodClient.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const existingSet = new Set(existingTables.map((r: any) => r.tablename));

    const tablesToCopy = TABLES.filter(t => existingSet.has(t));
    console.log(`[snapshot] Found ${tablesToCopy.length} tables to copy: ${tablesToCopy.join(", ")}`);

    // Truncate staging tables in reverse order (children first)
    console.log("[snapshot] Truncating staging tables...");
    await stagingClient.query("SET session_replication_role = 'replica'"); // disable FK checks
    for (const table of [...tablesToCopy].reverse()) {
      try {
        await stagingClient.query(`TRUNCATE TABLE "${table}" CASCADE`);
        console.log(`  [truncate] ${table}`);
      } catch (e: any) {
        if (e.message.includes("does not exist")) {
          console.log(`  [truncate] ${table} — doesn't exist in staging, skipping`);
        } else {
          throw e;
        }
      }
    }

    // Copy data table by table
    console.log("[snapshot] Copying data...");
    for (const table of tablesToCopy) {
      try {
        // Get all rows from production
        const { rows, fields } = await prodClient.query(`SELECT * FROM "${table}"`);

        if (rows.length === 0) {
          console.log(`  [copy] ${table}: 0 rows (empty)`);
          continue;
        }

        // Build INSERT statement
        const columns = fields.map((f: any) => `"${f.name}"`).join(", ");
        const placeholders = fields.map((_: any, i: number) => `$${i + 1}`).join(", ");

        let inserted = 0;
        for (const row of rows) {
          const values = fields.map((f: any) => {
            const val = row[f.name];
            // Handle JSON/JSONB — pg returns objects, need to stringify for insert
            if (val !== null && typeof val === "object" && !(val instanceof Date) && !Buffer.isBuffer(val)) {
              return JSON.stringify(val);
            }
            return val;
          });

          try {
            await stagingClient.query(
              `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
              values
            );
            inserted++;
          } catch (e: any) {
            // Skip rows that fail (e.g., FK constraint if referenced table is missing)
            if (inserted === 0) {
              console.warn(`  [copy] ${table}: first row failed: ${e.message.slice(0, 100)}`);
            }
          }
        }

        console.log(`  [copy] ${table}: ${inserted}/${rows.length} rows`);
      } catch (e: any) {
        console.error(`  [copy] ${table}: FAILED — ${e.message.slice(0, 100)}`);
      }
    }

    // Reset sequences so new inserts get correct IDs
    console.log("[snapshot] Resetting sequences...");
    for (const table of tablesToCopy) {
      try {
        await stagingClient.query(`
          SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
            COALESCE((SELECT MAX(id) FROM "${table}"), 1))
        `);
      } catch {
        // Table might not have an 'id' column or sequence — that's fine
      }
    }

    await stagingClient.query("SET session_replication_role = 'origin'"); // re-enable FK checks

    console.log("[snapshot] Done! Staging now has a full copy of production data.");

  } finally {
    prodClient.release();
    stagingClient.release();
    await prod.end();
    await staging.end();
  }
}

run().catch(err => {
  console.error("[snapshot] Fatal error:", err.message);
  process.exit(1);
});
