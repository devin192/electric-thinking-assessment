# Engineering Briefing: Assessment Content Update

**From:** Devin (via Claude Code session, March 26 2026)
**To:** Katrina + Claude Code
**Priority:** Ship today
**Rule:** This updates the assessment content only. No architectural changes.

---

## What's Changing

The 20 survey questions, skill names, skill descriptions, level names, and Lex prompt are all being updated. The 4-level structure stays. The adaptive survey logic stays. The scoring logic stays. The results page structure stays. Never/Sometimes/Always stays.

---

## 1. Survey Questions (client/src/pages/survey.tsx)

Replace the entire `SURVEY_QUESTIONS` array (lines 12-37) with:

```typescript
const SURVEY_QUESTIONS = [
  // Level 1 — Accelerator
  { skillName: "Role, Task, Context", text: "Before I ask AI to do something, I give it a role, the task, and the context it needs to do a good job.", level: 0 },
  { skillName: "Voice-to-Text", text: "I talk to AI using voice instead of typing.", level: 0 },
  { skillName: "Show It What Good Looks Like", text: "I give AI examples, reference docs, or past work so it knows what good output looks like.", level: 0 },
  { skillName: "Back-and-Forth", text: "When AI gives me something, I give it feedback and keep going for multiple rounds instead of accepting the first response.", level: 0 },
  { skillName: "Screenshot + Explain", text: "When I'm stuck on something, I screenshot it, open AI, and talk through what I need help with.", level: 0 },
  // Level 2 — Thought Partner
  { skillName: "Interview Me", text: "I ask AI to interview me — to ask me questions one at a time before I commit to a direction.", level: 1 },
  { skillName: "Rapid Ideation", text: "I use AI to generate multiple options, framings, or approaches before I pick one.", level: 1 },
  { skillName: "Challenge Me", text: "I ask AI to poke holes in my thinking and find what could go wrong.", level: 1 },
  { skillName: "Decision Mapping", text: "When I'm stuck between options, I use AI to lay out the trade-offs and play out different scenarios.", level: 1 },
  { skillName: "Execute and Iterate", text: "After working through a problem with AI, I have it make a first version, then I give feedback on voice-to-text to keep tightening it.", level: 1 },
  // Level 3 — Specialized Teammates
  { skillName: "See the Specialist", text: "I can look at my work and see where a dedicated AI teammate should exist.", level: 2 },
  { skillName: "Onboard the Teammate", text: "I've built dedicated AI teammates — writing instructions, attaching examples, and giving them what they need to do the job well.", level: 2 },
  { skillName: "Refine Inputs, Not Outputs", text: "When my AI teammate's output isn't right, I fix the instructions rather than just fixing the output myself.", level: 2 },
  { skillName: "Expand Your Toolkit", text: "I know what my AI platform can really do, and I know when to reach for a different one.", level: 2 },
  { skillName: "Manage the Roster", text: "I have multiple AI teammates I work with regularly, and I know which one to reach for and when.", level: 2 },
  // Level 4 — Systems Designer
  { skillName: "Systems Mapping", text: "I can map my work as a system — what triggers it, what steps happen, what feeds into what, and where the decision points are.", level: 3 },
  { skillName: "Human in the Loop", text: "I know which steps in my workflows need a human and which ones can run on their own.", level: 3 },
  { skillName: "Proactive vs. Reactive", text: "I have AI workflows that run on their own — on a schedule or triggered by an event — without me starting them.", level: 3 },
  { skillName: "Self-Improving Systems", text: "When I give feedback on my AI system's output, I make sure the system itself gets updated so it's better next time.", level: 3 },
  { skillName: "What Wasn't Possible Before", text: "I've built AI systems that create entirely new outputs or capabilities that didn't exist before — not just faster versions of old processes.", level: 3 },
];
```

---

## 2. Level Definitions (server/seed.ts, lines 6-11)

Replace `LEVEL_DATA`:

```typescript
const LEVEL_DATA = [
  { name: "accelerator", displayName: "Accelerator", sortOrder: 0, description: "Using AI to speed up everyday work", visualTheme: "gold" },
  { name: "thought_partner", displayName: "Thought Partner", sortOrder: 1, description: "Using AI as a collaborative thinking partner", visualTheme: "pink" },
  { name: "specialized_teammates", displayName: "Specialized Teammates", sortOrder: 2, description: "Building dedicated AI specialists for your work", visualTheme: "orange" },
  { name: "systems_designer", displayName: "Systems Designer", sortOrder: 3, description: "Designing autonomous AI-powered systems", visualTheme: "blue" },
];
```

**Note:** Level 4 name changed from "Agentic Workflow" to "Systems Designer". The internal `name` field changes from `agentic_workflow` to `systems_designer`. Check if this name is referenced elsewhere in the codebase (results page, scoring, etc.) and update all references.

---

## 3. Skill Definitions (server/seed.ts, lines 13-42)

