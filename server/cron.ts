import cron from "node-cron";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { assessments as assessmentsTable } from "@shared/schema";
import { storage } from "./storage";
import { generateNudgeWithDedup } from "./nudge-ai";
import type { NudgeGenerationResult } from "./nudge-ai";
import {
  sendNudgeEmail,
  sendReEngagementEmail,
  sendReAssessmentEmail,
  sendAbandonedAssessmentEmail,
} from "./email";
import { postNudgeToSlack } from "./slack";

const APP_URL = process.env.APP_URL || "http://localhost:5000";

export function startCronJobs() {
  // Nudge generation + delivery: Tuesday and Friday at 9am server time
  // Gated by system config "nudges_enabled" and per-user flags inside the functions
  cron.schedule("0 9 * * 2,5", async () => {
    console.log(`${new Date().toLocaleTimeString()} [cron] Running nudge cycle (Tue/Fri)...`);
    try {
      const enabled = await storage.getSystemConfig("nudges_enabled");
      if (enabled !== "true") {
        console.log(`${new Date().toLocaleTimeString()} [cron] Nudges disabled via system config. Skipping.`);
        return;
      }
      const genResult = await runNudgeGeneration();
      console.log(`${new Date().toLocaleTimeString()} [cron] Nudge generation complete: ${genResult.generated} generated, ${genResult.failed} failed`);
      const delResult = await runNudgeDelivery();
      console.log(`${new Date().toLocaleTimeString()} [cron] Nudge delivery complete: ${delResult.sent} sent, ${delResult.failed} failed`);
    } catch (e: any) {
      console.error(`${new Date().toLocaleTimeString()} [cron] Nudge cycle error:`, e.message);
    }
  });

  // Daily checks: abandoned assessments, etc.
  cron.schedule("0 10 * * *", async () => {
    console.log(`${new Date().toLocaleTimeString()} [cron] Running daily checks...`);
    await runDailyChecks();
  });

  console.log(`${new Date().toLocaleTimeString()} [cron] Cron jobs started: nudges (Tue/Fri 9am), daily checks (10am)`);
}

