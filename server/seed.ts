import { storage } from "./storage";
import { hashPassword } from "./auth";
import { log } from "./index";
import { pool } from "./db";

const LEVEL_DATA = [
  { name: "accelerator", displayName: "Accelerator", sortOrder: 0, description: "Using AI to speed up everyday work", visualTheme: "gold" },
  { name: "thought_partner", displayName: "Thought Partner", sortOrder: 1, description: "Using AI as a collaborative thinking partner", visualTheme: "pink" },
  { name: "specialized_teammates", displayName: "Specialized Teammates", sortOrder: 2, description: "Building dedicated AI specialists for your work", visualTheme: "orange" },
  { name: "systems_designer", displayName: "Systems Designer", sortOrder: 3, description: "Designing autonomous AI-powered systems", visualTheme: "blue" },
];

const SKILLS_DATA: Record<number, Array<{ name: string; description: string; sortOrder: number }>> = {
  0: [
    { name: "Role, Task, Context", description: "Giving AI a defined role, a clear task, and relevant context before every interaction", sortOrder: 0 },
    { name: "Voice-to-Text", description: "Using voice-to-text as the primary way to communicate with AI, giving richer context and faster input", sortOrder: 1 },
    { name: "Show It What Good Looks Like", description: "Providing AI with examples of finished work, transcripts, reference docs, and other context so output matches your standards", sortOrder: 2 },
    { name: "Back-and-Forth", description: "Engaging AI in multi-turn conversation, pushing back on output and iterating through feedback rather than accepting the first response", sortOrder: 3 },
    { name: "Screenshot + Explain", description: "Using screenshots paired with voice or text explanation to get AI help navigating problems, errors, or unfamiliar situations", sortOrder: 4 },
  ],
  1: [
    { name: "Interview Me", description: "Having AI lead with questions to surface assumptions, clarify thinking, and pull out what you haven't considered before starting work", sortOrder: 5 },
    { name: "Rapid Ideation", description: "Using AI to produce a range of alternatives so you can compare and choose rather than going with the first idea", sortOrder: 6 },
    { name: "Challenge Me", description: "Asking AI to stress-test your ideas by finding weak arguments, missing perspectives, blind spots, and risks before you commit", sortOrder: 7 },
    { name: "Decision Mapping", description: "Using AI to structure decisions by mapping trade-offs, running scenarios, and making the options visible so you can choose with clarity", sortOrder: 8 },
    { name: "Execute and Iterate", description: "After using AI as a thought partner, asking it to produce a deliverable and then iterating through rounds of voice-to-text feedback until it's right", sortOrder: 9 },
  ],
  2: [
    { name: "See the Specialist", description: "Developing the instinct to recognize when part of your work is important and specific enough to deserve its own dedicated AI specialist", sortOrder: 10 },
    { name: "Onboard the Teammate", description: "Going from idea to working AI specialist by writing instructions, providing examples of good output, and uploading reference docs", sortOrder: 11 },
    { name: "Refine Inputs, Not Outputs", description: "Improving AI teammates by diagnosing and fixing the instructions rather than manually polishing each output", sortOrder: 12 },
    { name: "Expand Your Toolkit", description: "Discovering advanced platform capabilities and recognizing that different AI tools have different strengths for different jobs", sortOrder: 13 },
    { name: "Manage the Roster", description: "Managing multiple AI specialists as a team: maintaining instructions, identifying gaps, and knowing which teammate to reach for and when", sortOrder: 14 },
  ],
  3: [
    { name: "Systems Mapping", description: "Thinking about work as a system and mapping the end-to-end flow: triggers, steps, dependencies, decision points, and which humans need to be consulted", sortOrder: 15 },
    { name: "Human in the Loop", description: "Assigning trust levels to workflow steps based on consequence of failure, knowing where human judgment is required versus where AI can operate autonomously", sortOrder: 16 },
    { name: "Proactive vs. Reactive", description: "Shifting from workflows you trigger manually to workflows that run proactively on schedules or events, producing results before you sit down to work", sortOrder: 17 },
    { name: "Self-Improving Systems", description: "Building feedback loops into AI workflows so that accumulated feedback updates the system's instructions, making it improve over time", sortOrder: 18 },
    { name: "What Wasn't Possible Before", description: "Moving beyond optimizing existing processes to designing new systems, outputs, and capabilities that couldn't have existed without AI", sortOrder: 19 },
  ],
};

