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
  userContext: { name?: string; roleTitle?: string; aiPlatform?: string; surveyContext?: string }
): Promise<{
  scores: Record<string, { status: string; explanation: string }>;
  assessmentLevel: number;
  activeLevel: number;
  contextSummary: string;
  workContextSummary: string;
  firstMove: { skillName: string; suggestion: string };
  outcomeOptions: Array<{ outcomeHeadline: string; description: string; skillName?: string }>;
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
- Red: The user never mentioned this skill, explicitly said they don't do it, or the transcript contains no evidence. When in doubt between red and yellow, choose yellow. An 8-10 minute conversation can't cover every skill. Yellow means "not enough signal," which is better than incorrectly marking someone red.
- For each skill, write a one-sentence explanation of WHY it got that score, referencing specific evidence from the transcript.
- Assessment Level: The highest level where the user has 3+ green skills
- Active Level: The lowest level where they have any non-green skills
- CRITICAL — CONVERSATIONAL LEVEL OVERRIDE: If the transcript contains the assessor (Lex) explicitly stating a specific level (e.g., "I'd put you at Level 2" or "you're a Thought Partner") and the user confirmed or did not object, that level MUST be the assessmentLevel. The conversational level call takes priority over the skill-counting formula. Only use the formula result if the user explicitly disagreed with the level Lex stated during the conversation.

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
- nextLevelIdentity: The display name of the next level up from their assessed level. If they're at Level 3 (Systems Designer), return "You've reached the top level."
- outcomeOptions: An array of exactly 3 personalized outcomes that paint a picture of what becomes possible as this person levels up. These should get the user excited about the journey ahead. Each should be tied to something specific the user said about their work.
  Each option has:
  - outcomeHeadline: A tantalizing outcome in one sentence tied to their actual work. Example: "Your meeting recaps write themselves after every call." NOT "Practice Quick Drafting."
  - description: 2-3 sentences painting the picture of what this looks like in their actual workflow. Make it vivid and specific to their work context. This should feel aspirational but believable. Example: "Instead of spending 20 minutes after every client call writing up notes, you have an AI teammate that already knows your format. You talk through the highlights, and it builds the recap, action items, and follow-up draft while you move on to the next thing."
- triggerMoment: If the user mentioned WHEN or WHERE they typically hit friction or reach for AI (e.g., "Monday mornings," "when I'm stuck on writing," "during meeting prep," "pulling Salesforce data"), capture that here. If not mentioned, return an empty string.

IMPORTANT FOR outcomeOptions:
- All three must reference something specific the user said about their work.
- Frame as the OUTCOME they get, not the skill they practice.
- The description should paint a vivid picture of what their work life looks like with this outcome. Not instructions. Not "what to do." Just the vision.
- Make all three outcomes genuinely exciting. The user should think "I want all of these."

TRANSCRIPT:
${transcript}

USER INFO:
Name: ${userContext.name || "Unknown"}
Role: ${userContext.roleTitle || "Unknown"}
AI Platform: ${userContext.aiPlatform || "Unknown"}
${userContext.surveyContext ? `\nSELF-ASSESSMENT SURVEY DATA:\n${userContext.surveyContext}\n\nUse this survey data as additional signal alongside the conversation. The survey shows what the user believes about their own habits. The conversation provides evidence of actual practice. When they conflict, weight the conversation evidence more heavily, but note the discrepancy.` : ""}

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
    { "outcomeHeadline": "outcome sentence tied to their work", "description": "2-3 sentences painting the picture of what this looks like in their workflow" },
    { "outcomeHeadline": "outcome sentence tied to their work", "description": "2-3 sentences painting the picture" },
    { "outcomeHeadline": "outcome sentence tied to their work", "description": "2-3 sentences painting the picture" }
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
      { outcomeHeadline: "Speed up your first draft", description: "Instead of staring at a blank page, you tell your AI tool what you need and who it's for. A solid first draft appears in seconds, and you spend your energy editing and refining instead of starting from scratch." },
      { outcomeHeadline: "Get unstuck faster", description: "When you hit a wall on a task, you describe the problem and get three different approaches back. Fresh perspectives you wouldn't have thought of on your own, ready in moments." },
      { outcomeHeadline: "Build your AI reflex", description: "You start reaching for your AI tool first whenever a new task lands. Within a week, you naturally recognize which tasks AI accelerates and which ones it doesn't." },
    ],
    signatureSkillName: "",
    signatureSkillRationale: "",
    brightSpots: ["You took the assessment. That's the first step."],
    futureSelfText: "",
    nextLevelIdentity: "",
    triggerMoment: "",
  };
}
