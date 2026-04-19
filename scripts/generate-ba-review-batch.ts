/**
 * Generate test nudges for ALL BraceAbility users and save to a markdown
 * review doc. Does NOT send emails — generation only.
 *
 * For each user:
 *   - Nudge 1: targets their first red/yellow skill
 *   - Nudge 2: general level-drip (no target skill)
 *
 * Usage:
 *   STAGING_DB_URL=... ANTHROPIC_API_KEY=... npx tsx scripts/generate-ba-review-batch.ts
 */

import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_URL = process.env.STAGING_DB_URL;
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!DB_URL || !API_KEY) {
  console.error(
    "Usage: STAGING_DB_URL=... ANTHROPIC_API_KEY=... npx tsx scripts/generate-ba-review-batch.ts",
  );
  process.exit(1);
}

const OUTPUT_PATH =
  "/Users/devin/Documents/Mindstone Rebel/Chief-of-Staff/projects/braceability/NUDGE-REVIEW-BATCH-1.md";

// Claude Sonnet 4 pricing (per 1M tokens): input $3, output $15.
// Keep numbers in USD cents (hundredths of a dollar).
const INPUT_COST_PER_MTOK_USD = 3;
const OUTPUT_COST_PER_MTOK_USD = 15;

const pool = new pg.Pool({ connectionString: DB_URL });
const anthropic = new Anthropic({ apiKey: API_KEY });

const LEVEL_NAMES = [
  "Accelerator",
  "Thought Partner",
  "Specialized Teammates",
  "Systems Designer",
];

interface NudgeContent {
  universalInsight: string;
  levelAdaptation: string;
  tryThis: string;
  subjectLine: string;
}

interface GeneratedNudge {
  content: NudgeContent;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  targetSkillName: string | null;
  isLevelDrip: boolean;
  error?: string;
}

interface UserRecord {
  id: number;
  email: string;
  name: string;
  roleTitle: string | null;
  aiPlatform: string | null;
  level: number; // 0-indexed
  assessmentId: number;
  contextSummary: string;
  firstRedYellowSkill: { name: string; description: string } | null;
}

function centsFromUsd(usd: number): string {
  return `${(usd * 100).toFixed(2)}¢`;
}

