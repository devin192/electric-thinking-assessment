import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { Skill, Level } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export async function getAssessmentResponse(
  messages: ConversationMessage[],
  userContext: { name?: string; roleTitle?: string; aiPlatform?: string }
): Promise<string> {
  const guide = await storage.getSystemConfig("assessment_conversation_guide");
  const systemPrompt = guide || "You are an AI fluency assessment agent.";

  const contextInfo = [
    userContext.name ? `User's name: ${userContext.name}` : "",
    userContext.roleTitle ? `Role: ${userContext.roleTitle}` : "",
    userContext.aiPlatform ? `Primary AI platform: ${userContext.aiPlatform}` : "",
  ].filter(Boolean).join("\n");

  const fullSystemPrompt = `${systemPrompt}\n\nUser context:\n${contextInfo}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    system: fullSystemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find(b => b.type === "text");
  return textBlock?.text || "I appreciate you sharing that. Could you tell me more?";
}

export async function scoreAssessment(
  transcript: string,
  userContext: { name?: string; roleTitle?: string; aiPlatform?: string }
): Promise<{
  scores: Record<string, { status: string; explanation: string }>;
  assessmentLevel: number;
  activeLevel: number;
  contextSummary: string;
  firstMove: { skillName: string; suggestion: string };
  outcomeOptions: Array<{ outcomeHeadline: string; timeEstimate: string; skillName: string; action: string; whatYoullSee: string }>;
  signatureSkillName: string;
  signatureSkillRationale: string;
  brightSpots: string[];
  futureSelfText: string;
  nextLevelIdentity: string;
  triggerMoment: string;
}> {
  const allLevels = await storage.getLevels();
  const allSkills = await storage.getSkills();

  const skillsByLevel: Record<number, Skill[]> = {};
  allSkills.forEach(s => {
    if (!skillsByLevel[s.levelId]) skillsByLevel[s.levelId] = [];
    skillsByLevel[s.levelId].push(s);
  });

  const frameworkDescription = allLevels.map(level => {
    const lvlSkills = skillsByLevel[level.id] || [];
    return `Level ${level.sortOrder} - ${level.displayName}:\n${lvlSkills.map(s => `  - ${s.name}: ${s.description}`).join("\n")}`;
  }).join("\n\n");

  const scoringPrompt = `You are scoring an AI fluency assessment. Analyze the following conversation transcript and evaluate the user against each skill in the framework.

SKILL FRAMEWORK:
${frameworkDescription}

SCORING RULES:
- Green: The user described this skill as a regular, habitual part of their workflow AND gave at least one specific example. They do this consistently, not occasionally.
- Yellow: The user mentioned trying this, described inconsistent use, or showed awareness without clear evidence of regular practice. "I've done that a few times" or "I know I should" both land here.
- Red: The user never mentioned this skill, explicitly said they don't do it, or the transcript contains no evidence. When in doubt between red and yellow, choose red. Do not give yellow for vague mentions.
- For each skill, write a one-sentence explanation of WHY it got that score, referencing specific evidence from the transcript.
- Assessment Level: The highest level where the user has 3+ green skills
- Active Level: The lowest level where they have any non-green skills
- contextSummary: Write a rich, specific profile of this person. Include: their exact role and what they do day to day, which AI platform they use and how, specific examples they gave during the conversation, what excites them about AI, what frustrates them, and any communication style notes. This summary powers all future personalization, so generic summaries are a failure. If they said something specific, capture it.
- Generate a "first move" suggestion for their first active skill (the first yellow or red skill at their active level)

WRITING STYLE FOR GENERATED TEXT (brightSpotsText, futureSelfText, signatureSkillRationale):
- Never use em dashes. Use periods or commas instead.
- Never use the words: delve, tapestry, landscape, testament, multifaceted, nuanced, comprehensive, robust, leverage, foster, pivotal, groundbreaking, transformative, synergy, streamline, cutting-edge, game-changer, paradigm, holistic.
- Never open with "Great job!" or "Amazing progress!" or similar. Be warm but not patronizing. The user is an adult professional.
- Be specific. Reference things the user actually said. "You've figured out voice-first drafting" is better than "You show strong AI skills."
- Emphasize what they've already accomplished, not what's left to do.

ADDITIONAL ANALYSIS (generate these carefully):
- signatureSkillName: Identify the SINGLE skill where this user demonstrated the most depth, sophistication, or unique insight during the conversation. This is their standout strength. Use the exact skill name from the framework.
- signatureSkillRationale: One sentence explaining why this is their signature skill, framed as a compliment. Example: "You showed real depth here. Your approach to prompt iteration is more sophisticated than most people at your level."
- brightSpots: An array of exactly 2 bullet points (one sentence each) about what this user is already doing well. Be specific to things they mentioned. Frame as strengths. Example: ["You've figured out voice-first drafting, which most people at your level skip entirely", "Your instinct to iterate on AI output instead of accepting the first response puts you ahead"]
- futureSelfText: ONE sentence painting the next level identity. Make it aspirational and tied to their role. Example: "At Level 3, your AI stops being a tool you use and starts being a teammate that handles entire workflows for you."
- nextLevelIdentity: The display name of the next level up from their assessed level. If they're at Level 4 (Agentic Workflow), return "You've reached the top level."
- outcomeOptions: An array of exactly 2 outcome-framed challenge options. Each should be tied to something the user said during the conversation. Frame as OUTCOMES, not skill names. The user will pick one.
  Each option has:
  - outcomeHeadline: A tantalizing outcome in one sentence. Example: "Your meeting recaps write themselves after every call." NOT "Practice Quick Drafting."
  - timeEstimate: How long to try it. Usually "~90 seconds" or "~2 minutes". Keep it short.
  - skillName: The actual skill name from the framework (shown only after they complete it).
  - action: ONE specific thing to do right now. Not a generic tip. Example: "Open your last meeting notes, paste them into ${userContext.aiPlatform || "your AI tool"}, and ask it to write a one-paragraph recap highlighting decisions made and next steps."
  - whatYoullSee: ONE sentence describing the expected result. Example: "You'll get a clean recap in about 10 seconds. Compare it to what you'd normally write."
- triggerMoment: If the user mentioned WHEN or WHERE they typically reach for AI (e.g., "Monday mornings," "when I'm stuck on writing," "during meeting prep"), capture that here. If not mentioned, return an empty string.

IMPORTANT FOR outcomeOptions:
- Both options must be doable in under 2 minutes.
- Both must reference something specific the user said about their work.
- Frame as the OUTCOME they get, not the skill they practice.
- The action should describe what to do in their own words, not a copy-paste prompt.
- Make both options genuinely appealing. The user should have a hard time choosing.

TRANSCRIPT:
${transcript}

USER INFO:
Name: ${userContext.name || "Unknown"}
Role: ${userContext.roleTitle || "Unknown"}
AI Platform: ${userContext.aiPlatform || "Unknown"}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "scores": {
    "Skill Name": { "status": "green|yellow|red", "explanation": "one sentence" }
  },
  "assessmentLevel": 0,
  "activeLevel": 0,
  "contextSummary": "paragraph about the user",
  "firstMove": { "skillName": "name", "suggestion": "actionable suggestion" },
  "outcomeOptions": [
    { "outcomeHeadline": "outcome sentence", "timeEstimate": "~90 seconds", "skillName": "framework skill name", "action": "specific action", "whatYoullSee": "expected result" },
    { "outcomeHeadline": "outcome sentence", "timeEstimate": "~90 seconds", "skillName": "framework skill name", "action": "specific action", "whatYoullSee": "expected result" }
  ],
  "signatureSkillName": "exact skill name from framework",
  "signatureSkillRationale": "one sentence compliment",
  "brightSpots": ["bullet 1", "bullet 2"],
  "futureSelfText": "one sentence about next level identity",
  "nextLevelIdentity": "display name of next level",
  "triggerMoment": "when they reach for AI, or empty string"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: scoringPrompt }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const text = textBlock?.text || "{}";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]);

    const assessmentLevel = parsed.assessmentLevel ?? 0;
    const activeLevel = parsed.activeLevel ?? 0;

    return {
      scores: parsed.scores || {},
      assessmentLevel: Math.max(0, Math.min(4, assessmentLevel)),
      activeLevel: Math.max(0, Math.min(4, activeLevel)),
      contextSummary: parsed.contextSummary || "",
      firstMove: parsed.firstMove || { skillName: "", suggestion: "" },
      outcomeOptions: parsed.outcomeOptions || [],
      signatureSkillName: parsed.signatureSkillName || "",
      signatureSkillRationale: parsed.signatureSkillRationale || "",
      brightSpots: parsed.brightSpots || [],
      futureSelfText: parsed.futureSelfText || "",
      nextLevelIdentity: parsed.nextLevelIdentity || "",
      triggerMoment: parsed.triggerMoment || "",
    };
  } catch (e) {
    console.error("Failed to parse scoring response:", e);
    const defaultScores: Record<string, { status: string; explanation: string }> = {};
    allSkills.forEach(s => {
      defaultScores[s.name] = { status: "red", explanation: "Not enough information to assess." };
    });
    return {
      scores: defaultScores,
      assessmentLevel: 0,
      activeLevel: 0,
      contextSummary: "Assessment scoring encountered an error.",
      firstMove: { skillName: allSkills[0]?.name || "", suggestion: "Try opening an AI tool and having your first conversation." },
      outcomeOptions: [],
      signatureSkillName: "",
      signatureSkillRationale: "",
      brightSpots: [],
      futureSelfText: "",
      nextLevelIdentity: "",
      triggerMoment: "",
    };
  }
}
