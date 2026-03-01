import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { User, Skill, Nudge } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateNudge(
  user: User,
  skill: Skill,
  previousNudges: Nudge[]
): Promise<{
  opener: string;
  idea: string;
  use_case: string;
  action: string;
  reflection: string;
  story: string;
  subject_line: string;
}> {
  const voiceGuide = await storage.getNudgeVoiceGuide();

  const latestAssessment = (await storage.getCompletedAssessments(user.id))[0];
  const contextSummary = latestAssessment?.contextSummary || "No assessment context available.";

  const previousNudgeText = previousNudges.length > 0
    ? `\n\nPREVIOUS NUDGES FOR THIS USER + SKILL (do NOT repeat angles, examples, or stories):\n${previousNudges.map((n, i) => {
        const c = n.contentJson as any;
        return `Nudge ${i + 1}: opener="${c?.opener || ""}", idea="${c?.idea || ""}", use_case="${c?.use_case || ""}", action="${c?.action || ""}", story="${c?.story || ""}"`;
      }).join("\n")}`
    : "";

  const systemPrompt = voiceGuide || `You write personalized AI learning nudges for Electric Thinking. Your writing is warm, direct, and specific. Never use em dashes, never use words like "delve" or "landscape" or "testament". No sycophantic tone. No bold-header bullet lists. No synonym cycling. No Rule of Three. Connect to how skills FEEL, not just what they DO.`;

  const userPrompt = `Generate a personalized weekly learning nudge for this user.

USER CONTEXT:
Name: ${user.name || "Unknown"}
Role: ${user.roleTitle || "Unknown"}
AI Platform: ${user.aiPlatform || "Unknown"}
Context from assessment: ${contextSummary}

SKILL TO DEVELOP:
Name: ${skill.name}
Description: ${skill.description}
${previousNudgeText}

Generate a challenge with these components (respond in JSON):
1. "opener": A pattern-breaking stat, observation, or question that creates a knowledge gap. Never "This week we're covering [skill name]." Never open with a compliment like "Great job" or "You're doing amazing."
2. "idea": ONE core idea tied to this skill
3. "use_case": ONE use case personalized to their actual role and work context. Reference something specific from their assessment context (their job, their tools, their examples). If the use case could apply to anyone, rewrite it.
4. "action": ONE specific action they can try in under 10 minutes. NOT a copy-paste prompt. Describe what to do, what to say to their AI in their own words, and what to look for in the response. Give the SHAPE of the action, not the exact words. If it requires setup or multiple tools, it's too big.
5. "reflection": ONE reflection question to deepen the skill
6. "story": A two-sentence story of someone in a similar role using this skill. Be concrete: include a specific role, a specific situation, and a specific outcome. "A content lead at a streaming service" not "A marketing manager."
7. "subject_line": An email subject line pulled from the opener or the user's specific context. NOT "Your weekly challenge." Something like "That thing you do every Monday morning? There's a faster way."

WRITING RULES (apply to ALL text you generate):
- Never use em dashes. Use periods or commas.
- Never use: delve, tapestry, landscape, testament, multifaceted, nuanced, comprehensive, robust, leverage, foster, pivotal, groundbreaking, transformative, synergy, streamline, cutting-edge, game-changer, paradigm, holistic.
- No "It's not just X, it's Y" constructions.
- No Rule of Three patterns ("innovation, collaboration, and excellence"). Use the natural number of items.
- Vary sentence length. Short sentences hit. Then something longer. Then short again.

${previousNudges.length > 0 ? "CRITICAL: Generate something MEANINGFULLY DIFFERENT from all previous nudges listed above. Different opener, different use case, different action, different story." : ""}

Respond with ONLY valid JSON, no markdown:`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const text = textBlock?.text || "{}";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("Failed to parse nudge response:", e);
    return {
      opener: "Something to think about this week.",
      idea: `${skill.name} is a skill worth developing.`,
      use_case: "Try applying this to your current work.",
      action: `Open your AI tool and experiment with ${skill.name.toLowerCase()}.`,
      reflection: "What did you notice when you tried this?",
      story: "A professional in a similar role tried this and found it changed their workflow. Small steps led to big shifts.",
      subject_line: `A quick thought about ${skill.name}`,
    };
  }
}

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
