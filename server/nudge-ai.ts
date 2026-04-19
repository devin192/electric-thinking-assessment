import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { User, Skill, Nudge } from "@shared/schema";
import {
  findSimilarNudge,
  buildAvoidInstruction,
  MAX_REGENERATION_ATTEMPTS,
  type SimilarityCandidate,
  type SimilarityMatch,
} from "./nudge-similarity";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------------------------------------------------------------------------
// Return type for the new nudge format
// ---------------------------------------------------------------------------
export interface NudgeContent {
  universalInsight: string;
  levelAdaptation: string;
  tryThis: string;
  subjectLine: string;
  targetSkillName: string | null;
}

// ---------------------------------------------------------------------------
// Token usage and cost tracking
//
// Claude Sonnet 4 pricing (as of 2026-04):
//   $3.00 per million input tokens
//   $15.00 per million output tokens
// We store cost in CENTS with 4 decimal places (decimal(6,4)), so e.g. 0.4500
// means 0.45 cents (~$0.0045) per nudge.
// ---------------------------------------------------------------------------
const INPUT_TOKEN_COST_PER_MILLION_USD = 3;
const OUTPUT_TOKEN_COST_PER_MILLION_USD = 15;

export interface NudgeUsage {
  inputTokens: number;
  outputTokens: number;
  generationCostCents: number;
}

export interface NudgeGenerationResult {
  content: NudgeContent;
  usage: NudgeUsage;
}

