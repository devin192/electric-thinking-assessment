import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  serial,
  decimal,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  industry: varchar("industry", { length: 255 }),
  size: varchar("size", { length: 100 }),
  joinCode: varchar("join_code", { length: 50 }),
  settingsJson: jsonb("settings_json").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").references(() => organizations.id),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    password: text("password"),
    roleTitle: varchar("role_title", { length: 255 }),
    aiPlatform: varchar("ai_platform", { length: 100 }),
    userRole: varchar("user_role", { length: 50 }).notNull().default("member"),
    nudgesActive: boolean("nudges_active").default(true),
    nudgeDay: varchar("nudge_day", { length: 20 }).default("Monday"),
    challengeFrequency: varchar("challenge_frequency", { length: 30 }).default("weekly"),
    timezone: varchar("timezone", { length: 100 }).default("America/Los_Angeles"),
    onboardingComplete: boolean("onboarding_complete").default(false),
    emailValid: boolean("email_valid").default(true),
    emailPrefsNudges: boolean("email_prefs_nudges").default(true),
    emailPrefsProgress: boolean("email_prefs_progress").default(true),
    emailPrefsReminders: boolean("email_prefs_reminders").default(true),
    unsubscribeToken: varchar("unsubscribe_token", { length: 255 }),
    currentLevel: integer("current_level"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_org_id_idx").on(table.orgId),
  ]
);

export const levels = pgTable("levels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  description: text("description"),
  visualTheme: varchar("visual_theme", { length: 100 }),
});

export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  levelId: integer("level_id")
    .references(() => levels.id)
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true),
});

export const assessmentQuestions = pgTable("assessment_questions", {
  id: serial("id").primaryKey(),
  skillId: integer("skill_id").references(() => skills.id),
  questionText: text("question_text").notNull(),
  questionType: varchar("question_type", { length: 50 }).default("scenario"),
  scoringLogicJson: jsonb("scoring_logic_json").$type<Record<string, any>>().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const assessments = pgTable(
  "assessments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    transcript: text("transcript"),
    contextSummary: text("context_summary"),
    workContextSummary: text("work_context_summary"),
    assessmentLevel: integer("assessment_level"),
    activeLevel: integer("active_level"),
    scoresJson: jsonb("scores_json").$type<Record<string, any>>(),
    firstMoveJson: jsonb("first_move_json").$type<Record<string, any>>(),
    outcomeOptionsJson: jsonb("outcome_options_json").$type<Record<string, any>[]>(),
    signatureSkillId: integer("signature_skill_id").references(() => skills.id),
    signatureSkillRationale: text("signature_skill_rationale"),
    brightSpotsText: text("bright_spots_text"),
    futureSelfText: text("future_self_text"),
    nextLevelIdentity: text("next_level_identity"),
    triggerMoment: text("trigger_moment"),
    surveyResponsesJson: jsonb("survey_responses_json").$type<Record<string, number>>(),
    surveyLevel: integer("survey_level"),
    scoringConfidence: varchar("scoring_confidence", { length: 20 }),
    status: varchar("status", { length: 50 }).notNull().default("in_progress"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    npsScore: integer("nps_score"),
    userFeedbackText: text("user_feedback_text"),
    voiceTimeToFirstAudio: integer("voice_time_to_first_audio"),
    voiceReconnectCount: integer("voice_reconnect_count"),
    voiceSessionDuration: integer("voice_session_duration"),
    abandonedEmailSent: boolean("abandoned_email_sent").default(false),
  },
  (table) => [
    index("assessments_user_status_idx").on(table.userId, table.status),
  ]
);

export const userSkillStatus = pgTable(
  "user_skill_status",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    skillId: integer("skill_id")
      .references(() => skills.id)
      .notNull(),
    status: varchar("status", { length: 20 }).notNull().default("red"),
    explanation: text("explanation"),
    completedAt: timestamp("completed_at"),
    streakCount: integer("streak_count").default(0),
  },
  (table) => [
    uniqueIndex("user_skill_status_unique_idx").on(table.userId, table.skillId),
    index("user_skill_status_skill_idx").on(table.skillId, table.status),
  ]
);

export const nudges = pgTable(
  "nudges",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    skillId: integer("skill_id").references(() => skills.id),
    contentJson: jsonb("content_json").$type<Record<string, any>>(),
    subjectLine: varchar("subject_line", { length: 500 }),
    emailId: varchar("email_id", { length: 255 }),
    emailSent: boolean("email_sent").default(false),
    emailOpened: boolean("email_opened").default(false),
    inAppRead: boolean("in_app_read").default(false),
    isFirstChallenge: boolean("is_first_challenge").default(false),
    feedbackRelevant: boolean("feedback_relevant"),
    feedbackVote: varchar("feedback_vote", { length: 10 }),
    feedbackText: text("feedback_text"),
    // Generation cost tracking (added 2026-04-18)
    // generationCost is stored in CENTS with 4 decimal places, so 0.4500 = 0.45 cents
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    generationCost: decimal("generation_cost", { precision: 6, scale: 4 }),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("nudges_user_skill_idx").on(table.userId, table.skillId)]
);

