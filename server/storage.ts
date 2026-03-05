import { eq, and, desc, asc, sql, count, inArray, isNull, lt, gte } from "drizzle-orm";
import { db } from "./db";
import {
  users, organizations, assessments, levels, skills, assessmentQuestions,
  userSkillStatus, nudges, nudgeVoiceGuide, invites, aiPlatforms,
  systemConfig, activityFeed, badges, verificationAttempts, emailLogs,
  liveSessions, coachConversations, challengeReflections,
  type User, type InsertUser, type Organization, type InsertOrganization,
  type Assessment, type InsertAssessment, type Level, type InsertLevel,
  type Skill, type InsertSkill, type AssessmentQuestion, type InsertAssessmentQuestion,
  type UserSkillStatus, type InsertUserSkillStatus, type Invite, type InsertInvite,
  type AiPlatform, type SystemConfigEntry, type Badge, type InsertBadge,
  type Nudge, type InsertNudge, type VerificationAttempt, type InsertVerificationAttempt,
  type ActivityFeedEntry, type InsertActivityFeed, type EmailLog, type InsertEmailLog,
  type LiveSession, type InsertLiveSession,
  type CoachConversation, type InsertCoachConversation,
  type ChallengeReflection, type InsertChallengeReflection,
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  getUsersByOrg(orgId: number): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  getActiveNudgeUsers(): Promise<User[]>;

  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: number): Promise<Organization | undefined>;
  getAllOrganizations(): Promise<Organization[]>;

  createAssessment(assessment: InsertAssessment): Promise<Assessment>;
  getAssessment(id: number): Promise<Assessment | undefined>;
  getActiveAssessment(userId: number): Promise<Assessment | undefined>;
  getCompletedAssessments(userId: number): Promise<Assessment[]>;
  getAllAssessments(): Promise<Assessment[]>;
  updateAssessment(id: number, data: Partial<Assessment>): Promise<Assessment | undefined>;
  deleteAssessment(id: number): Promise<void>;
  getAbandonedAssessments(hoursAgo: number): Promise<Assessment[]>;

  getLevels(): Promise<Level[]>;
  createLevel(level: InsertLevel): Promise<Level>;
  updateLevel(id: number, data: Partial<InsertLevel>): Promise<Level | undefined>;

  getSkills(): Promise<Skill[]>;
  getSkill(id: number): Promise<Skill | undefined>;
  getSkillsByLevel(levelId: number): Promise<Skill[]>;
  createSkill(skill: InsertSkill): Promise<Skill>;
  updateSkill(id: number, data: Partial<InsertSkill>): Promise<Skill | undefined>;

  getQuestions(): Promise<AssessmentQuestion[]>;
  createQuestion(q: InsertAssessmentQuestion): Promise<AssessmentQuestion>;
  updateQuestion(id: number, data: Partial<InsertAssessmentQuestion>): Promise<AssessmentQuestion | undefined>;
  deleteQuestion(id: number): Promise<void>;

  getUserSkillStatuses(userId: number): Promise<UserSkillStatus[]>;
  upsertUserSkillStatus(data: InsertUserSkillStatus): Promise<UserSkillStatus>;
  deleteUserSkillStatuses(userId: number): Promise<void>;
  resetUserProgress(userId: number): Promise<void>;

  createNudge(data: InsertNudge): Promise<Nudge>;
  getUserNudges(userId: number, limit?: number): Promise<Nudge[]>;
  getNudgesByUserAndSkill(userId: number, skillId: number): Promise<Nudge[]>;
  getNudge(id: number): Promise<Nudge | undefined>;
  updateNudge(id: number, data: Partial<Nudge>): Promise<void>;
  getUnsentNudges(): Promise<Nudge[]>;
  getConsecutiveUnopenedNudges(userId: number): Promise<number>;

  createVerificationAttempt(data: InsertVerificationAttempt): Promise<VerificationAttempt>;
  getUserVerificationAttempts(userId: number, skillId: number): Promise<VerificationAttempt[]>;

  createBadge(data: InsertBadge): Promise<Badge>;
  getUserBadges(userId: number): Promise<Badge[]>;

  createActivityFeedEntry(data: InsertActivityFeed): Promise<ActivityFeedEntry>;
  getOrgActivityFeed(orgId: number, limit?: number): Promise<ActivityFeedEntry[]>;
  getUserActivityFeed(userId: number, limit?: number): Promise<ActivityFeedEntry[]>;

  createEmailLog(data: InsertEmailLog): Promise<EmailLog>;
  getEmailLogs(limit?: number): Promise<EmailLog[]>;
  getEmailLogsByEvent(event: string): Promise<EmailLog[]>;

  createInvite(invite: InsertInvite): Promise<Invite>;
  getInviteByToken(token: string): Promise<Invite | undefined>;
  getInvitesByOrg(orgId: number): Promise<Invite[]>;
  getPendingInviteByEmail(email: string, orgId: number): Promise<Invite | undefined>;
  updateInvite(id: number, data: Partial<Invite>): Promise<void>;

  getAiPlatforms(): Promise<AiPlatform[]>;
  createAiPlatform(platform: { name: string; displayName: string; sortOrder: number }): Promise<AiPlatform>;
  updateAiPlatform(id: number, data: Partial<AiPlatform>): Promise<void>;
  deleteAiPlatform(id: number): Promise<void>;

  getSystemConfig(key: string): Promise<string | undefined>;
  setSystemConfig(key: string, value: string): Promise<void>;

  getNudgeVoiceGuide(): Promise<string | undefined>;
  setNudgeVoiceGuide(text: string): Promise<void>;

  getAnalytics(): Promise<{
    totalUsers: number;
    totalAssessments: number;
    completedAssessments: number;
    levelDistribution: Record<number, number>;
    skillCompletionRates: Record<number, { total: number; green: number; yellow: number; red: number }>;
    nudgeStats: { total: number; sent: number; opened: number; read: number };
  }>;

  getTeamAnalytics(orgId: number): Promise<{
    levelDistribution: Record<number, number>;
    memberCount: number;
    skillGaps: Array<{ skillId: number; skillName: string; redCount: number }>;
  }>;

  getUserByUnsubscribeToken(token: string): Promise<User | undefined>;

  getLiveSessions(): Promise<import("@shared/schema").LiveSession[]>;
  getLiveSessionsByLevel(levelId: number): Promise<import("@shared/schema").LiveSession[]>;
  getUpcomingSessionsByLevel(levelId: number): Promise<import("@shared/schema").LiveSession[]>;
  createLiveSession(data: import("@shared/schema").InsertLiveSession): Promise<import("@shared/schema").LiveSession>;
  updateLiveSession(id: number, data: Partial<import("@shared/schema").InsertLiveSession>): Promise<import("@shared/schema").LiveSession | undefined>;
  deleteLiveSession(id: number): Promise<void>;

  getBadge(id: number): Promise<Badge | undefined>;

  getCoachConversation(userId: number, nudgeId: number): Promise<CoachConversation | undefined>;
  createCoachConversation(data: InsertCoachConversation): Promise<CoachConversation>;
  updateCoachConversation(id: number, messagesJson: Array<{ role: string; content: string }>): Promise<void>;
  createChallengeReflection(data: InsertChallengeReflection): Promise<ChallengeReflection>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values({ ...user, email: user.email.toLowerCase() }).returning();
    return created;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(userSkillStatus).where(eq(userSkillStatus.userId, id));
    await db.delete(assessments).where(eq(assessments.userId, id));
    await db.delete(badges).where(eq(badges.userId, id));
    await db.delete(nudges).where(eq(nudges.userId, id));
    await db.delete(activityFeed).where(eq(activityFeed.userId, id));
    await db.delete(verificationAttempts).where(eq(verificationAttempts.userId, id));
    await db.delete(emailLogs).where(eq(emailLogs.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async getUsersByOrg(orgId: number): Promise<User[]> {
    return db.select().from(users).where(eq(users.orgId, orgId));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getActiveNudgeUsers(): Promise<User[]> {
    return db.select().from(users)
      .where(and(eq(users.nudgesActive, true), eq(users.emailValid, true)));
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [created] = await db.insert(organizations).values(org).returning();
    return created;
  }

  async getOrganization(id: number): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(desc(organizations.createdAt));
  }

  async createAssessment(assessment: InsertAssessment): Promise<Assessment> {
    const [created] = await db.insert(assessments).values(assessment).returning();
    return created;
  }

  async getAssessment(id: number): Promise<Assessment | undefined> {
    const [a] = await db.select().from(assessments).where(eq(assessments.id, id));
    return a;
  }

  async getActiveAssessment(userId: number): Promise<Assessment | undefined> {
    const [a] = await db.select().from(assessments)
      .where(and(eq(assessments.userId, userId), eq(assessments.status, "in_progress")));
    return a;
  }

  async getCompletedAssessments(userId: number): Promise<Assessment[]> {
    return db.select().from(assessments)
      .where(and(eq(assessments.userId, userId), eq(assessments.status, "completed")))
      .orderBy(desc(assessments.completedAt));
  }

  async getAllAssessments(): Promise<Assessment[]> {
    return db.select().from(assessments).orderBy(desc(assessments.startedAt));
  }

  async updateAssessment(id: number, data: Partial<Assessment>): Promise<Assessment | undefined> {
    const [updated] = await db.update(assessments).set(data).where(eq(assessments.id, id)).returning();
    return updated;
  }

  async deleteAssessment(id: number): Promise<void> {
    await db.delete(assessments).where(eq(assessments.id, id));
  }

  async getAbandonedAssessments(hoursAgo: number): Promise<Assessment[]> {
    const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    return db.select().from(assessments)
      .where(and(
        eq(assessments.status, "in_progress"),
        lt(assessments.startedAt, cutoff)
      ));
  }

  async getLevels(): Promise<Level[]> {
    return db.select().from(levels).orderBy(asc(levels.sortOrder));
  }

  async createLevel(level: InsertLevel): Promise<Level> {
    const [created] = await db.insert(levels).values(level).returning();
    return created;
  }

  async updateLevel(id: number, data: Partial<InsertLevel>): Promise<Level | undefined> {
    const [updated] = await db.update(levels).set(data).where(eq(levels.id, id)).returning();
    return updated;
  }

  async getSkills(): Promise<Skill[]> {
    return db.select().from(skills).orderBy(asc(skills.sortOrder));
  }

  async getSkill(id: number): Promise<Skill | undefined> {
    const [skill] = await db.select().from(skills).where(eq(skills.id, id));
    return skill;
  }

  async getSkillsByLevel(levelId: number): Promise<Skill[]> {
    return db.select().from(skills).where(eq(skills.levelId, levelId)).orderBy(asc(skills.sortOrder));
  }

  async createSkill(skill: InsertSkill): Promise<Skill> {
    const [created] = await db.insert(skills).values(skill).returning();
    return created;
  }

  async updateSkill(id: number, data: Partial<InsertSkill>): Promise<Skill | undefined> {
    const [updated] = await db.update(skills).set(data).where(eq(skills.id, id)).returning();
    return updated;
  }

  async getQuestions(): Promise<AssessmentQuestion[]> {
    return db.select().from(assessmentQuestions).orderBy(asc(assessmentQuestions.sortOrder));
  }

  async createQuestion(q: InsertAssessmentQuestion): Promise<AssessmentQuestion> {
    const [created] = await db.insert(assessmentQuestions).values(q).returning();
    return created;
  }

  async updateQuestion(id: number, data: Partial<InsertAssessmentQuestion>): Promise<AssessmentQuestion | undefined> {
    const [updated] = await db.update(assessmentQuestions).set(data).where(eq(assessmentQuestions.id, id)).returning();
    return updated;
  }

  async deleteQuestion(id: number): Promise<void> {
    await db.delete(assessmentQuestions).where(eq(assessmentQuestions.id, id));
  }

  async getUserSkillStatuses(userId: number): Promise<UserSkillStatus[]> {
    return db.select().from(userSkillStatus).where(eq(userSkillStatus.userId, userId));
  }

  async upsertUserSkillStatus(data: InsertUserSkillStatus): Promise<UserSkillStatus> {
    const existing = await db.select().from(userSkillStatus)
      .where(and(eq(userSkillStatus.userId, data.userId), eq(userSkillStatus.skillId, data.skillId)));

    if (existing.length > 0) {
      const [updated] = await db.update(userSkillStatus)
        .set(data)
        .where(eq(userSkillStatus.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(userSkillStatus).values(data).returning();
    return created;
  }

  async deleteUserSkillStatuses(userId: number): Promise<void> {
    await db.delete(userSkillStatus).where(eq(userSkillStatus.userId, userId));
  }

  async resetUserProgress(userId: number): Promise<void> {
    await db.delete(userSkillStatus).where(eq(userSkillStatus.userId, userId));
    await db.delete(assessments).where(eq(assessments.userId, userId));
    await db.delete(badges).where(eq(badges.userId, userId));
    await db.delete(nudges).where(eq(nudges.userId, userId));
    await db.delete(activityFeed).where(eq(activityFeed.userId, userId));
    await db.delete(verificationAttempts).where(eq(verificationAttempts.userId, userId));
  }

  async createNudge(data: InsertNudge): Promise<Nudge> {
    const [created] = await db.insert(nudges).values(data).returning();
    return created;
  }

  async getUserNudges(userId: number, limit = 20): Promise<Nudge[]> {
    return db.select().from(nudges)
      .where(eq(nudges.userId, userId))
      .orderBy(desc(nudges.createdAt))
      .limit(limit);
  }

  async getNudgesByUserAndSkill(userId: number, skillId: number): Promise<Nudge[]> {
    return db.select().from(nudges)
      .where(and(eq(nudges.userId, userId), eq(nudges.skillId, skillId)))
      .orderBy(desc(nudges.createdAt));
  }

  async getNudge(id: number): Promise<Nudge | undefined> {
    const [nudge] = await db.select().from(nudges).where(eq(nudges.id, id));
    return nudge;
  }

  async updateNudge(id: number, data: Partial<Nudge>): Promise<void> {
    await db.update(nudges).set(data).where(eq(nudges.id, id));
  }

  async getUnsentNudges(): Promise<Nudge[]> {
    return db.select().from(nudges)
      .where(and(eq(nudges.emailSent, false)));
  }

  async getConsecutiveUnopenedNudges(userId: number): Promise<number> {
    const userNudges = await db.select().from(nudges)
      .where(and(eq(nudges.userId, userId), eq(nudges.emailSent, true)))
      .orderBy(desc(nudges.createdAt))
      .limit(6);

    let consecutiveUnopened = 0;
    for (const n of userNudges) {
      if (!n.emailOpened && !n.inAppRead) {
        consecutiveUnopened++;
      } else {
        break;
      }
    }
    return consecutiveUnopened;
  }

  async createVerificationAttempt(data: InsertVerificationAttempt): Promise<VerificationAttempt> {
    const [created] = await db.insert(verificationAttempts).values(data).returning();
    return created;
  }

  async getUserVerificationAttempts(userId: number, skillId: number): Promise<VerificationAttempt[]> {
    return db.select().from(verificationAttempts)
      .where(and(eq(verificationAttempts.userId, userId), eq(verificationAttempts.skillId, skillId)))
      .orderBy(desc(verificationAttempts.attemptedAt));
  }

  async createBadge(data: InsertBadge): Promise<Badge> {
    const [created] = await db.insert(badges).values(data).returning();
    return created;
  }

  async getUserBadges(userId: number): Promise<Badge[]> {
    return db.select().from(badges)
      .where(eq(badges.userId, userId))
      .orderBy(desc(badges.earnedAt));
  }

  async createActivityFeedEntry(data: InsertActivityFeed): Promise<ActivityFeedEntry> {
    const [created] = await db.insert(activityFeed).values(data).returning();
    return created;
  }

  async getOrgActivityFeed(orgId: number, limit = 50): Promise<ActivityFeedEntry[]> {
    return db.select().from(activityFeed)
      .where(eq(activityFeed.orgId, orgId))
      .orderBy(desc(activityFeed.createdAt))
      .limit(limit);
  }

  async getUserActivityFeed(userId: number, limit = 20): Promise<ActivityFeedEntry[]> {
    return db.select().from(activityFeed)
      .where(eq(activityFeed.userId, userId))
      .orderBy(desc(activityFeed.createdAt))
      .limit(limit);
  }

  async createEmailLog(data: InsertEmailLog): Promise<EmailLog> {
    const [created] = await db.insert(emailLogs).values(data).returning();
    return created;
  }

  async getEmailLogs(limit = 100): Promise<EmailLog[]> {
    return db.select().from(emailLogs)
      .orderBy(desc(emailLogs.createdAt))
      .limit(limit);
  }

  async getEmailLogsByEvent(event: string): Promise<EmailLog[]> {
    return db.select().from(emailLogs)
      .where(eq(emailLogs.event, event))
      .orderBy(desc(emailLogs.createdAt));
  }

  async createInvite(invite: InsertInvite): Promise<Invite> {
    const [created] = await db.insert(invites).values(invite).returning();
    return created;
  }

  async getInviteByToken(token: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites).where(eq(invites.token, token));
    return invite;
  }

  async getInvitesByOrg(orgId: number): Promise<Invite[]> {
    return db.select().from(invites).where(eq(invites.orgId, orgId)).orderBy(desc(invites.createdAt));
  }

  async getPendingInviteByEmail(email: string, orgId: number): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites)
      .where(and(eq(invites.email, email.toLowerCase()), eq(invites.orgId, orgId), eq(invites.accepted, false)));
    return invite;
  }

  async updateInvite(id: number, data: Partial<Invite>): Promise<void> {
    await db.update(invites).set(data).where(eq(invites.id, id));
  }

  async getAiPlatforms(): Promise<AiPlatform[]> {
    return db.select().from(aiPlatforms).orderBy(asc(aiPlatforms.sortOrder));
  }

  async createAiPlatform(platform: { name: string; displayName: string; sortOrder: number }): Promise<AiPlatform> {
    const [created] = await db.insert(aiPlatforms).values(platform).returning();
    return created;
  }

  async updateAiPlatform(id: number, data: Partial<AiPlatform>): Promise<void> {
    await db.update(aiPlatforms).set(data).where(eq(aiPlatforms.id, id));
  }

  async deleteAiPlatform(id: number): Promise<void> {
    await db.delete(aiPlatforms).where(eq(aiPlatforms.id, id));
  }

  async getSystemConfig(key: string): Promise<string | undefined> {
    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
    return config?.value;
  }

  async setSystemConfig(key: string, value: string): Promise<void> {
    const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
    if (existing.length > 0) {
      await db.update(systemConfig).set({ value }).where(eq(systemConfig.key, key));
    } else {
      await db.insert(systemConfig).values({ key, value });
    }
  }

  async getNudgeVoiceGuide(): Promise<string | undefined> {
    const [guide] = await db.select().from(nudgeVoiceGuide).orderBy(desc(nudgeVoiceGuide.id)).limit(1);
    return guide?.promptText;
  }

  async setNudgeVoiceGuide(text: string): Promise<void> {
    const existing = await db.select().from(nudgeVoiceGuide).limit(1);
    if (existing.length > 0) {
      await db.update(nudgeVoiceGuide).set({ promptText: text, updatedAt: new Date() }).where(eq(nudgeVoiceGuide.id, existing[0].id));
    } else {
      await db.insert(nudgeVoiceGuide).values({ promptText: text });
    }
  }

  async getAnalytics() {
    const allUsers = await db.select({ count: count() }).from(users);
    const allAssessments = await db.select({ count: count() }).from(assessments);
    const completed = await db.select({ count: count() }).from(assessments).where(eq(assessments.status, "completed"));
    const completedList = await db.select().from(assessments).where(eq(assessments.status, "completed"));

    const levelDistribution: Record<number, number> = {};
    completedList.forEach(a => {
      if (a.assessmentLevel !== null && a.assessmentLevel !== undefined) {
        levelDistribution[a.assessmentLevel] = (levelDistribution[a.assessmentLevel] || 0) + 1;
      }
    });

    const allStatuses = await db.select().from(userSkillStatus);
    const skillCompletionRates: Record<number, { total: number; green: number; yellow: number; red: number }> = {};
    allStatuses.forEach(s => {
      if (!skillCompletionRates[s.skillId]) {
        skillCompletionRates[s.skillId] = { total: 0, green: 0, yellow: 0, red: 0 };
      }
      skillCompletionRates[s.skillId].total++;
      if (s.status === "green") skillCompletionRates[s.skillId].green++;
      else if (s.status === "yellow") skillCompletionRates[s.skillId].yellow++;
      else skillCompletionRates[s.skillId].red++;
    });

    const allNudges = await db.select({ count: count() }).from(nudges);
    const sentNudges = await db.select({ count: count() }).from(nudges).where(eq(nudges.emailSent, true));
    const openedNudges = await db.select({ count: count() }).from(nudges).where(eq(nudges.emailOpened, true));
    const readNudges = await db.select({ count: count() }).from(nudges).where(eq(nudges.inAppRead, true));

    return {
      totalUsers: allUsers[0].count,
      totalAssessments: allAssessments[0].count,
      completedAssessments: completed[0].count,
      levelDistribution,
      skillCompletionRates,
      nudgeStats: {
        total: allNudges[0].count,
        sent: sentNudges[0].count,
        opened: openedNudges[0].count,
        read: readNudges[0].count,
      },
    };
  }

  async getTeamAnalytics(orgId: number) {
    const members = await db.select().from(users).where(eq(users.orgId, orgId));
    const memberIds = members.map(m => m.id);

    const levelDistribution: Record<number, number> = {};
    if (memberIds.length > 0) {
      const memberAssessments = await db.select().from(assessments)
        .where(and(
          inArray(assessments.userId, memberIds),
          eq(assessments.status, "completed")
        ));

      memberAssessments.forEach(a => {
        if (a.assessmentLevel !== null && a.assessmentLevel !== undefined) {
          levelDistribution[a.assessmentLevel] = (levelDistribution[a.assessmentLevel] || 0) + 1;
        }
      });
    }

    const skillGaps: Array<{ skillId: number; skillName: string; redCount: number }> = [];
    if (memberIds.length > 0) {
      const allStatuses = await db.select().from(userSkillStatus)
        .where(inArray(userSkillStatus.userId, memberIds));
      const allSkillList = await db.select().from(skills);
      const skillMap = new Map(allSkillList.map(s => [s.id, s.name]));

      const redCounts: Record<number, number> = {};
      allStatuses.forEach(s => {
        if (s.status === "red") {
          redCounts[s.skillId] = (redCounts[s.skillId] || 0) + 1;
        }
      });

      Object.entries(redCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .forEach(([skillId, redCount]) => {
          skillGaps.push({
            skillId: parseInt(skillId),
            skillName: skillMap.get(parseInt(skillId)) || "Unknown",
            redCount,
          });
        });
    }

    return {
      levelDistribution,
      memberCount: members.length,
      skillGaps,
    };
  }

  async getUserByUnsubscribeToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.unsubscribeToken, token));
    return user;
  }

  async getLiveSessions(): Promise<LiveSession[]> {
    return db.select().from(liveSessions).orderBy(desc(liveSessions.sessionDate));
  }

  async getLiveSessionsByLevel(levelId: number): Promise<LiveSession[]> {
    return db.select().from(liveSessions)
      .where(eq(liveSessions.levelId, levelId))
      .orderBy(desc(liveSessions.sessionDate));
  }

  async getUpcomingSessionsByLevel(levelId: number): Promise<LiveSession[]> {
    return db.select().from(liveSessions)
      .where(and(
        eq(liveSessions.levelId, levelId),
        gte(liveSessions.sessionDate, new Date())
      ))
      .orderBy(asc(liveSessions.sessionDate));
  }

  async createLiveSession(data: InsertLiveSession): Promise<LiveSession> {
    const [session] = await db.insert(liveSessions).values(data).returning();
    return session;
  }

  async updateLiveSession(id: number, data: Partial<InsertLiveSession>): Promise<LiveSession | undefined> {
    const [session] = await db.update(liveSessions).set(data).where(eq(liveSessions.id, id)).returning();
    return session;
  }

  async deleteLiveSession(id: number): Promise<void> {
    await db.delete(liveSessions).where(eq(liveSessions.id, id));
  }

  async getBadge(id: number): Promise<Badge | undefined> {
    const [badge] = await db.select().from(badges).where(eq(badges.id, id));
    return badge;
  }

  async getCoachConversation(userId: number, nudgeId: number): Promise<CoachConversation | undefined> {
    const [conversation] = await db.select().from(coachConversations)
      .where(and(eq(coachConversations.userId, userId), eq(coachConversations.nudgeId, nudgeId)));
    return conversation;
  }

  async createCoachConversation(data: InsertCoachConversation): Promise<CoachConversation> {
    const [created] = await db.insert(coachConversations).values({
      userId: data.userId,
      nudgeId: data.nudgeId,
      messagesJson: (data.messagesJson || []) as { role: string; content: string }[],
    }).returning();
    return created;
  }

  async updateCoachConversation(id: number, messagesJson: Array<{ role: string; content: string }>): Promise<void> {
    await db.update(coachConversations)
      .set({ messagesJson, updatedAt: new Date() })
      .where(eq(coachConversations.id, id));
  }

  async createChallengeReflection(data: InsertChallengeReflection): Promise<ChallengeReflection> {
    const [created] = await db.insert(challengeReflections).values(data).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
