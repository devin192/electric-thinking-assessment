/**
 * Level Numbering Consistency Tests
 *
 * These tests verify that:
 * - LEVEL_DATA in seed.ts uses sortOrder 0-3
 * - Client-side LEVEL_COLORS maps have entries for keys 0-3
 * - Display code adds +1 when showing levels to users (0-indexed internally,
 *   1-indexed for display)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const seedSource = fs.readFileSync(
  path.resolve(__dirname, "../server/seed.ts"),
  "utf-8"
);

const resultsSource = fs.readFileSync(
  path.resolve(__dirname, "../client/src/pages/results.tsx"),
  "utf-8"
);

const animationsSource = fs.readFileSync(
  path.resolve(__dirname, "../client/src/lib/animations.ts"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// 1. LEVEL_DATA in seed.ts uses sortOrder 0-3
// ---------------------------------------------------------------------------
describe("LEVEL_DATA uses sortOrder 0-3", () => {
  it("LEVEL_DATA contains Accelerator at sortOrder 0", () => {
    expect(seedSource).toMatch(/displayName:\s*"Accelerator"[\s\S]*?sortOrder:\s*0/);
  });

  it("LEVEL_DATA contains Systems Designer at sortOrder 3", () => {
    expect(seedSource).toMatch(
      /displayName:\s*"Systems Designer"[\s\S]*?sortOrder:\s*3/
    );
  });
});

// ---------------------------------------------------------------------------
// 2. LEVEL_COLORS maps in client files have entries for 0-3
// ---------------------------------------------------------------------------
describe("LEVEL_COLORS maps cover keys 0-3", () => {
  function checkMapKeys(source: string, mapName: string) {
    const mapMatch = source.match(
      new RegExp(`${mapName}[^=]*=\\s*\\{([^}]+)\\}`)
    );
    if (!mapMatch) return false;
    const mapBody = mapMatch[1];
    for (let i = 0; i <= 3; i++) {
      if (!mapBody.includes(`${i}:`)) return false;
    }
    return true;
  }

  it("results.tsx LEVEL_COLORS has keys 0-3", () => {
    expect(checkMapKeys(resultsSource, "LEVEL_COLORS")).toBe(true);
  });

  it("animations.ts LEVEL_COLORS has keys 0-3", () => {
    expect(checkMapKeys(animationsSource, "LEVEL_COLORS")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Display code adds +1 for user-facing level numbers
// ---------------------------------------------------------------------------
describe("Level display adds +1 for user-facing numbers", () => {
  it("results.tsx displays assessmentLevel + 1 in the level circle", () => {
    expect(resultsSource).toContain("assessmentLevel + 1");
  });
});

// ---------------------------------------------------------------------------
// 4. LEVEL_NAMES map consistency
// ---------------------------------------------------------------------------
describe("LEVEL_NAMES maps are consistent with LEVEL_DATA", () => {
  const resultsNamesMatch = resultsSource.match(
    /LEVEL_NAMES[^=]*=\s*\{([^}]+)\}/
  );
  const resultsNames = resultsNamesMatch ? resultsNamesMatch[1] : "";

  it("results.tsx LEVEL_NAMES has 4 entries (0-3)", () => {
    for (let i = 0; i <= 3; i++) {
      expect(resultsNames).toContain(`${i}:`);
    }
  });

  it("results.tsx LEVEL_NAMES includes Accelerator at key 0", () => {
    expect(resultsNames).toMatch(/0:\s*"Accelerator"/);
  });

  it("results.tsx LEVEL_NAMES includes Systems Designer at key 3", () => {
    expect(resultsNames).toMatch(/3:\s*"Systems Designer"/);
  });
});

// ---------------------------------------------------------------------------
// 5. Skills per level consistency
// ---------------------------------------------------------------------------
describe("Seed data has 5 skills per level", () => {
  for (let level = 0; level <= 3; level++) {
    it(`level ${level} has 5 skills`, () => {
      const levelMatch = seedSource.match(
        new RegExp(`${level}:\\s*\\[([\\s\\S]*?)\\]`, "m")
      );
      expect(levelMatch).not.toBeNull();
      if (levelMatch) {
        const skillCount = (levelMatch[1].match(/\{\s*name:/g) || []).length;
        expect(skillCount).toBe(5);
      }
    });
  }
});
