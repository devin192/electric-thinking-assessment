import { storage } from "./storage";
import { hashPassword } from "./auth";
import { log } from "./index";

const LEVEL_DATA = [
  { name: "foundations", displayName: "Foundations", sortOrder: 0, description: "Getting started with AI tools", visualTheme: "cyan" },
  { name: "accelerator", displayName: "Accelerator", sortOrder: 1, description: "Using AI to speed up everyday work", visualTheme: "gold" },
  { name: "thought_partner", displayName: "Thought Partner", sortOrder: 2, description: "Using AI as a collaborative thinking partner", visualTheme: "pink" },
  { name: "specialized_teammates", displayName: "Specialized Teammates", sortOrder: 3, description: "Building reusable AI tools and workflows", visualTheme: "orange" },
  { name: "agentic_workflow", displayName: "Agentic Workflow", sortOrder: 4, description: "Designing autonomous AI-powered systems", visualTheme: "blue" },
];

const SKILLS_DATA: Record<number, Array<{ name: string; description: string; sortOrder: number }>> = {
  0: [
    { name: "Tool Access & Activation", description: "Have you actually opened and used an AI tool?", sortOrder: 0 },
    { name: "First Real Conversation", description: "Have you had a back-and-forth, not just a one-shot query?", sortOrder: 1 },
    { name: "Output Judgment", description: "Can you tell when AI output is good vs. bad?", sortOrder: 2 },
    { name: "Use Case Recognition", description: "Can you identify where AI could help in your work?", sortOrder: 3 },
    { name: "Willingness to Iterate", description: "Do you try again when the first response isn't right?", sortOrder: 4 },
  ],
  1: [
    { name: "Context Setting", description: "Briefing AI with role, task, and relevant inputs", sortOrder: 5 },
    { name: "Quick Drafting", description: "Using AI for first drafts of written content", sortOrder: 6 },
    { name: "Output Editing & Direction", description: "Redirecting AI output -- tone, structure, specificity", sortOrder: 7 },
    { name: "Voice-First Capture", description: "Using voice to externalize thinking, capture recaps, dictate drafts", sortOrder: 8 },
    { name: "In-the-Moment Support", description: "Reflexively reaching for AI when you hit friction", sortOrder: 9 },
  ],
  2: [
    { name: "Interview Me", description: "Letting AI lead with questions to surface your assumptions", sortOrder: 10 },
    { name: "Rapid Ideation", description: "Generating multiple options before committing to one", sortOrder: 11 },
    { name: "Challenge Me", description: "Asking AI to find holes, counterarguments, blind spots in your thinking", sortOrder: 12 },
    { name: "Decision Mapping", description: "Structuring trade-offs, running scenarios, applying frameworks", sortOrder: 13 },
    { name: "Operationalize This", description: "Converting strategy into concrete execution plans", sortOrder: 14 },
  ],
  3: [
    { name: "Pattern Spotting", description: "Recognizing when a repeating task should become a reusable tool", sortOrder: 15 },
    { name: "Workflow Scoping", description: "Breaking a task into inputs, steps, and expected outputs", sortOrder: 16 },
    { name: "Instruction Design", description: "Writing system prompts that produce consistent, reliable output", sortOrder: 17 },
    { name: "Testing & Refinement", description: "Testing tools with real inputs and iterating through edge cases", sortOrder: 18 },
    { name: "Knowledge Embedding", description: "Curating and attaching reference docs so AI has domain context", sortOrder: 19 },
  ],
  4: [
    { name: "Systems Mapping", description: "Designing end-to-end flows, not just individual tasks", sortOrder: 20 },
    { name: "Automation Design", description: "Building workflows where AI handles steps without you", sortOrder: 21 },
    { name: "Independent Judgment", description: "Knowing which steps require human decision-making", sortOrder: 22 },
    { name: "Cross-Workflow Integration", description: "Connecting multiple AI-powered processes together", sortOrder: 23 },
    { name: "Continuous Improvement", description: "Monitoring, measuring, and refining automated systems", sortOrder: 24 },
  ],
};

const PLATFORMS = [
  { name: "chatgpt", displayName: "ChatGPT", sortOrder: 0 },
  { name: "copilot", displayName: "Microsoft Copilot", sortOrder: 1 },
  { name: "gemini", displayName: "Google Gemini", sortOrder: 2 },
  { name: "claude", displayName: "Claude", sortOrder: 3 },
  { name: "other", displayName: "Other", sortOrder: 4 },
];

const DEFAULT_ASSESSMENT_GUIDE = `You are an AI fluency assessment agent for Electric Thinking. Your goal is to have a natural, engaging conversation that evaluates someone's AI fluency across 5 levels (0-4) and 25 skills.

PERSONALITY: You're curious, warm, and genuinely interested in how the person works. Like talking to a smart colleague who's fascinated by their job. Not clinical. Not robotic. Occasional humor is fine.

ASSESSMENT APPROACH:
1. Start with calibration: Ask about their role and how they currently use AI (if at all)
2. Adapt based on responses - if they're clearly advanced, don't waste time on basics
3. For advanced users showing Level 2+, show a quick checklist of lower-level skills and ask if any are actually new
4. For beginners, keep it short (under 5 min), supportive, and encouraging
5. For advanced users, probe deeper with scenario-based questions (10-15 min)

INSIGHT REFRAMES: Look for moments to help users "trip over the truth" about their own skills. When someone describes behaviors that map to specific skills without realizing it, reframe: "You just described three Level 1 skills without even realizing it. You're further along than you think."

DEEP CONTEXT COLLECTION: Build a rich profile including:
- Job title and actual day-to-day work
- Recurring weekly tasks
- What they care about most in their role
- Communication style and preferences
- Workflow frustrations
- AI excitement or concerns
- Specific task examples (store verbatim)
- Team dynamics

CONVERSATION FLOW:
- Keep your responses concise - don't write paragraphs when a sentence will do
- After 20 minutes or 30 exchanges, start wrapping up
- When you have enough signal, say something like: "I think I have a really good picture of where you are. Ready to see your results?"

SKILL FRAMEWORK:
Level 0 - Foundations: Tool Access & Activation, First Real Conversation, Output Judgment, Use Case Recognition, Willingness to Iterate
Level 1 - Accelerator: Context Setting, Quick Drafting, Output Editing & Direction, Voice-First Capture, In-the-Moment Support
Level 2 - Thought Partner: Interview Me, Rapid Ideation, Challenge Me, Decision Mapping, Operationalize This
Level 3 - Specialized Teammates: Pattern Spotting, Workflow Scoping, Instruction Design, Testing & Refinement, Knowledge Embedding
Level 4 - Agentic Workflow: Systems Mapping, Automation Design, Independent Judgment, Cross-Workflow Integration, Continuous Improvement`;

const DEFAULT_NUDGE_GUIDE = `You are a learning nudge generator for Electric Thinking. Generate personalized, actionable learning nudges that help users develop specific AI fluency skills. Each nudge should feel like it was written by someone who knows the user personally, referencing their specific role, tasks, and context from the assessment.`;

export async function seedDatabase() {
  try {
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

    const adminPassword = await hashPassword("admin123");
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
  } catch (error) {
    log(`Config sync error: ${error}`, "seed");
  }
}
