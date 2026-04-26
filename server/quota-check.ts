/**
 * Daily third-party quota health check.
 *
 * Checks each paid third-party service we depend on and surfaces a Slack
 * alert when any are approaching or have exceeded their quota.
 *
 * Why this exists: April 25 2026 — ElevenLabs ConvAI quota silently
 * exhausted on the Creator plan. EL provides no proactive billing email
 * or dashboard banner; they just close every WebSocket with a buried
 * `event.reason` text. Took ~6 hours of debugging on a Friday night to
 * identify that the bug was at the billing layer, not in our code.
 *
 * Lesson: third-party billing health is OUR monitoring responsibility,
 * not theirs. This script catches that category of failure proactively.
 *
 * Currently checks:
 *   - ElevenLabs subscription quota (character/credit usage)
 *
 * Future additions: Anthropic (admin API), Resend (no public usage API
 * but we can monitor bounce rates as a proxy for sender-reputation drift).
 */

import { storage } from "./storage";

interface QuotaStatus {
  service: string;
  level: "ok" | "warning" | "critical" | "exhausted" | "error";
  usagePct: number | null;
  message: string;
  details?: Record<string, unknown>;
}

const WARNING_THRESHOLD = 0.80; // 80% — start warning
const CRITICAL_THRESHOLD = 0.95; // 95% — critical alert

/**
 * Check ElevenLabs subscription quota via /v1/user/subscription.
 * Returns usage status. Never throws — failures are reported as "error" status.
 */
async function checkElevenLabsQuota(): Promise<QuotaStatus> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      service: "ElevenLabs",
      level: "error",
      usagePct: null,
      message: "ELEVENLABS_API_KEY not set — cannot check quota.",
    };
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      method: "GET",
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) {
      return {
        service: "ElevenLabs",
        level: "error",
        usagePct: null,
        message: `Subscription API returned ${res.status} ${res.statusText}`,
      };
    }
    const data = (await res.json()) as {
      tier?: string;
      character_count?: number;
      character_limit?: number;
      next_character_count_reset_unix?: number;
      can_extend_character_limit?: boolean;
    };
    const used = data.character_count ?? 0;
    const limit = data.character_limit ?? 0;
    const pct = limit > 0 ? used / limit : 0;
    const level: QuotaStatus["level"] =
      pct >= 1 ? "exhausted" : pct >= CRITICAL_THRESHOLD ? "critical" : pct >= WARNING_THRESHOLD ? "warning" : "ok";
    const resetIso = data.next_character_count_reset_unix
      ? new Date(data.next_character_count_reset_unix * 1000).toISOString().slice(0, 10)
      : "unknown";
    return {
      service: "ElevenLabs",
      level,
      usagePct: pct,
      message: `${used.toLocaleString()} / ${limit.toLocaleString()} characters used (${(pct * 100).toFixed(1)}%) on ${data.tier || "unknown"} tier. Resets ${resetIso}.`,
      details: { tier: data.tier, used, limit, pct, resetIso },
    };
  } catch (e: any) {
    return {
      service: "ElevenLabs",
      level: "error",
      usagePct: null,
      message: `Failed to fetch subscription: ${e?.message || String(e)}`,
    };
  }
}

/**
 * Synthetic ConvAI health check: actually attempt to fetch a signed URL.
 *
 * The /v1/user/subscription endpoint reports TTS character usage, which is
 * NOT how ConvAI minutes are billed. Yesterday's bug exhausted the ConvAI
 * minute quota while character_count looked fine. The only reliable way to
 * detect "ConvAI is dead for me" is to ask ElevenLabs for a signed URL and
 * see if they'll give it. If they refuse with a quota-shaped error, alert.
 *
 * Cost: one HTTP call per day. Getting a signed URL doesn't start a session
 * or consume ConvAI minutes — that only happens when a WebSocket connects.
 *
 * Rex flagged 2026-04-25: the original character-only check was theatre for
 * the actual failure mode. This catches it.
 */
