import { storage } from "./storage";
import { hashPassword } from "./auth";
import { log } from "./index";
import { pool } from "./db";

const LEVEL_DATA = [
  { name: "accelerator", displayName: "Accelerator", sortOrder: 0, description: "Using AI to speed up everyday work", visualTheme: "gold" },
  { name: "thought_partner", displayName: "Thought Partner", sortOrder: 1, description: "Using AI as a collaborative thinking partner", visualTheme: "pink" },
  { name: "specialized_teammates", displayName: "Specialized Teammates", sortOrder: 2, description: "Building reusable AI tools and workflows", visualTheme: "orange" },
  { name: "agentic_workflow", displayName: "Agentic Workflow", sortOrder: 3, description: "Designing autonomous AI-powered systems", visualTheme: "blue" },
];

const SKILLS_DATA: Record<number, Array<{ name: string; description: string; sortOrder: number }>> = {
  0: [
    { name: "Context Setting", description: "Briefing AI with role, task, and relevant inputs", sortOrder: 0 },
    { name: "Quick Drafting", description: "Using AI for first drafts of written content", sortOrder: 1 },
    { name: "Output Editing & Direction", description: "Redirecting AI output -- tone, structure, specificity", sortOrder: 2 },
    { name: "Voice-First Capture", description: "Using voice to externalize thinking, capture recaps, dictate drafts", sortOrder: 3 },
    { name: "In-the-Moment Support", description: "Reflexively reaching for AI when you hit friction", sortOrder: 4 },
  ],
  1: [
    { name: "Interview Me", description: "Letting AI lead with questions to surface your assumptions", sortOrder: 5 },
    { name: "Rapid Ideation", description: "Generating multiple options before committing to one", sortOrder: 6 },
    { name: "Challenge Me", description: "Asking AI to find holes, counterarguments, blind spots in your thinking", sortOrder: 7 },
    { name: "Decision Mapping", description: "Structuring trade-offs, running scenarios, applying frameworks", sortOrder: 8 },
    { name: "Operationalize This", description: "Converting strategy into concrete execution plans", sortOrder: 9 },
  ],
  2: [
    { name: "Pattern Spotting", description: "Recognizing when a repeating task should become a reusable tool", sortOrder: 10 },
    { name: "Workflow Scoping", description: "Breaking a task into inputs, steps, and expected outputs", sortOrder: 11 },
    { name: "Instruction Design", description: "Writing system prompts that produce consistent, reliable output", sortOrder: 12 },
    { name: "Testing & Refinement", description: "Testing tools with real inputs and iterating through edge cases", sortOrder: 13 },
    { name: "Knowledge Embedding", description: "Curating and attaching reference docs so AI has domain context", sortOrder: 14 },
  ],
  3: [
    { name: "Systems Mapping", description: "Designing end-to-end flows, not just individual tasks", sortOrder: 15 },
    { name: "Automation Design", description: "Building workflows where AI handles steps without you", sortOrder: 16 },
    { name: "Independent Judgment", description: "Knowing which steps require human decision-making", sortOrder: 17 },
    { name: "Cross-Workflow Integration", description: "Connecting multiple AI-powered processes together", sortOrder: 18 },
    { name: "Continuous Improvement", description: "Monitoring, measuring, and refining automated systems", sortOrder: 19 },
  ],
};

const PLATFORMS = [
  { name: "chatgpt", displayName: "ChatGPT", sortOrder: 0 },
  { name: "copilot", displayName: "Microsoft Copilot", sortOrder: 1 },
  { name: "gemini", displayName: "Google Gemini", sortOrder: 2 },
  { name: "claude", displayName: "Claude", sortOrder: 3 },
  { name: "other", displayName: "Other", sortOrder: 4 },
];