Replace the entire `SKILLS_DATA` object:

```typescript
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
```

---

## 4. Lex Prompt Update (server/seed.ts, lines 53-168 — DEFAULT_ASSESSMENT_GUIDE)

In the `DEFAULT_ASSESSMENT_GUIDE` constant, find the `SKILL FRAMEWORK` section near the bottom and replace it with:

```
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
```

Also add this immediately after the SKILL FRAMEWORK section:

```
THRESHOLD EXPERIENCES (what "they get it" sounds like at each level):
- Level 1: "I keep finding myself reaching for AI, and the output is actually good enough to use."
- Level 2: "I'm bringing my hardest, most important work to AI now, not just the quick stuff."
- Level 3: "I have a roster of AI teammates I use every week that actually work."
- Level 4: "I think in systems. I'm designing, managing, and improving AI workflows that run without me."
```

---

## 5. ElevenLabs Voice Prompt (Lex V7)

The same skill framework and threshold experience updates need to be pasted manually into the ElevenLabs agent configuration. The file `working-notes/lex-elevenlabs-prompt-v7.md` in the electric-thinking-assessment repo has the current voice prompt. Update the SKILL FRAMEWORK section at the bottom with the same text from section 4 above.

**Devin pastes this into ElevenLabs dashboard manually.**

---

## 6. Scoring Prompt (server/assessment-ai.ts)

The scoring prompt at line 76 references the skill framework via `${frameworkDescription}` which is built from the database. Since we're updating the database seed (section 3), the scoring prompt should automatically pick up the new skill names and descriptions.

**One change needed in the scoring prompt itself:** Find this line:

```
When in doubt between red and yellow, choose red. Do not give yellow for vague mentions.
```

Replace with:

```
When in doubt between red and yellow, choose yellow. An 8-10 minute conversation can't cover every skill. Yellow means "not enough signal," which is better than incorrectly marking someone red.
```

---

## 7. Database Migration Note

The skill names are changing. Existing users in the database have scores tied to old skill names. Options:

**(A) Re-seed skills for new assessments only.** Old assessments keep old skill names. New assessments get new names. This is the simplest path if existing data doesn't need to be comparable.

**(B) Run a migration** that maps old skill names to new ones. This preserves historical data but requires a mapping table.

**Recommendation:** Option A. There are very few existing assessments, and comparing old scores to new scores across a framework change doesn't make sense anyway. New assessments from today forward use the new framework.

---

## 8. Quick Reference — Old Name → New Name

| # | Old Skill Name | New Skill Name |
|---|---------------|---------------|
| 1 | Context Setting | Role, Task, Context |
| 2 | Quick Drafting | Voice-to-Text |
| 3 | Output Editing & Direction | Show It What Good Looks Like |
| 4 | Voice-First Capture | Back-and-Forth |
| 5 | In-the-Moment Support | Screenshot + Explain |
| 6 | Interview Me | Interview Me *(unchanged)* |
| 7 | Rapid Ideation | Rapid Ideation *(unchanged)* |
| 8 | Challenge Me | Challenge Me *(unchanged)* |
| 9 | Decision Mapping | Decision Mapping *(unchanged)* |
| 10 | Operationalize This | Execute and Iterate |
| 11 | Pattern Spotting | See the Specialist |
| 12 | Workflow Scoping | Onboard the Teammate |
| 13 | Instruction Design | Refine Inputs, Not Outputs |
| 14 | Testing & Refinement | Expand Your Toolkit |
| 15 | Knowledge Embedding | Manage the Roster |
| 16 | Systems Mapping | Systems Mapping *(unchanged)* |
| 17 | Automation Design | Human in the Loop |
| 18 | Independent Judgment | Proactive vs. Reactive |
| 19 | Cross-Workflow Integration | Self-Improving Systems |
| 20 | Continuous Improvement | What Wasn't Possible Before |

**Level 4 display name:** "Agentic Workflow" → "Systems Designer"

---

## 9. Files to Change (Summary)

| File | What to Change |
|------|---------------|
| `client/src/pages/survey.tsx` (lines 12-37) | Replace SURVEY_QUESTIONS array |
| `server/seed.ts` (lines 6-11) | Replace LEVEL_DATA (L4 name change) |
| `server/seed.ts` (lines 13-42) | Replace SKILLS_DATA |
| `server/seed.ts` (lines 53-168) | Update skill framework + add threshold experiences in DEFAULT_ASSESSMENT_GUIDE |
| `server/assessment-ai.ts` (line 84) | Change red/yellow default to yellow |
| `working-notes/lex-elevenlabs-prompt-v7.md` | Update skill framework section |
| Any file referencing "agentic_workflow" | Update to "systems_designer" |
| Any file referencing "Agentic Workflow" display name | Update to "Systems Designer" |

**Do a codebase search for "agentic" and "Agentic" to catch all references.**
