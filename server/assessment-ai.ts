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
  signatureSkillName: string;
  signatureSkillRationale: string;
  brightSpotsText: string;
  futureSelfText: string;
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
- Each skill gets: "green" (demonstrated), "yellow" (emerging/partial), or "red" (not demonstrated)
- For each skill, write a one-sentence explanation of WHY it got that score
- Assessment Level: The highest level where the user has 3+ green skills
- Active Level: The lowest level where they have any non-green skills
- Generate a context summary of the user: their role, work description, AI platform, specific examples mentioned, communication style, what excites/frustrates them
- Generate a "first move" suggestion for their first active skill (the first yellow or red skill at their active level)

ADDITIONAL ANALYSIS (generate these carefully):
- signatureSkillName: Identify the SINGLE skill where this user demonstrated the most depth, sophistication, or unique insight during the conversation. This is their standout strength. Use the exact skill name from the framework.
- signatureSkillRationale: One sentence explaining why this is their signature skill, framed as a compliment. Example: "You showed real depth here — your approach to prompt iteration is more sophisticated than most people at your level."
- brightSpotsText: 2-3 sentences about what this user is already doing well, framed as strengths and advantages, NOT as checkboxes. Lead with what's impressive. Be specific to things they mentioned. Example: "You've built strong habits around first drafts and output editing. Most people at your level haven't figured out voice-first capture yet — that's your unlock."
- futureSelfText: 2-3 sentences painting a vivid, personalized picture of what the NEXT level looks and feels like for someone in their specific role. Make it aspirational and concrete. Example: "As a Level 3 user, you won't just use AI for drafts — you'll have specialized AI teammates handling research, analysis, and first passes on strategy docs while you focus on the thinking only you can do."
- triggerMoment: If the user mentioned WHEN or WHERE they typically reach for AI (e.g., "Monday mornings," "when I'm stuck on writing," "during meeting prep"), capture that here. If not mentioned, return an empty string.

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
  "signatureSkillName": "exact skill name from framework",
  "signatureSkillRationale": "one sentence compliment",
  "brightSpotsText": "2-3 sentences about strengths",
  "futureSelfText": "2-3 sentences about next level",
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
      signatureSkillName: parsed.signatureSkillName || "",
      signatureSkillRationale: parsed.signatureSkillRationale || "",
      brightSpotsText: parsed.brightSpotsText || "",
      futureSelfText: parsed.futureSelfText || "",
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
      signatureSkillName: "",
      signatureSkillRationale: "",
      brightSpotsText: "",
      futureSelfText: "",
      triggerMoment: "",
    };
  }
}