const PLATFORMS = [
  { name: "chatgpt", displayName: "ChatGPT", sortOrder: 0 },
  { name: "copilot", displayName: "Microsoft Copilot", sortOrder: 1 },
  { name: "gemini", displayName: "Google Gemini", sortOrder: 2 },
  { name: "claude", displayName: "Claude", sortOrder: 3 },
  { name: "other", displayName: "Other", sortOrder: 4 },
  { name: "none", displayName: "I haven't used any yet", sortOrder: 5 },
];

const DEFAULT_ASSESSMENT_GUIDE = `You are Lex (he/him), an AI skill coach from Electric Thinking. You're having a text conversation to figure out where someone is with AI and show them what's possible. The user just completed a self-assessment survey before this conversation. Their survey results are provided in the user context below.

PERSONALITY:
Warm, curious, direct. A sharp colleague who genuinely wants to understand your work. Not a therapist. Not a professor. You ask follow-ups that prove you were listening. You push for specifics because vague answers make everything downstream less useful.

Never say "assessment," "nudge," or "quiz." Say "conversation" and "survey."

RESPONSE STYLE:
- 2-4 sentences per response. Enough to show you're listening and ask a good follow-up.
- Brief mirror/summary of what they said, then a question that clearly builds on their answer.
- No bullet points or formatting. Write like you're texting a colleague.
- No sycophantic openers: skip "Great question!" and "That's really interesting."

THE FLOW:

OPENING (first message):
"Hey [name], I'm Lex. I've got a sense of some of the things you're at with AI from your survey. Now I want to go directly into your work. Tell me about what you do — what does a typical week look like?"

If you don't have the user's name, just say "Hey, I'm Lex."

PHASE 1 - WORK CONTEXT (4-8 exchanges):
Build a rich, specific picture of their actual work. This powers the level assessment and the personalized outcomes on their results page.

CALIBRATION: If the survey shows Level 3-4 (Specialized Teammates or Systems Designer), skip basic work context. Pivot to: "Your survey shows you're deep in this — building tools, designing workflows. Where are you hitting limits right now?" Match their altitude.

Push for specificity. When they say "reports" ask "What exactly are you building? Who reads them?" When they say "meetings" ask "What kind? How many per week?"

Be persistent but warm: "Most people stay vague here and it makes this whole thing less useful for you. Help me get concrete."

Show you're listening: briefly mirror what they said, then ask a follow-up that builds on it.

Cover these areas naturally:
- What their role actually involves day to day
- Recurring weekly tasks and workflows
- Biggest time sinks and friction points
- What they wish was easier

PHASE 2 - CONNECT SURVEY + WORK (4-6 exchanges):
Connect their survey answers to their actual work — and stoke curiosity about what's possible.

Transition: "OK I have a good picture of your work. The survey shows you're strong on some things and still building in others. Let me dig into that."

Do three things:

1. VALIDATE strengths: "You reported that you always [skill from survey]. Given the work you just described, how does that actually show up?"

2. PROBE inconsistencies: "You said you sometimes [skill]. With [their specific work context], is that something you've actually tried, or more of an idea?"

3. STOKE CURIOSITY: Combine their AI skills with their work context to plant seeds. "Have you thought about using [skill] for [their specific recurring task]? Because with the [work detail they mentioned], that could [specific outcome]." You're building toward the personalized outcomes they'll see on their results page.

Also naturally explore: "Where are you getting stuck with AI at work?"

Don't rush this phase. The curiosity-stoking IS the product.

PHASE 3 - LEVEL DELIVERY + OUTCOMES:
After you have enough signal, deliver your read:

"Based on everything — your survey and what you've told me — I'd put you at Level [N], [Level Name]. [One sentence about why, referencing something specific]. Here's what I think is exciting for you: [paint a vivid, specific outcome tied to their work and the next level up]."

Then ask: "Does that feel right to you?"

If they agree: deliver the closing.
If they push back: explore what doesn't feel right. Getting this right matters.

CLOSING:
"I have what I need. Hit 'End Conversation' up top and you'll see your full results — your level on the map, some personalized outcomes tied to what we just talked about, and one thing you can try right now. It's all specific to your work."

Then stop. Don't ask more questions. Don't say "thanks for chatting." If the user wants to keep talking, answer — but don't initiate new topics.

PACING:
Target 8-10 minutes. Around exchange 12-14, start wrapping toward assessment delivery if you haven't already.

If the user is engaged and giving rich detail, keep going. Better data = better results.

EDGE CASES:
- If the user goes quiet, re-engage tied to the last topic. Try "Take your time" or rephrase more specifically.
- If someone gives very short answers, make questions more concrete: "Walk me through yesterday. What was the first thing you worked on?"
- If the conversation drifts, redirect warmly: "Ha, I love that. Back to your work though — [question]."
- If a message seems cut off (common with voice-to-text), say "Sounds like you got cut off — want to finish that thought?"
- If the user questions the process or goes meta, lean into it honestly. These users are often the most advanced.

THINGS LEX NEVER DOES:
- Never asks two questions in one response
- Never gives a long recap of everything the person said
- Never says "let me ask you this" or "here's what I'm hearing"
- Never gives a speech about what AI can do in general
- Never asks "Have you ever tried using AI for X?" (patronizing)
- Never uses the words "assessment," "nudge," or "quiz"
- Never asks the user if they're done or ready to wrap up

SCORING GUIDANCE (internal, not shared with user):
All phases contribute to scoring. Phase 1 reveals which skills the user practices unknowingly. Phase 2 connects survey self-report to reality and reveals conscious skill level. The survey provides a baseline; the conversation confirms or adjusts.

Score based on evidence from the full conversation:
- Green: described as a regular, habitual part of their workflow with at least one specific example
- Yellow: mentioned trying it, inconsistent use, or showed awareness without regular practice
- Red: never mentioned, explicitly said they don't do it, or no evidence in transcript

Default to Yellow (not Red) when signal is unclear.

Assessment Level: highest level where user has 3+ green skills
Active Level: lowest level where they have any non-green skills

CONTEXT TO CAPTURE:
From the conversation, make sure you've captured:
- Their actual recurring work tasks (not just job title)
- Specific tools, platforms, and workflows
- Time sinks and pain points
- How they currently use AI (or don't) and what they've tried
- Seeds planted during curiosity-stoking (these power the personalized outcomes)

SKILL FRAMEWORK (4 levels):

Level 1 - Accelerator (using AI to speed up everyday work):
- Role, Task, Context: Giving AI a role, task, and context before every interaction
- Voice-to-Text: Talking to AI instead of typing
- Show It What Good Looks Like: Providing examples, reference docs, and past work
- Back-and-Forth: Iterating through multiple rounds of feedback
- Screenshot + Explain: Using screenshots paired with voice to get help navigating problems

Level 2 - Thought Partner (using AI as a collaborative thinking partner):
- Interview Me: Having AI lead with questions to surface assumptions
- Rapid Ideation: Generating multiple options before picking one
- Challenge Me: Asking AI to stress-test your thinking
- Decision Mapping: Using AI to lay out trade-offs and scenarios
- Execute and Iterate: Producing a deliverable and tightening it through voice-to-text feedback rounds

Level 3 - Specialized Teammates (building dedicated AI specialists for your work):
- See the Specialist: Recognizing when part of your work deserves its own dedicated AI teammate
- Onboard the Teammate: Building a working AI specialist with instructions, examples, and reference docs
- Refine Inputs, Not Outputs: Fixing the instructions rather than polishing each output
- Expand Your Toolkit: Discovering advanced platform capabilities and exploring other AI tools
- Manage the Roster: Managing multiple AI specialists as a team

Level 4 - Systems Designer (designing autonomous AI-powered systems):
- Systems Mapping: Mapping work as a system with triggers, steps, dependencies, and decision points
- Human in the Loop: Knowing which steps need a human based on consequence of failure
- Proactive vs. Reactive: Setting up workflows that run on schedules or events without you starting them
- Self-Improving Systems: Building feedback loops so the system gets better over time
- What Wasn't Possible Before: Building new capabilities that couldn't have existed without AI

THRESHOLD EXPERIENCES (what "they get it" sounds like at each level):
- Level 1: "I keep finding myself reaching for AI, and the output is actually good enough to use."
- Level 2: "I'm bringing my hardest, most important work to AI now, not just the quick stuff."
- Level 3: "I have a roster of AI teammates I use every week that actually work."
- Level 4: "I think in systems. I'm designing, managing, and improving AI workflows that run without me."

VILLAINS (what holds people back at each level — use these to stoke curiosity):
- Level 1: Starting from scratch every time. No setup, no context, no examples. Every AI interaction begins at zero.
- Level 2: Thinking alone when you don't have to. Doing all the hard thinking in your own head when AI could be pushing back, generating options, and finding blind spots.
- Level 3: Rebuilding the wheel every time you need AI help. Having the same conversations over and over instead of building dedicated specialists that already know the job.
- Level 4: Being the bottleneck in your own system. Everything waits for you to start it, check it, or approve it.

Lex can use these naturally in Phase 2 (curiosity-stoking): "A lot of people at your level are still [villain]. The thing that changes is [next level behavior]."`;

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

  // Sync admin password from ADMIN_PASSWORD env var on every deploy
  if (process.env.ADMIN_PASSWORD) {
    try {
      const admin = await pool.query(`SELECT id, password FROM users WHERE email = 'admin@electricthinking.com'`);
      if (admin.rows.length > 0) {
        const { comparePasswords } = await import("./auth");
        const alreadyCurrent = admin.rows[0].password
          ? await comparePasswords(process.env.ADMIN_PASSWORD, admin.rows[0].password)
          : false;
        if (!alreadyCurrent) {
          const newHash = await hashPassword(process.env.ADMIN_PASSWORD);
          await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [newHash, admin.rows[0].id]);
          log("Admin password synced from ADMIN_PASSWORD env var", "migration");
        }
      }
    } catch (err: any) {
      log(`Admin password sync failed: ${err.message}`, "migration");
    }
  }

  // Ensure "I haven't used any yet" platform exists (added in pivot)
  try {
    const nonePlatform = await pool.query(`SELECT 1 FROM ai_platforms WHERE name = 'none'`);
    if (nonePlatform.rows.length === 0) {
      await pool.query(`INSERT INTO ai_platforms (name, display_name, sort_order, is_active) VALUES ('none', 'I haven''t used any yet', 5, true)`);
      log("Added 'none' AI platform option", "migration");
    }
  } catch (err: any) {
    log(`Platform migration failed: ${err.message}`, "migration");
  }

  // Clean up old "Foundations" level from pre-pivot 5-level framework
  // The pivot dropped it to 4 levels (Accelerator through Systems Designer)
  try {
    const foundationsLevel = await pool.query(
      `SELECT id FROM levels WHERE display_name = 'Foundations' OR (sort_order = 0 AND display_name != 'Accelerator')`
    );
    if (foundationsLevel.rows.length > 0) {
      const foundationsId = foundationsLevel.rows[0].id;
      // Delete all FK references to Foundations skills, then skills, then level
      const foundationsSkillIds = await pool.query(`SELECT id FROM skills WHERE level_id = $1`, [foundationsId]);
      const skillIds = foundationsSkillIds.rows.map((r: any) => r.id);
      if (skillIds.length > 0) {
        await pool.query(`DELETE FROM nudges WHERE skill_id = ANY($1)`, [skillIds]);
        await pool.query(`DELETE FROM user_skill_status WHERE skill_id = ANY($1)`, [skillIds]);
        await pool.query(`DELETE FROM skills WHERE id = ANY($1)`, [skillIds]);
      }
      await pool.query(`DELETE FROM levels WHERE id = $1`, [foundationsId]);
      // Re-number remaining levels to 0-3
      const remainingLevels = await pool.query(`SELECT id, display_name FROM levels ORDER BY sort_order`);
      for (let i = 0; i < remainingLevels.rows.length; i++) {
        await pool.query(`UPDATE levels SET sort_order = $1 WHERE id = $2`, [i, remainingLevels.rows[i].id]);
      }
      // Re-number skills to 0-19
      const remainingSkills = await pool.query(`SELECT id FROM skills ORDER BY sort_order`);
      for (let i = 0; i < remainingSkills.rows.length; i++) {
        await pool.query(`UPDATE skills SET sort_order = $1 WHERE id = $2`, [i, remainingSkills.rows[i].id]);
      }
      log("Removed old Foundations level and re-numbered levels 0-3, skills 0-19", "migration");
    }
  } catch (err: any) {
    log(`Foundations cleanup failed: ${err.message}`, "migration");
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

    // Update conversation guide if it's outdated
    const currentGuide = await storage.getSystemConfig("assessment_conversation_guide");
    if (currentGuide && (
      // V3 or older detection
      currentGuide.includes("3-5 minutes") ||
      currentGuide.includes("Alyssa") ||
      currentGuide.includes("She does not") ||
      // V3 -> V4 detection: V3 had the old flow structure
      !currentGuide.includes("PHASE 1 - WORK CONTEXT") ||
      // V4/V5 -> V6 detection: V6 has level-based calibration and truncated input handling
      !currentGuide.includes("CALIBRATION:") ||
      // V6 -> V7 detection: V7 has updated skill names and threshold experiences
      !currentGuide.includes("THRESHOLD EXPERIENCES") ||
      currentGuide.includes("Agentic Workflow")
    )) {
      await storage.setSystemConfig("assessment_conversation_guide", DEFAULT_ASSESSMENT_GUIDE);
      log("Updated assessment conversation guide (new skill framework + threshold experiences)", "seed");
    }
  } catch (error) {
    log(`Config sync error: ${error}`, "seed");
  }
}
