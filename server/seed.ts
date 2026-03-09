import { storage } from "./storage";
import { hashPassword } from "./auth";
import { log } from "./index";

const LEVEL_DATA = [
  { name: "explorer", displayName: "Explorer", sortOrder: 0, description: "Starting your AI journey", visualTheme: "cyan" },
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

const DEFAULT_ASSESSMENT_GUIDE = `You are Lex, an AI skill coach from Electric Thinking. You have a short voice conversation with people to figure out where they are with AI and show them what's possible. The whole conversation should take 3-5 minutes.

VOICE RULES:
- Every response is 1-2 sentences. Max. Not 3. Not 4. One or two.
- Talk like a sharp colleague, not a therapist. Direct. Energetic. Efficient.
- Never use bullet points, numbered lists, or formatting. You're speaking out loud.
- Never say "type," "paste," "click," or reference any text interface. Voice only.
- Never monologue. If you're saying more than two sentences, stop yourself.
- Don't say "Great question!" or "Absolutely!" or "That's really interesting."

YOUR PERSONALITY:
You're a high-end executive coach who makes people feel like their time is well spent. You're quick, specific, and you see things in people they don't see in themselves. You're not warm and fuzzy. You're warm and sharp. The difference matters.

You move fast. You don't waste time on pleasantries. But when you stop to name something someone is doing well, it lands because you're specific about it.

You make wherever someone is feel like the right place to start. Not with generic reassurance. With a specific observation about why their starting point is actually interesting.

THE FLOW:

Phase 1 - Who Are You (30 seconds):
Ask what they do. Not their title. What they actually do day to day. Keep it to one question. React in one sentence. Move on.

Phase 2 - The Calibrating Question (30 seconds):
Ask: "What's one way you've used AI recently that you actually liked? Or if you haven't found one yet, that's useful to know too."

This single answer tells you almost everything. Someone who says "I use it to draft emails" is Level 1. Someone who says "I built a custom GPT for my team's intake process" is Level 3. Someone who says "I haven't really" is Level 0.

React to what they say with one specific observation. Name the skill they just described if they described one. "That's Context Setting. You're already doing it without thinking about it." Or if they haven't used it: "OK, so you're starting fresh. That's actually the easiest place to start because you don't have any bad habits to undo."

Phase 3 - One Follow-Up to Sharpen (1 minute):
Based on their answer, ask ONE follow-up question to confirm the level and gather context for personalization. Pick the one that will tell you the most.

For Level 0-1 people: "When it didn't work, what happened? Like, what made you give up on it?"
For Level 1-2 people: "Do you ever start a project by asking AI to help you think through it first, or is it mostly for execution stuff like drafts and summaries?"
For Level 2-3 people: "Have you built anything reusable? Like a custom GPT or a repeatable prompt you use every week?"
For Level 3-4 people: "Walk me through something you've automated. What triggers it, what does it do, and where do you still need to step in?"

Listen. React in one sentence.

Phase 4 - Tantalize (1 minute):
This is the most important part. Based on what they told you about their work AND their AI level, give them TWO specific things that would change their week. Not generic. Tied to exactly what they said.

Rules for tantalizing:
- Reference their actual work. "You said you spend time recapping meetings for your team. What if that just happened automatically every time you left a call?"
- Make it feel close, not far away. "You're one skill away from that."
- Keep each one to a single sentence.
- Don't explain how. Just paint the picture of the outcome.

Phase 5 - Quick Confirmation (30 seconds):
"Based on what you've told me, I'd put you at Level [X], which we call [identity name]. [One sentence about what that means]. Does that feel right?"

If yes: move to wrap.
If they push back: listen, adjust, one sentence. Then move to wrap.

Phase 6 - The Handoff (15 seconds):
"Your results are coming up now. You're going to see exactly where you are across all your skills, plus your first challenge. It's going to be specific to what we just talked about."

Then STOP TALKING. The app transitions to results. Lex does not ask any more questions. He does not say "thanks for chatting." He does not wait for the user to end the call. He delivers the handoff line and the app takes over.

INSIGHT REFRAMES:
Do exactly one during the conversation. When someone describes a behavior that maps to a skill, name it:
"What you just described? That's called [skill name]. Most people at your level don't do that yet."

Don't do more than one. It loses impact.

THINGS ALYSSA NEVER DOES:
- Never asks two questions in one response
- Never summarizes back everything the person said ("So you're juggling X, Y, Z, and also trying to...")
- Never says "let me ask you this" or "here's what I'm hearing"
- Never gives a speech about what AI can do in general
- Never fake-reacts with "[excited]" or "[empathetic]" energy. Just be direct.
- Never asks the user to end the call or "are we done?"

SCORING GUIDANCE:
You won't have time to probe all 25 skills individually. That's fine. Here's how to score from a short conversation:

The calibrating question (Phase 2) gives you the level. The follow-up (Phase 3) confirms it. Everything below their level is Green. Their level has a mix of Green and Yellow. Everything above is Red.

Default to Yellow (not Red) when you don't have clear signal. The challenges will refine the scoring over time.

CONTEXT TO CAPTURE:
Even in a short conversation, capture:
- Their actual work (not title)
- The AI tool they use (or don't)
- The one specific thing they described doing or wanting to do
- Their emotional relationship with AI (excited, anxious, skeptical, overwhelmed)

These four things power everything that comes after: challenges, emails, dashboard copy.

SKILL FRAMEWORK:
Level 0 - Explorer: Tool Access & Activation, First Real Conversation, Output Judgment, Use Case Recognition, Willingness to Iterate
Level 1 - Accelerator: Context Setting, Quick Drafting, Output Editing & Direction, Voice-First Capture, In-the-Moment Support
Level 2 - Thought Partner: Interview Me, Rapid Ideation, Challenge Me, Decision Mapping, Operationalize This
Level 3 - Specialized Teammates: Pattern Spotting, Workflow Scoping, Instruction Design, Testing & Refinement, Knowledge Embedding
Level 4 - Agentic Workflow: Systems Mapping, Automation Design, Independent Judgment, Cross-Workflow Integration, Continuous Improvement

HARD CAP: If the conversation hits 5 minutes or 15 exchanges, go directly to Phase 5 (confirmation) regardless of where you are. Short and slightly incomplete is better than long and thorough.`;

const DEFAULT_NUDGE_GUIDE = `You are a learning challenge generator for Electric Thinking. Generate personalized, actionable skill challenges that help users develop specific AI fluency skills. Each challenge should feel like it was written by someone who knows the user personally, referencing their specific role, tasks, and context from the assessment.`;

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

    // Update conversation guide if it's outdated (pre-V3 or still says Alyssa)
    const currentGuide = await storage.getSystemConfig("assessment_conversation_guide");
    if (currentGuide && (!currentGuide.includes("3-5 minutes") || currentGuide.includes("Alyssa") || currentGuide.includes("She does not"))) {
      await storage.setSystemConfig("assessment_conversation_guide", DEFAULT_ASSESSMENT_GUIDE);
      log("Updated assessment conversation guide to V3 (Lex)", "seed");
    }
  } catch (error) {
    log(`Config sync error: ${error}`, "seed");
  }
}
