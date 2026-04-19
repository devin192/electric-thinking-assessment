/**
 * Cross-user nudge similarity detection tests.
 *
 * These cover the pure string-similarity functions in server/nudge-similarity.ts
 * which are the core of the dedup heuristic. The wrapper function
 * generateNudgeWithDedup is not tested here because it depends on the Anthropic
 * SDK and the storage layer; its logic is simple (loop + delegation).
 */
import { describe, it, expect } from "vitest";
import {
  tokenize,
  wordOverlap,
  firstSentence,
  findSimilarNudge,
  buildAvoidInstruction,
  SUBJECT_SIMILARITY_THRESHOLD,
  INSIGHT_SIMILARITY_THRESHOLD,
  MAX_REGENERATION_ATTEMPTS,
} from "../server/nudge-similarity";
import type { Nudge } from "../shared/schema";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function makeNudge(
  id: number,
  userId: number,
  subjectLine: string,
  universalInsight: string,
): Nudge {
  return {
    id,
    userId,
    skillId: null,
    contentJson: { subjectLine, universalInsight } as any,
    subjectLine,
    emailId: null,
    emailSent: false,
    emailOpened: false,
    inAppRead: false,
    isFirstChallenge: false,
    feedbackRelevant: null,
    feedbackVote: null,
    feedbackText: null,
    sentAt: null,
    createdAt: new Date(),
  } as Nudge;
}

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------
describe("tokenize", () => {
  it("lowercases and splits on whitespace", () => {
    expect(tokenize("Prompts Are Like Briefs")).toEqual(["prompts", "like", "briefs"]);
  });

  it("strips punctuation", () => {
    expect(tokenize("Hello, world! Foo.bar?")).toEqual(["hello", "world", "foo", "bar"]);
  });

  it("filters stopwords", () => {
    expect(tokenize("the quick brown fox is in the box")).toEqual([
      "quick", "brown", "fox", "box",
    ]);
  });

  it("filters very short tokens", () => {
    expect(tokenize("a b cd efg")).toEqual(["cd", "efg"]);
  });

  it("handles empty and whitespace-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("preserves hyphenated words as single tokens", () => {
    const tokens = tokenize("one-shot");
    expect(tokens).toContain("one-shot");
  });
});