export const nudgeVoiceGuide = pgTable("nudge_voice_guide", {
  id: serial("id").primaryKey(),
  promptText: text("prompt_text").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verificationAttempts = pgTable("verification_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  skillId: integer("skill_id")
    .references(() => skills.id)
    .notNull(),
  questionsJson: jsonb("questions_json").$type<Record<string, any>>(),
  answersJson: jsonb("answers_json").$type<Record<string, any>>(),
  passed: boolean("passed"),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
});

export const badges = pgTable("badges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  badgeType: varchar("badge_type", { length: 50 }).notNull(),
  badgeDataJson: jsonb("badge_data_json").$type<Record<string, any>>(),
  earnedAt: timestamp("earned_at").defaultNow().notNull(),
});

export const invites = pgTable(
  "invites",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .references(() => organizations.id)
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    invitedBy: integer("invited_by").references(() => users.id),
    token: varchar("token", { length: 255 }).notNull(),
    accepted: boolean("accepted").default(false),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("invites_email_org_idx").on(table.email, table.orgId),
    index("invites_org_accepted_idx").on(table.orgId, table.accepted),
    uniqueIndex("invites_token_idx").on(table.token),
  ]
);

export const liveSessions = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  levelId: integer("level_id").references(() => levels.id),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  sessionDate: timestamp("session_date"),
  joinLink: varchar("join_link", { length: 500 }),
  recordingLink: varchar("recording_link", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiPlatforms = pgTable("ai_platforms", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const systemConfig = pgTable("system_config", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
});

export const activityFeed = pgTable(
  "activity_feed",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").references(() => organizations.id),
    userId: integer("user_id").references(() => users.id),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    eventDataJson: jsonb("event_data_json").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_feed_org_created_idx").on(table.orgId, table.createdAt),
  ]
);

