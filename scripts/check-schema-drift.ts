/**
 * Schema Drift Detector
 *
 * Compares the Drizzle schema definition (shared/schema.ts) against
 * the actual PostgreSQL database to catch silent migration failures.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/check-schema-drift.ts
 *
 * This would have caught the missing work_context_summary column
 * that caused every API call to 500 for beta testers.
 */

import pg from "pg";
import { getTableName, getTableColumns } from "drizzle-orm";
import * as schema from "../shared/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

// Extract all pgTable objects from schema
function getSchemaTablesFromDrizzle(): Array<{ tableName: string; columns: string[] }> {
  const tables: Array<{ tableName: string; columns: string[] }> = [];

  for (const [exportName, value] of Object.entries(schema)) {
    // Skip non-table exports (types, schemas, etc)
    if (!value || typeof value !== "object") continue;
    // Skip Zod schemas and type exports
    if (exportName.startsWith("insert") || exportName.endsWith("Schema") || exportName === "loginSchema" || exportName === "registerSchema") continue;

    try {
      const tableName = getTableName(value as any);
      if (!tableName) continue;

      const columns = getTableColumns(value as any);
      const columnNames = Object.values(columns).map((col: any) => col.name);
      tables.push({ tableName, columns: columnNames });
    } catch {
      // Not a table object, skip
    }
  }

  return tables;
}

// Get actual database tables and columns
async function getActualSchema(pool: pg.Pool): Promise<Map<string, Set<string>>> {
  const result = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const tables = new Map<string, Set<string>>();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) {
      tables.set(row.table_name, new Set());
    }
    tables.get(row.table_name)!.add(row.column_name);
  }
  return tables;
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Test connection
    await pool.query("SELECT 1");
    console.log("Connected to database\n");

    const expectedTables = getSchemaTablesFromDrizzle();
    const actualSchema = await getActualSchema(pool);

    let hasErrors = false;
    let missingTables = 0;
    let missingColumns = 0;
    let extraColumns = 0;

    console.log("=== Schema Drift Report ===\n");

    for (const { tableName, columns: expectedColumns } of expectedTables) {
      const actualColumns = actualSchema.get(tableName);

      if (!actualColumns) {
        console.log(`MISSING TABLE: ${tableName}`);
        console.log(`  Expected columns: ${expectedColumns.join(", ")}\n`);
        missingTables++;
        hasErrors = true;
        continue;
      }

      // Check for missing columns (in schema but not in DB)
      const missing = expectedColumns.filter(col => !actualColumns.has(col));
      if (missing.length > 0) {
        console.log(`TABLE ${tableName}: MISSING COLUMNS`);
        for (const col of missing) {
          console.log(`  - ${col} (defined in schema but NOT in database)`);
        }
        console.log();
        missingColumns += missing.length;
        hasErrors = true;
      }

      // Check for extra columns (in DB but not in schema) — warning only
      const extra = [...actualColumns].filter(col => !expectedColumns.includes(col));
      if (extra.length > 0) {
        console.log(`TABLE ${tableName}: EXTRA COLUMNS (warning)`);
        for (const col of extra) {
          console.log(`  - ${col} (in database but not in schema)`);
        }
        console.log();
        extraColumns += extra.length;
      }
    }

    // Check for tables in DB not in schema
    const expectedTableNames = new Set(expectedTables.map(t => t.tableName));
    const unexpectedTables = [...actualSchema.keys()].filter(t => !expectedTableNames.has(t) && t !== "session");
    if (unexpectedTables.length > 0) {
      console.log("EXTRA TABLES in database (not in schema):");
      for (const t of unexpectedTables) {
        console.log(`  - ${t}`);
      }
      console.log();
    }

    // Summary
    console.log("=== Summary ===");
    console.log(`Tables checked: ${expectedTables.length}`);
    console.log(`Missing tables: ${missingTables}`);
    console.log(`Missing columns: ${missingColumns}`);
    console.log(`Extra columns (warnings): ${extraColumns}`);

    if (hasErrors) {
      console.log("\nFAILED: Schema drift detected. The database does not match the schema definition.");
      console.log("Fix: Run ensureMigrations() or manually ALTER TABLE to add missing columns.");
      process.exit(1);
    } else {
      console.log("\nPASSED: Database schema matches Drizzle schema definition.");
      process.exit(0);
    }
  } catch (err: any) {
    console.error(`Database error: ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
