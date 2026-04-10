import cron from "node-cron";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { assessments as assessmentsTable } from "@shared/schema";
import { storage } from "./storage";
import { generateNudge } from "./nudge-ai";
import { generateEmailSubjectLine } from "./email-headline";
import {
  sendNudgeEmail,
  sendReEngagementEmail,
  sendReAssessmentEmail,
  sendAbandonedAssessmentEmail,
} from "./email";

const APP_URL = process.env.APP_URL || "http://localhost:5000";

export function startCronJobs() {
  console.log(`${new Date().toLocaleTimeString()} [cron] Cron jobs disabled — assessment-only product (no nudges/challenges). Keeping abandoned assessment check.`);

  // Nudge generation, delivery, and re-assessment reminders disabled for assessment-only product.
  // These were generating AI content and sending emails for the removed Power Ups feature.

  // Keep only the abandoned assessment email (useful for assessment-only flow)
  cron.schedule("0 10 * * *", async () => {
    console.log(`${new Date().toLocaleTimeString()} [cron] Running daily checks...`);
    await runDailyChecks();
  });
}

export async function runNudgeGeneration(): Promise<{ generated: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let generated = 0;
  let failed = 0;

  try {
    const costThresholdStr = await storage.getSystemConfig("nudge_cost_threshold");
    const costThreshold = parseFloat(costThresholdStr || "50");

    const activeUsers = await storage.getActiveNudgeUsers();
    const allSkills = await storage.getSkills();

    for (const user of activeUsers) {
      try {
        const freq = user.challengeFrequency || "weekly";
        const now = new Date();
        const dayOfWeek = now.getDay();

        // Map day names to JS getDay() values
        const dayNameToNumber: Record<string, number> = {
          "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
          "Thursday": 4, "Friday": 5, "Saturday": 6,
        };
        const preferredDay = dayNameToNumber[user.nudgeDay || "Monday"] ?? 1;

        let shouldGenerate = false;
        if (freq === "daily") {
          shouldGenerate = true;
        } else if (freq === "every_other_day") {
          shouldGenerate = dayOfWeek % 2 === 0;
        } else if (freq === "twice_weekly") {
          shouldGenerate = dayOfWeek === preferredDay || dayOfWeek === ((preferredDay + 3) % 7);
        } else {
          // weekly: use user's preferred nudge day
          shouldGenerate = dayOfWeek === preferredDay;
        }

        if (!shouldGenerate) continue;

        const statuses = await storage.getUserSkillStatuses(user.id);
        const yellowStatuses = statuses.filter(s => s.status === "yellow");

        if (yellowStatuses.length === 0) continue;

        const activeSkillStatus = yellowStatuses.sort((a, b) => {
          const skillA = allSkills.find(s => s.id === a.skillId);
          const skillB = allSkills.find(s => s.id === b.skillId);
          return (skillA?.sortOrder || 0) - (skillB?.sortOrder || 0);
        })[0];

        const skill = allSkills.find(s => s.id === activeSkillStatus.skillId);
        if (!skill) continue;

        const previousNudges = await storage.getNudgesByUserAndSkill(user.id, skill.id);
        const nudgeContent = await generateNudge(user, skill, previousNudges);

        // Generate a personalized email subject line
        let subjectLine = nudgeContent.subject_line;
        try {
          const latestAssessment = (await storage.getCompletedAssessments(user.id))[0];
          const betterSubject = await generateEmailSubjectLine(
            {
              name: user.name || "there",
              roleTitle: user.roleTitle || "professional",
              workContextSummary: latestAssessment?.workContextSummary || undefined,
              contextSummary: latestAssessment?.contextSummary || undefined,
            },
            nudgeContent
          );
          if (betterSubject) {
            subjectLine = betterSubject;
          }
        } catch (headlineErr) {
          console.error(`[cron] Email headline generation failed for user ${user.id}, using default:`, headlineErr);
        }

        await storage.createNudge({
          userId: user.id,
          skillId: skill.id,
          contentJson: nudgeContent,
          subjectLine,
        });

        generated++;

        const estimatedCost = generated * 0.015;
        if (estimatedCost > costThreshold) {
          console.log(`[cron] Cost threshold reached ($${estimatedCost}). Pausing generation.`);
          break;
        }
      } catch (e: any) {
        failed++;
        errors.push(`User ${user.id}: ${e.message}`);
        console.error(`[cron] Failed to generate nudge for user ${user.id}:`, e.message);
      }
    }

    await storage.setSystemConfig("nudge_generation_last_run", new Date().toISOString());
    await storage.setSystemConfig("nudge_generation_last_result", JSON.stringify({ generated, failed, errors: errors.slice(0, 10) }));
  } catch (e: any) {
    console.error("[cron] Nudge generation batch error:", e);
    errors.push(`Batch error: ${e.message}`);
  }

  return { generated, failed, errors };
}