// ---------------------------------------------------------------------------
// firstSentence
// ---------------------------------------------------------------------------
describe("firstSentence", () => {
  it("extracts up to first period", () => {
    expect(firstSentence("First sentence. Second sentence.")).toBe("First sentence.");
  });

  it("handles ? and ! as terminators", () => {
    expect(firstSentence("Really? Yes!")).toBe("Really?");
    expect(firstSentence("Wow! Amazing.")).toBe("Wow!");
  });

  it("returns whole string when no terminator", () => {
    expect(firstSentence("just a fragment")).toBe("just a fragment");
  });

  it("handles empty input", () => {
    expect(firstSentence("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// wordOverlap
// ---------------------------------------------------------------------------
describe("wordOverlap", () => {
  it("returns 1.0 for identical strings", () => {
    expect(wordOverlap("hello world foo", "hello world foo")).toBe(1);
  });

  it("returns 0 for fully disjoint strings", () => {
    expect(wordOverlap("apple banana cherry", "dog elephant fish")).toBe(0);
  });

  it("returns 0 when either side is empty after tokenization", () => {
    expect(wordOverlap("", "something here")).toBe(0);
    expect(wordOverlap("something here", "")).toBe(0);
    expect(wordOverlap("", "")).toBe(0);
    expect(wordOverlap("the a of", "and is to")).toBe(0); // all stopwords
  });

  it("is asymmetric-favouring-shorter (subset gets high score)", () => {
    // "prompts meeting briefs" is a subset of "prompts meeting briefs context"
    // min(3, 4) = 3, shared = 3, overlap = 1.0
    const overlap = wordOverlap(
      "prompts meeting briefs",
      "prompts meeting briefs context",
    );
    expect(overlap).toBe(1);
  });

  it("returns 0.5 for half-overlapping word sets", () => {
    // tokens A: prompts, meeting, briefs, writing
    // tokens B: prompts, meeting, emails, subject
    // shared = 2 (prompts, meeting), min = 4, overlap = 0.5
    const overlap = wordOverlap(
      "prompts meeting briefs writing",
      "prompts meeting emails subject",
    );
    expect(overlap).toBe(0.5);
  });

  it("ignores case differences", () => {
    expect(wordOverlap("Prompts Meeting", "PROMPTS meeting")).toBe(1);
  });

  it("ignores stopwords in the comparison", () => {
    // Both strings share only stopwords -> 0
    expect(wordOverlap("the is of", "a of the")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findSimilarNudge
// ---------------------------------------------------------------------------
describe("findSimilarNudge", () => {
  it("returns null when pool is empty", () => {
    const result = findSimilarNudge(
      { subjectLine: "any subject", universalInsight: "any insight." },
      [],
    );
    expect(result).toBeNull();
  });

  it("returns null when no candidate is similar enough", () => {
    const pool = [
      makeNudge(1, 10, "The one-shot trap",
        "Most people judge AI by the first answer."),
    ];
    const result = findSimilarNudge(
      {
        subjectLine: "Voice beats typing",
        universalInsight: "Talking gives AI more context than typing does.",
      },
      pool,
    );
    expect(result).toBeNull();
  });

  it("detects subject-line similarity above threshold", () => {
    const pool = [
      makeNudge(42, 10,
        "Prompts are like meeting briefs",
        "Give AI the context a new hire would need."),
    ];
    const result = findSimilarNudge(
      {
        // 3 of 4 non-stopword tokens overlap: prompts, meeting, briefs
        // min(4, 4) = 4, shared = 3, overlap = 0.75 > 0.5
        subjectLine: "Prompts work like meeting briefs",
        universalInsight: "Something totally different for this insight.",
      },
      pool,
    );
    expect(result).not.toBeNull();
    expect(result!.nudgeId).toBe(42);
    expect(result!.reason).toBe("subject");
    expect(result!.subjectOverlap).toBeGreaterThan(SUBJECT_SIMILARITY_THRESHOLD);
  });

  it("detects insight similarity above threshold (first-sentence only)", () => {
    const pool = [
      makeNudge(
        7, 10,
        "Subject totally unrelated",
        "People type 40 words per minute and speak 150. That gap matters.",
      ),
    ];
    const result = findSimilarNudge(
      {
        subjectLine: "Completely different subject entirely now",
        // First sentence shares most content words with pool first sentence
        universalInsight: "People type 40 words per minute but speak 150 words. A very different second sentence here.",
      },
      pool,
    );
    expect(result).not.toBeNull();
    expect(result!.nudgeId).toBe(7);
    expect(result!.reason).toBe("insight");
    expect(result!.insightOverlap).toBeGreaterThan(INSIGHT_SIMILARITY_THRESHOLD);
  });

  it("returns reason='both' when subject AND insight match", () => {
    const pool = [
      makeNudge(
        1, 10,
        "Prompts are meeting briefs",
        "Give AI the context a coworker would need.",
      ),
    ];
    const result = findSimilarNudge(
      {
        subjectLine: "Prompts are meeting briefs", // identical
        universalInsight: "Give AI the context a coworker would need. Second sentence.", // identical first
      },
      pool,
    );
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("both");
  });

  it("returns the FIRST match when multiple similar nudges exist", () => {
    const pool = [
      makeNudge(100, 10, "Prompts are meeting briefs", "first."),
      makeNudge(200, 11, "Prompts are meeting briefs", "second."),
    ];
    const result = findSimilarNudge(
      { subjectLine: "Prompts are meeting briefs", universalInsight: "whatever." },
      pool,
    );
    expect(result!.nudgeId).toBe(100);
  });

  it("extracts text from legacy contentJson shape (opener/idea)", () => {
    const legacyNudge: Nudge = {
      id: 99,
      userId: 10,
      skillId: null,
      contentJson: { opener: "Prompts are meeting briefs.", idea: "legacy field" } as any,
      subjectLine: "Prompts are meeting briefs",
      emailId: null,
      emailSent: false,
      emailOpened: false,
      inAppRead: false,
      isFirstChallenge: false,
      feedbackRelevant: null,
      feedbackVote: null,
      feedbackText: null,
      sentAt: null,
      createdAt: new Date(),
    } as Nudge;

    const result = findSimilarNudge(
      {
        subjectLine: "Completely different subject entirely now",
        universalInsight: "Prompts work like meeting briefs do. Second sentence.",
      },
      [legacyNudge],
    );
    expect(result).not.toBeNull();
  });

  it("skips nudges with no text content", () => {
    const emptyNudge: Nudge = {
      id: 1,
      userId: 10,
      skillId: null,
      contentJson: {} as any,
      subjectLine: null,
      emailId: null,
      emailSent: false,
      emailOpened: false,
      inAppRead: false,
      isFirstChallenge: false,
      feedbackRelevant: null,
      feedbackVote: null,
      feedbackText: null,
      sentAt: null,
      createdAt: new Date(),
    } as Nudge;
    const result = findSimilarNudge(
      { subjectLine: "any subject line", universalInsight: "any insight." },
      [emptyNudge],
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildAvoidInstruction
// ---------------------------------------------------------------------------
describe("buildAvoidInstruction", () => {
  it("includes the matched subject and insight verbatim", () => {
    const instruction = buildAvoidInstruction({
      nudgeId: 42,
      userId: 10,
      subjectLine: "The one-shot trap",
      universalInsight: "Most people judge AI by the first answer.",
      subjectOverlap: 0.8,
      insightOverlap: 0.2,
      reason: "subject",
    });
    expect(instruction).toContain("The one-shot trap");
    expect(instruction).toContain("Most people judge AI by the first answer.");
    expect(instruction).toContain("CRITICAL");
  });
});

// ---------------------------------------------------------------------------
// Constant sanity checks (detect accidental tuning changes)
// ---------------------------------------------------------------------------
describe("similarity thresholds", () => {
  it("subject threshold is 50%", () => {
    expect(SUBJECT_SIMILARITY_THRESHOLD).toBe(0.5);
  });
  it("insight threshold is 70%", () => {
    expect(INSIGHT_SIMILARITY_THRESHOLD).toBe(0.7);
  });
  it("max regeneration attempts is 2", () => {
    expect(MAX_REGENERATION_ATTEMPTS).toBe(2);
  });
});