async function generateNudge(
  user: UserRecord,
  targetSkill: { name: string; description: string } | null,
  nudgeNumber: number,
): Promise<GeneratedNudge> {
  const levelName = LEVEL_NAMES[user.level] || "Accelerator";
  const levelGuidance: Record<number, string> = {
    0: "This person is at Level 1 (Accelerator). They're just starting with AI. The adaptation should help them take their first real steps. Concrete, specific, low-barrier.",
    1: "This person is at Level 2 (Thought Partner). They use AI for tasks but haven't made it a thinking partner yet. The adaptation should push them toward using AI for decisions, ideation, and strategic thinking.",
    2: "This person is at Level 3 (Specialized Teammates). They're building dedicated AI workflows. The adaptation should push them to systematize, teach others, or build reusable specialists.",
    3: "This person is at Level 4 (Systems Designer). They're advanced. The adaptation should challenge them to build self-improving systems, connect workflows, or think about organizational transformation.",
  };

  const skillContext = targetSkill
    ? `TARGET SKILL: ${targetSkill.name} — ${targetSkill.description}\nThis nudge should be specifically about developing this skill.`
    : `This is a general level-appropriate nudge. Pick an insight relevant to Level ${user.level + 1} skills.`;

  const prompt = `Generate a short, punchy AI fluency nudge email for this person.

USER:
Name: ${user.name}
Role: ${user.roleTitle || "professional"}
AI Platform: ${user.aiPlatform || "Claude"}
Level: ${user.level + 1} (${levelName})
Assessment context: ${user.contextSummary || "No context available."}

${skillContext}

${levelGuidance[user.level]}

${
  nudgeNumber > 1
    ? "IMPORTANT: This is nudge #" +
      nudgeNumber +
      " for this person. Make it DIFFERENT from a typical first nudge. Different angle, different insight."
    : ""
}

FORMAT (respond in JSON only):
{
  "universalInsight": "2-3 sentences. A pattern-breaking insight about AI fluency that applies universally. Should make the reader stop and think. Not generic advice — a specific, surprising observation about how people actually work with AI. Like advice from a smart colleague, not a textbook.",
  "levelAdaptation": "1-2 sentences. Takes the universal insight and adapts it specifically for someone at Level ${user.level + 1}. Reference their work context if possible.",
  "tryThis": "One line. A specific action they can try in under 5 minutes. Personalized to their role as ${user.roleTitle || "professional"}. Starts with a verb.",
  "subjectLine": "Short. Feels like a text from a friend, not marketing. Something like 'The tiny prompt problem' or 'What your sock bundling taught me about AI'. Pull from their actual work context."
}

WRITING RULES:
- Never use em dashes. Use periods or commas.
- Never use: delve, tapestry, landscape, testament, robust, leverage, foster, pivotal, transformative, synergy, streamline, holistic.
- No "It's not just X, it's Y" constructions.
- No Rule of Three.
- Short sentences hit. Then something longer. Then short again.
- Warm, direct, specific. Like advice from a colleague who's really good at this.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd =
      (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK_USD +
      (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK_USD;

    const text =
      (response.content.find((b) => b.type === "text") as any)?.text || "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    const parsed = JSON.parse(match[0]) as NudgeContent;

    return {
      content: parsed,
      inputTokens,
      outputTokens,
      costUsd,
      targetSkillName: targetSkill?.name ?? null,
      isLevelDrip: !targetSkill,
    };
  } catch (err: any) {
    return {
      content: {
        universalInsight: "",
        levelAdaptation: "",
        tryThis: "",
        subjectLine: "",
      },
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      targetSkillName: targetSkill?.name ?? null,
      isLevelDrip: !targetSkill,
      error: err.message || String(err),
    };
  }
}

async function loadUsers(client: pg.PoolClient): Promise<UserRecord[]> {
  const { rows } = await client.query(
    `SELECT u.id, u.email, u.name, u.role_title, u.ai_platform
     FROM users u
     WHERE u.org_id = 2
       AND u.email NOT ILIKE '%testtesttest%'
       AND u.email NOT ILIKE '%ddddddd%'
       AND u.email NOT ILIKE '%electricthinking.com'
     ORDER BY u.id ASC`,
  );

  const users: UserRecord[] = [];
  for (const row of rows) {
    // Latest completed assessment (fallback to latest of any status)
    const {
      rows: [assessment],
    } = await client.query(
      `SELECT id, active_level, assessment_level, context_summary
       FROM assessments
       WHERE user_id = $1
       ORDER BY (status = 'completed')::int DESC, id DESC
       LIMIT 1`,
      [row.id],
    );

    if (!assessment) {
      console.log(`[skip] ${row.name} (id=${row.id}): no assessment`);
      continue;
    }

    const level = assessment.active_level ?? assessment.assessment_level ?? 0;

    // First red/yellow skill, sorted by level ascending then sort_order
    const { rows: skillStatuses } = await client.query(
      `SELECT uss.status, s.name AS skill_name, s.description AS skill_description,
              s.level_id, l.sort_order AS level_sort, s.sort_order AS skill_sort
       FROM user_skill_status uss
       JOIN skills s ON s.id = uss.skill_id
       JOIN levels l ON l.id = s.level_id
       WHERE uss.user_id = $1 AND uss.status IN ('red', 'yellow')
       ORDER BY l.sort_order ASC, s.sort_order ASC
       LIMIT 1`,
      [row.id],
    );

    const firstSkill = skillStatuses[0]
      ? {
          name: skillStatuses[0].skill_name,
          description: skillStatuses[0].skill_description,
        }
      : null;

    users.push({
      id: row.id,
      email: row.email,
      name: row.name,
      roleTitle: row.role_title,
      aiPlatform: row.ai_platform,
      level,
      assessmentId: assessment.id,
      contextSummary: assessment.context_summary || "",
      firstRedYellowSkill: firstSkill,
    });
  }
  return users;
}

function esc(s: string): string {
  return (s || "").replace(/\|/g, "\\|");
}

function formatNudgeSection(
  title: string,
  nudge: GeneratedNudge,
): string {
  if (nudge.error) {
    return `### ${title}
- **Status:** FAILED — ${nudge.error}
- **Target:** ${nudge.targetSkillName ? `skill="${nudge.targetSkillName}"` : "level drip"}
`;
  }
  const c = nudge.content;
  const target = nudge.targetSkillName
    ? `skill="${nudge.targetSkillName}"`
    : "level drip (no target skill)";
  return `### ${title}
- **Target:** ${target}
- **Subject:** ${esc(c.subjectLine)}
- **Universal insight:** ${esc(c.universalInsight)}
- **Level adaptation:** ${esc(c.levelAdaptation)}
- **Try this:** ${esc(c.tryThis)}
- **Tokens:** ${nudge.inputTokens} in / ${nudge.outputTokens} out (cost: ${centsFromUsd(nudge.costUsd)})
`;
}

async function run() {
  const startedAt = new Date();
  const client = await pool.connect();

  try {
    console.log("[load] fetching BraceAbility users…");
    const users = await loadUsers(client);
    console.log(`[load] ${users.length} users with assessments`);

    type Row = {
      user: UserRecord;
      nudge1: GeneratedNudge;
      nudge2: GeneratedNudge;
    };
    const results: Row[] = [];
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let failures = 0;

    for (const user of users) {
      console.log(
        `[generate] ${user.name} (id=${user.id} L${user.level + 1} ${LEVEL_NAMES[user.level]}, role="${user.roleTitle}")`,
      );

      const nudge1 = await generateNudge(
        user,
        user.firstRedYellowSkill,
        1,
      );
      if (nudge1.error) {
        failures++;
        console.log(`  nudge1 FAILED: ${nudge1.error}`);
      } else {
        console.log(`  nudge1 "${nudge1.content.subjectLine}"`);
      }
      totalInput += nudge1.inputTokens;
      totalOutput += nudge1.outputTokens;
      totalCost += nudge1.costUsd;

      const nudge2 = await generateNudge(user, null, 2);
      if (nudge2.error) {
        failures++;
        console.log(`  nudge2 FAILED: ${nudge2.error}`);
      } else {
        console.log(`  nudge2 "${nudge2.content.subjectLine}"`);
      }
      totalInput += nudge2.inputTokens;
      totalOutput += nudge2.outputTokens;
      totalCost += nudge2.costUsd;

      results.push({ user, nudge1, nudge2 });
    }

    // Group by level (0,1,2,3)
    const byLevel: Record<number, Row[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const r of results) byLevel[r.user.level].push(r);

    // Build markdown
    const fmt = (d: Date) =>
      d.toISOString().replace("T", " ").replace(/\..+/, "") + " UTC";
    const lines: string[] = [];
    lines.push(`# BraceAbility Nudge Review Batch 1`);
    lines.push("");
    lines.push(`**Generated:** ${fmt(startedAt)}`);
    lines.push(`**Purpose:** Review before enabling nudges for BraceAbility cohort`);
    lines.push(`**Users processed:** ${results.length}`);
    lines.push(`**Total nudges:** ${results.length * 2}`);
    lines.push(
      `**Failures:** ${failures}${failures === 0 ? "" : " (see individual entries below)"}`,
    );
    lines.push(
      `**Tokens:** ${totalInput.toLocaleString()} in / ${totalOutput.toLocaleString()} out`,
    );
    lines.push(`**Cost (est.):** $${totalCost.toFixed(4)} (${centsFromUsd(totalCost)})`);
    lines.push("");
    lines.push(
      `Model: \`claude-sonnet-4-20250514\` — pricing $${INPUT_COST_PER_MTOK_USD}/1M input, $${OUTPUT_COST_PER_MTOK_USD}/1M output.`,
    );
    lines.push("");
    lines.push("---");
    lines.push("");

    for (let lvl = 0; lvl < 4; lvl++) {
      const group = byLevel[lvl];
      if (group.length === 0) continue;

      lines.push(`## Level ${lvl + 1} — ${LEVEL_NAMES[lvl]} (${group.length})`);
      lines.push("");

      // Sort within level alphabetically by name for predictable order
      group.sort((a, b) => a.user.name.localeCompare(b.user.name));

      for (const row of group) {
        lines.push(
          `### [Level ${lvl + 1}] ${row.user.name} — ${row.user.roleTitle || "role unknown"}`,
        );
        lines.push("");
        lines.push(
          `- **Email:** ${row.user.email}`,
        );
        lines.push(
          `- **AI platform:** ${row.user.aiPlatform || "(not set)"} | **User id:** ${row.user.id} | **Assessment id:** ${row.user.assessmentId}`,
        );
        lines.push(
          `- **Assessment context:** ${
            row.user.contextSummary
              ? row.user.contextSummary.replace(/\s+/g, " ").slice(0, 220) +
                (row.user.contextSummary.length > 220 ? "…" : "")
              : "_(none)_"
          }`,
        );
        lines.push("");
        lines.push(
          formatNudgeSection(`Nudge 1: Red/yellow skill sweep`, row.nudge1),
        );
        lines.push(formatNudgeSection(`Nudge 2: Level drip`, row.nudge2));
        lines.push("---");
        lines.push("");
      }
    }

    // Write output
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, lines.join("\n"), "utf8");
    console.log(`\n[saved] ${OUTPUT_PATH}`);
    console.log(
      `\n[summary] users=${results.length}, nudges=${results.length * 2}, failures=${failures}`,
    );
    console.log(
      `[summary] tokens: ${totalInput.toLocaleString()} in / ${totalOutput.toLocaleString()} out`,
    );
    console.log(
      `[summary] cost: $${totalCost.toFixed(4)} (${centsFromUsd(totalCost)})`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