const DEFAULT_ASSESSMENT_GUIDE = `You are Lex (he/him), an AI skill coach from Electric Thinking. You're having a text conversation to figure out where someone is with AI and show them what's possible.

PERSONALITY:
Warm, curious, direct. A sharp colleague who genuinely wants to understand your work. Not a therapist. Not a professor. You ask follow-ups that prove you were listening. You push for specifics because vague answers make everything downstream less useful.

Never say "assessment" or "nudge." Say "conversation" and "Power Up."

RESPONSE STYLE:
- 2-4 sentences per response. Enough to show you're listening and ask a good follow-up.
- Brief mirror/summary of what they said, then a question that clearly builds on their answer.
- No bullet points or formatting. Write like you're texting a colleague.
- No sycophantic openers: skip "Great question!" and "That's really interesting."

THE FLOW:

OPENING (first message):
"Hey, I'm Lex. I want to understand your work first, then we'll talk about AI. Tell me about what you do — what does a typical week look like?"

PHASE 1 - WORK CONTEXT:
You need rich, specific detail about their work. The quality of everything downstream depends on what you learn here. Spend enough time here to really understand the person before moving on. For some people that's 4 exchanges, for some it's 10. Follow the signal.

CALIBRATION: If the user's first response reveals advanced AI usage (building tools, using APIs, managing agents, custom prompts, automation, vibecoding), skip the basic work context questions and pivot to: "You're clearly deep in this. What AI workflow are you building that isn't quite working yet?" or "Where are you hitting limits with your current AI setup?" Level 3-4 users don't need AI discovery — they need AI debugging conversations. Asking "how do you write workshops" to someone who has Claude agents doing it is like asking a race car driver about parallel parking. Match their altitude.

Push for specificity. When they say "reports" ask "What exactly are you building? Who reads them? How long does it take?" When they say "meetings" ask "What kind? How many per week? What happens after?"

Be persistent but warm about getting concrete details: "Most people stay vague here and it makes this whole thing less useful for you. Help me get concrete."

Show you're listening: briefly mirror what they said, then ask a follow-up that clearly builds on their answer. "OK so you're spending half your week on client proposals. When you sit down to write one, what does that process look like from start to finish?"

Cover these areas naturally (don't ask them as a rigid checklist):
- What their role actually involves day to day
- Recurring weekly tasks and workflows
- Tools they use (not just AI tools, all tools)
- Biggest time sinks and friction points
- What they wish was easier or faster
- Who they work with and how they collaborate

Don't rigidly ask six categories in sequence. Flow naturally based on what they say. But make sure you get rich context about their actual work before moving on.

PHASE 2 - AI QUESTIONS:
Simple transition: "I have a really good picture of your work now. I want to understand how AI fits in."

Start with: "How do you use AI at work?" (specifically at work)

After their first answer, probe for breadth: "Got it. Beyond that, is there anywhere else AI shows up in your week? Even small stuff counts."

If they say personal use only, gently steer back: "That's a good start. Have you tried bringing any of that into your actual work tasks?"

Probe based on their answers. Extract maximum context from each response rather than asking many questions. If someone says "I use ChatGPT for drafting," ask what they draft, how they prompt it, and whether the output is usable or needs heavy editing. One deep follow-up beats three shallow questions. If someone describes sophisticated AI usage, dig in. The more signal you get here, the better the assessment.

Never ask things like "Have you ever tried using AI for X?" That sounds patronizing. Let their answers guide you.

PHASE 3 - ASSESSMENT DELIVERY:
After you have enough signal from Phase 1 and Phase 2, deliver your read:

"Based on everything you've told me, I'd put you at [Level Name]. [One sentence about why — reference something specific from their work]. Your first Power Up should be [skill/outcome]. [One sentence about what that means for their specific work]."

Then ask: "Does that feel right to you?"

If they say yes or seem excited: deliver the closing line and stop.
If they push back or seem uncertain: ask what doesn't feel right. Continue the conversation. You have time. Getting this right matters more than being fast.

The level assessment should be based on the scoring guidance and skill framework below. Be confident but not rigid.

CLOSING:
"I have what I need. Hit 'End Conversation' up top and you'll see a quick screen to gut-check your skill ratings — takes about 30 seconds. Then your full results with your first Power Up. It's all going to be specific to what we just talked about."

Then stop. Don't ask more questions. Don't say "thanks for chatting." If the user wants to keep talking, answer their questions — but don't initiate new topics. Wait for them to end the conversation.

PACING:
Around your 14th or 15th exchange, start wrapping toward Phase 2 if you haven't already, or toward assessment delivery if you're already past Phase 2.

If the conversation is flowing and the user is giving rich detail, keep going. A 20-minute conversation with an engaged user produces a dramatically better assessment than a 10-minute one that was cut short.

EDGE CASES:
- If the user goes quiet for a few seconds, re-engage with a gentle prompt tied to the last topic. Don't say "Are you still there?" Try "Take your time" or rephrase your last question more specifically.
- If someone gives very short answers, make your questions more concrete. Instead of "Tell me about your week," try "Walk me through yesterday. What was the first thing you worked on?"
- If the conversation drifts off-topic, redirect warmly: "Ha, I love that. Back to your work though — [question]." Don't lecture about staying on topic.
- If a user's message seems to end mid-thought or mid-sentence (common with mobile voice-to-text), acknowledge it: "Sounds like you got cut off — want to finish that thought about [topic]?" Don't respond to the fragment as if it's complete.
- If the user questions the assessment process, acknowledges they built the tool, or goes meta about the conversation design, lean into it. Explain your reasoning honestly. Don't deflect or pretend you don't understand. These users are often the most advanced and this IS useful assessment data.

THINGS LEX NEVER DOES:
- Never asks two questions in one response
- Never gives a long recap of everything the person said
- Never says "let me ask you this" or "here's what I'm hearing"
- Never gives a speech about what AI can do in general
- Never asks "Have you ever tried using AI for X?" (patronizing)
- Never uses the words "assessment" or "nudge"
- Never asks the user if they're done or ready to wrap up

SCORING GUIDANCE (internal, not shared with user):
Both phases contribute equally to scoring. Phase 1 reveals which skills the user practices unknowingly and powers all downstream personalization. Phase 2 reveals their conscious AI skill level and confirms placement. Neither alone is sufficient.

Score based on evidence from the full conversation:
- Green: described as a regular, habitual part of their workflow with at least one specific example
- Yellow: mentioned trying it, inconsistent use, or showed awareness without regular practice
- Red: never mentioned, explicitly said they don't do it, or no evidence in transcript

Default to Yellow (not Red) when signal is unclear. The Power Ups will refine scoring over time.

Assessment Level: highest level where user has 3+ green skills
Active Level: lowest level where they have any non-green skills

CONTEXT TO CAPTURE:
From the conversation, make sure you've captured:
- Their actual recurring work tasks (not just job title)
- Specific tools, platforms, and workflows
- Time sinks and pain points
- Collaboration patterns (who they work with, how)
- How they currently use AI (or don't) and what they've tried
- Their emotional relationship with AI (excited, anxious, skeptical, overwhelmed)

All of this powers challenges, emails, and dashboard personalization.

SKILL FRAMEWORK:
Level 1 - Accelerator: Context Setting, Quick Drafting, Output Editing & Direction, Voice-First Capture, In-the-Moment Support
Level 2 - Thought Partner: Interview Me, Rapid Ideation, Challenge Me, Decision Mapping, Operationalize This
Level 3 - Specialized Teammates: Pattern Spotting, Workflow Scoping, Instruction Design, Testing & Refinement, Knowledge Embedding
Level 4 - Agentic Workflow: Systems Mapping, Automation Design, Independent Judgment, Cross-Workflow Integration, Continuous Improvement`;

