/**
 * Generate and send test nudges to devin@electricthinking.ai
 * for review. Picks one BraceAbility person at each level,
 * generates 2 nudges per person, sends all 8 to Devin's email.
 */

import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

const DB_URL = process.env.STAGING_DB_URL;
if (!DB_URL) {
  console.error("Usage: STAGING_DB_URL=... npx tsx scripts/test-nudges.ts");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB_URL });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const DEVIN_EMAIL = "devin@electricthinking.ai";
const LEVEL_NAMES = ["Accelerator", "Thought Partner", "Specialized Teammates", "Systems Designer"];

const BRAND = {
  pink: "#FF2F86",
  orange: "#FF6A2B",
  gold: "#FFD236",
  cyan: "#2DD6FF",
  blue: "#1C4BFF",
  pageBg: "#F0E4CE",
  cardBg: "#FFF8F0",
  charcoal: "#2B2B2B",
  border: "#E5E0DF",
  textLight: "#666666",
  white: "#FFFFFF",
  levelColors: ["#FFD236", "#FF2F86", "#FF6A2B", "#1C4BFF"],
};

// The test users — one per level
const TEST_USERS = [
  { userId: 95, assessmentId: 118, level: 0, name: "Branden Kimmich" },     // L1
  { userId: 99, assessmentId: 123, level: 1, name: "Rona Ibuna" },          // L2
  { userId: 77, assessmentId: 104, level: 2, name: "Ryan Uhlenhopp" },      // L3
  { userId: 73, assessmentId: 96, level: 3, name: "Shaun Linderbaum" },     // L4
];

interface NudgeContent {
  universalInsight: string;
  levelAdaptation: string;
  tryThis: string;
  subjectLine: string;
  targetSkillName: string | null;
}

async function generateNudge(
  userName: string,
  roleTitle: string,
  aiPlatform: string,
  userLevel: number,
  contextSummary: string,
  targetSkill: { name: string; description: string } | null,
  nudgeNumber: number,
): Promise<NudgeContent> {

  const levelName = LEVEL_NAMES[userLevel] || "Accelerator";
  const levelGuidance: Record<number, string> = {
    0: "This person is at Level 1 (Accelerator). They're just starting with AI. The adaptation should help them take their first real steps. Concrete, specific, low-barrier.",
    1: "This person is at Level 2 (Thought Partner). They use AI for tasks but haven't made it a thinking partner yet. The adaptation should push them toward using AI for decisions, ideation, and strategic thinking.",
    2: "This person is at Level 3 (Specialized Teammates). They're building dedicated AI workflows. The adaptation should push them to systematize, teach others, or build reusable specialists.",
    3: "This person is at Level 4 (Systems Designer). They're advanced. The adaptation should challenge them to build self-improving systems, connect workflows, or think about organizational transformation.",
  };

  const skillContext = targetSkill
    ? `TARGET SKILL: ${targetSkill.name} — ${targetSkill.description}\nThis nudge should be specifically about developing this skill.`
    : `This is a general level-appropriate nudge. Pick an insight relevant to Level ${userLevel + 1} skills.`;

  const prompt = `Generate a short, punchy AI fluency nudge email for this person.

USER:
Name: ${userName}
Role: ${roleTitle}
AI Platform: ${aiPlatform}
Level: ${userLevel + 1} (${levelName})
Assessment context: ${contextSummary}

${skillContext}

${levelGuidance[userLevel]}

${nudgeNumber > 1 ? "IMPORTANT: This is nudge #" + nudgeNumber + " for this person. Make it DIFFERENT from a typical first nudge. Different angle, different insight." : ""}

FORMAT (respond in JSON only):
{
  "universalInsight": "2-3 sentences. A pattern-breaking insight about AI fluency that applies universally. Should make the reader stop and think. Not generic advice — a specific, surprising observation about how people actually work with AI. Like advice from a smart colleague, not a textbook.",
  "levelAdaptation": "1-2 sentences. Takes the universal insight and adapts it specifically for someone at Level ${userLevel + 1}. Reference their work context if possible.",
  "tryThis": "One line. A specific action they can try in under 5 minutes. Personalized to their role as ${roleTitle}. Starts with a verb.",
  "subjectLine": "Short. Feels like a text from a friend, not marketing. Something like 'The tiny prompt problem' or 'What your sock bundling taught me about AI'. Pull from their actual work context."
}

WRITING RULES:
- Never use em dashes. Use periods or commas.
- Never use: delve, tapestry, landscape, testament, robust, leverage, foster, pivotal, transformative, synergy, streamline, holistic.
- No "It's not just X, it's Y" constructions.
- No Rule of Three.
- Short sentences hit. Then something longer. Then short again.
- Warm, direct, specific. Like advice from a colleague who's really good at this.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content.find(b => b.type === "text") as any)?.text || "{}";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    return JSON.parse(match[0]);
  } catch {
    return {
      universalInsight: "Most people use AI like a search engine. They type a question, get an answer, and move on. But the real unlock is treating it like a conversation. The longer you talk, the better it gets.",
      levelAdaptation: `At Level ${userLevel + 1}, this means starting every AI interaction with context about what you're actually trying to accomplish, not just the immediate question.`,
      tryThis: `Next time you open ${aiPlatform || "your AI tool"}, spend 30 seconds explaining what you're working on before asking your question.`,
      subjectLine: "You're using AI like Google",
      targetSkillName: null,
    };
  }
}

