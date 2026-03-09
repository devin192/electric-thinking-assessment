/**
 * Level Numbering Consistency Tests
 *
 * These tests verify that:
 * - LEVEL_DATA in seed.ts uses sortOrder 0-4
 * - Client-side LEVEL_COLORS and LEVEL_HEX maps have entries for keys 0-4
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

const dashboardSource = fs.readFileSync(
  path.resolve(__dirname, "../client/src/pages/dashboard.tsx"),
  "utf-8"
);

const managerSource = fs.readFileSync(
  path.resolve(__dirname, "../client/src/pages/manager.tsx"),
  "utf-8"
);

const animationsSource = fs.readFileSync(
  path.resolve(__dirname, "../client/src/lib/animations.ts"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// 1. LEVEL_DATA in seed.ts uses sortOrder 0-4
// ---------------------------------------------------------------------------
describe("LEVEL_DATA uses sortOrder 0-4", () => {
  // Extract sortOrder values from LEVEL_DATA
  const sortOrderMatches = [...seedSource.matchAll(/sortOrder:\s*(\d+)/g)].map(
    (m) => parseInt(m[1])
  );
  // The first 5 should be the level sortOrders (0-4), the rest are skill sortOrders
  const levelSortOrders = sortOrderMatches.slice(0, 5);

  it("has exactly 5 levels", () => {
    expect(levelSortOrders).toHaveLength(5);
  });

  it("levels use sortOrder 0 through 4", () => {
    expect(levelSortOrders).toEqual([0, 1, 2, 3, 4]);
  });

  it("LEVEL_DATA contains Explorer at sortOrder 0", () => {
    expect(seedSource).toMatch(/displayName:\s*"Explorer"[\s\S]*?sortOrder:\s*0/);
  });

  it("LEVEL_DATA contains Agentic Workflow at sortOrder 4", () => {
    expect(seedSource).toMatch(
      /displayName:\s*"Agentic Workflow"[\s\S]*?sortOrder:\s*4/
    );
  });
});

// ---------------------------------------------------------------------------
// 2. LEVEL_COLORS maps in client files have entries for 0-4
// ---------------------------------------------------------------------------
describe("LEVEL_COLORS maps cover keys 0-4", () => {
  function checkMapKeys(source: string, mapName: string, fileName: string) {
    // Look for the map definition and check it has keys 0-4
    const mapMatch = source.match(
      new RegExp(`${mapName}[^=]*=\\s*\\{([^}]+)\\}`)
    );
    if (!mapMatch) return false;
    const mapBody = mapMatch[1];
    for (let i = 0; i <= 4; i++) {
      if (!mapBody.includes(`${i}:`)) return false;
    }
    return true;
  }

  it("results.tsx LEVEL_COLORS has keys 0-4", () => {
    expect(checkMapKeys(resultsSource, "LEVEL_COLORS", "results.tsx")).toBe(true);
  });

  it("dashboard.tsx LEVEL_COLORS has keys 0-4", () => {
    expect(checkMapKeys(dashboardSource, "LEVEL_COLORS", "dashboard.tsx")).toBe(true);
  });

  it("dashboard.tsx LEVEL_HEX has keys 0-4", () => {
    expect(checkMapKeys(dashboardSource, "LEVEL_HEX", "dashboard.tsx")).toBe(true);
  });

  it("manager.tsx LEVEL_COLORS has keys 0-4", () => {
    expect(checkMapKeys(managerSource, "LEVEL_COLORS", "manager.tsx")).toBe(true);
  });

  it("animations.ts LEVEL_COLORS has keys 0-4", () => {
    expect(checkMapKeys(animationsSource, "LEVEL_COLORS", "animations.ts")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Display code adds +1 for user-facing level numbers
// ---------------------------------------------------------------------------
describe("Level display adds +1 for user-facing numbers", () => {
  it("results.tsx displays assessmentLevel + 1 in the level circle", () => {
    expect(resultsSource).toContain("assessmentLevel + 1");
  });

  it("dashboard.tsx displays sortOrder + 1 for level headers", () => {
    expect(dashboardSource).toContain("sortOrder + 1");
  });

  it("manager.tsx displays level + 1 for level distribution", () => {
    expect(managerSource).toContain("level + 1");
  });

  it("manager.tsx displays assessmentLevel + 1 for member cards", () => {
    expect(managerSource).toContain("assessmentLevel + 1");
  });
});

// ---------------------------------------------------------------------------
// 4. LEVEL_NAMES map consistency
// ---------------------------------------------------------------------------
describe("LEVEL_NAMES maps are consistent with LEVEL_DATA", () => {
  // results.tsx has its own LEVEL_NAMES
  const resultsNamesMatch = resultsSource.match(
    /LEVEL_NAMES[^=]*=\s*\{([^}]+)\}/
  );
  const resultsNames = resultsNamesMatch ? resultsNamesMatch[1] : "";

  it("results.tsx LEVEL_NAMES has 5 entries (0-4)", () => {
    for (let i = 0; i <= 4; i++) {
      expect(resultsNames).toContain(`${i}:`);
    }
  });

  it("results.tsx LEVEL_NAMES includes Explorer at key 0", () => {
    expect(resultsNames).toMatch(/0:\s*"Explorer"/);
  });

  it("results.tsx LEVEL_NAMES includes Agentic Workflow at key 4", () => {
    expect(resultsNames).toMatch(/4:\s*"Agentic Workflow"/);
  });
});

// ---------------------------------------------------------------------------
// 5. Skills per level consistency
// ---------------------------------------------------------------------------
describe("Seed data has 5 skills per level", () => {
  // SKILLS_DATA has keys 0-4, each with an array
  for (let level = 0; level <= 4; level++) {
    it(`level ${level} has 5 skills`, () => {
      // Match the array for this level key
      const levelMatch = seedSource.match(
        new RegExp(`${level}:\\s*\\[([\\s\\S]*?)\\]`, "m")
      );
      expect(levelMatch).not.toBeNull();
      if (levelMatch) {
        // Count the objects in the array (each has { name: )
        const skillCount = (levelMatch[1].match(/\{\s*name:/g) || []).length;
        expect(skillCount).toBe(5);
      }
    });
  }
});
