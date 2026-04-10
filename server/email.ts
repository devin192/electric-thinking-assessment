import { getUncachableResendClient } from "./resend-client";
import { storage } from "./storage";
import type { User, Nudge, Skill, Level } from "@shared/schema";

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const DEFAULT_FROM = "Electric Thinking <hello@electricthinking.ai>";
const DEFAULT_REPLY_TO = "support@electricthinking.ai";

async function getFromConfig() {
  const from = await storage.getSystemConfig("email_from") || DEFAULT_FROM;
  const replyTo = await storage.getSystemConfig("email_reply_to") || DEFAULT_REPLY_TO;
  return { from, replyTo };
}

// ═══════════════════════════════════════════════════════════════════════
// Brand colors and base template
// All emails use table-based layout with inline styles for maximum
// client compatibility. Critical styles are inline, not in <style>.
// ═══════════════════════════════════════════════════════════════════════

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

function baseTemplate(content: string, unsubscribeUrl?: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Electric Thinking</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tomorrow:wght@400;600;700&family=Source+Sans+3:wght@400;500;600&display=swap');
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1410 !important; }
      .email-card { background-color: #231e18 !important; }
      .email-text { color: #e8e0d8 !important; }
      .email-text-light { color: #a09890 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.pageBg}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;" class="email-body">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td style="padding: 32px 24px 16px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 3px; color: ${BRAND.charcoal}; text-transform: uppercase; padding-bottom: 8px;">
              <span style="color: ${BRAND.pink};">ELECTRIC</span> THINKING
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 24px;">
        ${content}
      </td>
    </tr>
    <tr>
      <td style="padding: 24px; text-align: center;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #999999; text-align: center; padding-top: 16px; border-top: 1px solid ${BRAND.border};">
              Electric Thinking
              ${unsubscribeUrl ? `<br><a href="${unsubscribeUrl}" style="color: ${BRAND.pink}; text-decoration: none;">Manage email preferences</a>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;
}

// Helper to build a CTA button as a table (works in Outlook)
function ctaButton(text: string, href: string, bgColor: string = BRAND.pink): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
  <tr>
    <td style="border-radius: 999px; background-color: ${bgColor};" bgcolor="${bgColor}">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="50%" fillcolor="${bgColor}" stroke="f"><w:anchorlock/><center style="color:#ffffff;font-family:'Tomorrow',Arial,sans-serif;font-size:14px;font-weight:600;">${text}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}" style="display: inline-block; padding: 14px 32px; font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-weight: 600; font-size: 14px; color: ${BRAND.white}; text-decoration: none; border-radius: 999px; background-color: ${bgColor}; mso-line-height-rule: exactly; line-height: 20px;">${text}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

// Helper to wrap content in a card
function card(content: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${BRAND.cardBg}; border-radius: 16px;" bgcolor="${BRAND.cardBg}" class="email-card">
  <tr>
    <td style="padding: 32px;">
      ${content}
    </td>
  </tr>
</table>`;
}

// Helper for section dividers
function divider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding: 16px 0;"><hr style="border: none; border-top: 1px solid rgba(43,43,43,0.1); margin: 0;"></td></tr></table>`;
}

// Helper for bold section headings
function sectionHeading(text: string): string {
  return `<p style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${BRAND.pink}; margin: 0 0 8px 0; mso-line-height-rule: exactly; line-height: 18px;">${text}</p>`;
}

// Helper for body text
function bodyText(text: string): string {
  return `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">${text}</p>`;
}

// Helper for small/muted text
function smallText(text: string): string {
  return `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: ${BRAND.textLight}; margin: 0;" class="email-text-light">${text}</p>`;
}

// ═══════════════════════════════════════════════════════════════════════
// Email templates
// ═══════════════════════════════════════════════════════════════════════

/**
 * 1. WELCOME EMAIL
 * Sent after assessment completion.
 * Short, outcome-focused, one CTA.
 */
export async function sendWelcomeEmail(user: User, levelName: string, level: number, appUrl: string): Promise<void> {
  // Transactional email (assessment results) — only gate on email validity, not marketing prefs
  if (!user.emailValid) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;
    const levelColor = BRAND.levelColors[level] || BRAND.pink;

    const html = baseTemplate(card(`
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 24px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; mso-line-height-rule: exactly; line-height: 32px;" class="email-text">You're in.</h1>
      ${bodyText(`Hey ${escapeHtml(user.name || "there")},`)}
      ${bodyText("Your AI fluency conversation is done. Here's what we found:")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width: 64px; height: 64px; border-radius: 50%; background-color: ${levelColor}; text-align: center; vertical-align: middle; font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-weight: 700; font-size: 24px; color: ${BRAND.white};" bgcolor="${levelColor}">${level + 1}</td>
              </tr>
            </table>
            <p style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 18px; font-weight: 600; color: ${BRAND.charcoal}; margin: 12px 0 0 0;" class="email-text">${levelName}</p>
          </td>
        </tr>
      </table>
      ${bodyText("<strong>What happens next:</strong>")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; Your personalized results are ready</td></tr>
        <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; See your skill breakdown and what to focus on next</td></tr>
        <tr><td style="padding: 0 0 16px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; One thing you can try right now</td></tr>
      </table>
      ${ctaButton("Open Your Dashboard", `${appUrl}/dashboard`)}
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: `You're a Level ${level + 1} ${levelName}`,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send welcome email:", e);
    try {
      await storage.createEmailLog({
        userId: user.id,
        emailType: "welcome",
        recipientEmail: user.email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e) } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}

/**
 * 2. POWER UP EMAIL (nudge delivery)
 * The core retention mechanism. Delivers one skill Power Up.
 * Visually broken up with bold headlines, bullet points, and clear CTA.
 */
export async function sendNudgeEmail(user: User, nudge: Nudge, skill: Skill, appUrl: string): Promise<string | null> {
  if (!user.emailValid || !user.emailPrefsNudges) return null;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const content = nudge.contentJson as any;
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;
    const feedbackBaseUrl = `${appUrl}/api/nudges/${nudge.id}/feedback?token=${user.unsubscribeToken}`;

    const html = baseTemplate(card(`
      ${bodyText(content?.opener || "")}
      ${divider()}
      ${sectionHeading("The Idea")}
      ${bodyText(content?.idea || "")}
      ${divider()}
      ${sectionHeading("Try This")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding: 0 0 4px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.charcoal};" class="email-text">&#8226; <strong>Your use case:</strong> ${content?.use_case || ""}</td></tr>
        <tr><td style="padding: 0 0 4px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.charcoal};" class="email-text">&#8226; <strong>The action:</strong> ${content?.action || ""}</td></tr>
      </table>
      ${divider()}
      ${sectionHeading("Reflect")}
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 4px 0; font-style: italic;" class="email-text">${content?.reflection || ""}</p>
      ${divider()}
      ${smallText(content?.story || "")}
      ${divider()}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top: 8px;" align="center">
          ${ctaButton("Open Your Power Up", `${appUrl}/dashboard`)}
        </td></tr>
      </table>
      ${divider()}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="text-align: center; padding-top: 4px;">
          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: ${BRAND.textLight};">Was this relevant? </span>
          <a href="${feedbackBaseUrl}&relevant=true" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: ${BRAND.pink}; text-decoration: none;">This was helpful</a>
          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: ${BRAND.textLight};"> &middot; </span>
          <a href="${feedbackBaseUrl}&relevant=false" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: ${BRAND.textLight}; text-decoration: none;">Not relevant to my work</a>
        </td></tr>
      </table>
    `), unsubscribeUrl);

    const result = await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: content?.subject_line || nudge.subjectLine || `Your challenge for ${skill.name}`,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    return result?.data?.id || null;
  } catch (e) {
    console.error("Failed to send nudge email:", e);
    try {
      await storage.createEmailLog({
        userId: user.id,
        emailType: "nudge",
        recipientEmail: user.email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e), nudgeId: nudge.id } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
    return null;
  }
}

/**
 * 3. SKILL COMPLETION EMAIL
 * Sent when a skill turns green. Short, celebratory, next step clear.
 */
export async function sendSkillCompleteEmail(user: User, skillName: string, nextSkillName: string | null, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsProgress) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(card(`
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding-bottom: 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width: 48px; height: 48px; border-radius: 50%; background-color: #38A169; text-align: center; vertical-align: middle; font-size: 24px; color: ${BRAND.white};" bgcolor="#38A169">&#10003;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 22px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 12px 0; text-align: center; mso-line-height-rule: exactly; line-height: 30px;" class="email-text">${skillName}: Locked In</h1>
      ${bodyText("You proved it in practice. That skill is yours now.")}
      ${nextSkillName
        ? `${bodyText(`<strong>Next up:</strong> ${nextSkillName}. Keep building on this momentum.`)}`
        : `${bodyText("Keep going. Every skill you lock in changes how you work.")}`
      }
      ${ctaButton("See Your Results", `${appUrl}/results`)}
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: `${skillName}: locked in.`,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send skill complete email:", e);
    try {
      await storage.createEmailLog({
        userId: user.id,
        emailType: "skill_complete",
        recipientEmail: user.email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e), skillName } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}

/**
 * 4. LEVEL-UP EMAIL
 * Sent when all 5 skills in a level turn green. Bigger, more visual.
 */
export async function sendLevelUpEmail(user: User, levelName: string, level: number, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsProgress) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;
    const levelColor = BRAND.levelColors[level] || BRAND.pink;

    const html = baseTemplate(card(`
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 16px 0 24px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width: 80px; height: 80px; border-radius: 50%; background-color: ${levelColor}; text-align: center; vertical-align: middle; font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-weight: 700; font-size: 32px; color: ${BRAND.white};" bgcolor="${levelColor}">${level + 1}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 26px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; text-align: center; mso-line-height-rule: exactly; line-height: 34px;" class="email-text">You're now a ${levelName}</h1>
      ${bodyText(`<strong>All five Level ${level + 1} skills: complete.</strong> That took real work.`)}
      ${bodyText("You're building real fluency. The next level unlocks new ways of thinking about AI.")}
      ${divider()}
      ${smallText(`Share your achievement: "I'm a Level ${level + 1} AI ${levelName}, assessed by Electric Thinking."`)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top: 16px;" align="center">
          ${ctaButton("See Your Results", `${appUrl}/results`)}
        </td></tr>
      </table>
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: `Level ${level + 1} complete. You're now a ${levelName}.`,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send level up email:", e);
    try {
      await storage.createEmailLog({
        userId: user.id,
        emailType: "level_up",
        recipientEmail: user.email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e), level, levelName } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}

/**
 * 5. RE-ENGAGEMENT EMAIL
 * Sent after 3+ weeks inactive. No guilt, one action, direct link.
 */
export async function sendReEngagementEmail(user: User, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsNudges) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(card(`
      ${bodyText(`Hey ${escapeHtml(user.name || "there")},`)}
      ${bodyText("It's been a while since your assessment. A lot can change in a few weeks.")}
      ${bodyText("Retake the assessment to see how your AI skills have grown.")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top: 20px;" align="center">
          ${ctaButton("Retake the Assessment", `${appUrl}/dashboard`)}
        </td></tr>
      </table>
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: "Your AI skills may have changed. Find out.",
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send re-engagement email:", e);
    try {
      await storage.createEmailLog({
        userId: user.id,
        emailType: "re_engagement",
        recipientEmail: user.email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e) } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Additional system emails (not part of the core 5, but needed)
// ═══════════════════════════════════════════════════════════════════════

export async function sendReAssessmentEmail(user: User, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsReminders) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(card(`
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 22px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; mso-line-height-rule: exactly; line-height: 30px;" class="email-text">Time for a check-in</h1>
      ${bodyText(`Hey ${escapeHtml(user.name || "there")},`)}
      ${bodyText("Your AI skills have grown since your last conversation. A re-assessment takes a few minutes and can only move you up.")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top: 16px;" align="center">
          ${ctaButton("Take Re-Assessment", `${appUrl}/survey`)}
        </td></tr>
      </table>
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: "Your AI skills have probably grown. Want to check?",
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send re-assessment email:", e);
    try {
      await storage.createEmailLog({
        userId: user.id,
        emailType: "re_assessment",
        recipientEmail: user.email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e) } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}

export async function sendAbandonedAssessmentEmail(user: User, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsReminders) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(card(`
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 22px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; mso-line-height-rule: exactly; line-height: 30px;" class="email-text">Pick up where you left off</h1>
      ${bodyText(`Hey ${escapeHtml(user.name || "there")},`)}
      ${bodyText("Your conversation is still open. A few more minutes and you'll have your results.")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top: 16px;" align="center">
          ${ctaButton("Continue Your Conversation", `${appUrl}/assessment`)}
        </td></tr>
      </table>
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: "Your conversation is waiting",
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send abandoned assessment email:", e);
    try {
      await storage.createEmailLog({
        userId: user.id,
        emailType: "abandoned_assessment",
        recipientEmail: user.email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e) } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}

export async function sendInviteEmail(email: string, inviterName: string, orgName: string, token: string, appUrl: string, welcomeMessage?: string): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();

    const html = baseTemplate(card(`
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 22px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; mso-line-height-rule: exactly; line-height: 30px;" class="email-text">You're invited</h1>
      ${bodyText(`${escapeHtml(inviterName)} has invited you to join ${escapeHtml(orgName)}'s AI fluency program.`)}
      ${welcomeMessage ? `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.textLight}; font-style: italic; margin: 0 0 12px 0;" class="email-text-light">${escapeHtml(welcomeMessage)}</p>` : ""}
      ${bodyText("<strong>What you'll get:</strong>")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; A quick survey and conversation to find your AI level</td></tr>
        <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; Personalized outcomes tied to your actual work</td></tr>
        <tr><td style="padding: 0 0 16px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; One thing you can try right now</td></tr>
      </table>
      ${ctaButton("Join Your Team", `${appUrl}/join?token=${token}`)}
    `));

    await client.emails.send({
      from: fromEmail || from,
      to: email,
      replyTo,
      subject: `${escapeHtml(inviterName)} invited you to Electric Thinking`,
      html,
    });
  } catch (e) {
    console.error("Failed to send invite email:", e);
    try {
      await storage.createEmailLog({
        emailType: "invite",
        recipientEmail: email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e), inviterName, orgName } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}

export async function sendManagerOnboardingEmail(user: User, step: number, appUrl: string): Promise<void> {
  if (!user.emailValid) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();

    const subjects = [
      "Welcome to your Manager Dashboard",
      "Talking to your team about AI fluency",
      "Using data to support skill development",
    ];

    const bodies = [
      `${bodyText(`Hey ${escapeHtml(user.name || "there")},`)}
       ${bodyText("You now have access to the Manager Dashboard. Here's what you can see:")}
       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
         <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; <strong>Level distribution</strong> across your team</td></tr>
         <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; <strong>Individual skill profiles</strong> for each member</td></tr>
         <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; <strong>Export data</strong> for your team</td></tr>
       </table>
       ${bodyText("You can see skill scores and levels, but not conversation transcripts. That's by design.")}
       ${ctaButton("Open Dashboard", `${appUrl}/dashboard`)}`,
      `${bodyText(`Hey ${escapeHtml(user.name || "there")},`)}
       ${bodyText("<strong>How to frame it with your team:</strong>")}
       ${bodyText("This isn't a test. It's a conversation with an AI that helps people understand where they are with AI tools. No wrong answers, no grades.")}
       ${bodyText('The best framing: "We\'re all figuring this out together. The assessment gives each person a personalized snapshot of where they are and what to try next."')}`,
      `${bodyText(`Hey ${escapeHtml(user.name || "there")},`)}
       ${bodyText("<strong>How to use your dashboard data:</strong>")}
       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
         <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; If most of the team is red on one skill, that's a workshop topic</td></tr>
         <tr><td style="padding: 0 0 6px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; If one person is way ahead, they might be an internal champion</td></tr>
         <tr><td style="padding: 0 0 16px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: ${BRAND.charcoal};" class="email-text">&#8226; The assessment handles individual insights. You focus on patterns.</td></tr>
       </table>`,
    ];

    const html = baseTemplate(card(`
      <h2 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 18px; font-weight: 600; color: ${BRAND.charcoal}; margin: 0 0 16px 0; mso-line-height-rule: exactly; line-height: 26px;" class="email-text">${subjects[step]}</h2>
      ${bodies[step]}
    `));

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: subjects[step],
      html,
    });
  } catch (e) {
    console.error(`Failed to send manager onboarding email step ${step}:`, e);
    try {
      await storage.createEmailLog({
        userId: user.id,
        emailType: "manager_onboarding",
        recipientEmail: user.email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e), step } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}

/**
 * PASSWORD RESET EMAIL
 * Sent when a user requests a password reset. Simple CTA button.
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();

    const html = baseTemplate(card(`
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 22px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; mso-line-height-rule: exactly; line-height: 30px;" class="email-text">Reset your password</h1>
      ${bodyText("We received a request to reset your password. Click the button below to choose a new one.")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top: 16px;" align="center">
          ${ctaButton("Reset Password", resetUrl)}
        </td></tr>
      </table>
      ${divider()}
      ${smallText("This link expires in 1 hour. If you didn't request this, you can safely ignore this email.")}
    `));

    await client.emails.send({
      from: fromEmail || from,
      to: email,
      replyTo,
      subject: "Reset your password",
      html,
    });
  } catch (e) {
    console.error("Failed to send password reset email:", e);
    try {
      await storage.createEmailLog({
        emailType: "password_reset",
        recipientEmail: email,
        event: "failed",
        metadata: { error: e instanceof Error ? e.message : String(e) } as Record<string, any>,
      });
    } catch (_) { /* don't let logging failure mask original error */ }
  }
}
