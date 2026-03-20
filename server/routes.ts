import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, hashPassword, comparePasswords, requireAuth, requireAdmin, getCurrentUser } from "./auth";
import { getAssessmentResponse, scoreAssessment } from "./assessment-ai";
import { generateNudge, generateVerificationQuestions } from "./nudge-ai";
import { sendWelcomeEmail, sendSkillCompleteEmail, sendLevelUpEmail, sendInviteEmail, sendManagerOnboardingEmail, sendPasswordResetEmail } from "./email";
import { seedDatabase } from "./seed";
import { startCronJobs, runNudgeGeneration, runNudgeDelivery } from "./cron";
import { generateBadgeSVG } from "./badge-svg";
import { getConversationSignedUrl } from "./elevenlabs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { registerSchema, loginSchema, insertLiveSessionSchema } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { message: "Too many attempts, please try again later" } });

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  storage.getUser(req.session.userId).then(user => {
    if (!user || !["manager", "org_admin", "system_admin"].includes(user.userRole)) {
      return res.status(403).json({ message: "Manager access required" });
    }
    next();
  }).catch(() => res.status(500).json({ message: "Internal error" }));
}

const APP_URL = process.env.APP_URL || "http://localhost:5000";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  await seedDatabase();

  startCronJobs();

  // ========== AUTH ==========
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const hashedPassword = await hashPassword(data.password);
      const unsubscribeToken = randomUUID();
      const user = await storage.createUser({
        email: data.email,
        name: data.name,
        password: hashedPassword,
        userRole: "member",
        unsubscribeToken,
      });
      req.session.userId = user.id;
      const { password: _, ...userWithoutPassword } = user;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      return res.json(userWithoutPassword);
    } catch (e: any) {
      return res.status(400).json({ message: e.message || "Invalid input" });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const valid = await comparePasswords(data.password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      req.session.userId = user.id;
      const { password: _, ...userWithoutPassword } = user;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      return res.json(userWithoutPassword);
    } catch (e: any) {
      return res.status(400).json({ message: e.message || "Invalid input" });
    }
  });


  app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      // Always return success to avoid leaking whether email exists
      const user = await storage.getUserByEmail(email);
      if (user) {
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await storage.createPasswordResetToken({ userId: user.id, token, expiresAt });
        const resetUrl = `${APP_URL}/reset-password?token=${token}`;
        await sendPasswordResetEmail(user.email, resetUrl);
      }
      return res.json({ message: "If an account with that email exists, we sent a password reset link." });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || "Invalid input" });
    }
  });

  app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
    try {
      const { token, newPassword } = z.object({
        token: z.string().min(1),
        newPassword: z.string().min(6),
      }).parse(req.body);
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(resetToken.userId, { password: hashedPassword });
      await storage.markPasswordResetTokenUsed(resetToken.id);
      return res.json({ message: "Password has been reset successfully" });
    } catch (e: any) {
      return res.status(400).json({ message: e.message || "Invalid input" });
    }
  });
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const { password: _, ...userWithoutPassword } = user;
    return res.json(userWithoutPassword);
  });

  app.patch("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const allowedFields = [
        "name", "roleTitle", "aiPlatform", "nudgesActive", "nudgeDay", "timezone",
        "onboardingComplete", "emailPrefsNudges", "emailPrefsProgress", "emailPrefsReminders",
      ];
      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }
      const updated = await storage.updateUser(user.id, updates);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _, ...userWithoutPassword } = updated;
      return res.json(userWithoutPassword);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  // ========== PUBLIC DATA ==========
  app.get("/api/levels", async (_req, res) => {
    const lvls = await storage.getLevels();
    return res.json(lvls);
  });

  app.get("/api/skills", async (_req, res) => {
    const sk = await storage.getSkills();
    return res.json(sk);
  });

  app.get("/api/platforms", async (_req, res) => {
    const platforms = await storage.getAiPlatforms();
    return res.json(platforms);
  });

  // ========== ASSESSMENT ==========
  app.get("/api/assessment/active", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const assessment = await storage.getActiveAssessment(user.id);
    return res.json(assessment || null);
  });

  app.post("/api/assessment/start", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const existing = await storage.getActiveAssessment(user.id);
    if (existing) return res.json(existing);

    const assessment = await storage.createAssessment({
      userId: user.id,
      status: "in_progress",
      transcript: JSON.stringify([]),
    });
    return res.json(assessment);
  });

  app.post("/api/assessment/:id/message", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const assessmentId = parseInt(req.params.id);
      const assessment = await storage.getAssessment(assessmentId);
      if (!assessment || assessment.userId !== user.id) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      const { message, transcript } = req.body;
      if (!message) return res.status(400).json({ message: "Message required" });

      if (message === "__TRANSCRIPT_SAVE__" && transcript) {
        await storage.updateAssessment(assessmentId, {
          transcript: transcript,
        });
        return res.json({ saved: true });
      }

      let messages: Array<{ role: "user" | "assistant"; content: string }> = [];
      try { messages = JSON.parse(assessment.transcript || "[]"); } catch { messages = []; }

      messages.push({ role: "user", content: message });

      const aiResponse = await getAssessmentResponse(messages, {
        name: user.name || undefined,
        roleTitle: user.roleTitle || undefined,
        aiPlatform: user.aiPlatform || undefined,
      });

      messages.push({ role: "assistant", content: aiResponse });

      await storage.updateAssessment(assessmentId, {
        transcript: JSON.stringify(messages),
      });

      return res.json({ response: aiResponse, messages });
    } catch (e: any) {
      console.error("Assessment message error:", e);
      return res.status(500).json({ message: "AI is taking a moment. Your progress has been saved." });
    }
  });

  app.post("/api/assessment/:id/complete", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const assessmentId = parseInt(req.params.id);
      const assessment = await storage.getAssessment(assessmentId);
      if (!assessment || assessment.userId !== user.id) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      if (assessment.status === "completed") {
        return res.status(200).json({ message: "Assessment already completed" });
      }

      let messages: Array<{ role: string; content: string }> = [];
      try { messages = JSON.parse(assessment.transcript || "[]"); } catch { messages = []; }

      const transcriptText = messages.map(m => `${m.role}: ${m.content}`).join("\n\n");

      const result = await scoreAssessment(transcriptText, {
        name: user.name || undefined,
        roleTitle: user.roleTitle || undefined,
        aiPlatform: user.aiPlatform || undefined,
      });

      const allSkills = await storage.getSkills();

      const signatureSkill = allSkills.find(s => s.name === result.signatureSkillName)
        || allSkills.find(s => s.name.toLowerCase() === result.signatureSkillName?.toLowerCase());

      await storage.updateAssessment(assessmentId, {
        status: "completed",
        completedAt: new Date(),
        scoresJson: result.scores,
        assessmentLevel: result.assessmentLevel,
        activeLevel: result.activeLevel,
        contextSummary: result.contextSummary,
        workContextSummary: result.workContextSummary || null,
        firstMoveJson: result.firstMove,
        outcomeOptionsJson: result.outcomeOptions,
        signatureSkillId: signatureSkill?.id || null,
        signatureSkillRationale: result.signatureSkillRationale || null,
        brightSpotsText: JSON.stringify(result.brightSpots),
        futureSelfText: result.futureSelfText || null,
        nextLevelIdentity: result.nextLevelIdentity || null,
        triggerMoment: result.triggerMoment || null,
      });

      for (const skill of allSkills) {
        const scoreData = result.scores[skill.name];
        if (scoreData) {
          await storage.upsertUserSkillStatus({
            userId: user.id,
            skillId: skill.id,
            status: scoreData.status,
            explanation: scoreData.explanation,
          });
        }
      }

      const allLevels = await storage.getLevels();
      const levelName = allLevels.find(l => l.sortOrder === result.assessmentLevel)?.displayName || "Learner";
      sendWelcomeEmail(user, levelName, result.assessmentLevel, APP_URL).catch(console.error);

      (async () => {
        try {
          const firstSkillName = result.firstMove?.skillName;
          const firstSkill = allSkills.find(s => s.name === firstSkillName)
            || allSkills.find(s => s.name.toLowerCase() === firstSkillName?.toLowerCase());
          if (firstSkill && user) {
            const previousNudges = await storage.getNudgesByUserAndSkill(user.id, firstSkill.id);
            const nudgeContent = await generateNudge(user, firstSkill, previousNudges);
            if (nudgeContent) {
              await storage.createNudge({
                userId: user.id,
                skillId: firstSkill.id,
                contentJson: nudgeContent,
                subjectLine: nudgeContent.subject_line,
                isFirstChallenge: true,
              });
              console.log(`[first-challenge] Generated first challenge for user ${user.id}, skill: ${firstSkill.name}`);
            }
          }
        } catch (err) {
          console.error("[first-challenge] Failed to generate first challenge:", err);
        }
      })();

      return res.json({
        assessmentLevel: result.assessmentLevel,
        activeLevel: result.activeLevel,
        scores: result.scores,
        contextSummary: result.contextSummary,
        workContextSummary: result.workContextSummary || "",
        firstMove: result.firstMove,
        outcomeOptions: result.outcomeOptions,
        signatureSkillId: signatureSkill?.id || null,
        signatureSkillRationale: result.signatureSkillRationale || "",
        brightSpots: result.brightSpots || [],
        futureSelfText: result.futureSelfText || "",
        nextLevelIdentity: result.nextLevelIdentity || "",
        triggerMoment: result.triggerMoment || "",
      });
    } catch (e: any) {
      console.error("Scoring error:", e);
      return res.status(500).json({ message: "Scoring is taking longer than expected. We'll notify you when ready." });
    }
  });

  app.get("/api/assessment/latest", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const completed = await storage.getCompletedAssessments(user.id);
    if (completed.length === 0) return res.json(null);
    return res.json(completed[0]);
  });

  // Confirm assessment results after user reviews sliders
  app.post("/api/assessment/:id/confirm", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const assessmentId = parseInt(req.params.id);
      const assessment = await storage.getAssessment(assessmentId);
      if (!assessment || assessment.userId !== user.id) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      if (assessment.status === "completed" && !req.body.adjustedScores) {
        return res.json({
          assessmentLevel: assessment.assessmentLevel,
          activeLevel: assessment.activeLevel,
          scores: assessment.scoresJson,
          message: "Assessment already completed",
        });
      }

      if (assessment.status !== "completed") {
        return res.status(400).json({ message: "Assessment not yet completed" });
      }

      const { adjustedScores } = req.body as {
        adjustedScores?: Record<number, number>;
      };

      if (adjustedScores && typeof adjustedScores === "object") {
        const allSkills = await storage.getSkills();

        for (const [skillIdStr, rawRating] of Object.entries(adjustedScores)) {
          const skillId = parseInt(skillIdStr);
          const userRating = typeof rawRating === "number" ? rawRating : parseInt(String(rawRating));
          const skill = allSkills.find(s => s.id === skillId);
          if (!skill || isNaN(skillId) || isNaN(userRating)) continue;

          let status: string;
          if (userRating >= 4) {
            status = "green";
          } else if (userRating >= 3) {
            status = "yellow";
          } else {
            status = "red";
          }

          await storage.upsertUserSkillStatus({
            userId: user.id,
            skillId,
            status,
          });
        }

        // Recalculate activeLevel based on updated statuses
        const allLevels = await storage.getLevels();
        const updatedStatuses = await storage.getUserSkillStatuses(user.id);
        const allSkillsList = await storage.getSkills();

        // Find the lowest level with any non-green skills
        let newActiveLevel = 0;
        for (const level of allLevels.sort((a, b) => a.sortOrder - b.sortOrder)) {
          const levelSkills = allSkillsList.filter(s => s.levelId === level.id);
          const hasNonGreen = levelSkills.some(s => {
            const st = updatedStatuses.find(us => us.skillId === s.id);
            return !st || st.status !== "green";
          });
          if (hasNonGreen) {
            newActiveLevel = level.sortOrder;
            break;
          }
        }

        await storage.updateAssessment(assessmentId, {
          activeLevel: newActiveLevel,
        });
      }

      return res.json({ message: "Assessment confirmed" });
    } catch (e: any) {
      console.error("Assessment confirm error:", e);
      return res.status(500).json({ message: "Failed to confirm assessment" });
    }
  });

  app.get("/api/user/skills", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const statuses = await storage.getUserSkillStatuses(user.id);
    return res.json(statuses);
  });

  app.post("/api/user/challenge/generate-next", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const skillStatuses = await storage.getUserSkillStatuses(user.id);
      const yellowSkills = skillStatuses.filter(s => s.status === "yellow");
      if (yellowSkills.length === 0) {
        return res.status(400).json({ message: "No active skills to generate a Power Up for" });
      }

      const targetSkillStatus = yellowSkills[0];
      const skill = await storage.getSkill(targetSkillStatus.skillId);
      if (!skill) return res.status(404).json({ message: "Skill not found" });

      const previousNudges = await storage.getNudgesByUserAndSkill(user.id, skill.id);
      const nudgeContent = await generateNudge(user, skill, previousNudges);
      const created = await storage.createNudge({
        userId: user.id,
        skillId: skill.id,
        contentJson: nudgeContent,
        subjectLine: nudgeContent.subject_line,
        isFirstChallenge: false,
      });
      return res.json(created);
    } catch (e: any) {
      console.error("Generate next challenge error:", e);
      return res.status(500).json({ message: "Failed to generate Power Up" });
    }
  });

  app.post("/api/user/journey-setup", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const { challengeFrequency, nudgeDay } = req.body;
      const updates: any = {};
      if (challengeFrequency && ["weekly", "twice_weekly", "every_other_day", "daily"].includes(challengeFrequency)) {
        updates.challengeFrequency = challengeFrequency;
      }
      if (nudgeDay) {
        updates.nudgeDay = nudgeDay;
      }
      await storage.updateUser(user.id, updates);
      return res.json({ message: "Journey preferences saved" });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/team/snapshot", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      if (!user.orgId) {
        return res.json({
          teamName: null,
          memberCount: 1,
          completedCount: 0,
          averageLevel: 0,
          levelDistribution: {},
          recentCompletions: [],
          userRank: "middle" as const,
          powerUpsCompletedThisWeek: 0,
          recentLevelUps: 0,
        });
      }

      const orgUsers = await storage.getUsersByOrg(user.orgId);
      const org = await storage.getOrganization(user.orgId);
      const completedAssessments: Array<{ userId: number; level: number; completedAt: Date; userName: string }> = [];

      for (const u of orgUsers) {
        const assessments = await storage.getCompletedAssessments(u.id);
        if (assessments.length > 0) {
          completedAssessments.push({
            userId: u.id,
            level: assessments[0].assessmentLevel ?? 0,
            completedAt: assessments[0].completedAt || new Date(),
            userName: u.name || "Team member",
          });
        }
      }

      const levelDist: Record<number, number> = {};
      let totalLevel = 0;
      completedAssessments.forEach(a => {
        levelDist[a.level] = (levelDist[a.level] || 0) + 1;
        totalLevel += a.level;
      });

      const sortedByDate = [...completedAssessments].sort((a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      );
      const numericRank = sortedByDate.findIndex(a => a.userId === user.id) + 1;
      const rankPosition = numericRank || completedAssessments.length + 1;
      const totalRanked = completedAssessments.length || 1;

      let userRank: "ahead" | "middle" | "behind" = "middle";
      if (totalRanked >= 3) {
        const topThird = Math.ceil(totalRanked / 3);
        const bottomThirdStart = totalRanked - Math.floor(totalRanked / 3) + 1;
        if (rankPosition <= topThird) {
          userRank = "ahead";
        } else if (rankPosition >= bottomThirdStart) {
          userRank = "behind";
        }
      }

      // Count power-ups (nudges) completed (inAppRead) in the last 7 days across org
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      let powerUpsCompletedThisWeek = 0;
      for (const u of orgUsers) {
        const userNudges = await storage.getUserNudges(u.id, 100);
        powerUpsCompletedThisWeek += userNudges.filter(
          n => n.inAppRead && n.createdAt && new Date(n.createdAt).getTime() >= sevenDaysAgo.getTime()
        ).length;
      }

      // Count recent level-ups from activity feed in the last 14 days
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const orgFeed = await storage.getOrgActivityFeed(user.orgId!, 200);
      const recentLevelUps = orgFeed.filter(
        e => e.eventType === "level_up" && e.createdAt && new Date(e.createdAt).getTime() >= fourteenDaysAgo.getTime()
      ).length;

      return res.json({
        teamName: org?.name || "Your Team",
        memberCount: orgUsers.length,
        completedCount: completedAssessments.length,
        averageLevel: completedAssessments.length > 0 ? Math.round((totalLevel / completedAssessments.length) * 10) / 10 : 0,
        levelDistribution: levelDist,
        recentCompletions: sortedByDate.slice(0, 5).map(a => ({
          name: a.userName,
          level: a.level,
          completedAt: a.completedAt,
        })),
        userRank,
        powerUpsCompletedThisWeek,
        recentLevelUps,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ========== NUDGES ==========
  app.get("/api/user/nudges", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const userNudges = await storage.getUserNudges(user.id);
    return res.json(userNudges);
  });

  app.patch("/api/nudges/:id/read", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const nudgeId = parseInt(req.params.id);
    const nudge = await storage.getNudge(nudgeId);
    if (!nudge || nudge.userId !== user.id) return res.status(404).json({ message: "Power Up not found" });
    await storage.updateNudge(nudgeId, { inAppRead: true });
    return res.json({ message: "Marked as read" });
  });

  // ========== NUDGE FEEDBACK ==========
  // POST endpoint for programmatic feedback
  app.post("/api/nudges/:id/feedback", async (req, res) => {
    try {
      const nudgeId = parseInt(req.params.id);
      const nudge = await storage.getNudge(nudgeId);
      if (!nudge) return res.status(404).json({ message: "Power Up not found" });

      // Auth check: either logged in user owns it, or valid unsubscribe token
      const token = req.query.token as string;
      if (token) {
        const tokenUser = await storage.getUserByUnsubscribeToken(token);
        if (!tokenUser || tokenUser.id !== nudge.userId) {
          return res.status(403).json({ message: "Invalid token" });
        }
      } else {
        const user = await getCurrentUser(req);
        if (!user || user.id !== nudge.userId) {
          return res.status(403).json({ message: "Not authorized" });
        }
      }

      const { relevant, feedback } = req.body;
      const updates: Record<string, any> = {};
      if (relevant !== undefined) updates.feedbackRelevant = relevant;
      if (feedback) updates.feedbackText = feedback;

      await storage.updateNudge(nudgeId, updates);
      return res.json({ message: "Thanks for the feedback" });
    } catch (e: any) {
      console.error("Nudge feedback error:", e);
      return res.status(500).json({ message: "Failed to save feedback" });
    }
  });

  // GET endpoint for email link simplicity (idempotent)
  app.get("/api/nudges/:id/feedback", async (req, res) => {
    try {
      const nudgeId = parseInt(req.params.id);
      const nudge = await storage.getNudge(nudgeId);
      if (!nudge) {
        return res.status(404).send(feedbackResponseHtml("Power Up not found", false));
      }

      const token = req.query.token as string;
      if (!token) {
        return res.status(403).send(feedbackResponseHtml("Missing token", false));
      }

      const tokenUser = await storage.getUserByUnsubscribeToken(token);
      if (!tokenUser || tokenUser.id !== nudge.userId) {
        return res.status(403).send(feedbackResponseHtml("Invalid token", false));
      }

      const relevant = req.query.relevant === "true";
      await storage.updateNudge(nudgeId, { feedbackRelevant: relevant });

      const message = relevant
        ? "Thanks! We'll keep sending Power Ups like this."
        : "Got it. We'll adjust future Power Ups to be more relevant to your work.";

      return res.send(feedbackResponseHtml(message, true));
    } catch (e: any) {
      console.error("Nudge feedback GET error:", e);
      return res.status(500).send(feedbackResponseHtml("Something went wrong", false));
    }
  });

  // ========== SKILL VERIFICATION ==========
  const pendingVerifications = new Map<string, any[]>();

  app.post("/api/skills/:id/verify/start", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const skillId = parseInt(req.params.id);
      const skill = await storage.getSkill(skillId);
      if (!skill) return res.status(404).json({ message: "Skill not found" });

      const questions = await generateVerificationQuestions(user, skill);

      const verificationKey = `${user.id}-${skillId}`;
      pendingVerifications.set(verificationKey, questions);
      setTimeout(() => pendingVerifications.delete(verificationKey), 30 * 60 * 1000);

      const clientQuestions = questions.map(q => ({
        question: q.question,
        options: q.options,
      }));

      return res.json({ questions: clientQuestions });
    } catch (e: any) {
      console.error("Verification question generation error:", e);
      return res.status(500).json({ message: "Failed to generate questions" });
    }
  });

  app.post("/api/skills/:id/verify/submit", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const skillId = parseInt(req.params.id);
      const skill = await storage.getSkill(skillId);
      if (!skill) return res.status(404).json({ message: "Skill not found" });

      const { answers } = req.body;
      if (!answers) return res.status(400).json({ message: "Answers required" });

      const verificationKey = `${user.id}-${skillId}`;
      const questions = pendingVerifications.get(verificationKey);
      if (!questions) return res.status(400).json({ message: "No pending verification. Please start again." });

      pendingVerifications.delete(verificationKey);

      let correctCount = 0;
      for (let i = 0; i < questions.length; i++) {
        if (answers[i] === questions[i].correctIndex) {
          correctCount++;
        }
      }

      const passed = correctCount >= 2;

      await storage.createVerificationAttempt({
        userId: user.id,
        skillId,
        questionsJson: questions,
        answersJson: answers,
        passed,
      });

      if (passed) {
        await storage.upsertUserSkillStatus({
          userId: user.id,
          skillId,
          status: "green",
          explanation: `Verified via quiz (${correctCount}/3 correct)`,
          completedAt: new Date(),
        });

        await storage.createBadge({
          userId: user.id,
          badgeType: "skill_complete",
          badgeDataJson: { skillId, skillName: skill.name },
        });

        await storage.createActivityFeedEntry({
          orgId: user.orgId || undefined,
          userId: user.id,
          eventType: "skill_complete",
          eventDataJson: { skillId, skillName: skill.name },
        });

        const allSkills = await storage.getSkills();
        const allStatuses = await storage.getUserSkillStatuses(user.id);

        const nextSkill = allSkills
          .filter(s => s.sortOrder > skill.sortOrder)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .find(s => {
            const st = allStatuses.find(ss => ss.skillId === s.id);
            return !st || st.status !== "green";
          });

        if (nextSkill) {
          const existingStatus = allStatuses.find(ss => ss.skillId === nextSkill.id);
          if (!existingStatus || existingStatus.status === "red") {
            await storage.upsertUserSkillStatus({
              userId: user.id,
              skillId: nextSkill.id,
              status: "yellow",
              explanation: "Now active for development",
            });
          }
        }

        const levelSkills = allSkills.filter(s => s.levelId === skill.levelId);
        const levelStatuses = allStatuses.filter(ss => levelSkills.some(ls => ls.id === ss.skillId));
        const greenInLevel = levelStatuses.filter(ss => ss.status === "green" || ss.skillId === skillId).length;

        let levelUp = false;
        let levelUpInfo = null;

        if (greenInLevel >= levelSkills.length) {
          const allLevels = await storage.getLevels();
          const currentLevel = allLevels.find(l => l.id === skill.levelId);
          if (currentLevel) {
            levelUp = true;
            levelUpInfo = { level: currentLevel.sortOrder, name: currentLevel.displayName };

            await storage.createBadge({
              userId: user.id,
              badgeType: "level_up",
              badgeDataJson: { level: currentLevel.sortOrder, levelName: currentLevel.displayName },
            });

            await storage.createActivityFeedEntry({
              orgId: user.orgId || undefined,
              userId: user.id,
              eventType: "level_up",
              eventDataJson: { level: currentLevel.sortOrder, levelName: currentLevel.displayName },
            });

            sendLevelUpEmail(user, currentLevel.displayName, currentLevel.sortOrder, APP_URL).catch(console.error);
          }
        }

        sendSkillCompleteEmail(user, skill.name, nextSkill?.name || null, APP_URL).catch(console.error);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const recentBadges = (await storage.getUserBadges(user.id))
          .filter(b => b.badgeType === "skill_complete" && b.earnedAt >= todayStart);
        if (recentBadges.length >= 5) {
          await storage.createActivityFeedEntry({
            orgId: user.orgId || undefined,
            userId: user.id,
            eventType: "speedrun_detected",
            eventDataJson: { skillsCompletedToday: recentBadges.length },
          });
        }

        return res.json({
          passed: true,
          correctCount,
          levelUp,
          levelUpInfo,
          nextSkillName: nextSkill?.name || null,
          message: `Nice. ${skill.name}: locked in.`,
        });
      } else {
        return res.json({
          passed: false,
          correctCount,
          message: "Not quite. Revisit this week's challenge and try again when you're ready.",
        });
      }
    } catch (e: any) {
      console.error("Verification submit error:", e);
      return res.status(500).json({ message: "Verification failed" });
    }
  });

  // ========== BADGES ==========
  app.get("/api/user/badges", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const userBadges = await storage.getUserBadges(user.id);
    return res.json(userBadges);
  });

  // ========== ACTIVITY FEED ==========
  app.get("/api/activity/org", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.json([]);
    const feed = await storage.getOrgActivityFeed(user.orgId);
    return res.json(feed);
  });

  // ========== SOCIAL PROOF ==========
  app.get("/api/social/skill-completion", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.json({});

    const members = await storage.getUsersByOrg(user.orgId);
    const memberIds = members.map(m => m.id);
    const allSkills = await storage.getSkills();

    const completionRates: Record<number, { completed: number; total: number }> = {};
    for (const skill of allSkills) {
      let completed = 0;
      for (const memberId of memberIds) {
        const statuses = await storage.getUserSkillStatuses(memberId);
        const ss = statuses.find(s => s.skillId === skill.id);
        if (ss?.status === "green") completed++;
      }
      completionRates[skill.id] = { completed, total: memberIds.length };
    }

    return res.json(completionRates);
  });

  // ========== UNSUBSCRIBE ==========
  app.get("/api/unsubscribe/:token", async (req, res) => {
    const user = await storage.getUserByUnsubscribeToken(req.params.token);
    if (!user) return res.status(404).json({ message: "Invalid token" });
    const { password: _, ...safe } = user;
    return res.json(safe);
  });

  app.post("/api/unsubscribe/:token", async (req, res) => {
    const user = await storage.getUserByUnsubscribeToken(req.params.token);
    if (!user) return res.status(404).json({ message: "Invalid token" });

    const { emailPrefsNudges, emailPrefsProgress, emailPrefsReminders, unsubscribeAll } = req.body;

    const updates: Record<string, any> = {};
    if (unsubscribeAll) {
      updates.emailPrefsNudges = false;
      updates.emailPrefsProgress = false;
      updates.emailPrefsReminders = false;
    } else {
      if (emailPrefsNudges !== undefined) updates.emailPrefsNudges = emailPrefsNudges;
      if (emailPrefsProgress !== undefined) updates.emailPrefsProgress = emailPrefsProgress;
      if (emailPrefsReminders !== undefined) updates.emailPrefsReminders = emailPrefsReminders;
    }

    await storage.updateUser(user.id, updates);
    return res.json({ message: "Preferences updated" });
  });

  // ========== ORGANIZATION ==========
  app.post("/api/org/create", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const { name, industry, size } = req.body;
      if (!name) return res.status(400).json({ message: "Organization name required" });

      const org = await storage.createOrganization({ name, industry, size });
      await storage.updateUser(user.id, { orgId: org.id, userRole: "org_admin" });
      return res.json(org);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/org/invite", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user || !user.orgId) return res.status(403).json({ message: "No organization" });
      if (!["manager", "org_admin", "system_admin"].includes(user.userRole)) {
        return res.status(403).json({ message: "Manager access required to send invites" });
      }

      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });

      const existing = await storage.getPendingInviteByEmail(email, user.orgId);
      if (existing) return res.status(400).json({ message: "Already invited" });

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const invite = await storage.createInvite({
        orgId: user.orgId,
        email: email.toLowerCase(),
        invitedBy: user.id,
        token,
        expiresAt,
      });

      const org = await storage.getOrganization(user.orgId);
      const orgSettings = org?.settingsJson as any;
      sendInviteEmail(email, user.name || "Your manager", org?.name || "your team", token, APP_URL, orgSettings?.welcomeMessage).catch(console.error);

      return res.json(invite);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/org/invites", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.json([]);
    const invitesList = await storage.getInvitesByOrg(user.orgId);
    return res.json(invitesList);
  });

  app.get("/api/org/members", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.json([]);
    const members = await storage.getUsersByOrg(user.orgId);
    return res.json(members.map(m => {
      const { password: _, ...safe } = m;
      return safe;
    }));
  });

  app.put("/api/org/settings", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user || !user.orgId) return res.status(403).json({ message: "No organization" });
      if (!["org_admin", "system_admin"].includes(user.userRole)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const org = await storage.getOrganization(user.orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const currentSettings = (org.settingsJson || {}) as Record<string, any>;
      const { defaultNudgeDay, anonymizeSocial, welcomeMessage, assessmentFraming } = req.body;

      if (defaultNudgeDay !== undefined) currentSettings.defaultNudgeDay = defaultNudgeDay;
      if (anonymizeSocial !== undefined) currentSettings.anonymizeSocial = anonymizeSocial;
      if (welcomeMessage !== undefined) currentSettings.welcomeMessage = welcomeMessage;
      if (assessmentFraming !== undefined) currentSettings.assessmentFraming = assessmentFraming;

      const [updated] = await (await import("./db")).db
        .update((await import("@shared/schema")).organizations)
        .set({ settingsJson: currentSettings })
        .where((await import("drizzle-orm")).eq((await import("@shared/schema")).organizations.id, user.orgId))
        .returning();

      return res.json(updated);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/invite/accept", async (req, res) => {
    try {
      const { token } = req.body;
      const invite = await storage.getInviteByToken(token);
      if (!invite) return res.status(404).json({ message: "Invite not found" });
      if (invite.accepted) return res.status(400).json({ message: "Invite already used" });
      if (new Date() > invite.expiresAt) return res.status(400).json({ message: "Invite expired" });

      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Please sign in first" });
      if (user.orgId && user.orgId !== invite.orgId) {
        return res.status(400).json({ message: `You're already part of another organization.` });
      }

      const updates: any = { orgId: invite.orgId };
      if (!["manager", "org_admin", "system_admin"].includes(user.userRole)) {
        updates.userRole = "member";
      }
      await storage.updateUser(user.id, updates);
      await storage.updateInvite(invite.id, { accepted: true });
      return res.json({ message: "Successfully joined organization" });
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  // ========== MANAGER DASHBOARD ==========
  app.get("/api/manager/team", requireManager, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.json([]);

    const members = await storage.getUsersByOrg(user.orgId);
    const result = [];

    for (const member of members) {
      const statuses = await storage.getUserSkillStatuses(member.id);
      const completed = await storage.getCompletedAssessments(member.id);
      const latest = completed[0];

      result.push({
        id: member.id,
        name: member.name,
        email: member.email,
        roleTitle: member.roleTitle,
        userRole: member.userRole,
        nudgesActive: member.nudgesActive,
        assessmentLevel: latest?.assessmentLevel ?? null,
        skillStatuses: statuses.map(s => ({
          skillId: s.skillId,
          status: s.status,
          completedAt: s.completedAt,
        })),
        lastAssessment: latest?.completedAt || null,
      });
    }

    return res.json(result);
  });

  app.get("/api/manager/team/:id", requireManager, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.status(403).json({ message: "No organization" });

    const memberId = parseInt(req.params.id);
    const member = await storage.getUser(memberId);
    if (!member || member.orgId !== user.orgId) {
      return res.status(404).json({ message: "Team member not found" });
    }

    const statuses = await storage.getUserSkillStatuses(memberId);
    const badges = await storage.getUserBadges(memberId);
    const allSkills = await storage.getSkills();
    const skillNameMap = new Map(allSkills.map(s => [s.id, s.name]));

    return res.json({
      id: member.id,
      name: member.name,
      email: member.email,
      roleTitle: member.roleTitle,
      nudgesActive: member.nudgesActive,
      skillStatuses: statuses.map(s => ({
        skillId: s.skillId,
        skillName: skillNameMap.get(s.skillId) || `Skill #${s.skillId}`,
        status: s.status,
        explanation: s.explanation,
        completedAt: s.completedAt,
      })),
      badges: badges.map(b => ({
        badgeType: b.badgeType,
        badgeDataJson: b.badgeDataJson,
        earnedAt: b.earnedAt,
      })),
    });
  });

  app.get("/api/manager/analytics", requireManager, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.json({});
    const analytics = await storage.getTeamAnalytics(user.orgId);
    return res.json(analytics);
  });

  app.patch("/api/manager/team/:id/nudges", requireManager, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.status(403).json({ message: "No organization" });

    const memberId = parseInt(req.params.id);
    const member = await storage.getUser(memberId);
    if (!member || member.orgId !== user.orgId) {
      return res.status(404).json({ message: "Team member not found" });
    }

    const { nudgesActive } = req.body;
    await storage.updateUser(memberId, { nudgesActive });
    return res.json({ message: "Updated" });
  });

  app.get("/api/manager/activity", requireManager, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.json([]);
    const feed = await storage.getOrgActivityFeed(user.orgId);

    const org = await storage.getOrganization(user.orgId);
    const settings = org?.settingsJson as any;
    const anonymize = settings?.anonymizeSocial === true;

    const enrichedFeed = [];
    for (const entry of feed) {
      const entryUser = entry.userId ? await storage.getUser(entry.userId) : null;
      enrichedFeed.push({
        ...entry,
        userName: anonymize ? "A teammate" : (entryUser?.name || "Someone"),
      });
    }

    return res.json(enrichedFeed);
  });

  app.get("/api/manager/export", requireManager, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.status(403).json({ message: "No organization" });

    const members = await storage.getUsersByOrg(user.orgId);
    const allSkills = await storage.getSkills();

    let csv = "Name,Email,Role,Level," + allSkills.map(s => s.name).join(",") + "\n";

    for (const member of members) {
      const statuses = await storage.getUserSkillStatuses(member.id);
      const completed = await storage.getCompletedAssessments(member.id);
      const latest = completed[0];

      const skillValues = allSkills.map(s => {
        const ss = statuses.find(st => st.skillId === s.id);
        return ss?.status || "N/A";
      });

      csv += `"${member.name || ""}","${member.email}","${member.roleTitle || ""}",${latest?.assessmentLevel ?? "N/A"},${skillValues.join(",")}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=team-progress.csv");
    return res.send(csv);
  });

  // ========== RESEND WEBHOOKS ==========
  app.post("/api/webhooks/resend", async (req, res) => {
    try {
      const webhookSecret = await storage.getSystemConfig("resend_webhook_secret");
      if (!webhookSecret) {
        return res.status(401).json({ message: "Webhook not configured" });
      }
      const provided = req.headers["x-webhook-secret"] || req.query.secret;
      if (provided !== webhookSecret) {
        return res.status(401).json({ message: "Invalid webhook secret" });
      }

      const { type, data } = req.body;

      if (type === "email.opened" && data?.email_id) {
        const allNudges = await storage.getEmailLogs(500);
        const matchingLog = allNudges.find(l => l.resendId === data.email_id);
        if (matchingLog && matchingLog.userId) {
          const userNudges = await storage.getUserNudges(matchingLog.userId);
          const matchingNudge = userNudges.find(n => n.emailId === data.email_id);
          if (matchingNudge) {
            await storage.updateNudge(matchingNudge.id, { emailOpened: true });
          }
        }
        await storage.createEmailLog({
          userId: matchingLog?.userId || undefined,
          emailType: "webhook",
          resendId: data.email_id,
          event: "opened",
        });
      }

      if (type === "email.bounced" && data?.email_id) {
        await storage.createEmailLog({
          emailType: "bounce",
          resendId: data.email_id,
          recipientEmail: data.to?.[0],
          event: "bounced",
          metadata: data,
        });

        if (data.to?.[0]) {
          const bouncedUser = await storage.getUserByEmail(data.to[0]);
          if (bouncedUser) {
            await storage.updateUser(bouncedUser.id, { emailValid: false });
          }
        }
      }

      if (type === "email.complained" && data?.email_id) {
        await storage.createEmailLog({
          emailType: "complaint",
          resendId: data.email_id,
          recipientEmail: data.to?.[0],
          event: "complained",
          metadata: data,
        });

        if (data.to?.[0]) {
          const complainedUser = await storage.getUserByEmail(data.to[0]);
          if (complainedUser) {
            await storage.updateUser(complainedUser.id, {
              nudgesActive: false,
              emailPrefsNudges: false,
              emailPrefsProgress: false,
              emailPrefsReminders: false,
            });
          }
        }
      }

      return res.json({ received: true });
    } catch (e: any) {
      console.error("Webhook error:", e);
      return res.status(200).json({ received: true });
    }
  });

  // ========== ADMIN ==========
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    return res.json(allUsers.map(u => {
      const { password: _, ...safe } = u;
      return safe;
    }));
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const prevUser = await storage.getUser(id);
      const allowed = ["name", "roleTitle", "userRole", "orgId", "nudgesActive", "nudgeDay", "timezone", "emailPrefsNudges", "emailPrefsProgress", "emailPrefsReminders"];
      const updates: Record<string, any> = {};
      for (const f of allowed) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
      const updated = await storage.updateUser(id, updates);
      if (!updated) return res.status(404).json({ message: "User not found" });

      if (prevUser && prevUser.userRole !== "manager" && updated.userRole === "manager") {
        // Just send the first onboarding email, not all 3 at once
        sendManagerOnboardingEmail(updated, 0, APP_URL).catch(console.error);
      }

      const { password: _, ...safe } = updated;
      return res.json(safe);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteUser(id);
      return res.json({ message: "User deleted" });
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/admin/users/:id/reset", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteUserSkillStatuses(id);
      return res.json({ message: "User progress reset" });
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/admin/assessments", requireAdmin, async (_req, res) => {
    const allAssessments = await storage.getAllAssessments();
    return res.json(allAssessments);
  });

  app.get("/api/admin/assessments/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const assessment = await storage.getAssessment(id);
    if (!assessment) return res.status(404).json({ message: "Assessment not found" });
    return res.json(assessment);
  });

  app.delete("/api/admin/assessments/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAssessment(id);
      return res.json({ message: "Assessment deleted" });
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/admin/organizations", requireAdmin, async (_req, res) => {
    const orgs = await storage.getAllOrganizations();
    return res.json(orgs);
  });

  app.get("/api/admin/levels", requireAdmin, async (_req, res) => {
    const lvls = await storage.getLevels();
    return res.json(lvls);
  });

  app.put("/api/admin/levels/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateLevel(id, req.body);
    return res.json(updated);
  });

  app.post("/api/admin/levels", requireAdmin, async (req, res) => {
    const level = await storage.createLevel(req.body);
    return res.json(level);
  });

  app.get("/api/admin/skills", requireAdmin, async (_req, res) => {
    const allSkills = await storage.getSkills();
    return res.json(allSkills);
  });

  app.post("/api/admin/skills", requireAdmin, async (req, res) => {
    const skill = await storage.createSkill(req.body);
    return res.json(skill);
  });

  app.put("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateSkill(id, req.body);
    return res.json(updated);
  });

  app.get("/api/admin/questions", requireAdmin, async (_req, res) => {
    const questions = await storage.getQuestions();
    return res.json(questions);
  });

  app.post("/api/admin/questions", requireAdmin, async (req, res) => {
    const question = await storage.createQuestion(req.body);
    return res.json(question);
  });

  app.put("/api/admin/questions/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateQuestion(id, req.body);
    return res.json(updated);
  });

  app.delete("/api/admin/questions/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteQuestion(id);
    return res.json({ message: "Deleted" });
  });

  app.get("/api/admin/platforms", requireAdmin, async (_req, res) => {
    const platforms = await storage.getAiPlatforms();
    return res.json(platforms);
  });

  app.post("/api/admin/platforms", requireAdmin, async (req, res) => {
    const platform = await storage.createAiPlatform(req.body);
    return res.json(platform);
  });

  app.put("/api/admin/platforms/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.updateAiPlatform(id, req.body);
    return res.json({ message: "Updated" });
  });

  app.delete("/api/admin/platforms/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteAiPlatform(id);
    return res.json({ message: "Deleted" });
  });

  app.get("/api/admin/config/:key", requireAdmin, async (req, res) => {
    const value = await storage.getSystemConfig(req.params.key);
    return res.json({ key: req.params.key, value: value || "" });
  });

  app.put("/api/admin/config/:key", requireAdmin, async (req, res) => {
    await storage.setSystemConfig(req.params.key, req.body.value);
    return res.json({ message: "Saved" });
  });

  app.get("/api/admin/nudge-guide", requireAdmin, async (_req, res) => {
    const text = await storage.getNudgeVoiceGuide();
    return res.json({ text: text || "" });
  });

  app.put("/api/admin/nudge-guide", requireAdmin, async (req, res) => {
    await storage.setNudgeVoiceGuide(req.body.text);
    return res.json({ message: "Saved" });
  });

  app.get("/api/admin/analytics", requireAdmin, async (_req, res) => {
    const analytics = await storage.getAnalytics();
    return res.json(analytics);
  });

  app.post("/api/admin/nudge/generate", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      if (userId) {
        const user = await storage.getUser(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const statuses = await storage.getUserSkillStatuses(user.id);
        const yellowStatus = statuses.find(s => s.status === "yellow");
        if (!yellowStatus) return res.status(400).json({ message: "No active yellow skill" });

        const skill = await storage.getSkill(yellowStatus.skillId);
        if (!skill) return res.status(400).json({ message: "Skill not found" });

        const previousNudges = await storage.getNudgesByUserAndSkill(user.id, skill.id);
        const content = await generateNudge(user, skill, previousNudges);
        const nudge = await storage.createNudge({
          userId: user.id,
          skillId: skill.id,
          contentJson: content,
          subjectLine: content.subject_line,
        });

        return res.json(nudge);
      } else {
        const result = await runNudgeGeneration();
        return res.json(result);
      }
    } catch (e: any) {
      console.error("Admin nudge generation error:", e);
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/nudge/deliver", requireAdmin, async (_req, res) => {
    try {
      const result = await runNudgeDelivery();
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/system-health", requireAdmin, async (_req, res) => {
    try {
      const nudgeGenLastRun = await storage.getSystemConfig("nudge_generation_last_run");
      const nudgeGenLastResult = await storage.getSystemConfig("nudge_generation_last_result");
      const nudgeDeliveryLastRun = await storage.getSystemConfig("nudge_delivery_last_run");
      const dailyChecksLastRun = await storage.getSystemConfig("daily_checks_last_run");
      const reassessmentLastRun = await storage.getSystemConfig("reassessment_reminder_last_run");

      const emailLogs = await storage.getEmailLogs(100);
      const bounces = emailLogs.filter(l => l.event === "bounced").length;
      const complaints = emailLogs.filter(l => l.event === "complained").length;
      const sent = emailLogs.filter(l => l.event === "sent").length;

      return res.json({
        cronJobs: {
          nudgeGeneration: { lastRun: nudgeGenLastRun, lastResult: nudgeGenLastResult ? JSON.parse(nudgeGenLastResult) : null },
          nudgeDelivery: { lastRun: nudgeDeliveryLastRun },
          dailyChecks: { lastRun: dailyChecksLastRun },
          reassessmentReminders: { lastRun: reassessmentLastRun },
        },
        email: {
          recentSent: sent,
          recentBounces: bounces,
          recentComplaints: complaints,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/email-logs", requireAdmin, async (_req, res) => {
    const logs = await storage.getEmailLogs();
    return res.json(logs);
  });

  // ========== ADMIN TESTING ==========
  app.post("/api/admin/test/generate-challenge", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId required" });
      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      const skillStatuses = await storage.getUserSkillStatuses(userId);
      const yellowSkills = skillStatuses.filter(s => s.status === "yellow");
      if (yellowSkills.length === 0) return res.status(400).json({ message: "No active (yellow) skills" });

      const skill = await storage.getSkill(yellowSkills[0].skillId);
      if (!skill) return res.status(404).json({ message: "Skill not found" });

      const previousNudges = await storage.getNudgesByUserAndSkill(userId, skill.id);
      const nudgeContent = await generateNudge(targetUser, skill, previousNudges);
      const created = await storage.createNudge({
        userId,
        skillId: skill.id,
        contentJson: nudgeContent,
        subjectLine: nudgeContent.subject_line,
      });
      return res.json({ message: "Challenge generated", nudge: created, skillName: skill.name });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/test/simulate-skill-completion", requireAdmin, async (req, res) => {
    try {
      const { userId, skillId } = req.body;
      if (!userId || !skillId) return res.status(400).json({ message: "userId and skillId required" });

      const skill = await storage.getSkill(skillId);
      if (!skill) return res.status(404).json({ message: "Skill not found" });
      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      await storage.upsertUserSkillStatus({ userId, skillId, status: "green", explanation: "Simulated completion via admin testing" });

      const allSkills = await storage.getSkills();
      const levelSkills = allSkills.filter(s => s.levelId === skill.levelId);
      const userStatuses = await storage.getUserSkillStatuses(userId);
      const greenCount = levelSkills.filter(ls =>
        userStatuses.some(us => us.skillId === ls.id && us.status === "green")
      ).length;

      let leveledUp = false;
      if (greenCount === levelSkills.length) {
        leveledUp = true;
        const levels = await storage.getLevels();
        const currentLevel = levels.find(l => l.id === skill.levelId);
        if (currentLevel) {
          sendLevelUpEmail(targetUser, currentLevel.displayName, currentLevel.sortOrder, APP_URL).catch(console.error);
          await storage.createBadge({ userId, badgeType: "level_up", badgeDataJson: { levelId: skill.levelId, levelName: currentLevel.displayName } });
        }
      }

      await storage.createBadge({ userId, badgeType: "skill_complete", badgeDataJson: { skillId, skillName: skill.name } });
      if (targetUser.orgId) {
        await storage.createActivityFeedEntry({ orgId: targetUser.orgId, userId, eventType: "skill_complete", eventDataJson: { skillName: skill.name } });
      }

      const nextYellow = userStatuses.find(s => s.status !== "green" && s.skillId !== skillId);
      if (nextYellow) {
        const nextSkill = allSkills.find(s => s.id === nextYellow.skillId);
        if (nextSkill) {
          sendSkillCompleteEmail(targetUser, skill.name, nextSkill.name, APP_URL).catch(console.error);
        }
      }

      return res.json({ message: "Skill completed", skillName: skill.name, leveledUp, greenInLevel: greenCount, totalInLevel: levelSkills.length });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/test/trigger-level-up", requireAdmin, async (req, res) => {
    try {
      const { userId, levelId } = req.body;
      if (!userId || !levelId) return res.status(400).json({ message: "userId and levelId required" });

      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      const allSkills = await storage.getSkills();
      const levelSkills = allSkills.filter(s => s.levelId === levelId);
      for (const skill of levelSkills) {
        await storage.upsertUserSkillStatus({ userId, skillId: skill.id, status: "green", explanation: "Simulated via admin level-up trigger" });
        await storage.createBadge({ userId, badgeType: "skill_complete", badgeDataJson: { skillId: skill.id, skillName: skill.name } });
      }

      const levels = await storage.getLevels();
      const level = levels.find(l => l.id === levelId);
      if (level) {
        sendLevelUpEmail(targetUser, level.displayName, level.sortOrder, APP_URL).catch(console.error);
        await storage.createBadge({ userId, badgeType: "level_up", badgeDataJson: { levelId, levelName: level.displayName } });
      }

      if (targetUser.orgId) {
        await storage.createActivityFeedEntry({ orgId: targetUser.orgId, userId, eventType: "level_up", eventDataJson: { levelName: level?.displayName || "Unknown" } });
      }

      return res.json({ message: `Level-up triggered: ${level?.displayName}`, skillsCompleted: levelSkills.length });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/test/preview-challenge-email", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId required" });

      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      const nudges = await storage.getUserNudges(userId);
      const latestNudge = nudges[0];
      if (!latestNudge) return res.status(404).json({ message: "No Power Ups found for this user" });

      const skill = latestNudge.skillId ? await storage.getSkill(latestNudge.skillId) : null;
      return res.json({
        to: targetUser.email,
        subject: latestNudge.subjectLine,
        skillName: skill?.name || "Unknown",
        content: latestNudge.contentJson,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/test/reset-user", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId required" });

      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      await storage.resetUserProgress(userId);

      return res.json({ message: `User ${targetUser.email} reset successfully` });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/test/send-test-email", requireAdmin, async (req, res) => {
    try {
      const { userId, emailType } = req.body;
      if (!userId || !emailType) return res.status(400).json({ message: "userId and emailType required" });

      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      switch (emailType) {
        case "welcome":
          await sendWelcomeEmail(targetUser, "Learner", 0, APP_URL);
          break;
        case "challenge": {
          const nudges = await storage.getUserNudges(userId);
          if (nudges[0]) {
            const skill = nudges[0].skillId ? await storage.getSkill(nudges[0].skillId) : null;
            if (skill) {
              const { sendNudgeEmail } = await import("./email");
              await sendNudgeEmail(targetUser, nudges[0], skill, APP_URL);
            }
          }
          break;
        }
        case "level_up":
          await sendLevelUpEmail(targetUser, "Accelerator", 1, APP_URL);
          break;
        case "skill_complete":
          await sendSkillCompleteEmail(targetUser, "Test Skill", "Next Skill", APP_URL);
          break;
        default:
          return res.status(400).json({ message: "Unknown email type" });
      }

      return res.json({ message: `${emailType} email sent to ${targetUser.email}` });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ========== LIVE SESSIONS ==========
  app.get("/api/sessions", async (req, res) => {
    const levelId = req.query.level ? parseInt(req.query.level as string) : null;
    if (levelId) {
      const sessions = await storage.getLiveSessionsByLevel(levelId);
      return res.json(sessions);
    }
    const sessions = await storage.getLiveSessions();
    return res.json(sessions);
  });

  app.get("/api/sessions/upcoming", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const latest = await storage.getCompletedAssessments(user.id);
    const activeLevel = latest[0]?.activeLevel ?? 0;
    const allLevels = await storage.getLevels();
    const level = allLevels.find(l => l.sortOrder === activeLevel);
    if (!level) return res.json([]);
    const upcoming = await storage.getUpcomingSessionsByLevel(level.id);
    return res.json(upcoming);
  });

  app.post("/api/admin/sessions", requireAdmin, async (req, res) => {
    try {
      const parsed = insertLiveSessionSchema.parse({
        ...req.body,
        sessionDate: new Date(req.body.sessionDate),
      });
      const session = await storage.createLiveSession(parsed);
      return res.json(session);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/admin/sessions", requireAdmin, async (_req, res) => {
    const sessions = await storage.getLiveSessions();
    return res.json(sessions);
  });

  app.put("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = { ...req.body };
      if (data.sessionDate) data.sessionDate = new Date(data.sessionDate);
      const partial = insertLiveSessionSchema.partial().parse(data);
      const session = await storage.updateLiveSession(id, partial);
      return res.json(session);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteLiveSession(id);
    return res.json({ message: "Deleted" });
  });

  // ========== SHAREABLE BADGES ==========
  app.get("/api/badge/:id", async (req, res) => {
    try {
      const badgeId = parseInt(req.params.id);
      const badge = await storage.getBadge(badgeId);
      if (!badge) return res.status(404).send("Badge not found");
      const user = await storage.getUser(badge.userId);
      const userName = user?.name || "Unknown";
      const svg = generateBadgeSVG(
        badge.badgeType,
        (badge.badgeDataJson || {}) as Record<string, any>,
        userName,
        badge.earnedAt
      );
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(svg);
    } catch (e: any) {
      return res.status(500).send("Error generating badge");
    }
  });

  app.get("/api/badge/:id/share", async (req, res) => {
    try {
      const badgeId = parseInt(req.params.id);
      const badge = await storage.getBadge(badgeId);
      if (!badge) return res.status(404).send("Badge not found");
      const user = await storage.getUser(badge.userId);
      const userName = escapeHtml(user?.name || "Someone");
      const data = (badge.badgeDataJson || {}) as Record<string, any>;
      const skillName = escapeHtml(data.skillName || "Skill");
      const levelName = escapeHtml(data.levelName || "");
      const level = Number(data.level ?? 0) + 1;

      let title = "Electric Thinking Badge";
      let description = `${userName} earned a badge on Electric Thinking`;
      if (badge.badgeType === "skill_complete") {
        title = `${skillName}: Mastered`;
        description = `${userName} mastered ${escapeHtml(data.skillName || "a skill")} on Electric Thinking`;
      } else if (badge.badgeType === "level_up") {
        title = `Level ${level}: ${levelName}`;
        description = `${userName} reached Level ${level} on Electric Thinking`;
      } else if (badge.badgeType === "ultimate_master") {
        title = "AI Fluency Master";
        description = `${userName} mastered all 25 AI skills on Electric Thinking`;
      }

      const badgeImageUrl = `${APP_URL}/api/badge/${badgeId}`;
      const html = `<!DOCTYPE html><html><head>
        <title>${title} | Electric Thinking</title>
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:image" content="${badgeImageUrl}" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${title}" />
        <meta name="twitter:description" content="${description}" />
        <meta name="twitter:image" content="${badgeImageUrl}" />
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#F0E4CE;margin:0}
        .card{text-align:center;padding:40px}img{max-width:600px;width:100%;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.1)}</style>
      </head><body><div class="card">
        <img src="${badgeImageUrl}" alt="${title}" />
        <p style="margin-top:24px;color:#666">Verified by Electric Thinking</p>
      </div></body></html>`;
      return res.send(html);
    } catch (e: any) {
      return res.status(500).send("Error");
    }
  });

  // ========== CHALLENGE COACH ==========
  app.post("/api/challenge/:nudgeId/coach", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const { message } = req.body;
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "Message is required" });
      }

      const nudgeId = parseInt(req.params.nudgeId);
      const nudge = await storage.getNudge(nudgeId);
      if (!nudge || nudge.userId !== user.id) {
        return res.status(404).json({ message: "Power Up not found" });
      }

      // Look up or create conversation
      let conversation = await storage.getCoachConversation(user.id, nudgeId);
      if (!conversation) {
        conversation = await storage.createCoachConversation({
          userId: user.id,
          nudgeId,
          messagesJson: [],
        });
      }

      const existingMessages = (conversation.messagesJson || []) as Array<{ role: string; content: string }>;

      const contentJson = nudge.contentJson as any;
      const challengeContext = contentJson
        ? `Opener: ${contentJson.opener || ""}\nIdea: ${contentJson.idea || ""}\nAction: ${contentJson.action || ""}\nReflection: ${contentJson.reflection || ""}\nUse Case: ${contentJson.use_case || ""}\nStory: ${contentJson.story || ""}`
        : "No challenge content available.";

      const systemPrompt = `You are a helpful AI coach embedded inside a learning challenge. The user is trying to complete a specific challenge and needs help.

CHALLENGE CONTEXT:
${challengeContext}

USER CONTEXT:
Name: ${user.name || "Unknown"}
Role: ${user.roleTitle || "Unknown"}
AI Platform: ${user.aiPlatform || "Unknown"}

YOUR ROLE:
- Help them work through the challenge step by step
- If they're stuck, ask what specifically isn't working
- Give specific, actionable advice for their AI platform
- Don't do the work for them. Guide them.
- Keep responses to 2-3 sentences max. Be direct and helpful.
- If they share a screenshot description or error, diagnose the issue
- Celebrate when they succeed. Be genuine, not over the top.

IMPORTANT: You are teaching the meta-skill of "when stuck with AI, describe the problem and ask for help." Model this behavior.`;

      const apiMessages = [
        ...existingMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: message.trim() },
      ];

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: systemPrompt,
        messages: apiMessages,
      });

      const textBlock = response.content.find(b => b.type === "text");
      const assistantMessage = textBlock?.text || "I'm having trouble responding right now. Try again in a moment.";

      const updatedMessages = [
        ...existingMessages,
        { role: "user", content: message.trim() },
        { role: "assistant", content: assistantMessage },
      ];

      await storage.updateCoachConversation(conversation.id, updatedMessages);

      return res.json({ response: assistantMessage, conversationId: conversation.id });
    } catch (e: any) {
      console.error("Coach conversation error:", e);
      return res.status(500).json({ message: "Failed to get coaching response" });
    }
  });

  app.get("/api/challenge/:nudgeId/coach", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const nudgeId = parseInt(req.params.nudgeId);
      const conversation = await storage.getCoachConversation(user.id, nudgeId);

      return res.json({ messages: conversation?.messagesJson || [] });
    } catch (e: any) {
      console.error("Get coach conversation error:", e);
      return res.status(500).json({ message: "Failed to load conversation" });
    }
  });

  app.post("/api/challenge/:nudgeId/reflect", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const { note } = req.body;
      if (!note || typeof note !== "string" || !note.trim()) {
        return res.status(400).json({ message: "Reflection note is required" });
      }

      const nudgeId = parseInt(req.params.nudgeId);
      const nudge = await storage.getNudge(nudgeId);
      if (!nudge || nudge.userId !== user.id) {
        return res.status(404).json({ message: "Power Up not found" });
      }

      await storage.createChallengeReflection({
        userId: user.id,
        nudgeId,
        note: note.trim(),
      });

      await storage.updateNudge(nudgeId, { inAppRead: true });

      return res.json({ success: true });
    } catch (e: any) {
      console.error("Challenge reflection error:", e);
      return res.status(500).json({ message: "Failed to save reflection" });
    }
  });

  // ========== VOICE ASSESSMENT ==========
  app.get("/api/assessment/voice-available", requireAuth, async (_req, res) => {
    try {
      const hasApiKey = !!process.env.ELEVENLABS_API_KEY;
      const config = await storage.getSystemConfig("elevenlabs_agent_id");
      return res.json({ available: hasApiKey && !!config });
    } catch {
      return res.json({ available: false });
    }
  });

  app.get("/api/assessment/voice-token", requireAuth, async (_req, res) => {
    try {
      const signedUrl = await getConversationSignedUrl();
      return res.json({ signedUrl });
    } catch (e: any) {
      console.error("Voice token error:", e.message);
      return res.status(500).json({ message: "Voice assessment temporarily unavailable" });
    }
  });

  return httpServer;
}

// Helper: simple HTML response for feedback GET endpoint
function feedbackResponseHtml(message: string, success: boolean): string {
  const bgColor = success ? "#F0E4CE" : "#FFF0F0";
  const textColor = success ? "#2B2B2B" : "#CC0000";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Electric Thinking</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:${bgColor}}
.card{text-align:center;padding:40px;max-width:400px;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
h2{color:${textColor};margin:0 0 12px 0;font-size:20px}p{color:#666;margin:0;font-size:16px;line-height:1.5}</style>
</head><body><div class="card"><h2>${success ? "Thanks for the feedback" : "Oops"}</h2><p>${message}</p></div></body></html>`;
}
