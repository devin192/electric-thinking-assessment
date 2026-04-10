import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, hashPassword, comparePasswords, requireAuth, requireAdmin, getCurrentUser } from "./auth";
import { getAssessmentResponse, scoreAssessment } from "./assessment-ai";
// nudge-ai imports removed — assessment-only product (no Power Ups/challenges)
// Anthropic SDK import removed — coach conversation feature removed (assessment-only product)
import { sendWelcomeEmail, sendSkillCompleteEmail, sendLevelUpEmail, sendInviteEmail, sendManagerOnboardingEmail, sendPasswordResetEmail } from "./email";
import { seedDatabase } from "./seed";
import { startCronJobs } from "./cron";
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
      // Regenerate session to prevent session fixation
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
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
      // Regenerate session to prevent session fixation
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
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


  app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      // Always return success to avoid leaking whether email exists
      const user = await storage.getUserByEmail(email);
      if (user) {
        // Invalidate any existing unused tokens for this user
        await storage.invalidateUserResetTokens(user.id);
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
      res.clearCookie("connect.sid");
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
      console.error("Profile update error:", e);
      return res.status(400).json({ message: "Failed to update profile" });
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

    const { surveyResponsesJson, surveyLevel } = req.body || {};

    const existing = await storage.getActiveAssessment(user.id);
    if (existing) {
      // If new survey data was submitted (retake), update the existing assessment
      if (surveyResponsesJson) {
        await storage.updateAssessment(existing.id, {
          surveyResponsesJson,
          ...(typeof surveyLevel === "number" ? { surveyLevel } : {}),
          transcript: JSON.stringify([]), // Reset transcript for fresh conversation
        });
        const updated = await storage.getAssessment(existing.id);
        return res.json(updated);
      }
      return res.json(existing);
    }

    const assessment = await storage.createAssessment({
      userId: user.id,
      status: "in_progress",
      transcript: JSON.stringify([]),
      ...(surveyResponsesJson ? { surveyResponsesJson } : {}),
      ...(typeof surveyLevel === "number" ? { surveyLevel } : {}),
    });
    return res.json(assessment);
  });

  app.post("/api/assessment/:id/message", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const assessmentId = parseInt(req.params.id);
      if (isNaN(assessmentId)) return res.status(400).json({ message: "Invalid assessment ID" });
      const assessment = await storage.getAssessment(assessmentId);
      if (!assessment || assessment.userId !== user.id) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      const { message, transcript } = req.body;
      if (!message) return res.status(400).json({ message: "Message required" });

      if (message === "__TRANSCRIPT_SAVE__" && transcript) {
        // Validate transcript is a valid JSON array of messages and not excessively large
        if (typeof transcript !== "string" || transcript.length > 500000) {
          return res.status(400).json({ message: "Invalid transcript" });
        }
        try {
          const parsed = JSON.parse(transcript);
          if (!Array.isArray(parsed)) throw new Error("Not an array");
        } catch {
          return res.status(400).json({ message: "Invalid transcript format" });
        }
        await storage.updateAssessment(assessmentId, {
          transcript: transcript,
        });
        return res.json({ saved: true });
      }

      let messages: Array<{ role: "user" | "assistant"; content: string }> = [];
      try { messages = JSON.parse(assessment.transcript || "[]"); } catch { messages = []; }

      messages.push({ role: "user", content: message });

      // Build survey context string if survey data exists
      let surveyContext: string | undefined;
      if (assessment.surveyResponsesJson) {
        const surveyData = assessment.surveyResponsesJson as Record<string, number>;
        const surveyLevel = (assessment as any).surveyLevel ?? 0;
        const levelNames = ["Accelerator", "Thought Partner", "Team Builder", "Systems Designer"];
        const strong = Object.entries(surveyData).filter(([, v]) => v === 2).map(([k]) => k);
        const sometimes = Object.entries(surveyData).filter(([, v]) => v === 1).map(([k]) => k);
        const never = Object.entries(surveyData).filter(([, v]) => v === 0).map(([k]) => k);
        surveyContext = [
          `Approximate level: ${levelNames[surveyLevel]} (Level ${surveyLevel + 1} of 4)`,
          strong.length > 0 ? `Skills they regularly do: ${strong.join(", ")}` : "",
          sometimes.length > 0 ? `Skills they sometimes do: ${sometimes.join(", ")}` : "",
          never.length > 0 ? `Skills they never do: ${never.join(", ")}` : "",
        ].filter(Boolean).join("\n");
      }

      const aiResponse = await getAssessmentResponse(messages, {
        name: user.name || undefined,
        roleTitle: user.roleTitle || undefined,
        aiPlatform: user.aiPlatform || undefined,
        surveyContext,
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
      if (isNaN(assessmentId)) return res.status(400).json({ message: "Invalid assessment ID" });
      const assessment = await storage.getAssessment(assessmentId);
      if (!assessment || assessment.userId !== user.id) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      if (assessment.status === "completed") {
        return res.status(200).json({ message: "Assessment already completed" });
      }

      if (assessment.status === "scoring") {
        return res.status(409).json({ message: "Scoring is already in progress" });
      }

      // Optimistic lock: atomically set status to "scoring" to prevent double-complete
      const { db: dbInstance } = await import("./db");
      const { assessments: assessmentsTable } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [locked] = await dbInstance.update(assessmentsTable)
        .set({ status: "scoring" })
        .where(and(eq(assessmentsTable.id, assessmentId), eq(assessmentsTable.status, "in_progress")))
        .returning();
      if (!locked) {
        return res.status(409).json({ message: "Scoring is already in progress" });
      }

      let messages: Array<{ role: string; content: string }> = [];
      try { messages = JSON.parse(assessment.transcript || "[]"); } catch { messages = []; }

      const userMessages = messages.filter(m => m.role === "user" && m.content !== "Hi, I'm ready to start my assessment.");
      if (userMessages.length < 2) {
        // Not enough conversation data to score meaningfully — complete with survey-based defaults
        const surveyLevel = (assessment as any).surveyLevel ?? 0;
        await storage.updateAssessment(assessmentId, {
          status: "completed",
          completedAt: new Date(),
          scoresJson: {},
          assessmentLevel: surveyLevel,
          activeLevel: surveyLevel,
          contextSummary: "Assessment completed with limited conversation data. Level based on survey responses.",
          workContextSummary: user.roleTitle || null,
          brightSpotsText: JSON.stringify(["You took the first step by starting the assessment."]),
        });
        // Still send the results email even for short assessments
        const allLevels = await storage.getLevels();
        const levelName = allLevels.find(l => l.sortOrder === surveyLevel)?.displayName || "Accelerator";
        sendWelcomeEmail(user, levelName, surveyLevel, APP_URL).catch(console.error);
        return res.json({ assessmentLevel: surveyLevel, activeLevel: surveyLevel, scores: {} });
      }

      const transcriptText = messages.map(m => `${m.role}: ${m.content}`).join("\n\n");

      // Build survey context for scoring (so the model sees self-assessment data too)
      let surveyContext: string | undefined;
      if (assessment.surveyResponsesJson) {
        const surveyData = assessment.surveyResponsesJson as Record<string, number>;
        const surveyLevel = (assessment as any).surveyLevel ?? 0;
        const levelNames = ["Accelerator", "Thought Partner", "Team Builder", "Systems Designer"];
        const strong = Object.entries(surveyData).filter(([, v]) => v === 2).map(([k]) => k);
        const sometimes = Object.entries(surveyData).filter(([, v]) => v === 1).map(([k]) => k);
        const never = Object.entries(surveyData).filter(([, v]) => v === 0).map(([k]) => k);
        surveyContext = [
          `Self-assessment survey level: ${levelNames[surveyLevel]} (Level ${surveyLevel + 1} of 4)`,
          strong.length > 0 ? `Skills they self-reported as regularly doing: ${strong.join(", ")}` : "",
          sometimes.length > 0 ? `Skills they self-reported as sometimes doing: ${sometimes.join(", ")}` : "",
          never.length > 0 ? `Skills they self-reported as not yet doing: ${never.join(", ")}` : "",
        ].filter(Boolean).join("\n");
      }

      let result;
      try {
        result = await scoreAssessment(transcriptText, {
          name: user.name || undefined,
          roleTitle: user.roleTitle || undefined,
          aiPlatform: user.aiPlatform || undefined,
          surveyContext,
        });
      } catch (scoreErr: any) {
        console.error("Scoring failed:", scoreErr.message);
        // Fall back to survey-based level rather than crashing
        const surveyLevel = (assessment as any).surveyLevel ?? 0;
        await storage.updateAssessment(assessmentId, {
          status: "completed",
          completedAt: new Date(),
          scoresJson: {},
          assessmentLevel: surveyLevel,
          activeLevel: surveyLevel,
          contextSummary: "Scoring encountered an issue. Level based on survey responses.",
          workContextSummary: user.roleTitle || null,
          brightSpotsText: JSON.stringify(["You completed the assessment conversation."]),
        });
        // Still send the results email even when scoring fails
        const allLevels = await storage.getLevels();
        const levelName = allLevels.find(l => l.sortOrder === surveyLevel)?.displayName || "Accelerator";
        sendWelcomeEmail(user, levelName, surveyLevel, APP_URL).catch(console.error);
        return res.json({ assessmentLevel: surveyLevel, activeLevel: surveyLevel, scores: {} });
      }

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

      // Build case-insensitive lookup for AI-returned scores
      const scoresLower: Record<string, { status: string; explanation: string }> = {};
      for (const [key, val] of Object.entries(result.scores)) {
        scoresLower[key.toLowerCase()] = val;
      }

      for (const skill of allSkills) {
        const scoreData = result.scores[skill.name] || scoresLower[skill.name.toLowerCase()];
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
      const levelName = allLevels.find(l => l.sortOrder === result.assessmentLevel)?.displayName || "Accelerator";
      sendWelcomeEmail(user, levelName, result.assessmentLevel, APP_URL).catch(console.error);

      // Nudge generation disabled — assessment-only product (no Power Ups/challenges)

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
      // Reset status so user can retry
      try {
        await storage.updateAssessment(parseInt(req.params.id), { status: "in_progress" });
      } catch (resetErr) {
        console.error("Failed to reset assessment status:", resetErr);
      }
      return res.status(500).json({ message: "Scoring is taking longer than expected. Please try again." });
    }
  });

  app.get("/api/assessment/latest", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const completed = await storage.getCompletedAssessments(user.id);
    if (completed.length === 0) return res.json(null);
    return res.json(completed[0]);
  });

  // NPS score
  app.post("/api/assessment/:id/nps", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const assessmentId = parseInt(req.params.id);
      const assessment = await storage.getAssessment(assessmentId);
      if (!assessment || assessment.userId !== user.id) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      if (assessment.status !== "completed") {
        return res.status(400).json({ message: "Assessment not yet completed" });
      }

      const score = parseInt(req.body.score);
      if (isNaN(score) || score < 0 || score > 10) {
        return res.status(400).json({ message: "Score must be 0-10" });
      }

      await storage.updateAssessment(assessmentId, { npsScore: score });
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
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

  // generate-next endpoint disabled — assessment-only product (no Power Ups/challenges)
  app.post("/api/user/challenge/generate-next", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature is no longer available" });
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
      console.error("Team snapshot error:", e);
      return res.status(500).json({ message: "Failed to load team data" });
    }
  });

  // ========== NUDGES (removed — assessment-only product) ==========
  app.get("/api/user/nudges", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  app.patch("/api/nudges/:id/read", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  // ========== NUDGE FEEDBACK (removed — assessment-only product) ==========
  app.post("/api/nudges/:id/feedback", async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  app.get("/api/nudges/:id/feedback", async (_req, res) => {
    return res.status(410).send(feedbackResponseHtml("This feature has been removed", false));
  });

  // ========== SKILL VERIFICATION (removed — assessment-only product) ==========
  app.post("/api/skills/:id/verify/start", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  app.post("/api/skills/:id/verify/submit", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  // ========== BADGES ==========
  app.get("/api/user/badges", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const userBadges = await storage.getUserBadges(user.id);
    return res.json(userBadges);
  });

  // ========== WAITLIST ==========
  app.post("/api/waitlist", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const { level, levelName } = req.body;
      const displayLevel = (typeof level === "number" ? level + 1 : 1);
      const name = escapeHtml(user.name || "Unknown");
      const email = user.email || "no email";
      const role = escapeHtml(user.roleTitle || "not provided");

      // Send notification email to support
      try {
        const resendClient = (await import("./resend-client")).getUncachableResendClient();
        await resendClient.emails.send({
          from: "Electric Thinking <onboarding@resend.dev>",
          to: "devin@electricthinking.ai",
          subject: `Waitlist signup: ${name} — Level ${displayLevel} ${levelName || ""}`,
          html: `<p><strong>${name}</strong> (${email}) joined the waitlist for a Level ${displayLevel} ${escapeHtml(levelName || "")} cohort.</p><p>Role: ${role}</p><p>Org: ${user.orgId ? `ID ${user.orgId}` : "none"}</p>`,
        });
      } catch (emailErr) {
        console.warn("Waitlist notification email failed:", emailErr);
        // Don't fail the request — the signup still counts
      }

      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ message: "Failed to join waitlist" });
    }
  });

  // ========== ACTIVITY FEED ==========
  app.get("/api/activity/org", requireAuth, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user || !user.orgId) return res.json([]);
    const feed = await storage.getOrgActivityFeed(user.orgId);
    return res.json(feed);
  });

  // ========== SOCIAL PROOF (removed — assessment-only product, no client consumer) ==========
  app.get("/api/social/skill-completion", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  // ========== UNSUBSCRIBE ==========
  app.get("/api/unsubscribe/:token", async (req, res) => {
    const user = await storage.getUserByUnsubscribeToken(req.params.token);
    if (!user) return res.status(404).json({ message: "Invalid token" });
    return res.json({
      email: user.email,
      emailPrefsNudges: user.emailPrefsNudges,
      emailPrefsProgress: user.emailPrefsProgress,
      emailPrefsReminders: user.emailPrefsReminders,
    });
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
      if (user.orgId) return res.status(400).json({ message: "You already belong to an organization" });

      const org = await storage.createOrganization({ name, industry, size });
      await storage.updateUser(user.id, { orgId: org.id, userRole: "org_admin" });
      return res.json(org);
    } catch (e: any) {
      console.error("Org creation error:", e);
      return res.status(400).json({ message: "Failed to create organization" });
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
      console.error("Invite error:", e);
      return res.status(400).json({ message: "Failed to send invite" });
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
      console.error("Org settings error:", e);
      return res.status(400).json({ message: "Failed to update settings" });
    }
  });

  // Join org via reusable join code (e.g., "BRACE2026")
  app.post("/api/org/join-code", authLimiter, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== "string") return res.status(400).json({ message: "Join code required" });

      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Please sign in first" });
      if (user.orgId) {
        // Already in this org? Just succeed silently.
        const existingOrg = await storage.getOrganization(user.orgId);
        if (existingOrg?.joinCode?.toUpperCase() === code.trim().toUpperCase()) {
          return res.json({ message: "You're already part of this organization", orgName: existingOrg.name });
        }
        return res.status(400).json({ message: "You're already part of another organization" });
      }

      const org = await storage.getOrganizationByJoinCode(code.trim());
      if (!org) return res.status(404).json({ message: "Invalid join code" });

      await storage.updateUser(user.id, { orgId: org.id });
      return res.json({ message: "Successfully joined organization", orgName: org.name });
    } catch (e: any) {
      console.error("Join code error:", e);
      return res.status(400).json({ message: "Failed to join organization" });
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
      console.error("Invite accept error:", e);
      return res.status(400).json({ message: "Failed to join organization" });
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

    const escapeCsv = (val: string) => {
      // Escape double quotes by doubling them, and prevent formula injection
      let safe = val.replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
      return `"${safe}"`;
    };

    let csv = "Name,Email,Role,Level," + allSkills.map(s => escapeCsv(s.name)).join(",") + "\n";

    for (const member of members) {
      const statuses = await storage.getUserSkillStatuses(member.id);
      const completed = await storage.getCompletedAssessments(member.id);
      const latest = completed[0];

      const skillValues = allSkills.map(s => {
        const ss = statuses.find(st => st.skillId === s.id);
        return ss?.status || "N/A";
      });

      csv += `${escapeCsv(member.name || "")},${escapeCsv(member.email)},${escapeCsv(member.roleTitle || "")},${latest?.assessmentLevel ?? "N/A"},${skillValues.join(",")}\n`;
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
    const allOrgs = await storage.getAllOrganizations();
    const orgMap = Object.fromEntries(allOrgs.map(o => [o.id, o.name]));
    return res.json(allUsers.map(u => {
      const { password: _, ...safe } = u;
      return { ...safe, orgName: u.orgId ? orgMap[u.orgId] || null : null };
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

  app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { newPassword } = z.object({ newPassword: z.string().min(6) }).parse(req.body);
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(id, { password: hashed });
      return res.json({ message: `Password reset for ${user.email}` });
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (id === req.session.userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      const targetUser = await storage.getUser(id);
      if (targetUser?.userRole === "system_admin") {
        // Prevent deleting the last admin
        const allUsers = await storage.getAllUsers();
        const adminCount = allUsers.filter(u => u.userRole === "system_admin").length;
        if (adminCount <= 1) {
          return res.status(400).json({ message: "Cannot delete the only admin account" });
        }
      }
      await storage.deleteUser(id);
      return res.json({ message: "User deleted" });
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  // Admin shortcut: fast-complete an assessment for testing the results page
  app.post("/api/admin/test-complete", requireAdmin, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const level = typeof req.body.level === "number" ? req.body.level : 1;
      const allSkills = await storage.getSkills();
      const levels = await storage.getLevels();
      const targetLevel = levels.find(l => l.sortOrder === level);
      const signatureSkill = allSkills.find(s => s.levelId === targetLevel?.id);

      // Create a completed assessment with sample data
      const assessment = await storage.createAssessment({
        userId: user.id,
        status: "in_progress",
        surveyLevel: level,
        surveyResponsesJson: {},
      });

      const sampleOutcomes = [
        { outcomeHeadline: "Your meeting prep becomes a 2-minute conversation with an AI that knows your style.", description: "Instead of starting from scratch every time, you walk into meetings with an AI teammate that already knows your agenda format, your team's priorities, and how you like to prep. You talk through what's coming up, and it builds your brief." },
        { outcomeHeadline: "Your client deliverables get a first draft before you even open the doc.", description: "You build a specialist that knows your deliverable templates, your client's voice, and the kind of structure that always works. Feed it the brief, and the first draft is waiting for you to refine — not write from zero." },
        { outcomeHeadline: "Your weekly reporting writes itself from your notes and data.", description: "Your scattered notes, updates, and metrics get pulled together automatically. The AI knows what your stakeholders care about and formats everything the way they expect to see it." },
      ];

      const sampleBrightSpots = [
        "You're already using AI as a thinking partner for complex decisions",
        "Your instinct to iterate and refine shows real AI fluency",
      ];

      await storage.updateAssessment(assessment.id, {
        status: "completed",
        completedAt: new Date(),
        assessmentLevel: level,
        transcript: JSON.stringify([
          { role: "assistant", content: "Test conversation for results page preview." },
          { role: "user", content: "This is a test assessment." },
        ]),
        brightSpotsText: JSON.stringify(sampleBrightSpots),
        outcomeOptionsJson: sampleOutcomes,
        signatureSkillId: signatureSkill?.id || null,
        signatureSkillRationale: "Test assessment",
      } as any);

      // Set skill statuses
      for (const skill of allSkills) {
        const skillLevel = levels.find(l => l.id === skill.levelId);
        const status = skillLevel && skillLevel.sortOrder <= level ? (skillLevel.sortOrder < level ? "green" : "yellow") : "red";
        await storage.upsertUserSkillStatus({ userId: user.id, skillId: skill.id, status });
      }

      return res.json({ message: "Test assessment created", assessmentId: assessment.id });
    } catch (e: any) {
      console.error("Test complete error:", e);
      return res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/admin/users/:id/reset", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.resetUserProgress(id);
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
      const assessment = await storage.getAssessment(id);
      await storage.deleteAssessment(id);
      if (assessment) {
        // Only wipe skill statuses if this was the user's only completed assessment
        const remaining = await storage.getCompletedAssessments(assessment.userId);
        if (remaining.length === 0) {
          await storage.deleteUserSkillStatuses(assessment.userId);
        }
      }
      return res.json({ message: "Assessment deleted" });
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  // Admin re-score: reset a stuck/failed assessment so scoring can be re-triggered
  app.post("/api/admin/assessments/:id/rescore", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const assessment = await storage.getAssessment(id);
      if (!assessment) return res.status(404).json({ message: "Assessment not found" });

      const user = await storage.getUser(assessment.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Reset to in_progress so the complete endpoint can re-lock it
      await storage.updateAssessment(id, { status: "in_progress" });

      // Now trigger scoring directly (same logic as the /complete endpoint)
      let messages: Array<{ role: string; content: string }> = [];
      try { messages = JSON.parse(assessment.transcript || "[]"); } catch { messages = []; }

      const userMessages = messages.filter(m => m.role === "user" && m.content !== "Hi, I'm ready to start my assessment.");
      if (userMessages.length < 2) {
        const surveyLevel = (assessment as any).surveyLevel ?? 0;
        await storage.updateAssessment(id, {
          status: "completed",
          completedAt: new Date(),
          scoresJson: {},
          assessmentLevel: surveyLevel,
          activeLevel: surveyLevel,
          contextSummary: "Assessment completed with limited conversation data. Level based on survey responses.",
          workContextSummary: user.roleTitle || null,
          brightSpotsText: JSON.stringify(["You took the first step by starting the assessment."]),
        });
        return res.json({ message: "Scored with survey defaults (limited conversation data)", assessmentLevel: surveyLevel });
      }

      const transcriptText = messages.map(m => `${m.role}: ${m.content}`).join("\n\n");

      let surveyContext: string | undefined;
      if (assessment.surveyResponsesJson) {
        const surveyData = assessment.surveyResponsesJson as Record<string, number>;
        const surveyLevel = (assessment as any).surveyLevel ?? 0;
        const levelNames = ["Accelerator", "Thought Partner", "Team Builder", "Systems Designer"];
        const strong = Object.entries(surveyData).filter(([, v]) => v === 2).map(([k]) => k);
        const sometimes = Object.entries(surveyData).filter(([, v]) => v === 1).map(([k]) => k);
        const never = Object.entries(surveyData).filter(([, v]) => v === 0).map(([k]) => k);
        surveyContext = [
          `Self-assessment survey level: ${levelNames[surveyLevel]} (Level ${surveyLevel + 1} of 4)`,
          strong.length > 0 ? `Skills they self-reported as regularly doing: ${strong.join(", ")}` : "",
          sometimes.length > 0 ? `Skills they self-reported as sometimes doing: ${sometimes.join(", ")}` : "",
          never.length > 0 ? `Skills they self-reported as not yet doing: ${never.join(", ")}` : "",
        ].filter(Boolean).join("\n");
      }

      const result = await scoreAssessment(transcriptText, {
        name: user.name || undefined,
        roleTitle: user.roleTitle || undefined,
        aiPlatform: user.aiPlatform || undefined,
        surveyContext,
      });

      const allSkills = await storage.getSkills();
      const signatureSkill = allSkills.find(s => s.name === result.signatureSkillName)
        || allSkills.find(s => s.name.toLowerCase() === result.signatureSkillName?.toLowerCase());

      await storage.updateAssessment(id, {
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

      const scoresLower: Record<string, { status: string; explanation: string }> = {};
      for (const [key, val] of Object.entries(result.scores)) {
        scoresLower[key.toLowerCase()] = val;
      }
      for (const skill of allSkills) {
        const scoreData = result.scores[skill.name] || scoresLower[skill.name.toLowerCase()];
        if (scoreData) {
          await storage.upsertUserSkillStatus({
            userId: user.id,
            skillId: skill.id,
            status: scoreData.status,
            explanation: scoreData.explanation,
          });
        }
      }

      return res.json({ message: "Re-scored successfully", assessmentLevel: result.assessmentLevel });
    } catch (e: any) {
      console.error("Admin rescore error:", e);
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/organizations", requireAdmin, async (_req, res) => {
    const orgs = await storage.getAllOrganizations();
    return res.json(orgs);
  });

  app.post("/api/admin/organizations", requireAdmin, async (req, res) => {
    try {
      const { name, industry, size } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Organization name required" });
      }
      const org = await storage.createOrganization({
        name: name.trim(),
        industry: industry?.trim() || null,
        size: size?.trim() || null,
      });
      return res.json(org);
    } catch (e: any) {
      console.error("Create org error:", e);
      return res.status(400).json({ message: "Failed to create organization" });
    }
  });

  app.put("/api/admin/organizations/:id/join-code", requireAdmin, async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      if (isNaN(orgId)) return res.status(400).json({ message: "Invalid organization ID" });

      const { joinCode } = req.body;

      // Allow clearing the join code by passing null
      if (joinCode === null) {
        const { db } = await import("./db");
        const { organizations } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [updated] = await db.update(organizations).set({ joinCode: null }).where(eq(organizations.id, orgId)).returning();
        if (!updated) return res.status(404).json({ message: "Organization not found" });
        return res.json(updated);
      }

      if (!joinCode || typeof joinCode !== "string") {
        return res.status(400).json({ message: "Join code required" });
      }
      const code = joinCode.trim().toUpperCase();
      if (code.length < 3 || code.length > 30) {
        return res.status(400).json({ message: "Join code must be 3-30 characters" });
      }
      if (!/^[A-Z0-9]+$/.test(code)) {
        return res.status(400).json({ message: "Join code must be letters and numbers only" });
      }

      // Check for uniqueness
      const existing = await storage.getOrganizationByJoinCode(code);
      if (existing && existing.id !== orgId) {
        return res.status(400).json({ message: "This join code is already in use" });
      }

      const { db } = await import("./db");
      const { organizations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(organizations).set({ joinCode: code }).where(eq(organizations.id, orgId)).returning();
      if (!updated) return res.status(404).json({ message: "Organization not found" });
      return res.json(updated);
    } catch (e: any) {
      console.error("Set join code error:", e);
      return res.status(400).json({ message: "Failed to set join code" });
    }
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

  // Admin nudge generate/deliver disabled — assessment-only product
  app.post("/api/admin/nudge/generate", requireAdmin, async (_req, res) => {
    return res.status(410).json({ message: "Nudge generation is disabled" });
  });

  app.post("/api/admin/nudge/deliver", requireAdmin, async (_req, res) => {
    return res.status(410).json({ message: "Nudge delivery is disabled" });
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
  // Challenge/nudge admin test endpoints removed — assessment-only product
  app.post("/api/admin/test/generate-challenge", requireAdmin, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  app.post("/api/admin/test/simulate-skill-completion", requireAdmin, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  app.post("/api/admin/test/trigger-level-up", requireAdmin, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  app.post("/api/admin/test/preview-challenge-email", requireAdmin, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
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
          await sendWelcomeEmail(targetUser, "Accelerator", 0, APP_URL);
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
        description = `${userName} mastered all 20 AI skills on Electric Thinking`;
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

  // ========== CHALLENGE COACH & REFLECTIONS (removed — assessment-only product) ==========
  app.post("/api/challenge/:nudgeId/coach", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  app.get("/api/challenge/:nudgeId/coach", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
  });

  app.post("/api/challenge/:nudgeId/reflect", requireAuth, async (_req, res) => {
    return res.status(410).json({ message: "This feature has been removed" });
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
