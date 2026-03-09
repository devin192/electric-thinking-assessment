/**
 * API Response Shape Tests
 *
 * These tests verify that the API routes return the fields the client
 * expects, and that coach/reflection endpoints expect the right request
 * body shapes. We do this by reading the source files and checking for
 * the presence of required field names in the response objects.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const routesSource = fs.readFileSync(
  path.resolve(__dirname, "../server/routes.ts"),
  "utf-8"
);

const resultsSource = fs.readFileSync(
  path.resolve(__dirname, "../client/src/pages/results.tsx"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// 1. Assessment completion response shape
//    POST /api/assessment/:id/complete should return all fields the client
//    reads from the Assessment object or the completion response.
// ---------------------------------------------------------------------------
describe("Assessment completion response includes all client-expected fields", () => {
  // Extract the res.json block from the /complete route
  const completeRouteMatch = routesSource.match(
    /app\.post\("\/api\/assessment\/:id\/complete"[\s\S]*?return res\.json\(\{([\s\S]*?)\}\);/
  );

  it("the /api/assessment/:id/complete route exists", () => {
    expect(completeRouteMatch).not.toBeNull();
  });

  const responseBlock = completeRouteMatch ? completeRouteMatch[1] : "";

  // Fields the client (results.tsx) reads from the assessment or completion response
  const expectedFields = [
    "assessmentLevel",
    "activeLevel",
    "scores",
    "contextSummary",
    "firstMove",
    "outcomeOptions",
    "signatureSkillId",
    "signatureSkillRationale",
    "brightSpots",
    "futureSelfText",
    "nextLevelIdentity",
    "triggerMoment",
  ];

  for (const field of expectedFields) {
    it(`completion response includes "${field}"`, () => {
      expect(responseBlock).toContain(field);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. /api/assessment/latest response shape
//    This returns a raw Assessment row from the DB, so the Assessment schema
//    must include the columns the client reads.
// ---------------------------------------------------------------------------
describe("/api/assessment/latest returns Assessment object with required columns", () => {
  // The client reads these from the assessment object via (assessment as any)?.fieldName
  const clientAccessedFields = [
    "outcomeOptionsJson",
    "signatureSkillRationale",
    "signatureSkillId",
    "brightSpotsText",
    "futureSelfText",
    "nextLevelIdentity",
    "firstMoveJson",
    "assessmentLevel",
  ];

  for (const field of clientAccessedFields) {
    it(`results.tsx accesses "${field}" from the assessment`, () => {
      expect(resultsSource).toContain(field);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Assessment completion route stores all scoring fields to the DB
// ---------------------------------------------------------------------------
describe("Assessment completion route stores all scoring fields", () => {
  // The updateAssessment call should set these fields
  const storedFields = [
    "outcomeOptionsJson",
    "signatureSkillId",
    "signatureSkillRationale",
    "brightSpotsText",
    "futureSelfText",
    "nextLevelIdentity",
    "triggerMoment",
    "firstMoveJson",
    "scoresJson",
    "assessmentLevel",
    "activeLevel",
    "contextSummary",
  ];

  // Extract the section of the complete route between scoreAssessment and
  // the res.json response. The updateAssessment call that stores scoring
  // results lives in this section and sets status: "completed".
  const completeSection = routesSource.match(
    /const result = await scoreAssessment\([\s\S]*?return res\.json/
  );

  it("scoring section exists in the complete route", () => {
    expect(completeSection).not.toBeNull();
  });

  const scoringSection = completeSection ? completeSection[0] : "";

  for (const field of storedFields) {
    it(`scoring section includes "${field}"`, () => {
      expect(scoringSection).toContain(field);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Coach route expects the right request body
// ---------------------------------------------------------------------------
describe("Coach route request/response shapes", () => {
  it("POST /api/challenge/:nudgeId/coach expects { message } in body", () => {
    // The route destructures { message } from req.body
    const coachRouteMatch = routesSource.match(
      /app\.post\("\/api\/challenge\/:nudgeId\/coach"[\s\S]*?const \{ message \} = req\.body/
    );
    expect(coachRouteMatch).not.toBeNull();
  });

  it("POST /api/challenge/:nudgeId/coach returns { response, conversationId }", () => {
    const responseMatch = routesSource.match(
      /return res\.json\(\{\s*response:\s*assistantMessage,\s*conversationId/
    );
    expect(responseMatch).not.toBeNull();
  });

  it("GET /api/challenge/:nudgeId/coach returns { messages }", () => {
    const getMatch = routesSource.match(
      /return res\.json\(\{\s*messages:\s*conversation\?\.messagesJson/
    );
    expect(getMatch).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Reflection route expects the right request body
// ---------------------------------------------------------------------------
describe("Reflection route request shape", () => {
  it("POST /api/challenge/:nudgeId/reflect expects { note } in body", () => {
    const reflectMatch = routesSource.match(
      /app\.post\("\/api\/challenge\/:nudgeId\/reflect"[\s\S]*?const \{ note \} = req\.body/
    );
    expect(reflectMatch).not.toBeNull();
  });

  it("POST /api/challenge/:nudgeId/reflect returns { success: true }", () => {
    const successMatch = routesSource.match(
      /return res\.json\(\{\s*success:\s*true\s*\}\)/
    );
    expect(successMatch).not.toBeNull();
  });
});
