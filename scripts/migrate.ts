/**
 * Non-interactive schema migration for Railway deployments.
 *
 * drizzle-kit push --force sometimes prompts interactively when it detects
 * ambiguous table changes (e.g., "is issue_reports new or renamed from session?").
 * Railway can't answer interactive prompts, so the migration silently skips.
 *
 * This script runs ALTER TABLE IF NOT EXISTS for all columns added in recent
 * commits. It's safe to run repeatedly — each statement is idempotent.
 */

import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const migrations: string[] = [
  // NPS score (pre-existing, added before migration script existed)
  `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS nps_score integer`,

  // Scoring validation (added 2026-04-09)
  `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS scoring_confidence varchar(20)`,

  // Voice metrics (added 2026-04-09)
  `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS voice_time_to_first_audio integer`,
  `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS voice_reconnect_count integer`,
  `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS voice_session_duration integer`,

  // Abandoned assessment recovery (added 2026-04-09)
  `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS abandoned_email_sent boolean DEFAULT false`,

  // Post-assessment micro-survey (added 2026-04-09)
  `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS user_feedback_text text`,

  // Level-up: self-declared current level (added 2026-04-17)
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS current_level integer`,

  // Nudge feedback vote: thumbs up/down from email (added 2026-04-17)
  `ALTER TABLE nudges ADD COLUMN IF NOT EXISTS feedback_vote varchar(10)`,

  // Nudge cost and token tracking (added 2026-04-18)
  // generation_cost is stored in CENTS with 4 decimal places, so 0.4500 = 0.45 cents
  `ALTER TABLE nudges ADD COLUMN IF NOT EXISTS input_tokens integer`,
  `ALTER TABLE nudges ADD COLUMN IF NOT EXISTS output_tokens integer`,
  `ALTER TABLE nudges ADD COLUMN IF NOT EXISTS generation_cost decimal(6, 4)`,

  // Voice attempt tracking (added 2026-04-23) — distinguishes "user chose text"
  // from "user tried voice but it failed silently". Set true on first /voice-token call.
  `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS voice_attempted boolean DEFAULT false`,

  // Issue reports table (added 2026-04-09)
  `CREATE TABLE IF NOT EXISTS issue_reports (
    id serial PRIMARY KEY,
    user_id integer REFERENCES users(id),
    assessment_id integer,
    error text NOT NULL,
    browser text,
    connection_type varchar(50),
    created_at timestamp DEFAULT now()
  )`,
];

async function run() {
  const client = await pool.connect();
  try {
    for (const sql of migrations) {
      try {
        await client.query(sql);
        const label = sql.split("\n")[0].trim().slice(0, 80);
        console.log(`[migrate] OK: ${label}`);
      } catch (err: any) {
        // "already exists" errors are fine — means the migration already ran
        if (err.message?.includes("already exists")) {
          console.log(`[migrate] SKIP (already exists): ${sql.slice(0, 60)}`);
        } else {
          console.error(`[migrate] FAIL: ${sql.slice(0, 60)}`);
          console.error(`[migrate] Error: ${err.message}`);
        }
      }
    }
    console.log("[migrate] All migrations complete");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[migrate] Fatal error:", err.message);
  process.exit(1);
});
