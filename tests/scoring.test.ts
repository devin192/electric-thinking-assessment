/**
 * scoreAssessment Return Type & Fallback Logic Tests
 *
 * These tests verify the scoreAssessment function's return type signature,
 * its JSON parsing fallback logic, and that default/fallback values have
 * the correct types. We read the source and parse it structurally rather
 * than importing the module (which would try to connect to Anthropic/PG).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const aiSource = fs.readFileSync(
  path.resolve(__dirname, "../server/assessment-ai.ts"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// 1. scoreAssessment return type includes all required fields
// ---------------------------------------------------------------------------
describe("scoreAssessment return type signature", () => {
  // Extract the return type annotation from the function signature
  const returnTypeMatch = aiSource.match(
    /export async function scoreAssessment\([\s\S]*?\):\s*Promise<\{([\s\S]*?)\}>\s*\{/
  );

  it("scoreAssessment function exists and has a typed return", () => {
    expect(returnTypeMatch).not.toBeNull();
  });

  const returnType = returnTypeMatch ? returnTypeMatch[1] : "";

  const requiredFields = [
    "scores",
    "assessmentLevel",
    "activeLevel",
    "contextSummary",
    "firstMove",
    "outcomeOptions",
    "signatureSkillName",
    "signatureSkillRationale",
    "brightSpots",
    "futureSelfText",
    "nextLevelIdentity",
    "triggerMoment",
  ];

  for (const field of requiredFields) {
    it(`return type includes "${field}"`, () => {
      expect(returnType).toContain(field);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Return type field types are correct
// ---------------------------------------------------------------------------
describe("scoreAssessment return type field types", () => {
  const returnTypeMatch = aiSource.match(
    /export async function scoreAssessment\([\s\S]*?\):\s*Promise<\{([\s\S]*?)\}>\s*\{/
  );
  const returnType = returnTypeMatch ? returnTypeMatch[1] : "";

  it("scores is Record<string, { status: string; explanation: string }>", () => {
    expect(returnType).toMatch(/scores:\s*Record<string,\s*\{\s*status:\s*string;\s*explanation:\s*string\s*\}>/);
  });

  it("assessmentLevel is number", () => {
    expect(returnType).toMatch(/assessmentLevel:\s*number/);
  });

  it("brightSpots is string[]", () => {
    expect(returnType).toMatch(/brightSpots:\s*string\[\]/);
  });

  it("outcomeOptions is an Array with the right shape", () => {
    expect(returnType).toMatch(/outcomeOptions:\s*Array</);
    expect(returnType).toContain("outcomeHeadline");
    expect(returnType).toContain("timeEstimate");
    expect(returnType).toContain("skillName");
    expect(returnType).toContain("action");
    expect(returnType).toContain("whatYoullSee");
  });

  it("firstMove has skillName and suggestion", () => {
    expect(returnType).toMatch(/firstMove:\s*\{/);
    expect(returnType).toContain("skillName");
    expect(returnType).toContain("suggestion");
  });
});

// ---------------------------------------------------------------------------
// 3. JSON parsing fallback logic
// ---------------------------------------------------------------------------
describe("scoreAssessment JSON parsing fallback", () => {
  it("uses regex to extract JSON from response text as fallback", () => {
    expect(aiSource).toContain("text.match(/\\{[\\s\\S]*\\}/)");
  });

  it("has a try/catch around JSON parsing with regex fallback", () => {
    // Primary: JSON.parse(text), Fallback: regex extraction then JSON.parse
    expect(aiSource).toContain("JSON.parse(text)");
    expect(aiSource).toContain("JSON.parse(jsonMatch[0])");
  });

  it("throws if no JSON found in response", () => {
    expect(aiSource).toContain('throw new Error("No JSON found in response")');
  });
});

// ---------------------------------------------------------------------------
// 4. Default/fallback values after retry exhaustion
// ---------------------------------------------------------------------------
describe("scoreAssessment fallback values have correct types", () => {
  // Extract the fallback return after "all retries exhausted" comment
  const fallbackMatch = aiSource.match(
    /All retries exhausted[\s\S]*?return\s*\{([\s\S]*?)\};\s*\}/
  );

  it("fallback return statement exists after retry exhaustion", () => {
    expect(fallbackMatch).not.toBeNull();
  });

  const catchReturn = fallbackMatch ? fallbackMatch[1] : "";

  it("fallback scores is an object (defaultScores)", () => {
    expect(catchReturn).toContain("scores: defaultScores");
  });

  it("fallback assessmentLevel is 0", () => {
    expect(catchReturn).toContain("assessmentLevel: 0");
  });

  it("fallback activeLevel is 0", () => {
    expect(catchReturn).toContain("activeLevel: 0");
  });

  it("fallback outcomeOptions is an empty array", () => {
    expect(catchReturn).toContain("outcomeOptions: []");
  });

  it("fallback brightSpots is an empty array", () => {
    expect(catchReturn).toContain("brightSpots: []");
  });

  it("fallback contextSummary is a string", () => {
    expect(catchReturn).toMatch(/contextSummary:\s*"/);
  });

  it("fallback firstMove has skillName and suggestion as strings", () => {
    expect(catchReturn).toContain("firstMove:");
    expect(catchReturn).toMatch(/skillName:/);
    expect(catchReturn).toMatch(/suggestion:/);
  });

  it("fallback signatureSkillName is an empty string", () => {
    expect(catchReturn).toContain('signatureSkillName: ""');
  });

  it("fallback signatureSkillRationale is an empty string", () => {
    expect(catchReturn).toContain('signatureSkillRationale: ""');
  });

  it("fallback futureSelfText is an empty string", () => {
    expect(catchReturn).toContain('futureSelfText: ""');
  });

  it("fallback nextLevelIdentity is an empty string", () => {
    expect(catchReturn).toContain('nextLevelIdentity: ""');
  });

  it("fallback triggerMoment is an empty string", () => {
    expect(catchReturn).toContain('triggerMoment: ""');
  });
});

// ---------------------------------------------------------------------------
// 5. Happy-path parsed values have correct fallbacks
// ---------------------------------------------------------------------------
describe("scoreAssessment happy-path parsed value fallbacks", () => {
  // In the try block, each parsed field should have a fallback
  // Match the return inside the for loop's try block (before the outer catch)
  const tryMatch = aiSource.match(
    /parsed\.triggerMoment[\s\S]*?return\s*\{([\s\S]*?)\};\s*\}\s*catch/
  ) || aiSource.match(
    /return\s*\{\s*\n\s*scores:\s*parsed\.scores([\s\S]*?)\};\s*\}\s*catch/
  );

  it("try block return exists", () => {
    expect(tryMatch).not.toBeNull();
  });

  const tryReturn = tryMatch ? tryMatch[1] : "";

  it("parsed scores defaults to empty object", () => {
    // tryReturn may start mid-line; check the full source for this pattern
    expect(aiSource).toMatch(/scores:\s*parsed\.scores\s*\|\|\s*\{\}/);
  });

  it("parsed outcomeOptions defaults to empty array", () => {
    expect(tryReturn).toMatch(/outcomeOptions:\s*parsed\.outcomeOptions\s*\|\|\s*\[\]/);
  });

  it("parsed brightSpots defaults to empty array", () => {
    expect(tryReturn).toMatch(/brightSpots:\s*parsed\.brightSpots\s*\|\|\s*\[\]/);
  });

  it("assessmentLevel is clamped between 0 and 4", () => {
    expect(tryReturn).toContain("Math.max(0, Math.min(4, assessmentLevel))");
  });

  it("activeLevel is clamped between 0 and 4", () => {
    expect(tryReturn).toContain("Math.max(0, Math.min(4, activeLevel))");
  });
});
