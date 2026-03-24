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
  userContext: { name?: string; roleTitle?: string; aiPlatform?: string; surveyContext?: string }
): Promise<string> {
  const guide = await storage.getSystemConfig("assessment_conversation_guide");
  const systemPrompt = guide || "You are an AI fluency assessment agent.";

  const contextInfo = [
    userContext.name ? `User's name: ${userContext.name}` : "",
    userContext.roleTitle ? `Role: ${userContext.roleTitle}` : "",
    userContext.aiPlatform ? `Primary AI platform: ${userContext.aiPlatform}` : "",
    userContext.surveyContext ? `\nSurvey results (from Part A self-assessment):\n${userContext.surveyContext}` : "",
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
  workContextSummary: string;
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

  const scoringPrompt = `You are scoring an AI fluency assessment conversation. This conversation focused heavily on understanding the person's work context before asking about AI usage. Use both the work context and AI usage evidence to score accurately.

SKILL FRAMEWORK:
${frameworkDescription}

SCORING RULES:
- Green: The user described this skill as a regular, habitual part of their workflow AND gave at least one specific example. They do this consistently, not occasionally.
- Yellow: The user mentioned trying this, described inconsistent use, or showed awareness without clear evidence of regular practice. "I've done that a few times" or "I know I should" both land here.
- Red: The user never mentioned this skill, explicitly said they don't do it, or the transcript contains no evidence. When in doubt between red and yellow, choose red. Do not give yellow for vague mentions.
- For each skill, write a one-sentence explanation of WHY it got that score, referencing specific evidence from the transcript.
- Assessment Level: The highest level where the user has 3+ green skills
- Active Level: The lowest level where they have any non-green skills

WORK CONTEXT IS PRIMARY DATA:
The conversation spent significant time understanding this person's actual work. Use that context heavily:
- contextSummary: Write a rich, specific profile of this person. Include: their exact role and what they do day to day, which AI platform they use and how, specific examples they gave during the conversation, what excites them about AI, what frustrates them, and any communication style notes. This summary powers all future personalization, so generic summaries are a failure. If they said something specific, capture it.
- workContextSummary: Write a 2-3 sentence summary focused specifically on the person's key recurring work activities, tools they use, and who they work with. This powers email subject lines and Power Up personalization. Example: "Sarah spends most of her week writing client proposals and managing a team of 4 account managers. She uses Google Docs and Salesforce daily, and her biggest time sink is pulling data from Salesforce into proposal templates. She collaborates closely with the design team for pitch decks."
- firstMove: Make the suggestion reference their specific work. Example: "Based on the weekly reports you described, try having AI draft the executive summary section next time." NOT generic advice.
- brightSpots: Reference specific work tasks they mentioned. Example: "You've already figured out how to use AI for the client proposal drafts you write every week" NOT "You show strong AI skills."
- futureSelfText: Paint a picture using their actual job. Example: "Imagine your Monday morning planning sessions already have a draft agenda pulled from last week's action items, ready for you to review." NOT generic level descriptions.
- triggerMoment: Should come from the work context naturally. When do they hit friction? What recurring task frustrates them?

WRITING STYLE FOR GENERATED TEXT (brightSpotsText, futureSelfText, signatureSkillRationale, firstMove suggestion):
- Never use em dashes. Use periods or commas instead.
- Never use the words: delve, tapestry, landscape, testament, multifaceted, nuanced, comprehensive, robust, leverage, foster, pivotal, groundbreaking, transformative, synergy, streamline, cutting-edge, game-changer, paradigm, holistic.
- Never open with "Great job!" or "Amazing progress!" or similar. Be warm but not patronizing. The user is an adult professional.
- Be specific. Reference things the user actually said. "You've figured out voice-first drafting for your meeting recaps" is better than "You show strong AI skills."
- Emphasize what they've already accomplished, not what's left to do.

ADDITIONAL ANALYSIS (generate these carefully):
- signatureSkillName: Identify the SINGLE skill where this user demonstrated the most depth, sophistication, or unique insight during the conversation. This is their standout strength. Use the exact skill name from the framework.
- signatureSkillRationale: One sentence explaining why this is their signature skill, framed as a compliment. Example: "You showed real depth here. Your approach to prompt iteration is more sophisticated than most people at your level."
- brightSpots: An array of exactly 2 bullet points (one sentence each) about what this user is already doing well. Be specific to things they mentioned about their work. Frame as strengths. Example: ["You've figured out voice-first drafting for meeting recaps, which most people at your level skip entirely", "Your instinct to iterate on AI output for client proposals instead of accepting the first response puts you ahead"]
- futureSelfText: ONE sentence painting the next level identity using their actual job context. Example: "Imagine your Monday morning planning sessions already have a draft agenda pulled from last week's action items, ready for you to review."
- nextLevelIdentity: The display name of the next level up from their assessed level. If they're at Level 3 (Agentic Workflow), return "You've reached the top level."
- outcomeOptions: An array of exactly 3 outcome-framed challenge options. Each should be tied to something specific the user said about their work during the conversation. Frame as OUTCOMES, not skill names. The user will pick one.
  Each option has:
  - outcomeHeadline: A tantalizing outcome in one sentence tied to their actual work. Example: "Your meeting recaps write themselves after every call." NOT "Practice Quick Drafting."
  - timeEstimate: How long to try it. Usually "~5 minutes" or "under 10 minutes". Keep it realistic.
  - skillName: The actual skill name from the framework (shown only after they complete it).
  - action: ONE specific thing to do right now, referencing their tools and workflows. Not a generic tip. Example: "Open your last meeting notes, paste them into ${userContext.aiPlatform || "your AI tool"}, and ask it to write a one-paragraph recap highlighting decisions made and next steps."
  - whatYoullSee: ONE sentence describing the expected result. Example: "You'll get a clean recap in about 10 seconds. Compare it to what you'd normally write."
- triggerMoment: If the user mentioned WHEN or WHERE they typically hit friction or reach for AI (e.g., "Monday mornings," "when I'm stuck on writing," "during meeting prep," "pulling Salesforce data"), capture that here. If not mentioned, return an empty string.

IMPORTANT FOR outcomeOptions:
- All three options should be doable in a few minutes — realistic, not rushed.
- All three must reference something specific the user said about their work.
- Frame as the OUTCOME they get, not the skill they practice.
- The action should describe what to do in their own words, not a copy-paste prompt.
- Make all three options genuinely appealing. The user should have a hard time choosing.

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
  "workContextSummary": "2-3 sentence summary of the person's key recurring work activities and tools",
  "firstMove": { "skillName": "name", "suggestion": "actionable suggestion referencing their specific work" },
  "outcomeOptions": [
    { "outcomeHeadline": "outcome sentence", "timeEstimate": "~5 minutes", "skillName": "framework skill name", "action": "specific action referencing their work", "whatYoullSee": "expected result" },
    { "outcomeHeadline": "outcome sentence", "timeEstimate": "~5 minutes", "skillName": "framework skill name", "action": "specific action referencing their work", "whatYoullSee": "expected result" },
    { "outcomeHeadline": "outcome sentence", "timeEstimate": "~5 minutes", "skillName": "framework skill name", "action": "specific action referencing their work", "whatYoullSee": "expected result" }
  ],
  "signatureSkillName": "exact skill name from framework",
  "signatureSkillRationale": "one sentence compliment",
  "brightSpots": ["bullet 1 referencing their work", "bullet 2 referencing their work"],
  "futureSelfText": "one sentence about next level identity using their actual job",
  "nextLevelIdentity": "display name of next level",
  "triggerMoment": "when they hit friction at work, or empty string"
}`;

  const maxRetries = 3;
  const retryDelayMs = 2000;
  const allSkillNames = allSkills.map(s => s.name);
  const allSkillNamesLower = allSkills.map(s => s.name.toLowerCase());

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: scoringPrompt }],
      });

      const textBlock = response.content.find(b => b.type === "text");
      const text = textBlock?.text || "{}";

      // Try JSON.parse directly first, then fall back to regex extraction
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response");
        parsed = JSON.parse(jsonMatch[0]);
      }

      const assessmentLevel = parsed.assessmentLevel ?? 0;
      const activeLevel = parsed.activeLevel ?? 0;

      // Validate signatureSkillName against actual skill names
      let signatureSkillName = parsed.signatureSkillName || "";
      if (signatureSkillName) {
        const exactMatch = allSkillNames.includes(signatureSkillName);
        const caseInsensitiveMatch = !exactMatch && allSkillNamesLower.includes(signatureSkillName.toLowerCase());
        if (!exactMatch && caseInsensitiveMatch) {
          // Fix casing to match the canonical name
          const idx = allSkillNamesLower.indexOf(signatureSkillName.toLowerCase());
          signatureSkillName = allSkillNames[idx];
        } else if (!exactMatch && !caseInsensitiveMatch) {
          // Name doesn't match any known skill — nullify to prevent bad references
          console.warn(`scoreAssessment: signatureSkillName "${signatureSkillName}" does not match any known skill. Setting to empty.`);
          signatureSkillName = "";
        }
      }

      return {
        scores: parsed.scores || {},
        assessmentLevel: Math.max(0, Math.min(3, assessmentLevel)),
        activeLevel: Math.max(0, Math.min(3, activeLevel)),
        contextSummary: parsed.contextSummary || "",
        workContextSummary: parsed.workContextSummary || "",
        firstMove: parsed.firstMove || { skillName: "", suggestion: "" },
        outcomeOptions: parsed.outcomeOptions || [],
        signatureSkillName,
        signatureSkillRationale: parsed.signatureSkillRationale || "",
        brightSpots: parsed.brightSpots || [],
        futureSelfText: parsed.futureSelfText || "",
        nextLevelIdentity: parsed.nextLevelIdentity || "",
        triggerMoment: parsed.triggerMoment || "",
      };
    } catch (e: any) {
      lastError = e;
      console.error(`scoreAssessment attempt ${attempt}/${maxRetries} failed:`, e.message || e);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  // All retries exhausted — fall back to error defaults
  console.error("scoreAssessment: all retries exhausted. Last error:", lastError);
  const defaultScores: Record<string, { status: string; explanation: string }> = {};
  allSkills.forEach(s => {
    defaultScores[s.name] = { status: "red", explanation: "Not enough information to assess." };
  });
  return {
    scores: defaultScores,
    assessmentLevel: 0,
    activeLevel: 0,
    contextSummary: "Assessment scoring encountered an error.",
    workContextSummary: "",
    firstMove: { skillName: allSkills[0]?.name || "Context Setting", suggestion: "Open your AI tool and try this: tell it your job title, what you're working on, and what you need help with. See how the answer changes when you give it context." },
    outcomeOptions: [
      { outcomeHeadline: "Speed up your first draft", action: "Next time you need to write an email or document, start by telling your AI tool what you need and who it's for.", whatYoullSee: "A solid first draft in seconds instead of staring at a blank page." },
      { outcomeHeadline: "Get unstuck faster", action: "When you hit a wall on a task, describe the problem to your AI tool and ask for three different approaches.", whatYoullSee: "Fresh perspectives you wouldn't have thought of on your own." },
      { outcomeHeadline: "Build your AI reflex", action: "For one week, try reaching for your AI tool first whenever you start a new task.", whatYoullSee: "You'll start recognizing which tasks AI accelerates and which ones it doesn't." },
    ],
    signatureSkillName: "",
    signatureSkillRationale: "",
    brightSpots: ["You took the assessment — that's the first step."],
    futureSelfText: "",
    nextLevelIdentity: "",
    triggerMoment: "",
  };
}