export const emailLogs = pgTable(
  "email_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    emailType: varchar("email_type", { length: 50 }).notNull(),
    resendId: varchar("resend_id", { length: 255 }),
    recipientEmail: varchar("recipient_email", { length: 255 }),
    event: varchar("event", { length: 50 }).notNull().default("sent"),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_logs_user_idx").on(table.userId),
  ]
);

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export const insertOrgSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
});
export const insertAssessmentSchema = createInsertSchema(assessments).omit({
  id: true,
  startedAt: true,
});
export const insertLevelSchema = createInsertSchema(levels).omit({ id: true });
export const insertSkillSchema = createInsertSchema(skills).omit({ id: true });
export const insertQuestionSchema = createInsertSchema(assessmentQuestions).omit({ id: true });
export const insertUserSkillStatusSchema = createInsertSchema(userSkillStatus).omit({ id: true });
export const insertInviteSchema = createInsertSchema(invites).omit({
  id: true,
  createdAt: true,
});
export const insertBadgeSchema = createInsertSchema(badges).omit({
  id: true,
  earnedAt: true,
});
export const insertAiPlatformSchema = createInsertSchema(aiPlatforms).omit({ id: true });
export const insertSystemConfigSchema = createInsertSchema(systemConfig);
export const insertLiveSessionSchema = createInsertSchema(liveSessions).omit({ id: true, createdAt: true });
export const insertNudgeSchema = createInsertSchema(nudges).omit({ id: true, createdAt: true });
export const coachConversations = pgTable(
  "coach_conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    nudgeId: integer("nudge_id").references(() => nudges.id),
    messagesJson: jsonb("messages_json").$type<Array<{ role: string; content: string }>>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("coach_conversations_user_idx").on(table.userId),
    index("coach_conversations_nudge_idx").on(table.nudgeId),
  ]
);

export const challengeReflections = pgTable("challenge_reflections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  nudgeId: integer("nudge_id").references(() => nudges.id),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_idx").on(table.token),
    index("password_reset_tokens_user_idx").on(table.userId),
  ]
);

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });

export const issueReports = pgTable("issue_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  assessmentId: integer("assessment_id"),
  error: text("error").notNull(),
  browser: text("browser"),
  connectionType: varchar("connection_type", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIssueReportSchema = createInsertSchema(issueReports).omit({ id: true, createdAt: true });

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({ id: true, createdAt: true });
export const insertVerificationAttemptSchema = createInsertSchema(verificationAttempts).omit({ id: true, attemptedAt: true });
export const insertActivityFeedSchema = createInsertSchema(activityFeed).omit({ id: true, createdAt: true });
export const insertCoachConversationSchema = createInsertSchema(coachConversations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChallengeReflectionSchema = createInsertSchema(challengeReflections).omit({ id: true, createdAt: true });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrgSchema>;
export type Assessment = typeof assessments.$inferSelect;
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;
export type Level = typeof levels.$inferSelect;
export type InsertLevel = z.infer<typeof insertLevelSchema>;
export type Skill = typeof skills.$inferSelect;
export type InsertSkill = z.infer<typeof insertSkillSchema>;
export type AssessmentQuestion = typeof assessmentQuestions.$inferSelect;
export type InsertAssessmentQuestion = z.infer<typeof insertQuestionSchema>;
export type UserSkillStatus = typeof userSkillStatus.$inferSelect;
export type InsertUserSkillStatus = z.infer<typeof insertUserSkillStatusSchema>;
export type Invite = typeof invites.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Badge = typeof badges.$inferSelect;
export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type AiPlatform = typeof aiPlatforms.$inferSelect;
export type SystemConfigEntry = typeof systemConfig.$inferSelect;
export type ActivityFeedEntry = typeof activityFeed.$inferSelect;
export type InsertActivityFeed = z.infer<typeof insertActivityFeedSchema>;
export type Nudge = typeof nudges.$inferSelect;
export type InsertNudge = z.infer<typeof insertNudgeSchema>;
export type VerificationAttempt = typeof verificationAttempts.$inferSelect;
export type InsertVerificationAttempt = z.infer<typeof insertVerificationAttemptSchema>;
export type LiveSession = typeof liveSessions.$inferSelect;
export type InsertLiveSession = z.infer<typeof insertLiveSessionSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type CoachConversation = typeof coachConversations.$inferSelect;
export type InsertCoachConversation = z.infer<typeof insertCoachConversationSchema>;
export type ChallengeReflection = typeof challengeReflections.$inferSelect;
export type InsertChallengeReflection = z.infer<typeof insertChallengeReflectionSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type IssueReport = typeof issueReports.$inferSelect;
export type InsertIssueReport = z.infer<typeof insertIssueReportSchema>;
