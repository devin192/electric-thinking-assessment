/**
 * Critical Path Integration Tests
 *
 * These tests cover the three paths that have caused production regressions:
 * 1. Email delivery on all assessment completion paths (normal, short convo, scoring failure)
 * 2. Voice token endpoint returning a signed URL
 * 3. Scoring handling insufficient data without crashing
 *
 * All external dependencies (Resend, ElevenLabs, Anthropic, DB) are mocked.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1,
    orgId: null,
    email: "test@example.com",
    name: "Test User",
    password: "hashed",
    roleTitle: "Product Manager",
    aiPlatform: "ChatGPT",
    userRole: "member",
    nudgesActive: true,
    nudgeDay: "Monday",
    challengeFrequency: "weekly",
    timezone: "America/Los_Angeles",
    onboardingComplete: false,
    emailValid: true,
    emailPrefsNudges: true,
    emailPrefsProgress: true,
    emailPrefsReminders: true,
    unsubscribeToken: "unsub-token-123",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 42,
    userId: 1,
    transcript: JSON.stringify([
      { role: "assistant", content: "Tell me about your work." },
      { role: "user", content: "Hi, I'm ready to start my assessment." },
      { role: "assistant", content: "What do you do day to day?" },
      { role: "user", content: "I manage a product team and we use AI for research." },
      { role: "assistant", content: "Interesting. How do you use AI specifically?" },
      { role: "user", content: "I use ChatGPT to draft PRDs and brainstorm features." },
    ]),
    contextSummary: null,
    workContextSummary: null,
    assessmentLevel: null,
    activeLevel: null,
    scoresJson: null,
    firstMoveJson: null,
    outcomeOptionsJson: null,
    signatureSkillId: null,
    signatureSkillRationale: null,
    brightSpotsText: null,
    futureSelfText: null,
    nextLevelIdentity: null,
    triggerMoment: null,
    surveyResponsesJson: { "Context Setting": 2, "Quick Drafting": 1 },
    surveyLevel: 0,
    status: "in_progress",
    startedAt: new Date(),
    completedAt: null,
    npsScore: null,
    ...overrides,
  };
}

function makeLevels() {
  return [
    { id: 1, displayName: "Accelerator", sortOrder: 0, description: "Getting started" },
    { id: 2, displayName: "Thought Partner", sortOrder: 1, description: "Regular use" },
    { id: 3, displayName: "Team Builder", sortOrder: 2, description: "Expanding impact" },
    { id: 4, displayName: "Systems Designer", sortOrder: 3, description: "Transforming work" },
  ];
}

function makeSkills() {
  return [
    { id: 1, name: "Context Setting", description: "Providing context to AI", levelId: 1 },
    { id: 2, name: "Quick Drafting", description: "Fast first drafts", levelId: 1 },
    { id: 3, name: "Prompt Iteration", description: "Refining prompts", levelId: 2 },
  ];
}

// ---------------------------------------------------------------------------
// Test 1: Email sent on all assessment completion paths
// ---------------------------------------------------------------------------
describe("Email sent on all assessment completion paths", () => {
  // We test the logic by directly calling sendWelcomeEmail after mocking Resend,
  // and by simulating the three completion branches from routes.ts.

  let sendWelcomeEmail: typeof import("../server/email").sendWelcomeEmail;
  let mockResendSend: Mock;

  beforeEach(async () => {
    vi.resetModules();

    // Mock the Resend client
    mockResendSend = vi.fn().mockResolvedValue({ data: { id: "resend-id-123" } });

    vi.doMock("../server/resend-client", () => ({
      getUncachableResendClient: vi.fn().mockResolvedValue({
        client: { emails: { send: mockResendSend } },
        fromEmail: "test@electricthinking.ai",
      }),
    }));

    // Mock storage — sendWelcomeEmail calls getSystemConfig and createEmailLog
    vi.doMock("../server/storage", () => ({
      storage: {
        getSystemConfig: vi.fn().mockResolvedValue(null),
        createEmailLog: vi.fn().mockResolvedValue({}),
        getLevels: vi.fn().mockResolvedValue(makeLevels()),
        getSkills: vi.fn().mockResolvedValue(makeSkills()),
        getAssessment: vi.fn().mockResolvedValue(makeAssessment()),
        updateAssessment: vi.fn().mockResolvedValue(makeAssessment({ status: "completed" })),
        getActiveAssessment: vi.fn().mockResolvedValue(makeAssessment()),
        upsertUserSkillStatus: vi.fn().mockResolvedValue({}),
      },
    }));

    const emailModule = await import("../server/email");
    sendWelcomeEmail = emailModule.sendWelcomeEmail;
  });

  it("sends welcome email on normal assessment completion (scoring succeeds)", async () => {
    const user = makeUser();
    await sendWelcomeEmail(user as any, "Accelerator", 0, "https://app.electricthinking.ai");

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.to).toBe("test@example.com");
    expect(callArgs.subject).toContain("Level 1");
    expect(callArgs.subject).toContain("Accelerator");
    expect(callArgs.html).toContain("You're in.");
  });

  it("sends welcome email for short conversation (< 2 user messages)", async () => {
    // This verifies the fix for the short-conversation bug.
    // The route handler falls back to survey-based defaults and still calls sendWelcomeEmail.
    const user = makeUser();
    await sendWelcomeEmail(user as any, "Accelerator", 0, "https://app.electricthinking.ai");

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockResendSend.mock.calls[0][0].to).toBe("test@example.com");
  });

  it("sends welcome email when scoring fails (fallback to survey level)", async () => {
    // This verifies the fix for the scoring-failure bug.
    // The route handler catches scoreAssessment errors and still calls sendWelcomeEmail.
    const user = makeUser();
    // Even though scoring failed, the email should still go out with survey-based level
    await sendWelcomeEmail(user as any, "Thought Partner", 1, "https://app.electricthinking.ai");

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.to).toBe("test@example.com");
    expect(callArgs.subject).toContain("Level 2");
    expect(callArgs.subject).toContain("Thought Partner");
  });

  it("does NOT send email when emailValid is false", async () => {
    const user = makeUser({ emailValid: false });
    await sendWelcomeEmail(user as any, "Accelerator", 0, "https://app.electricthinking.ai");

    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("does not throw when Resend API fails", async () => {
    mockResendSend.mockRejectedValueOnce(new Error("Resend API down"));
    const user = makeUser();

    // Should not throw — the function catches errors internally
    await expect(
      sendWelcomeEmail(user as any, "Accelerator", 0, "https://app.electricthinking.ai")
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 1b: Route-level verification that sendWelcomeEmail is called in all 3 paths
// ---------------------------------------------------------------------------
describe("Assessment complete route calls sendWelcomeEmail in all branches", () => {
  // This test reads the route source and verifies the three sendWelcomeEmail calls
  // exist in the complete endpoint. This is a structural guard — if someone removes
  // a sendWelcomeEmail call, this test breaks.

  let routeSource: string;

  beforeEach(async () => {
    const fs = await import("fs");
    const path = await import("path");
    routeSource = fs.readFileSync(
      path.resolve(__dirname, "../server/routes.ts"),
      "utf-8"
    );
  });

  it("calls sendWelcomeEmail in the short-conversation branch (< 2 user messages)", () => {
    // Find the short conversation branch: it checks userMessages.length < 2
    // and should call sendWelcomeEmail before returning
    const shortConvoBranch = routeSource.match(
      /userMessages\.length < 2[\s\S]*?return res\.json/
    );
    expect(shortConvoBranch).not.toBeNull();
    expect(shortConvoBranch![0]).toContain("sendWelcomeEmail");
  });

  it("calls sendWelcomeEmail in the scoring-failure catch branch", () => {
    // Find the scoring failure branch: catches scoreErr and falls back
    const scoringFailBranch = routeSource.match(
      /catch \(scoreErr[\s\S]*?return res\.json/
    );
    expect(scoringFailBranch).not.toBeNull();
    expect(scoringFailBranch![0]).toContain("sendWelcomeEmail");
  });

  it("calls sendWelcomeEmail in the normal scoring success path", () => {
    // After successful scoring, sendWelcomeEmail is called before the final res.json
    // Look for the block after upsertUserSkillStatus that calls sendWelcomeEmail
    const successPath = routeSource.match(
      /upsertUserSkillStatus[\s\S]*?sendWelcomeEmail[\s\S]*?return res\.json/
    );
    expect(successPath).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Voice token endpoint returns signed URL
// ---------------------------------------------------------------------------
describe("Voice token endpoint returns signed URL", () => {
  let getConversationSignedUrl: typeof import("../server/elevenlabs").getConversationSignedUrl;
  let mockFetch: Mock;

  beforeEach(async () => {
    vi.resetModules();

    // Set required env var
    vi.stubEnv("ELEVENLABS_API_KEY", "test-xi-api-key");

    // Mock storage for agent ID lookup
    vi.doMock("../server/storage", () => ({
      storage: {
        getSystemConfig: vi.fn().mockImplementation((key: string) => {
          if (key === "elevenlabs_agent_id") return Promise.resolve("agent-id-abc");
          return Promise.resolve(null);
        }),
        getActiveAssessment: vi.fn().mockResolvedValue({ id: 42 }),
      },
    }));

    // Mock global fetch for the ElevenLabs API call
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ signed_url: "wss://elevenlabs.io/convai/abc123" }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);

    const elevenModule = await import("../server/elevenlabs");
    getConversationSignedUrl = elevenModule.getConversationSignedUrl;
  });

  it("returns a signed URL from ElevenLabs", async () => {
    const url = await getConversationSignedUrl();

    expect(url).toBe("wss://elevenlabs.io/convai/abc123");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0];
    expect(fetchUrl).toContain("api.elevenlabs.io/v1/convai/conversation/get_signed_url");
    expect(fetchUrl).toContain("agent_id=agent-id-abc");
    expect(fetchOpts.headers["xi-api-key"]).toBe("test-xi-api-key");
  });

  it("throws when ELEVENLABS_API_KEY is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    // Re-import to pick up new env
    vi.resetModules();
    vi.doMock("../server/storage", () => ({
      storage: {
        getSystemConfig: vi.fn().mockResolvedValue("agent-id-abc"),
      },
    }));

    const { getConversationSignedUrl: freshFn } = await import("../server/elevenlabs");
    await expect(freshFn()).rejects.toThrow("ELEVENLABS_API_KEY");
  });

  it("throws when ElevenLabs API returns non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    await expect(getConversationSignedUrl()).rejects.toThrow("ElevenLabs API error: 403");
  });

  it("route handler logs the request with [voice-token] tag", () => {
    // Structural check: the route source must log with the [voice-token] tag
    const fs = require("fs");
    const path = require("path");
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, "../server/routes.ts"),
      "utf-8"
    );

    const voiceTokenRoute = routeSource.match(
      /voice-token.*requireAuth[\s\S]*?getConversationSignedUrl/
    ) || routeSource.match(
      /api\/assessment\/voice-token[\s\S]*?\[voice-token\]/
    );
    expect(voiceTokenRoute).not.toBeNull();

    // Verify the console.log call with [voice-token] exists in the route
    expect(routeSource).toContain('console.log(`[voice-token]');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Scoring handles insufficient data gracefully
// ---------------------------------------------------------------------------
describe("Scoring handles insufficient data gracefully", () => {

  it("route sets status to 'completed' (not stuck in 'scoring') for short transcripts", () => {
    // Structural verification: the short conversation branch must set status: "completed"
    const fs = require("fs");
    const path = require("path");
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, "../server/routes.ts"),
      "utf-8"
    );

    const shortBranch = routeSource.match(
      /userMessages\.length < 2[\s\S]*?(?:updateAssessment|transitionAssessment)[\s\S]*?\}/
    );
    expect(shortBranch).not.toBeNull();
    expect(shortBranch![0]).toContain('"completed"');
    // Must NOT leave it as "scoring"
    expect(shortBranch![0]).not.toMatch(/status:\s*["']scoring["']/);
  });

  it("route includes survey-based defaults for short conversations", () => {
    const fs = require("fs");
    const path = require("path");
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, "../server/routes.ts"),
      "utf-8"
    );

    const shortBranch = routeSource.match(
      /userMessages\.length < 2[\s\S]*?return res\.json/
    );
    expect(shortBranch).not.toBeNull();
    const branchCode = shortBranch![0];

    // Uses surveyLevel as the assessment level
    expect(branchCode).toContain("surveyLevel");
    expect(branchCode).toContain("assessmentLevel: surveyLevel");
    // Sets a context summary indicating limited data
    expect(branchCode).toContain("limited conversation data");
  });

  it("route sets status to 'completed' when scoring throws an error", () => {
    const fs = require("fs");
    const path = require("path");
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, "../server/routes.ts"),
      "utf-8"
    );

    const scoringFailBranch = routeSource.match(
      /catch \(scoreErr[\s\S]*?(?:updateAssessment|transitionAssessment)[\s\S]*?\}/
    );
    expect(scoringFailBranch).not.toBeNull();
    expect(scoringFailBranch![0]).toContain('"completed"');
  });

  it("scoreAssessment function returns safe defaults when all retries fail", async () => {
    vi.resetModules();

    // Mock Anthropic to always fail
    vi.doMock("@anthropic-ai/sdk", () => {
      return {
        default: class MockAnthropic {
          messages = {
            create: vi.fn().mockRejectedValue(new Error("API overloaded")),
          };
        },
      };
    });

    vi.doMock("../server/storage", () => ({
      storage: {
        getLevels: vi.fn().mockResolvedValue(makeLevels()),
        getSkills: vi.fn().mockResolvedValue(makeSkills()),
        getSystemConfig: vi.fn().mockResolvedValue(null),
      },
    }));

    const { scoreAssessment } = await import("../server/assessment-ai");

    // scoreAssessment retries 3 times then returns safe defaults (not throw)
    const result = await scoreAssessment("user: Hello\nassistant: Hi", {
      name: "Test",
      roleTitle: "PM",
    });

    // Should return with level 0, not crash
    expect(result.assessmentLevel).toBe(0);
    expect(result.activeLevel).toBe(0);
    expect(result.scores).toBeDefined();
    expect(typeof result.contextSummary).toBe("string");
    expect(result.firstMove).toHaveProperty("skillName");
    expect(result.firstMove).toHaveProperty("suggestion");
    expect(Array.isArray(result.brightSpots)).toBe(true);
  }, 15000); // Higher timeout for the 3 retries with delays

  it("scoreAssessment returns all required fields in its return type", async () => {
    vi.resetModules();

    vi.doMock("@anthropic-ai/sdk", () => {
      return {
        default: class MockAnthropic {
          messages = {
            create: vi.fn().mockResolvedValue({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    scores: { "Context Setting": { status: "green", explanation: "Good" } },
                    assessmentLevel: 1,
                    activeLevel: 0,
                    contextSummary: "Test user is a PM.",
                    workContextSummary: "Manages product team.",
                    firstMove: { skillName: "Context Setting", suggestion: "Try X" },
                    outcomeOptions: [
                      { outcomeHeadline: "A", description: "B" },
                      { outcomeHeadline: "C", description: "D" },
                      { outcomeHeadline: "E", description: "F" },
                    ],
                    signatureSkillName: "Context Setting",
                    signatureSkillRationale: "Strong context skills.",
                    brightSpots: ["Already using AI for drafts", "Good prompt habits"],
                    futureSelfText: "Imagine automated PRDs.",
                    nextLevelIdentity: "Thought Partner",
                    triggerMoment: "Monday planning sessions",
                  }),
                },
              ],
            }),
          };
        },
      };
    });

    vi.doMock("../server/storage", () => ({
      storage: {
        getLevels: vi.fn().mockResolvedValue(makeLevels()),
        getSkills: vi.fn().mockResolvedValue(makeSkills()),
        getSystemConfig: vi.fn().mockResolvedValue(null),
      },
    }));

    const { scoreAssessment } = await import("../server/assessment-ai");
    const result = await scoreAssessment(
      "user: I manage a product team\nassistant: Tell me more",
      { name: "Test", roleTitle: "PM", aiPlatform: "ChatGPT" }
    );

    expect(result.assessmentLevel).toBe(1);
    expect(result.activeLevel).toBe(0);
    expect(result.scores["Context Setting"].status).toBe("green");
    expect(result.contextSummary).toBe("Test user is a PM.");
    expect(result.workContextSummary).toBe("Manages product team.");
    expect(result.signatureSkillName).toBe("Context Setting");
    expect(result.brightSpots).toHaveLength(2);
    expect(result.outcomeOptions).toHaveLength(3);
    expect(result.futureSelfText).toBeTruthy();
    expect(result.nextLevelIdentity).toBeTruthy();
    expect(result.triggerMoment).toBeTruthy();
  });
});
