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

function baseTemplate(content: string, unsubscribeUrl?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tomorrow:wght@400;600;700&family=Source+Sans+3:wght@400;500;600&display=swap');
    body { margin: 0; padding: 0; background-color: #F0E4CE; font-family: 'Source Sans 3', 'Segoe UI', sans-serif; color: #2B2B2B; }
    .container { max-width: 580px; margin: 0 auto; padding: 32px 24px; }
    .card { background: #FFF8F0; border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    .wordmark { font-family: 'Tomorrow', sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 3px; color: #2B2B2B; text-transform: uppercase; margin-bottom: 24px; }
    h1 { font-family: 'Tomorrow', sans-serif; font-size: 24px; font-weight: 700; color: #2B2B2B; margin: 0 0 16px; }
    h2 { font-family: 'Tomorrow', sans-serif; font-size: 18px; font-weight: 600; color: #2B2B2B; margin: 0 0 12px; }
    h3 { font-family: 'Tomorrow', sans-serif; font-size: 15px; font-weight: 600; color: #2B2B2B; margin: 0 0 8px; }
    p { font-size: 15px; line-height: 1.6; margin: 0 0 12px; color: #2B2B2B; }
    .btn { display: inline-block; background: #FF2F86; color: white; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-family: 'Tomorrow', sans-serif; font-weight: 600; font-size: 14px; }
    .btn-secondary { background: transparent; border: 2px solid #FF2F86; color: #FF2F86; }
    .label { font-family: 'Tomorrow', sans-serif; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #FF2F86; margin-bottom: 8px; }
    .divider { border: none; border-top: 1px solid rgba(43,43,43,0.1); margin: 20px 0; }
    .footer { text-align: center; font-size: 12px; color: #999; padding: 16px; }
    .footer a { color: #FF2F86; text-decoration: none; }
    .badge-circle { display: inline-block; width: 48px; height: 48px; border-radius: 50%; text-align: center; line-height: 48px; font-family: 'Tomorrow', sans-serif; font-weight: 700; font-size: 20px; color: white; }
    .level-0 { background: #2DD6FF; }
    .level-1 { background: #FFD236; }
    .level-2 { background: #FF2F86; }
    .level-3 { background: #FF6A2B; }
    .level-4 { background: #1C4BFF; }
  </style>
</head>
<body>
  <div class="container">
    <div class="wordmark">ELECTRIC THINKING</div>
    ${content}
    <div class="footer">
      <p>Electric Thinking</p>
      ${unsubscribeUrl ? `<p><a href="${unsubscribeUrl}">Manage email preferences</a></p>` : ""}
    </div>
  </div>
</body>
</html>`;
}

export async function sendNudgeEmail(user: User, nudge: Nudge, skill: Skill, appUrl: string): Promise<string | null> {
  if (!user.emailValid || !user.emailPrefsNudges) return null;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const content = nudge.contentJson as any;
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(`
      <div class="card">
        <p style="font-size: 16px; line-height: 1.7; margin-bottom: 20px;">${content?.opener || ""}</p>
        <hr class="divider">

        <div class="label">THE IDEA</div>
        <p>${content?.idea || ""}</p>

        <hr class="divider">

        <div class="label">YOUR USE CASE</div>
        <p>${content?.use_case || ""}</p>

        <hr class="divider">

        <div class="label">TRY THIS</div>
        <p>${content?.action || ""}</p>

        <hr class="divider">

        <div class="label">REFLECT</div>
        <p style="font-style: italic;">${content?.reflection || ""}</p>

        <hr class="divider">

        <div class="label">STORY</div>
        <p style="font-size: 14px; color: #666;">${content?.story || ""}</p>

        <hr class="divider">

        <div style="text-align: center; margin-top: 24px;">
          <a href="${appUrl}/dashboard" class="btn">Mark This Skill Complete</a>
        </div>
        <div style="text-align: center; margin-top: 12px;">
          <a href="${appUrl}/dashboard" style="color: #FF2F86; font-size: 13px; text-decoration: none;">Open in App</a>
        </div>
      </div>
    `, unsubscribeUrl);

    const result = await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: content?.subject_line || nudge.subjectLine || `Your nudge for ${skill.name}`,
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

export async function sendWelcomeEmail(user: User, levelName: string, level: number, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsProgress) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(`
      <div class="card">
        <h1>Welcome to Electric Thinking</h1>
        <p>Hey ${user.name || "there"},</p>
        <p>You've completed your AI fluency assessment. Here's what we found:</p>
        <div style="text-align: center; margin: 24px 0;">
          <div class="badge-circle level-${level}">${level}</div>
          <h2 style="margin-top: 12px;">You're a ${levelName}</h2>
        </div>
        <p>This is your starting point, not your ceiling. Each week, you'll receive a personalized nudge to help you build your next skill.</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${appUrl}/dashboard" class="btn">View Your Dashboard</a>
        </div>
      </div>
    `, unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: `You're a Level ${level} ${levelName}`,
      html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
  } catch (e) {
    console.error("Failed to send welcome email:", e);
  }
}

export async function sendSkillCompleteEmail(user: User, skillName: string, nextSkillName: string | null, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsProgress) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(`
      <div class="card">
        <h1>Skill Complete!</h1>
        <p>${skillName}: locked in.</p>
        ${nextSkillName ? `<p>Up next: <strong>${nextSkillName}</strong>. Your nudges will now focus on this skill.</p>` : "<p>You're making great progress. Keep going!</p>"}
        <div style="text-align: center; margin-top: 24px;">
          <a href="${appUrl}/dashboard" class="btn">View Progress</a>
        </div>
      </div>
    `, unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: `Nice. ${skillName}: locked in.`,
      html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
  } catch (e) {
    console.error("Failed to send skill complete email:", e);
  }
}

export async function sendLevelUpEmail(user: User, levelName: string, level: number, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsProgress) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(`
      <div class="card" style="text-align: center;">
        <div class="badge-circle level-${level}" style="width: 72px; height: 72px; line-height: 72px; font-size: 28px; margin: 0 auto 16px;">${level}</div>
        <h1>You're now a ${levelName}!</h1>
        <p>You've completed all Level ${level} skills. That's a real milestone.</p>
        <p style="font-size: 14px; color: #666; margin-top: 16px;">Share your achievement: "I'm a Level ${level} AI ${levelName}, certified by Electric Thinking"</p>
        <div style="margin-top: 24px;">
          <a href="${appUrl}/dashboard" class="btn">Continue Your Journey</a>
        </div>
      </div>
    `, unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: `You're now a Level ${level} ${levelName}!`,
      html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
  } catch (e) {
    console.error("Failed to send level up email:", e);
  }
}

export async function sendReEngagementEmail(user: User, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsNudges) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(`
      <div class="card">
        <p>Hey ${user.name || "there"},</p>
        <p>No pressure. Here's one thing you could try in 2 minutes.</p>
        <p>Open your AI tool and ask it one question about something you're working on right now. That's it. Just one question.</p>
        <p>Sometimes the smallest step is the one that sticks.</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${appUrl}/dashboard" class="btn">Open Dashboard</a>
        </div>
      </div>
    `, unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: "Just 2 minutes. That's all.",
      html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
  } catch (e) {
    console.error("Failed to send re-engagement email:", e);
  }
}

export async function sendReAssessmentEmail(user: User, appUrl: string): Promise<void> {
  if (!user.emailValid || !user.emailPrefsReminders) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();
    const unsubscribeUrl = `${appUrl}/unsubscribe/${user.unsubscribeToken}`;

    const html = baseTemplate(`
      <div class="card">
        <h1>Time for a check-in</h1>
        <p>Hey ${user.name || "there"},</p>
        <p>It's been a while since your last assessment. Your AI skills have likely grown. Want to see where you are now?</p>
        <p>A re-assessment takes just a few minutes and can only move you up, never down.</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${appUrl}/assessment/warmup" class="btn">Take Re-Assessment</a>
        </div>
      </div>
    `, unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: "Your AI skills have probably grown. Want to check?",
      html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
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

    const html = baseTemplate(`
      <div class="card">
        <h1>Pick up where you left off</h1>
        <p>Hey ${user.name || "there"},</p>
        <p>You started your AI fluency assessment but didn't finish. It only takes a few more minutes.</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${appUrl}/assessment" class="btn">Continue Assessment</a>
        </div>
      </div>
    `, unsubscribeUrl);

    await client.emails.send({
      from: fromEmail || from,
      to: user.email,
      replyTo,
      subject: "You started your AI fluency assessment but didn't finish",
      html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
  } catch (e) {
    console.error("Failed to send abandoned assessment email:", e);
  }
}

export async function sendInviteEmail(email: string, inviterName: string, orgName: string, token: string, appUrl: string, welcomeMessage?: string): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { from, replyTo } = await getFromConfig();

    const html = baseTemplate(`
      <div class="card">
        <h1>You're invited</h1>
        <p>${inviterName} has invited you to join ${orgName}'s AI fluency program on Electric Thinking.</p>
        ${welcomeMessage ? `<p style="font-style: italic; color: #666;">${welcomeMessage}</p>` : ""}
        <p>Take a quick assessment to discover your AI fluency level, then get personalized learning nudges each week.</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${appUrl}/join?token=${token}" class="btn">Join Your Team</a>
        </div>
      </div>
    `);

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
      `<p>Hey ${user.name || "there"},</p>
       <p>You now have access to the Manager Dashboard. Here's what you can see:</p>
       <p>Your team's level distribution, individual skill profiles, progression timelines, and common skill gaps. You can also toggle nudges on or off for any team member.</p>
       <p>One thing to know: you can see skill scores and levels, but not assessment transcripts or conversation details. That's by design. Trust the process.</p>
       <div style="text-align: center; margin-top: 24px;">
         <a href="${appUrl}/manager" class="btn">Open Manager Dashboard</a>
       </div>`,
      `<p>Hey ${user.name || "there"},</p>
       <p>A quick note on framing the assessment with your team:</p>
       <p>This isn't a test. It's a conversation with an AI that helps people understand where they are with AI tools. There are no wrong answers, no grades, and no consequences for being early in the journey.</p>
       <p>The best framing: "We're all learning this together. The assessment gives each person a personalized learning path."</p>`,
      `<p>Hey ${user.name || "there"},</p>
       <p>Your dashboard shows where your team's gaps are. Use this to plan training, not to judge individuals.</p>
       <p>Look for patterns: if most of the team is red on "Context Setting," that's a great topic for a team workshop. If one person is way ahead, they might be a good internal champion.</p>
       <p>The weekly nudges do the individual coaching. You focus on the team-level patterns.</p>`,
    ];

    const html = baseTemplate(`
      <div class="card">
        <h2>${subjects[step]}</h2>
        ${bodies[step]}
      </div>
    `);

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