export async function runNudgeDelivery(): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
    const unsentNudges = await storage.getUnsentNudges();
    const allSkills = await storage.getSkills();

    for (const nudge of unsentNudges) {
      try {
        const user = await storage.getUser(nudge.userId);
        if (!user || !user.emailValid || !user.emailPrefsNudges || !user.nudgesActive) {
          continue;
        }

        const skill = allSkills.find(s => s.id === nudge.skillId);
        if (!skill) continue;

        const emailId = await sendNudgeEmail(user, nudge, skill, APP_URL);

        await storage.updateNudge(nudge.id, {
          emailSent: true,
          emailId: emailId || undefined,
          sentAt: new Date(),
        });

        if (emailId) {
          await storage.createEmailLog({
            userId: user.id,
            emailType: "nudge",
            resendId: emailId,
            recipientEmail: user.email,
            event: "sent",
          });
        }

        sent++;
      } catch (e: any) {
        failed++;
        console.error(`[cron] Failed to send nudge ${nudge.id}:`, e.message);
      }
    }

    await storage.setSystemConfig("nudge_delivery_last_run", new Date().toISOString());
  } catch (e: any) {
    console.error("[cron] Nudge delivery batch error:", e);
  }

  return { sent, failed };
}

export async function runDailyChecks(): Promise<void> {
  try {
    // Nudge/re-engagement checks disabled for assessment-only product
    await checkAbandonedAssessments();
    await storage.setSystemConfig("daily_checks_last_run", new Date().toISOString());
  } catch (e: any) {
    console.error("[cron] Daily checks error:", e);
  }
}

/**
 * Find assessments that are "in_progress" and started 30+ minutes ago but never completed.
 * Sends a recovery email if we haven't already sent one for this assessment.
 *
 * Wire into a cron job via runDailyChecks(), or call manually:
 *   import { checkAbandonedAssessments } from "./cron";
 *   await checkAbandonedAssessments();
 */
export async function checkAbandonedAssessments(): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  try {
    // 30 minutes = 0.5 hours
    const abandoned = await storage.getAbandonedAssessments(0.5);
    for (const assessment of abandoned) {
      try {
        // Skip if we already sent an abandoned email for this specific assessment
        if (assessment.abandonedEmailSent) {
          skipped++;
          continue;
        }

        const user = await storage.getUser(assessment.userId);
        if (!user || !user.emailValid || !user.emailPrefsReminders) {
          skipped++;
          continue;
        }

        // Skip if the user already completed a different assessment
        const completed = await storage.getCompletedAssessments(user.id);
        if (completed.length > 0) {
          skipped++;
          continue;
        }

        // Atomic claim: only update if still in_progress and not yet emailed
        const [claimed] = await db.update(assessmentsTable)
          .set({ abandonedEmailSent: true })
          .where(and(
            eq(assessmentsTable.id, assessment.id),
            eq(assessmentsTable.status, "in_progress"),
            eq(assessmentsTable.abandonedEmailSent, false)
          ))
          .returning();
        if (!claimed) {
          skipped++;
          continue;
        }

        await sendAbandonedAssessmentEmail(user, APP_URL);
        sent++;
      } catch (e: any) {
        console.error(`[cron] Abandoned assessment email failed for assessment ${assessment.id}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error("[cron] checkAbandonedAssessments error:", e);
  }

  return { sent, skipped };
}

export async function runReAssessmentReminders(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    for (const user of allUsers) {
      try {
        const completed = await storage.getCompletedAssessments(user.id);
        if (completed.length === 0) continue;

        const latest = completed[0];
        if (latest.completedAt && latest.completedAt < ninetyDaysAgo) {
          await sendReAssessmentEmail(user, APP_URL);
        }
      } catch (e: any) {
        console.error(`[cron] Re-assessment reminder failed for user ${user.id}:`, e.message);
      }
    }

    await storage.setSystemConfig("reassessment_reminder_last_run", new Date().toISOString());
  } catch (e: any) {
    console.error("[cron] Re-assessment reminders error:", e);
  }
}