export async function runNudgeGeneration(): Promise<{ generated: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let generated = 0;
  let failed = 0;

  try {
    // Feature flag: global kill switch
    const enabled = await storage.getSystemConfig("nudges_enabled");
    if (enabled !== "true") {
      console.log("[cron] Nudges disabled via system config. Skipping generation.");
      return { generated, failed, errors };
    }

    const costThresholdStr = await storage.getSystemConfig("nudge_cost_threshold");
    const costThreshold = parseFloat(costThresholdStr || "50");

    const activeUsers = await storage.getActiveNudgeUsers();
    const allSkills = await storage.getSkills();
    const allLevels = await storage.getLevels();

    // Build a map of levelId -> level sortOrder for ordering skills by level
    const levelSortMap = new Map<number, number>();
    for (const level of allLevels) {
      levelSortMap.set(level.id, level.sortOrder);
    }

    for (const user of activeUsers) {
      try {
        // Per-user flags
        if (!user.nudgesActive || !user.emailPrefsNudges) continue;

        // Check if it's an appropriate send day (Tuesday=2 or Friday=5)
        // Convert to user's timezone for the day-of-week check
        const userTz = user.timezone || "America/Los_Angeles";
        const nowInUserTz = new Date(new Date().toLocaleString("en-US", { timeZone: userTz }));
        const userDayOfWeek = nowInUserTz.getDay();
        if (userDayOfWeek !== 2 && userDayOfWeek !== 5) continue;

        // Get the user's skill statuses and all previous nudges
        const statuses = await storage.getUserSkillStatuses(user.id);
        const allUserNudges = await storage.getUserNudges(user.id, 200);

        // Build set of skillIds that already have a nudge for this user
        const nudgedSkillIds = new Set<number>();
        for (const n of allUserNudges) {
          if (n.skillId !== null) nudgedSkillIds.add(n.skillId);
        }

        // Phase 1: Red/Yellow Sweep
        // Find all red and yellow skills, ordered by level (lowest first), then skill sort order
        const redYellowStatuses = statuses
          .filter(s => s.status === "red" || s.status === "yellow")
          .sort((a, b) => {
            const skillA = allSkills.find(s => s.id === a.skillId);
            const skillB = allSkills.find(s => s.id === b.skillId);
            const levelOrderA = levelSortMap.get(skillA?.levelId ?? 0) ?? 999;
            const levelOrderB = levelSortMap.get(skillB?.levelId ?? 0) ?? 999;
            if (levelOrderA !== levelOrderB) return levelOrderA - levelOrderB;
            return (skillA?.sortOrder || 0) - (skillB?.sortOrder || 0);
          });

        // Find the next red/yellow skill that hasn't had a nudge yet
        const nextRedYellow = redYellowStatuses.find(s => !nudgedSkillIds.has(s.skillId));

        if (nextRedYellow) {
          // Phase 1: Generate a skill-specific nudge
          const skill = allSkills.find(s => s.id === nextRedYellow.skillId);
          if (!skill) continue;

          const latestAssessment = (await storage.getCompletedAssessments(user.id))[0];
          if (!latestAssessment) continue;

          const userRecord = user as any;
          const currentLevel: number = userRecord.currentLevel ?? latestAssessment.assessmentLevel ?? 1;
          const contextSummary = latestAssessment.contextSummary || "No assessment context available.";
          const previousNudges = await storage.getNudgesByUserAndSkill(user.id, skill.id);

          const result: NudgeGenerationResult = await generateNudgeWithDedup(
            user,
            currentLevel,
            contextSummary,
            previousNudges,
            { name: skill.name, description: skill.description },
          );
          const { content: nudgeContent, usage } = result;

          const createdNudge = await storage.createNudge({
            userId: user.id,
            skillId: skill.id,
            contentJson: nudgeContent as any,
            subjectLine: nudgeContent.subjectLine,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            generationCost: usage.generationCostCents.toFixed(4),
          });
          console.log(`[nudge-generated] userId=${user.id} skillName=${skill.name} level=${currentLevel} phase=red-yellow-sweep inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens} costCents=${usage.generationCostCents.toFixed(4)}`);
          postNudgeToSlack(createdNudge, user, skill).catch(console.error);
          generated++;
        } else {
          // Phase 2: Level Drip
          // All red/yellow skills have been covered. Send a general level nudge.
          // Use currentLevel if available (Agent 4 adds this column), fall back to assessment level
          const latestAssessment = (await storage.getCompletedAssessments(user.id))[0];
          if (!latestAssessment) continue; // No completed assessment, nothing to drip

          const userRecord = user as any;
          const currentLevel: number = userRecord.currentLevel ?? latestAssessment.assessmentLevel ?? 1;

          // Find a skill at the user's current level to use as the nudge anchor
          // Pick one that hasn't been nudged recently (or at all)
          const levelObj = allLevels.find(l => l.sortOrder === currentLevel);
          if (!levelObj) continue;

          const levelSkills = allSkills.filter(s => s.levelId === levelObj.id);
          if (levelSkills.length === 0) continue;

          // Find a level skill we haven't nudged yet, or pick the one with the fewest nudges
          let targetSkill = levelSkills.find(s => !nudgedSkillIds.has(s.id));
          if (!targetSkill) {
            // All skills at this level have been nudged at least once.
            // Pick the one with the oldest/fewest nudges to avoid repetition.
            let minNudgeCount = Infinity;
            for (const s of levelSkills) {
              const count = allUserNudges.filter(n => n.skillId === s.id).length;
              if (count < minNudgeCount) {
                minNudgeCount = count;
                targetSkill = s;
              }
            }
          }
          if (!targetSkill) continue;

          const contextSummary = latestAssessment.contextSummary || "No assessment context available.";
          const previousNudges = allUserNudges.slice(0, 20);

          const result: NudgeGenerationResult = await generateNudgeWithDedup(
            user,
            currentLevel,
            contextSummary,
            previousNudges,
            null,
          );
          const { content: nudgeContent, usage } = result;

          const createdNudge = await storage.createNudge({
            userId: user.id,
            skillId: targetSkill.id,
            contentJson: nudgeContent as any,
            subjectLine: nudgeContent.subjectLine,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            generationCost: usage.generationCostCents.toFixed(4),
          });
          console.log(`[nudge-generated] userId=${user.id} skillName=${targetSkill.name} level=${currentLevel} phase=level-drip inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens} costCents=${usage.generationCostCents.toFixed(4)}`);
          // Phase 2 is a level drip — the Slack message shows "Level drip"
          // instead of a target skill, so pass null even though a skill is
          // attached to the DB row for anchoring purposes.
          postNudgeToSlack(createdNudge, user, null).catch(console.error);
          generated++;
        }

        // Cost threshold check
        const estimatedCost = generated * 0.015;
        if (estimatedCost > costThreshold) {
          console.log(`[cron] Cost threshold reached ($${estimatedCost.toFixed(2)}). Pausing generation.`);
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
    // Feature flag: global kill switch
    const enabled = await storage.getSystemConfig("nudges_enabled");
    if (enabled !== "true") {
      console.log("[cron] Nudges disabled via system config. Skipping delivery.");
      return { sent, failed };
    }

    const unsentNudges = await storage.getUnsentNudges();
    const allSkills = await storage.getSkills();

    for (const nudge of unsentNudges) {
      try {
        const user = await storage.getUser(nudge.userId);
        if (!user || !user.emailValid || !user.emailPrefsNudges || !user.nudgesActive) {
          continue;
        }

        const skill = nudge.skillId ? allSkills.find(s => s.id === nudge.skillId) ?? null : null;
        if (nudge.skillId && !skill) continue;

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

        console.log(`[nudge-sent] userId=${user.id} nudgeId=${nudge.id} to=${user.email}`);
        sent++;
      } catch (e: any) {
        failed++;
        console.error(`[cron] Failed to send nudge ${nudge.id}:`, e.message);
      }
    }

    await storage.setSystemConfig("nudge_delivery_last_run", new Date().toISOString());
    await storage.setSystemConfig("nudge_delivery_last_result", JSON.stringify({ sent, failed }));
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
