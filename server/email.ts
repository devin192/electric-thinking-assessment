import { getUncachableResendClient } from "./resend-client";
import { storage } from "./storage";
import type { User, Nudge, Skill, Level } from "@shared/schema";

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
  levelColors: ["#2DD6FF", "#FFD236", "#FF2F86", "#FF6A2B", "#1C4BFF"],
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding: 20px 0;"><hr style="border: none; border-top: 1px solid rgba(43,43,43,0.1); margin: 0;"></td></tr></table>`;
}

// Helper for section labels
function sectionLabel(text: string): string {
  return `<p style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: ${BRAND.pink}; margin: 0 0 8px 0; mso-line-height-rule: exactly; line-height: 16px;">${text}</p>`;
}

// ═══════════════════════════════════════════════════════════════════════
// Email templates
// ═══════════════════════════════════════════════════════════════════════

/**
 * 1. WELCOME EMAIL
 * Sent after signup (non-org users) or after assessment completion.
 * 3-5 sentences, one CTA to start the assessment.
 */
export async function sendWelcomeEmail(user: User, levelName: string, level: number, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsProgress) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;
    const levelColor = BRAND.levelColors[level] || BRAND.pink;

    const html = baseTemplate(card(`
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 24px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; mso-line-height-rule: exactly; line-height: 32px;" class="email-text">Welcome to Electric Thinking</h1>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Hey ${user.name || "there"},</p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 16px 0;" class="email-text">You've completed your AI fluency assessment. Here's where you landed:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 24px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width: 64px; height: 64px; border-radius: 50%; background-color: ${levelColor}; text-align: center; vertical-align: middle; font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-weight: 700; font-size: 24px; color: ${BRAND.white};" bgcolor="${levelColor}">${level}</td>
              </tr>
            </table>
            <p style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 18px; font-weight: 600; color: ${BRAND.charcoal}; margin: 12px 0 0 0;" class="email-text">${levelName}</p>
          </td>
        </tr>
      </table>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">This is your starting point, not your ceiling. You'll get personalized skill challenges to help you build from here.</p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 24px 0;" class="email-text">Your first challenge is already waiting.</p>
      ${ctaButton("View Your Dashboard", `${appUrl}/dashboard`)}
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: `You're a Level ${level} ${levelName}`,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send welcome email:", e);
  }
}

/**
 * 2. WEEKLY CHALLENGE EMAIL (nudge delivery)
 * The core retention mechanism. Delivers one skill challenge.
 * Template variables: user.name, skill.name, nudge.contentJson fields.
 */