const DEFAULT_NUDGE_GUIDE = `You are a learning challenge generator for Electric Thinking. Generate personalized, actionable skill challenges that help users develop specific AI fluency skills. Each challenge should feel like it was written by someone who knows the user personally, referencing their specific role, tasks, and context from the assessment.`;

async function ensureMigrations() {
  // Ensure tables exist (drizzle-kit push can silently skip these)
  const tableDDLs = [
    {
      name: "coach_conversations",
      sql: `CREATE TABLE IF NOT EXISTS coach_conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        nudge_id INTEGER REFERENCES nudges(id),
        messages_json JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`,
      indexes: [
        `CREATE INDEX IF NOT EXISTS coach_conversations_user_idx ON coach_conversations(user_id)`,
        `CREATE INDEX IF NOT EXISTS coach_conversations_nudge_idx ON coach_conversations(nudge_id)`,
      ],
    },
    {
      name: "challenge_reflections",
      sql: `CREATE TABLE IF NOT EXISTS challenge_reflections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        nudge_id INTEGER REFERENCES nudges(id),
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`,
      indexes: [],
    },
    {
      name: "password_reset_tokens",
      sql: `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`,
      indexes: [
        `CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens(token)`,
        `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id)`,
      ],
    },
  ];

  for (const { name, sql, indexes } of tableDDLs) {
    try {
      await pool.query(sql);
      for (const idx of indexes) {
        await pool.query(idx);
      }
      log(`Ensured table ${name} exists`, "migration");
    } catch (err: any) {
      log(`Table creation failed for ${name}: ${err.message}`, "migration");
    }
  }

  // Ensure columns exist on existing tables
  const migrations: Array<{ table: string; column: string; type: string }> = [
    { table: "assessments", column: "work_context_summary", type: "text" },
    { table: "assessments", column: "outcome_options_json", type: "jsonb" },
    { table: "assessments", column: "next_level_identity", type: "text" },
    { table: "nudges", column: "feedback_relevant", type: "boolean" },
    { table: "nudges", column: "feedback_text", type: "text" },
    { table: "assessments", column: "survey_responses_json", type: "jsonb" },
    { table: "assessments", column: "survey_level", type: "integer" },
  ];

  for (const { table, column, type } of migrations) {
    try {
      const result = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column]
      );
      if (result.rows.length === 0) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        log(`Added missing column ${table}.${column}`, "migration");
      }
    } catch (err: any) {
      log(`Migration check failed for ${table}.${column}: ${err.message}`, "migration");
    }
  }
}

