/**
 * Schema-Storage Alignment Tests
 *
 * These tests verify that the storage interface covers all schema tables,
 * that cleanup methods (deleteUser, resetUserProgress) touch every
 * user-related table, and that the Assessment type includes the fields
 * the rest of the app depends on.
 */
import { describe, it, expect } from "vitest";
import * as schema from "../shared/schema";
import type { IStorage } from "../server/storage";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers: read source files as text so we can inspect them without importing
// the database module (which needs a live PG connection).
// ---------------------------------------------------------------------------
const storageSource = fs.readFileSync(
  path.resolve(__dirname, "../server/storage.ts"),
  "utf-8"
);

// All pgTable declarations in schema.ts
const schemaSource = fs.readFileSync(
  path.resolve(__dirname, "../shared/schema.ts"),
  "utf-8"
);

function extractTableNames(src: string): string[] {
  const regex = /export const (\w+)\s*=\s*pgTable\(/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(src)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// 1. Every schema table should have at least one storage method that
//    references it (imported or used via db.select/insert/update/delete).
// ---------------------------------------------------------------------------
describe("Schema tables have corresponding storage methods", () => {
  const tables = extractTableNames(schemaSource);

  it("finds at least 10 tables in schema (sanity check)", () => {
    expect(tables.length).toBeGreaterThanOrEqual(10);
  });

  for (const table of tables) {
    it(`storage.ts references the "${table}" table`, () => {
      // The storage file should import or use the table identifier somewhere
      expect(storageSource).toContain(table);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. deleteUser cleans up ALL user-owned tables
// ---------------------------------------------------------------------------
describe("deleteUser cleans up all user-related tables", () => {
  // Tables that have a userId column (FK to users.id)
  const userOwnedTables = [
    "assessments",
    "userSkillStatus",
    "badges",
    "nudges",
    "activityFeed",
    "verificationAttempts",
    "emailLogs",
    "coachConversations",
    "challengeReflections",
  ];

  // Extract just the deleteUser method body
  const deleteUserMatch = storageSource.match(
    /async deleteUser\(id: number\)[\s\S]*?(?=\n  async )/
  );
  const deleteUserBody = deleteUserMatch ? deleteUserMatch[0] : "";

  it("deleteUser method exists", () => {
    expect(deleteUserBody.length).toBeGreaterThan(0);
  });

  for (const table of userOwnedTables) {
    it(`deleteUser deletes from ${table}`, () => {
      expect(deleteUserBody).toContain(table);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. resetUserProgress cleans up progress-related tables
// ---------------------------------------------------------------------------
describe("resetUserProgress cleans up progress-related tables", () => {
  const progressTables = [
    "userSkillStatus",
    "assessments",
    "badges",
    "nudges",
    "activityFeed",
    "verificationAttempts",
    "coachConversations",
    "challengeReflections",
  ];

  const resetMatch = storageSource.match(
    /async resetUserProgress\(userId: number\)[\s\S]*?(?=\n  async )/
  );
  const resetBody = resetMatch ? resetMatch[0] : "";

  it("resetUserProgress method exists", () => {
    expect(resetBody.length).toBeGreaterThan(0);
  });

  for (const table of progressTables) {
    it(`resetUserProgress deletes from ${table}`, () => {
      expect(resetBody).toContain(table);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Assessment type includes all critical fields
// ---------------------------------------------------------------------------
describe("Assessment schema includes critical fields", () => {
  // We inspect the assessments pgTable definition columns
  const assessmentColumns = schema.assessments;

  const requiredFields = [
    "outcomeOptionsJson",
    "nextLevelIdentity",
    "brightSpotsText",
    "signatureSkillId",
    "signatureSkillRationale",
    "futureSelfText",
    "firstMoveJson",
    "triggerMoment",
    "scoresJson",
    "assessmentLevel",
    "activeLevel",
    "contextSummary",
  ];

  for (const field of requiredFields) {
    it(`assessments table has "${field}" column`, () => {
      expect(field in assessmentColumns).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. IStorage interface has methods for coach conversations & reflections
// ---------------------------------------------------------------------------
describe("IStorage interface includes coach and reflection methods", () => {
  const requiredMethods = [
    "getCoachConversation",
    "createCoachConversation",
    "updateCoachConversation",
    "createChallengeReflection",
  ];

  for (const method of requiredMethods) {
    it(`IStorage declares "${method}"`, () => {
      // Check the interface definition in the source
      expect(storageSource).toContain(method);
    });
  }
});