export async function sendNudgeEmail(user: User, nudge: Nudge, skill: Skill, appUrl: string): Promise<string | null> {
  if (!user.emailValid || !user.emailPrefsNudges) return null;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const content = nudge.contentJson as any;
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(card(`
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.7; color: ${BRAND.charcoal}; margin: 0 0 20px 0;" class="email-text">${content?.opener || ""}</p>
      ${divider()}
      ${sectionLabel("THE IDEA")}
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 4px 0;" class="email-text">${content?.idea || ""}</p>
      ${divider()}
      ${sectionLabel("YOUR USE CASE")}
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 4px 0;" class="email-text">${content?.use_case || ""}</p>
      ${divider()}
      ${sectionLabel("TRY THIS")}
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 4px 0;" class="email-text">${content?.action || ""}</p>
      ${divider()}
      ${sectionLabel("REFLECT")}
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 4px 0; font-style: italic;" class="email-text">${content?.reflection || ""}</p>
      ${divider()}
      ${sectionLabel("STORY")}
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: ${BRAND.textLight}; margin: 0 0 4px 0;" class="email-text-light">${content?.story || ""}</p>
      ${divider()}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top: 8px;" align="center">
          ${ctaButton("Read Challenge", `${appUrl}/dashboard`)}
        </td></tr>
        <tr><td style="padding-top: 12px; text-align: center;">
          <a href="${appUrl}/dashboard" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: ${BRAND.pink}; font-size: 13px; text-decoration: none;">Open in App</a>
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
    return null;
  }
}

/**
 * 3. SKILL COMPLETION EMAIL
 * Sent when a skill turns green. Celebrates the specific skill,
 * shows progress, previews the next skill.
 */
export async function sendSkillCompleteEmail(user: User, skillName: string, nextSkillName: string | null, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsProgress) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const nextSkillSection = nextSkillName
      ? `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 24px 0;" class="email-text">Up next: <strong>${nextSkillName}</strong>. Your challenges will now focus here.</p>`
      : `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 24px 0;" class="email-text">Keep going. Every skill you lock in changes how you work.</p>`;

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
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">You proved you can do this, not just talk about it. That skill is yours now.</p>
      ${nextSkillSection}
      ${ctaButton("See Your Skill Map", `${appUrl}/dashboard`)}
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
  }
}

/**
 * 4. LEVEL-UP EMAIL
 * Sent when all 5 skills in a level turn green. Ceremonial.
 * This should feel different from skill completion, bigger and more visual.
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
                <td style="width: 80px; height: 80px; border-radius: 50%; background-color: ${levelColor}; text-align: center; vertical-align: middle; font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-weight: 700; font-size: 32px; color: ${BRAND.white};" bgcolor="${levelColor}">${level}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 26px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; text-align: center; mso-line-height-rule: exactly; line-height: 34px;" class="email-text">You're now a ${levelName}</h1>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0; text-align: center;" class="email-text">All five Level ${level} skills: complete. That took real work.</p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 24px 0; text-align: center;" class="email-text">You've moved past where most people stop. The next level brings harder challenges and bigger thinking.</p>
      ${divider()}
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: ${BRAND.textLight}; margin: 0 0 24px 0; text-align: center;" class="email-text-light">Share your achievement: "I'm a Level ${level} AI ${levelName}, certified by Electric Thinking."</p>
      ${ctaButton("Explore Your New Territory", `${appUrl}/dashboard`)}
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: `Level ${level} complete. You're now a ${levelName}.`,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send level up email:", e);
  }
}

/**
 * 5. RE-ENGAGEMENT EMAIL
 * Sent after 7+ days inactive (3+ weeks of unopened emails).
 * 2-3 sentences, no guilt, one small action, direct link.
 */
export async function sendReEngagementEmail(user: User, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsNudges) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(card(`
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Hey ${user.name || "there"},</p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">No pressure. Here's one thing you could try in 2 minutes.</p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Open your AI tool and ask it one question about something you're working on right now. That's it. Just one question.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top: 24px;" align="center">
          ${ctaButton("Jump Back In", `${appUrl}/dashboard`)}
        </td></tr>
      </table>
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: "Just 2 minutes. That's all.",
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send re-engagement email:", e);
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
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Hey ${user.name || "there"},</p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">It's been a while since your last assessment. Your AI skills have probably grown. Want to see where you are now?</p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 24px 0;" class="email-text">A re-assessment takes just a few minutes and can only move you up, never down.</p>
      ${ctaButton("Take Re-Assessment", `${appUrl}/assessment/warmup`)}
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
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Hey ${user.name || "there"},</p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 24px 0;" class="email-text">You started your AI fluency assessment but didn't finish. It only takes a few more minutes.</p>
      ${ctaButton("Continue Assessment", `${appUrl}/assessment`)}
    `), unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: "Your assessment is waiting",
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("Failed to send abandoned assessment email:", e);
  }
}

export async function sendInviteEmail(email: string, inviterName: string, orgName: string, token: string, appUrl: string, welcomeMessage?: string): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();

    const html = baseTemplate(card(`
      <h1 style="font-family: 'Tomorrow', 'Trebuchet MS', Arial, sans-serif; font-size: 22px; font-weight: 700; color: ${BRAND.charcoal}; margin: 0 0 16px 0; mso-line-height-rule: exactly; line-height: 30px;" class="email-text">You're invited</h1>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">${inviterName} has invited you to join ${orgName}'s AI fluency program on Electric Thinking.</p>
      ${welcomeMessage ? `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: ${BRAND.textLight}; font-style: italic; margin: 0 0 12px 0;" class="email-text-light">${welcomeMessage}</p>` : ""}
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 24px 0;" class="email-text">Take a quick assessment to discover your AI fluency level, then get personalized challenges each week.</p>
      ${ctaButton("Join Your Team", `${appUrl}/join?token=${token}`)}
    `));

    await client.emails.send({
      from: fromEmail || from,
      to: email,
      replyTo,
      subject: `${inviterName} invited you to Electric Thinking`,
      html,
    });
  } catch (e) {
    console.error("Failed to send invite email:", e);
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
      `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Hey ${user.name || "there"},</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">You now have access to the Manager Dashboard. Here's what you can see:</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Your team's level distribution, individual skill profiles, progression timelines, and common skill gaps. You can also toggle challenges on or off for any team member.</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 24px 0;" class="email-text">One thing to know: you can see skill scores and levels, but not assessment transcripts or conversation details. That's by design. Trust the process.</p>
       ${ctaButton("Open Manager Dashboard", `${appUrl}/manager`)}`,
      `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Hey ${user.name || "there"},</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">A quick note on framing the assessment with your team:</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">This isn't a test. It's a conversation with an AI that helps people understand where they are with AI tools. There are no wrong answers, no grades, and no consequences for being early in the journey.</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">The best framing: "We're all learning this together. The assessment gives each person a personalized learning path."</p>`,
      `<p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Hey ${user.name || "there"},</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Your dashboard shows where your team's gaps are. Use this to plan training, not to judge individuals.</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">Look for patterns: if most of the team is red on "Context Setting," that's a good topic for a team workshop. If one person is way ahead, they might be a good internal champion.</p>
       <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.charcoal}; margin: 0 0 12px 0;" class="email-text">The weekly challenges do the individual coaching. You focus on the team-level patterns.</p>`,
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
  }
}