async function checkElevenLabsConvAISynthetic(): Promise<QuotaStatus> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      service: "ElevenLabs ConvAI",
      level: "error",
      usagePct: null,
      message: "ELEVENLABS_API_KEY not set — cannot synthetic-check ConvAI.",
    };
  }
  try {
    const agentId = await storage.getSystemConfig("elevenlabs_agent_id");
    if (!agentId) {
      return {
        service: "ElevenLabs ConvAI",
        level: "error",
        usagePct: null,
        message: "elevenlabs_agent_id not configured in system_config.",
      };
    }
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      { method: "GET", headers: { "xi-api-key": apiKey } },
    );
    if (res.ok) {
      return {
        service: "ElevenLabs ConvAI",
        level: "ok",
        usagePct: null,
        message: "Synthetic signed-URL fetch succeeded.",
      };
    }
    const body = await res.text().catch(() => "");
    const lower = body.toLowerCase();
    const looksLikeQuota =
      lower.includes("quota") || lower.includes("exceeds") || lower.includes("limit");
    return {
      service: "ElevenLabs ConvAI",
      level: looksLikeQuota ? "exhausted" : "error",
      usagePct: looksLikeQuota ? 1 : null,
      message: `Signed-URL fetch failed: ${res.status} ${res.statusText}. Body: ${body.slice(0, 200)}`,
    };
  } catch (e: any) {
    return {
      service: "ElevenLabs ConvAI",
      level: "error",
      usagePct: null,
      message: `ConvAI synthetic check failed: ${e?.message || String(e)}`,
    };
  }
}

/**
 * Run all configured quota checks and return the consolidated status.
 */
export async function runQuotaChecks(): Promise<QuotaStatus[]> {
  return Promise.all([
    checkElevenLabsQuota(),          // TTS character usage (subscription endpoint)
    checkElevenLabsConvAISynthetic(), // ConvAI reachability (catches yesterday's bug)
  ]);
}

/**
 * Post a Slack alert summarizing the quota status. Only posts when:
 *   - SLACK_NUDGE_WEBHOOK_URL is set (we reuse the nudge webhook for ops alerts)
 *   - At least one service is in "warning" or worse
 *   - system_config "slack_notifications_enabled" is "true"
 *
 * Ok-only checks are silent (we don't spam Slack with "everything's fine" daily).
 */
async function postQuotaAlertToSlack(statuses: QuotaStatus[]): Promise<void> {
  try {
    const webhookUrl = process.env.SLACK_NUDGE_WEBHOOK_URL;
    if (!webhookUrl) return;
    const enabled = await storage.getSystemConfig("slack_notifications_enabled");
    if (enabled !== "true") return;

    const concerning = statuses.filter(
      (s) => s.level === "warning" || s.level === "critical" || s.level === "exhausted" || s.level === "error",
    );
    if (concerning.length === 0) return;

    const emoji = (level: QuotaStatus["level"]) =>
      level === "exhausted" ? ":rotating_light:" : level === "critical" ? ":warning:" : level === "error" ? ":question:" : ":eyes:";

    const lines = concerning.map((s) => `${emoji(s.level)} *${s.service}* (${s.level}): ${s.message}`);

    const payload = {
      text: `Third-party quota check: ${concerning.length} issue(s)`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Third-party quota check", emoji: true },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: lines.join("\n") },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "_Daily check at 10am PT. Set thresholds in `server/quota-check.ts`._",
            },
          ],
        },
      ],
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[quota-check] Slack post failed: ${res.status} ${body}`.trim());
    }
  } catch (e: any) {
    console.error("[quota-check] Slack post error:", e?.message || e);
  }
}

/**
 * Top-level entry point. Run from cron daily.
 * Logs every check (ok or not) for audit. Alerts to Slack only on issues.
 */
export async function runDailyQuotaCheck(): Promise<void> {
  console.log(`${new Date().toLocaleTimeString()} [quota-check] Running daily quota check...`);
  const statuses = await runQuotaChecks();
  for (const s of statuses) {
    const pctStr = s.usagePct !== null ? ` (${(s.usagePct * 100).toFixed(1)}%)` : "";
    console.log(`[quota-check] ${s.service}: ${s.level}${pctStr} — ${s.message}`);
  }
  await postQuotaAlertToSlack(statuses);
}
