import { storage } from "./storage";
import type { Nudge, Skill, User } from "@shared/schema";

/**
 * Post a nudge summary to Slack via incoming webhook.
 *
 * No-ops silently when:
 *   - process.env.SLACK_NUDGE_WEBHOOK_URL is not set
 *   - system_config "slack_notifications_enabled" is not "true"
 *   - the HTTP call fails (errors are logged but swallowed)
 *
 * This should never throw — callers can treat it as fire-and-forget.
 */
export async function postNudgeToSlack(
  nudge: Nudge,
  user: User,
  skill: Skill | null,
): Promise<void> {
  try {
    const webhookUrl = process.env.SLACK_NUDGE_WEBHOOK_URL;
    if (!webhookUrl) return;

    const enabled = await storage.getSystemConfig("slack_notifications_enabled");
    if (enabled !== "true") return;

    const content = (nudge.contentJson || {}) as {
      universalInsight?: string;
      levelAdaptation?: string;
      tryThis?: string;
      subjectLine?: string;
    };

    const appUrl = process.env.APP_URL || "http://localhost:5000";
    const adminUrl = `${appUrl.replace(/\/$/, "")}/admin`;

    const userName = user.name || user.email || `User ${user.id}`;
    const roleTitle = user.roleTitle || "(no role)";
    const level =
      typeof user.currentLevel === "number" ? `Level ${user.currentLevel}` : "Level ?";

    const subject = content.subjectLine || nudge.subjectLine || "(no subject)";
    const rawInsight = content.universalInsight || "(no universal insight)";
    const insight =
      rawInsight.length > 200 ? `${rawInsight.slice(0, 200).trimEnd()}…` : rawInsight;
    const adaptation = content.levelAdaptation || "(no level adaptation)";
    const tryThis = content.tryThis || "(no try-this)";

    // Phase is inferred: if a skill was attached AND the skill matches a
    // red/yellow sweep target, the caller is passing that skill. We can't
    // cleanly detect phase here, so we surface the skill name if present and
    // fall back to "Level drip" when there's no skill attached.
    const targetLine = skill ? `Target skill: ${skill.name}` : "Level drip";

    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `New nudge: ${userName}`,
          emoji: true,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*${roleTitle}* · *${level}* · ${targetLine}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Subject*\n${escapeMrkdwn(subject)}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Universal insight*\n${escapeMrkdwn(insight)}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Level adaptation*\n${escapeMrkdwn(adaptation)}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Try this*\n${escapeMrkdwn(tryThis)}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${adminUrl}|Open admin dashboard> · nudge id ${nudge.id}`,
          },
        ],
      },
    ];

    const payload = {
      text: `New nudge for ${userName}: ${subject}`,
      blocks,
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[slack] postNudgeToSlack failed: ${res.status} ${res.statusText} ${body}`.trim(),
      );
    }
  } catch (e: any) {
    // Swallow errors — a failed Slack post must never break nudge generation.
    console.error("[slack] postNudgeToSlack error:", e?.message || e);
  }
}

// Slack mrkdwn needs `&`, `<`, `>` escaped; everything else renders literally.
function escapeMrkdwn(text: string): string {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