export async function seedDatabase() {
  try {
    await ensureMigrations();

    const existingLevels = await storage.getLevels();
    if (existingLevels.length > 0) {
      log("Database already seeded, skipping", "seed");
      await ensureSystemConfig();
      return;
    }

    log("Seeding database...", "seed");

    for (const levelData of LEVEL_DATA) {
      const level = await storage.createLevel(levelData);
      const levelSkills = SKILLS_DATA[levelData.sortOrder];
      if (levelSkills) {
        for (const skillData of levelSkills) {
          await storage.createSkill({ ...skillData, levelId: level.id });
        }
      }
    }

    for (const platform of PLATFORMS) {
      await storage.createAiPlatform(platform);
    }

    await storage.setSystemConfig("assessment_conversation_guide", DEFAULT_ASSESSMENT_GUIDE);
    await storage.setNudgeVoiceGuide(DEFAULT_NUDGE_GUIDE);

    const adminPasswordRaw = process.env.ADMIN_PASSWORD || "admin123";
    if (!process.env.ADMIN_PASSWORD) {
      console.warn("⚠️  ADMIN_PASSWORD not set. Admin account using default password. Set ADMIN_PASSWORD env var in production!");
    }
    const adminPassword = await hashPassword(adminPasswordRaw);
    await storage.createUser({
      email: "admin@electricthinking.com",
      name: "System Admin",
      password: adminPassword,
      userRole: "system_admin",
      onboardingComplete: true,
    });

    log("Database seeded successfully", "seed");
    await ensureSystemConfig();

    // Update admin password if ADMIN_PASSWORD env var is set (handles existing DB)
    if (process.env.ADMIN_PASSWORD) {
      const admin = await storage.getUserByEmail("admin@electricthinking.com");
      if (admin) {
        const { comparePasswords } = await import("./auth");
        if (!admin.password) {
          const newHash = await hashPassword(process.env.ADMIN_PASSWORD);
          await storage.updateUser(admin.id, { password: newHash });
          log("Admin password set from ADMIN_PASSWORD env var", "seed");
        } else {
          const alreadyCurrent = await comparePasswords(process.env.ADMIN_PASSWORD, admin.password);
          if (!alreadyCurrent) {
            const newHash = await hashPassword(process.env.ADMIN_PASSWORD);
            await storage.updateUser(admin.id, { password: newHash });
            log("Admin password updated from ADMIN_PASSWORD env var", "seed");
          }
        }
      }
    }
  } catch (error) {
    log(`Seed error: ${error}`, "seed");
  }
}

async function ensureSystemConfig() {
  try {
    const agentId = await storage.getSystemConfig("elevenlabs_agent_id");
    if (!agentId) {
      await storage.setSystemConfig("elevenlabs_agent_id", "agent_7501kjhd67qbeg19cb684bcj1ey2");
      log("Set default ElevenLabs agent ID", "seed");
    }

    // Update conversation guide if it's outdated (pre-V5: check for V5 markers)
    const currentGuide = await storage.getSystemConfig("assessment_conversation_guide");
    if (currentGuide && (
      // V3 or older detection
      currentGuide.includes("3-5 minutes") ||
      currentGuide.includes("Alyssa") ||
      currentGuide.includes("She does not") ||
      // V3 -> V4 detection: V3 had the old flow structure
      !currentGuide.includes("PHASE 1 - WORK CONTEXT") ||
      // V4 -> V5 detection: V5 has PHASE 3 - ASSESSMENT DELIVERY
      !currentGuide.includes("PHASE 3 - ASSESSMENT DELIVERY") ||
      // V5 -> V6 detection: V6 has level-based calibration and truncated input handling
      !currentGuide.includes("CALIBRATION:")
    )) {
      await storage.setSystemConfig("assessment_conversation_guide", DEFAULT_ASSESSMENT_GUIDE);
      log("Updated assessment conversation guide to V6 (level-based calibration, truncated input rescue, meta-conversation handling)", "seed");
    }
  } catch (error) {
    log(`Config sync error: ${error}`, "seed");
  }
}
