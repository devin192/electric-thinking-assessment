import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { User, Skill, Nudge } from "@shared/schema";

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
- Never use em dashes (--  or —). Use periods or commas instead.
- Never use these words: delve, tapestry, landscape, testament, multifaceted, nuanced, comprehensive, robust, leverage, foster, pivotal, groundbreaking, transformative, synergy, streamline, cutting-edge, game-changer, paradigm, holistic.
- No "It's not just X, it's Y" constructions.
- No Rule of Three patterns ("innovation, collaboration, and excellence"). Use the natural number of items.
- Vary sentence length. Short sentences hit. Then something longer. Then short again.
- Warm, direct, specific. Like advice from a colleague who's really good at this.
- No sycophantic tone. No bold-header bullet lists. No synonym cycling.`;

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
): Promise<NudgeContent> {
  if (!targetSkill) {
    return generateLevelDripNudge(user, userLevel, assessmentContext, previousNudges);
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

${previousNudges.length > 0 ? "CRITICAL: Generate something MEANINGFULLY DIFFERENT from all previous nudges listed above. Different angle, different example, different action." : ""}

Respond with ONLY valid JSON, no markdown:`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: buildSystemPrompt(voiceGuide),
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = parseNudgeResponse(response);
  return {
    ...parsed,
    targetSkillName: targetSkill.name,
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
): Promise<NudgeContent> {
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

${previousNudges.length > 0 ? "CRITICAL: Generate something MEANINGFULLY DIFFERENT from all previous nudges listed above. Different topic, different angle, different action." : ""}

Respond with ONLY valid JSON, no markdown:`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: buildSystemPrompt(voiceGuide),
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = parseNudgeResponse(response);
  return {
    ...parsed,
    targetSkillName: null,
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