export function calculateNudgeCostCents(inputTokens: number, outputTokens: number): number {
  // Convert USD/MTok to cents/token, then total cents.
  // (tokens / 1e6) * USD_per_MTok * 100 cents_per_USD
  const inputCost = (inputTokens / 1_000_000) * INPUT_TOKEN_COST_PER_MILLION_USD * 100;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_TOKEN_COST_PER_MILLION_USD * 100;
  // Round to 4 decimal places to match decimal(6,4) storage
  return Math.round((inputCost + outputCost) * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Level metadata used in prompts
// ---------------------------------------------------------------------------
const LEVEL_META: Record<number, { name: string; identity: string; villainQuote: string }> = {
  1: {
    name: "Accelerator",
    identity: "Using AI to speed up everyday work",
    villainQuote: "AI gives me generic, useless output. It doesn't understand my work.",
  },
  2: {
    name: "Thought Partner",
    identity: "Using AI as a collaborative thinking partner",
    villainQuote: "AI is great for quick drafts, but when it comes to my real, hard work, I still do that alone.",
  },
  3: {
    name: "Team Builder",
    identity: "Building dedicated AI specialists for your work",
    villainQuote: "I keep going back to the same long threads, re-explaining context every time.",
  },
  4: {
    name: "Systems Designer",
    identity: "Designing autonomous AI-powered systems",
    villainQuote: "I've got my teammates, but I'm the copy-paste monkey between all of them.",
  },
};

// ---------------------------------------------------------------------------
// Level-specific drip topic pools (skills framework distilled)
// ---------------------------------------------------------------------------
const LEVEL_DRIP_TOPICS: Record<number, string[]> = {
  1: [
    "Giving AI a role, task, and context before every interaction",
    "Talking to AI instead of typing (voice-to-text)",
    "Going back and forth instead of expecting a perfect first answer",
    "Uploading documents so AI has real material to work with",
    "Using screenshots paired with voice to get help navigating problems",
    "The post-it habit: asking 'Can AI help with this?' before every task",
    "Spending 30 seconds briefing AI like a new coworker instead of typing two sentences",
    "Using AI for the email you've been avoiding",
    "Getting AI to interview you before it writes anything",
    "The difference between a tool and a teammate",
  ],
  2: [
    "Having AI lead with questions to surface your assumptions",
    "Generating multiple options before picking one (rapid ideation)",
    "Building a document with AI from messy notes and voice memos",
    "Producing a deliverable and tightening it through feedback rounds",
    "Using AI as a stakeholder pressure-test before a real meeting",
    "Asking AI to poke holes in your plan instead of validate it",
    "The 'be fickle and hard to please' principle: demanding editors get better output",
    "Voice-to-text brainstorms: talking through a problem for 3 minutes, then asking AI to organize it",
    "Turning a 2-week exec summary into a 45-minute exercise",
    "Using AI to prep for conversations you're nervous about",
  ],
  3: [
    "Recognizing when part of your work deserves its own dedicated AI teammate",
    "Building a working AI specialist with instructions, examples, and reference docs",
    "Teaching your AI teammate what good output looks like for your context",
    "Managing multiple AI specialists as a coordinated team",
    "Auditing whether your specialists have enough context for a Level 1 person to use them",
    "The difference between a long conversation thread and a purpose-built specialist",
    "Building a specialist for your most repeated weekly task",
    "Writing system prompts that capture your standards, not just your instructions",
    "When to build a new specialist vs. improve an existing one",
    "Sharing your AI teammates with colleagues who do similar work",
  ],
  4: [
    "Mapping your work as a system with triggers, steps, dependencies, and decision points",
    "Knowing which steps need a human based on consequence of failure",
    "Connecting AI teammates into multi-step workflows",
    "Measuring whether an AI workflow actually saves time or just feels clever",
    "Designing handoff points between AI steps and human review",
    "Building feedback loops so your systems improve over time",
    "When to automate vs. when to keep a human in the loop",
    "Turning a manual multi-tool process into a single triggered workflow",
    "Designing for failure: what happens when one step in your system breaks",
    "Teaching others to maintain and improve the systems you build",
  ],
};

// ---------------------------------------------------------------------------
// Shared writing rules and system prompt
// ---------------------------------------------------------------------------
const WRITING_RULES = `WRITING RULES (apply to ALL text you generate):

HARD BANS (zero tolerance, these will fail the output):
- NO em dashes. Not "—", not "--", not any dash longer than a hyphen. Use a period, comma, or colon instead. If you catch yourself writing one, rewrite the sentence. Example: "they're undertrained on saying 'I don't know' — it's a core skill" is WRONG. Rewrite as: "they're undertrained on saying 'I don't know'. That's a core skill." Or: "they're undertrained on saying 'I don't know'. It matters."
- NO "complex", "complexity", "complicated". These are overused filler. Say what you actually mean: "has a lot of moving parts", "hard to untangle", "multi-step", or just delete the word.
- NO "isn't X, it's Y" or "isn't about X, it's about Y" or "not X, but Y" pivot constructions. They are formulaic. This also includes two-sentence variants like "It isn't X. It's Y." or "X isn't too important for Y. It's too important to Z." or any "not X. Y instead." pattern. Say the thing directly. Example: "This isn't about speed, it's about quality" is WRONG. Rewrite as: "This is about quality. Speed is secondary." Or just: "Focus on quality."
- NO "the real X is Y" when used to pivot. Example: "The real skill is patience" is WRONG. Just say "Patience is the skill that matters" or state the point directly.
- NO "the biggest X is Y" openers. Too formulaic. Example: "The biggest mistake people make is..." is WRONG. Rewrite with a specific observation: "Most people stop at one question. Don't."
- NO banned AI words: delve, tapestry, landscape, testament, multifaceted, nuanced, comprehensive, robust, leverage, foster, pivotal, groundbreaking, transformative, synergy, streamline, cutting-edge, game-changer, paradigm, holistic, intricate, intricacies, underscore, enduring, vibrant, crucial, vital, pivotal.
- NO Rule of Three lists ("innovation, collaboration, and excellence"). Use the actual number of items. Two or four is fine.
- NO bold-header bullet lists ("**Speed:** faster code"). Write in sentences.
- NO sycophantic phrases ("Great question!", "You're absolutely right"). Not in the content itself.
- NO curly quotes. Use straight quotes: "like this", not "like this".
- NO vague hedging ("it could potentially be argued", "some might say").

STYLE:
- Vary sentence length. Short sentences hit. Then something longer that takes a beat to land. Then short again.
- Warm, direct, specific. Like advice from a colleague who's really good at this.
- Use "is/are/has" where it fits. Avoid "serves as", "stands as", "functions as".
- First person is fine where appropriate.

FINAL CHECK before you return the JSON:
1. Scan for em dashes. If you find any, rewrite that sentence.
2. Scan for "complex", "complexity", "complicated". If found, replace with the concrete meaning.
3. Scan for "isn't X, it's Y" and "the real X is Y" patterns. If found, rewrite directly.
4. Read each field aloud. If any sentence sounds like a newsletter, a LinkedIn post, or a TED talk opener, rewrite it.`;

function buildSystemPrompt(voiceGuide: string | null | undefined): string {
  return voiceGuide || `You write personalized AI fluency nudges for Electric Thinking. Your tone is warm, direct, and specific. You sound like a smart friend who happens to know a lot about working with AI. Not a newsletter. Not a corporate training email. Not a LinkedIn thought leader. A colleague who pulls you aside and says "hey, try this."`;
}

// ---------------------------------------------------------------------------
// Build a summary of previous nudges (last 20 max) for de-duplication
// ---------------------------------------------------------------------------
function buildPreviousNudgeSummary(previousNudges: Nudge[]): string {
  const recent = previousNudges.slice(0, 20);
  if (recent.length === 0) return "";

  const summaries = recent.map((n, i) => {
    const c = n.contentJson as any;
    // Support both old format and new format
    const insight = c?.universalInsight || c?.opener || c?.idea || "";
    const action = c?.tryThis || c?.action || "";
    const subject = c?.subjectLine || n.subjectLine || "";
    return `Nudge ${i + 1}: insight="${insight}", action="${action}", subject="${subject}"`;
  });

  return `\n\nPREVIOUS NUDGES SENT TO THIS USER (do NOT repeat angles, examples, or actions):\n${summaries.join("\n")}`;
}

// ---------------------------------------------------------------------------
// generateNudge()
//
// Main entry point. When targetSkill is provided (red/yellow sweep phase),
// the nudge is about THAT specific skill. When not provided (level drip),
// delegates to generateLevelDripNudge().
// ---------------------------------------------------------------------------
export async function generateNudge(
  user: User,
  userLevel: number,
  assessmentContext: string,
  previousNudges: Nudge[],
  targetSkill?: { name: string; description: string | null | undefined } | null,
  avoidInstruction?: string,
): Promise<NudgeGenerationResult> {
  if (!targetSkill) {
    return generateLevelDripNudge(user, userLevel, assessmentContext, previousNudges, avoidInstruction);
  }

  const voiceGuide = await storage.getNudgeVoiceGuide();
  const level = Math.max(1, Math.min(4, userLevel));
  const meta = LEVEL_META[level];
  const previousText = buildPreviousNudgeSummary(previousNudges);

  const userPrompt = `Generate a personalized AI fluency nudge for this user. The nudge targets a SPECIFIC skill they need to develop.

USER:
Name: ${user.name || "there"}
Role: ${user.roleTitle || "professional"}
AI platform: ${user.aiPlatform || "Claude"}
Current level: ${level} (${meta.name} — ${meta.identity})
Assessment context: ${assessmentContext || "No assessment context available."}

TARGET SKILL:
Name: ${targetSkill.name}
Description: ${targetSkill.description || targetSkill.name}
${previousText}

FORMAT — respond with ONLY valid JSON, no markdown:

{
  "universalInsight": "A bite-sized, pattern-breaking nugget about this skill and AI fluency. 2-3 sentences. Should feel like something you'd text a friend, not publish in a newsletter. Ground it in a surprising fact, a common mistake, or a reframe that makes people see the skill differently.",
  "levelAdaptation": "1-2 sentences that adapt the insight to Level ${level}. ${level === 1 ? "At Level 1, tell them exactly how to start doing this. Make it feel approachable, not overwhelming." : level === 2 ? "At Level 2, they have basics down. Push them toward using this for harder, more important work." : level === 3 ? "At Level 3, they know this. Challenge them to systematize it or teach it to their team." : "At Level 4, they think in systems. Push them toward building this into workflows that run without them."}",
  "tryThis": "ONE specific thing they can do in under 5 minutes. Personalize it to their role (${user.roleTitle || "their work"}) and their AI platform (${user.aiPlatform || "Claude"}). Not a copy-paste prompt. Describe what to do in plain language.",
  "subjectLine": "Feels like a text from a friend. Short. Specific to the insight or their work context. NOT 'Your weekly AI tip' or anything that sounds like a newsletter."
}

${WRITING_RULES}

GOOD EXAMPLES (study these carefully):

GOOD universalInsight: "People type around 40 words a minute. They talk around 150. When you type a prompt, you unconsciously strip it down to the minimum. When you talk, you give the full picture. That extra context is the gap between generic output and something you'd actually send."

GOOD levelAdaptation: "At Level 2, you've got the basics. The risk now is bringing a hard problem in, getting a mediocre first pass, and assuming AI can't handle the important stuff. It can. You just have to stay in the conversation longer."

GOOD tryThis: "Open Claude on your phone. Hit the mic button. Spend 90 seconds describing the inventory problem you were about to email Dave about. Then ask Claude to draft the message. Compare it to what you'd have typed in two sentences."

BAD EXAMPLES (DO NOT produce anything like these):

BAD universalInsight: "This isn't just about prompting, it's about building a real relationship with your AI. The biggest mistake people make is treating AI as a complex tool rather than a teammate. The real skill is learning to collaborate." (uses banned "isn't X, it's Y", "the biggest X is Y", "complex", "the real skill is")

BAD levelAdaptation: "At Level 2, it's important to delve deeper into the nuanced landscape of AI collaboration — you need a comprehensive, robust approach." (uses em dash, banned words "delve", "nuanced", "landscape", "comprehensive", "robust")

BAD tryThis: "Spend some time thinking about how you could potentially use AI in your work. Consider various approaches and explore what might resonate with your role." (vague, no concrete output, no platform reference, generic advice anyone could get)

PERSONALIZATION CHECK (run before finalizing):
(a) Is the universalInsight generic advice anyone could receive, or is it pattern-breaking and specific? If it would apply equally to a marketing manager, a nurse, and a farmer, rewrite it to land harder for this person.
(b) Does the levelAdaptation reference something specific to their role (${user.roleTitle || "their work"}) or their assessment context? If it's just "at Level ${level}, do X", add a detail tied to what they actually do.
(c) Is the tryThis concrete enough that if they did it in 5 minutes, they'd be looking at a specific output? Not "think about", not "consider", not "explore". Something they could screenshot and send back.

${previousNudges.length > 0 ? "CRITICAL: Generate something MEANINGFULLY DIFFERENT from all previous nudges listed above. Different angle, different example, different action." : ""}
${avoidInstruction ? `\n${avoidInstruction}\n` : ""}
Respond with ONLY valid JSON, no markdown:`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: buildSystemPrompt(voiceGuide),
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = parseNudgeResponse(response);
  return {
    content: {
      ...parsed,
      targetSkillName: targetSkill.name,
    },
    usage: extractUsage(response),
  };
}

// ---------------------------------------------------------------------------
// generateLevelDripNudge()
//
// For the second phase: red/yellow skills are exhausted, so we pick from a
// curated pool of level-appropriate topics drawn from the skills framework.
// ---------------------------------------------------------------------------
export async function generateLevelDripNudge(
  user: User,
  userLevel: number,
  assessmentContext: string,
  previousNudges: Nudge[],
  avoidInstruction?: string,
): Promise<NudgeGenerationResult> {
  const voiceGuide = await storage.getNudgeVoiceGuide();
  const level = Math.max(1, Math.min(4, userLevel));
  const meta = LEVEL_META[level];
  const previousText = buildPreviousNudgeSummary(previousNudges);

  // Give the model the full topic pool so it can pick and vary
  const topicPool = LEVEL_DRIP_TOPICS[level];
  const topicList = topicPool.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const userPrompt = `Generate a personalized AI fluency nudge for this user. This is a LEVEL DRIP nudge (not targeting a specific skill gap). Pick one topic from the pool below and build a fresh, specific nudge around it.

USER:
Name: ${user.name || "there"}
Role: ${user.roleTitle || "professional"}
AI platform: ${user.aiPlatform || "Claude"}
Current level: ${level} (${meta.name} — ${meta.identity})
Assessment context: ${assessmentContext || "No assessment context available."}

TOPIC POOL FOR LEVEL ${level}:
${topicList}

Pick whichever topic would be most useful and interesting for this specific person given their role and context. Do NOT just go in order. Surprise them.
${previousText}

FORMAT — respond with ONLY valid JSON, no markdown:

{
  "universalInsight": "A bite-sized, pattern-breaking nugget about the topic you chose. 2-3 sentences. Should feel like advice from a smart friend, not a newsletter. Ground it in a surprising fact, a common mistake, or a reframe.",
  "levelAdaptation": "1-2 sentences that adapt the insight to Level ${level}. ${level === 1 ? "At Level 1, tell them exactly how to start doing this. Make it feel approachable." : level === 2 ? "At Level 2, they have basics down. Push them toward using this for harder, more important work." : level === 3 ? "At Level 3, they know this. Challenge them to systematize it or teach it to their team." : "At Level 4, they think in systems. Push them toward building this into workflows that run without them."}",
  "tryThis": "ONE specific thing they can do in under 5 minutes. Personalize it to their role (${user.roleTitle || "their work"}) and their AI platform (${user.aiPlatform || "Claude"}). Not a copy-paste prompt. Describe what to do in plain language.",
  "subjectLine": "Feels like a text from a friend. Short. Specific to the insight or their work context. NOT 'Your weekly AI tip' or anything that sounds like a newsletter."
}

${WRITING_RULES}

GOOD EXAMPLES (study these carefully):

GOOD universalInsight: "Anthropic looked at what predicts whether someone gets good at AI. Not IQ. Not technical background. The number of conversation turns. People who go back and forth 5 or 6 times get dramatically better output than people who ask once and walk away."

GOOD levelAdaptation: "At Level 3, you already know this. The question is whether you've built a dedicated specialist for the work you repeat most often, or whether your best prompts are still buried in old threads you keep reopening."

GOOD tryThis: "Pick the analysis you ran last week. Paste the findings into Claude and ask it to challenge your interpretation. When it pushes back, tell it what it got wrong about your context. Keep going for at least four rounds. Save the final exchange somewhere you can find it."

BAD EXAMPLES (DO NOT produce anything like these):

BAD universalInsight: "AI fluency isn't just about using the tools, it's about a complex, multifaceted approach to collaboration — the real unlock is embracing the nuanced landscape of possibilities." (em dash, "isn't X, it's Y", "complex", "multifaceted", "nuanced", "landscape", "the real unlock is")

BAD levelAdaptation: "The biggest challenge at Level 2 is that you need to leverage your existing skills to foster deeper engagement with AI." (banned "the biggest X is Y" opener, banned words "leverage" and "foster")

BAD tryThis: "Think about how you might use AI more effectively. Explore different approaches and see what resonates with your workflow." (vague, no specific output, no role or platform reference, generic advice)

PERSONALIZATION CHECK (run before finalizing):
(a) Is the universalInsight generic advice anyone could receive, or is it pattern-breaking and specific? If it would apply equally to a marketing manager, a nurse, and a farmer, rewrite it to land harder for this person's role.
(b) Does the levelAdaptation reference something specific to their role (${user.roleTitle || "their work"}) or their assessment context? If it's just "at Level ${level}, do X", add a detail tied to what they actually do.
(c) Is the tryThis concrete enough that if they did it in 5 minutes, they'd be looking at a specific output? Not "think about", not "consider", not "explore". Something they could screenshot and send back.

${previousNudges.length > 0 ? "CRITICAL: Generate something MEANINGFULLY DIFFERENT from all previous nudges listed above. Different topic, different angle, different action." : ""}
${avoidInstruction ? `\n${avoidInstruction}\n` : ""}
Respond with ONLY valid JSON, no markdown:`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: buildSystemPrompt(voiceGuide),
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = parseNudgeResponse(response);
  return {
    content: {
      ...parsed,
      targetSkillName: null,
    },
    usage: extractUsage(response),
  };
}

// ---------------------------------------------------------------------------
// generateNudgeWithDedup()
//
// Cross-user de-duplication wrapper. Generates a nudge, checks it against the
// last 7 days of nudges sent to OTHER users, and regenerates up to
// MAX_REGENERATION_ATTEMPTS (2) times if it's too similar. After the retry
// budget is spent, accepts whatever the last attempt produced.
//
// Token/cost usage is accumulated across attempts so callers see the true
// cost of the dedup process, not just the final generation.
// ---------------------------------------------------------------------------
const DEDUP_WINDOW_DAYS = 7;

export async function generateNudgeWithDedup(
  user: User,
  userLevel: number,
  assessmentContext: string,
  previousNudges: Nudge[],
  targetSkill?: { name: string; description: string | null | undefined } | null,
): Promise<NudgeGenerationResult> {
  // Fetch the pool of recent nudges ONCE, then filter out the current user.
  // Filtering here keeps the DB query simple and makes the test seam easy.
  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = await storage.getRecentNudgesAcrossUsers(since);
  const otherUsersRecent = recent.filter(n => n.userId !== user.id);

  let avoidInstruction: string | undefined;
  let lastResult: NudgeGenerationResult | null = null;
  let accumulatedInputTokens = 0;
  let accumulatedOutputTokens = 0;
  let accumulatedCostCents = 0;

  // attempt 0 = initial, attempts 1..MAX are regenerations
  for (let attempt = 0; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
    const result = await generateNudge(
      user,
      userLevel,
      assessmentContext,
      previousNudges,
      targetSkill,
      avoidInstruction,
    );

    accumulatedInputTokens += result.usage.inputTokens;
    accumulatedOutputTokens += result.usage.outputTokens;
    accumulatedCostCents += result.usage.generationCostCents;
    lastResult = result;

    const candidate: SimilarityCandidate = {
      subjectLine: result.content.subjectLine,
      universalInsight: result.content.universalInsight,
    };
    const match: SimilarityMatch | null = findSimilarNudge(candidate, otherUsersRecent);

    if (!match) {
      // Clean result. Return with accumulated usage (in case we regenerated).
      return {
        content: result.content,
        usage: {
          inputTokens: accumulatedInputTokens,
          outputTokens: accumulatedOutputTokens,
          generationCostCents:
            Math.round(accumulatedCostCents * 10_000) / 10_000,
        },
      };
    }

    // Similar. Log and prepare for another attempt (if budget remains).
    console.log(
      `[nudge-dedup] userId=${user.id} retry=${attempt + 1} reason=similar-to-${match.nudgeId} ` +
      `(matchedUserId=${match.userId}, reason=${match.reason}, ` +
      `subjectOverlap=${match.subjectOverlap.toFixed(2)}, insightOverlap=${match.insightOverlap.toFixed(2)})`,
    );

    if (attempt < MAX_REGENERATION_ATTEMPTS) {
      avoidInstruction = buildAvoidInstruction(match);
    }
  }

  // Retry budget exhausted. Accept the last attempt.
  console.log(
    `[nudge-dedup] userId=${user.id} retry-budget-exhausted accepting-last-attempt`,
  );

  // lastResult is non-null here because the loop ran at least once.
  return {
    content: lastResult!.content,
    usage: {
      inputTokens: accumulatedInputTokens,
      outputTokens: accumulatedOutputTokens,
      generationCostCents:
        Math.round(accumulatedCostCents * 10_000) / 10_000,
    },
  };
}

// ---------------------------------------------------------------------------
// Extract token usage and compute cost from an Anthropic response
// ---------------------------------------------------------------------------
function extractUsage(response: Anthropic.Message): NudgeUsage {
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    generationCostCents: calculateNudgeCostCents(inputTokens, outputTokens),
  };
}

// ---------------------------------------------------------------------------
// Response parsing (shared)
// ---------------------------------------------------------------------------
function parseNudgeResponse(response: Anthropic.Message): Omit<NudgeContent, "targetSkillName"> {
  const textBlock = response.content.find(b => b.type === "text");
  const text = textBlock?.text || "{}";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate all required fields exist
    if (!parsed.universalInsight || !parsed.levelAdaptation || !parsed.tryThis || !parsed.subjectLine) {
      throw new Error("Missing required fields in nudge response");
    }

    return {
      universalInsight: parsed.universalInsight,
      levelAdaptation: parsed.levelAdaptation,
      tryThis: parsed.tryThis,
      subjectLine: parsed.subjectLine,
    };
  } catch (e) {
    console.error("Failed to parse nudge response:", e);
    return {
      universalInsight: "Most people ask AI one question and judge the whole technology by the answer. That's like evaluating a new hire after one email.",
      levelAdaptation: "The unlock is going back and forth. Give feedback. Be specific about what's wrong. The second and third responses are where it gets good.",
      tryThis: "Open your AI tool right now. Pick something small you need to do today. After the first response, say what's off and ask for another take.",
      subjectLine: "The one-shot trap",
    };
  }
}

// ---------------------------------------------------------------------------
// generateVerificationQuestions() — preserved from original, may be reused
// ---------------------------------------------------------------------------
export async function generateVerificationQuestions(
  user: User,
  skill: Skill
): Promise<Array<{
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}>> {
  const latestAssessment = (await storage.getCompletedAssessments(user.id))[0];
  const contextSummary = latestAssessment?.contextSummary || "";

  const prompt = `Generate 3 multiple-choice skill check questions for this AI fluency skill. These confirm understanding, they don't trick people. The tone is encouraging, like a coach checking in, not a professor giving a test.

SKILL:
Name: ${skill.name}
Description: ${skill.description}

USER CONTEXT:
Name: ${user.name || "Unknown"}
Role: ${user.roleTitle || "Unknown"}
AI Platform: ${user.aiPlatform || "Unknown"}
${contextSummary ? `Assessment context: ${contextSummary}` : ""}

QUESTION RULES:
- Personalize scenarios to the user's role and context. A question for a marketing manager should use marketing examples.
- Use "Which of these would work best for..." framing, not "Which of the following is correct?"
- Wrong answers should be plausible but clearly inferior if you understand the skill. No trick options.
- Never use "All of the above" or "None of the above."
- Each question tests whether they understand the skill in practice, not whether they can define it.
- The explanation should be encouraging and teach something. "This works because..." not "The correct answer is A because..."

Each question should have 4 options with one correct answer.

Respond with ONLY valid JSON array, no markdown:
[
  {
    "question": "question text",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0,
    "explanation": "Brief, encouraging explanation"
  }
]`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const text = textBlock?.text || "[]";

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");
    const questions = JSON.parse(jsonMatch[0]);
    return questions.slice(0, 3);
  } catch (e) {
    console.error("Failed to parse verification questions:", e);
    return [
      {
        question: `Which best describes ${skill.name}?`,
        options: [skill.description || "Using AI effectively", "Avoiding AI tools", "Only using AI for simple tasks", "Replacing human judgment entirely"],
        correctIndex: 0,
        explanation: `${skill.name} is about ${skill.description?.toLowerCase() || "using AI effectively"}.`,
      },
      {
        question: `When practicing ${skill.name}, what matters most?`,
        options: ["Consistent practice and reflection", "Getting perfect results every time", "Using only one specific tool", "Memorizing exact prompts"],
        correctIndex: 0,
        explanation: "Building AI fluency is about consistent practice and learning from results.",
      },
      {
        question: `How do you know you've developed ${skill.name}?`,
        options: ["You can apply it naturally in your work", "You've read about it extensively", "Someone told you about it", "You watched a tutorial"],
        correctIndex: 0,
        explanation: "True skill development means you can apply it confidently in real work situations.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// EXAMPLE OUTPUTS (for eyeballing quality)
//
// These are hand-written examples of what the new format should produce.
// They follow all writing rules and demonstrate the level adaptation pattern.
//
// --- Example 1: L1 warehouse manager, targetSkill = "Voice-to-Text" ---
// {
//   "universalInsight": "People type an average of 40 words per minute. They speak about 150. When you type a prompt to AI, you unconsciously edit yourself down to the bare minimum. When you talk, you give it the full picture. That extra context is the difference between generic output and something you'd actually use.",
//   "levelAdaptation": "At Level 1, this is the fastest way to get better results without learning anything new. Just talk instead of type. Your AI tool has a mic button. Use it.",
//   "tryThis": "Next time you need to write an email about inventory or a shift update, open Claude and hit the mic button. Spend 30 seconds explaining the situation out loud. Then ask it to draft the message. Compare that to what you'd get from typing two sentences.",
//   "subjectLine": "You're typing too little",
//   "targetSkillName": "Voice-to-Text"
// }
//
// --- Example 2: L2 analytics person, level drip (no targetSkill) ---
// {
//   "universalInsight": "Anthropic studied what predicts whether someone gets good at using AI. It's not technical background. It's not IQ. It's the number of conversation turns. People who go back and forth 5-6 times get dramatically better output than people who ask once and walk away.",
//   "levelAdaptation": "At Level 2, you've moved past simple tasks. The risk now is that you bring your hard problems to AI, get a mediocre first answer, and conclude it can't help with the real stuff. It can. You just have to push back and iterate.",
//   "tryThis": "Pick a data analysis you're working on. Paste in your initial findings and ask Claude to challenge your interpretation. When it responds, tell it what it got wrong about your context. Do at least 4 rounds before you stop.",
//   "subjectLine": "The 4-round rule",
//   "targetSkillName": null
// }
//
// --- Example 3: L3 software engineer, targetSkill = "Onboard the Teammate" ---
// {
//   "universalInsight": "Most people using AI at a high level still have one problem: their best prompts and context live in conversation threads that get buried. You figured out what works, but you carry it in your head instead of writing it down for the AI. That's the gap between a power user and someone with an actual AI team.",
//   "levelAdaptation": "At Level 3, you know this. The question is whether you've actually sat down and built a dedicated specialist for your most common workflow. Not a long thread you keep going back to. A purpose-built teammate with written instructions, examples of good output, and the reference docs it needs.",
//   "tryThis": "Pick the coding task you do most often, like code review or writing tests. Open a new Claude Project. Write a 3-paragraph system prompt: who this specialist is, what good output looks like, and what files or standards it should reference. Test it on something real.",
//   "subjectLine": "Your best prompts are buried in old threads",
//   "targetSkillName": "Onboard the Teammate"
// }
// ---------------------------------------------------------------------------