function buildNudgeEmailHtml(content: NudgeContent, userName: string, level: number): string {
  const levelName = LEVEL_NAMES[level] || "Accelerator";
  const levelColor = BRAND.levelColors[level] || BRAND.pink;
  const nextLevelName = LEVEL_NAMES[level + 1] || null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Electric Thinking</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tomorrow:wght@400;600;700&family=Source+Sans+3:wght@400;500;600&display=swap');
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1410 !important; }
      .email-card { background-color: #231e18 !important; }
      .email-text { color: #e8e0d8 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.pageBg};" class="email-body">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto;">
    <tr>
      <td style="padding: 32px 24px 16px 24px;">
        <span style="font-family: 'Tomorrow', Arial, sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 3px; color: ${BRAND.charcoal}; text-transform: uppercase;">
          <span style="color: ${BRAND.pink};">ELECTRIC</span> THINKING
        </span>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${BRAND.cardBg}; border-radius: 16px;" class="email-card">
          <tr>
            <td style="padding: 32px;">
              <!-- Universal Insight -->
              <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 20px 0;" class="email-text">
                ${content.universalInsight}
              </p>

              <!-- Level Adaptation -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="border-left: 3px solid ${levelColor}; padding-left: 16px;">
                    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal}; margin: 0;" class="email-text">
                      ${content.levelAdaptation}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid rgba(43,43,43,0.1); margin: 24px 0;">

              <!-- Try This -->
              <p style="font-family: 'Tomorrow', Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${BRAND.pink}; margin: 0 0 8px 0;">TRY THIS</p>
              <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal}; margin: 0 0 24px 0;" class="email-text">
                ${content.tryThis}
              </p>

              <!-- Thumbs -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td style="padding: 0 8px;">
                    <a href="#" style="display: inline-block; width: 56px; height: 44px; line-height: 44px; text-align: center; font-size: 22px; background-color: #f0ebe6; border-radius: 22px; text-decoration: none;">👍</a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="#" style="display: inline-block; width: 56px; height: 44px; line-height: 44px; text-align: center; font-size: 22px; background-color: #f0ebe6; border-radius: 22px; text-decoration: none;">👎</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Fine print -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding: 16px 0; text-align: center;">
              <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #999; margin: 0;">
                You're getting this at Level ${level + 1} (${levelName}).${nextLevelName ? ` <a href="#" style="color: ${BRAND.pink}; text-decoration: none;">Ready for Level ${level + 2}?</a>` : ""}
              </p>
              <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #bbb; margin: 8px 0 0 0;">
                [TEST EMAIL — sent to Devin for review, not to ${userName}]
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function run() {
  const client = await pool.connect();

  try {
    let totalSent = 0;

    for (const testUser of TEST_USERS) {
      // Get user data
      const { rows: [user] } = await client.query(
        `SELECT * FROM users WHERE id = $1`, [testUser.userId]
      );
      if (!user) {
        console.log(`[skip] User ${testUser.userId} not found`);
        continue;
      }

      // Get assessment data
      const { rows: [assessment] } = await client.query(
        `SELECT * FROM assessments WHERE id = $1`, [testUser.assessmentId]
      );
      if (!assessment) {
        console.log(`[skip] Assessment ${testUser.assessmentId} not found`);
        continue;
      }

      const contextSummary = assessment.context_summary || "No context available.";

      // Get their red/yellow skills for the first nudge
      const { rows: skillStatuses } = await client.query(
        `SELECT uss.*, s.name as skill_name, s.description as skill_description, s.level_id, l.sort_order as level_sort
         FROM user_skill_status uss
         JOIN skills s ON s.id = uss.skill_id
         JOIN levels l ON l.id = s.level_id
         WHERE uss.user_id = $1 AND uss.status IN ('red', 'yellow')
         ORDER BY l.sort_order ASC, s.sort_order ASC
         LIMIT 1`,
        [testUser.userId]
      );

      const firstSkill = skillStatuses.length > 0
        ? { name: skillStatuses[0].skill_name, description: skillStatuses[0].skill_description }
        : null;

      console.log(`\n[generating] ${user.name} (Level ${testUser.level + 1} ${LEVEL_NAMES[testUser.level]}, ${user.role_title})`);

      // Generate 2 nudges
      for (let i = 1; i <= 2; i++) {
        const targetSkill = i === 1 ? firstSkill : null; // First is skill-specific, second is level drip

        console.log(`  Nudge ${i}: ${targetSkill ? `skill="${targetSkill.name}"` : "level drip"}...`);

        const content = await generateNudge(
          user.name,
          user.role_title || "professional",
          user.ai_platform || "Claude",
          testUser.level,
          contextSummary,
          targetSkill,
          i,
        );

        console.log(`  Subject: "${content.subjectLine}"`);
        console.log(`  Insight: "${content.universalInsight.slice(0, 80)}..."`);

        const html = buildNudgeEmailHtml(content, user.name, testUser.level);

        // Send to Devin
        try {
          const result = await resend.emails.send({
            from: "Electric Thinking <hello@electricthinking.ai>",
            to: DEVIN_EMAIL,
            subject: `[TEST L${testUser.level + 1} - ${user.name}] ${content.subjectLine}`,
            html,
          });
          console.log(`  ✓ Sent (${(result as any)?.data?.id || "ok"})`);
          totalSent++;
        } catch (e: any) {
          console.error(`  ✗ Send failed: ${e.message}`);
        }
      }
    }

    console.log(`\n[done] ${totalSent} test nudge emails sent to ${DEVIN_EMAIL}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
