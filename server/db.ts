import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

// Pool sizing notes (Dex review 2026-04-25 pre-ABC-launch):
//   - default max is 10. ABC cohort = ~20 users. Each assessment briefly holds
//     1-2 connections during AI scoring. 20 concurrent + cron + admin
//     queries can starve the default pool → 503s on /api/health and stalled
//     assessments.
//   - Railway Postgres tier limits: Hobby = 22 conns, Pro = 500. Picking 25
//     leaves headroom for migrations, cron, admin without blowing past Hobby
//     if the deploy lands there. Bump to 50 if we move to Pro.
//   - idleTimeoutMillis prevents stale connections piling up between bursts.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 25,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema });
