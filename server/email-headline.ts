import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateEmailSubjectLine(
  userContext: { name: string; roleTitle: string; workContextSummary?: string; contextSummary?: string },
  nudgeContent: { opener: string; idea: string; action: string; subject_line: string }
): Promise<string> {
  try {
    const contextInfo = userContext.workContextSummary || userContext.contextSummary || "";

    const prompt = `Generate 5 email subject line candidates for this AI learning Power Up email.

PERSON:
Name: ${userContext.name}
Role: ${userContext.roleTitle}
Work context: ${contextInfo}

POWER UP CONTENT:
Opener: ${nudgeContent.opener}
Idea: ${nudgeContent.idea}
Action: ${nudgeContent.action}

RULES:
- Reference the person's specific work when possible
- Lead with outcomes, not skill names
- Under 50 characters each
- Create curiosity. Make them want to open.
- No generic subjects like "Your weekly challenge" or "This week's Power Up"
- No exclamation marks
- No emoji

Rank by predicted open rate. Return ONLY the best one as a plain string. No quotes, no numbering, no explanation.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    const result = textBlock?.text?.trim();

    if (result && result.length > 0 && result.length < 100) {
      // Strip any quotes the model might have added
      return result.replace(/^["']|["']$/g, "");
    }

    return nudgeContent.subject_line;
  } catch (e) {
    console.error("Email headline generation failed, using fallback:", e);
    return nudgeContent.subject_line;
  }
}
