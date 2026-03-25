# Assessment Design Briefing

**Purpose:** This document gives a new Claude Code session everything it needs to help Devin iterate on the Electric Thinking assessment content — the 20 survey questions, 4-level skill framework, Lex conversation guide, scoring prompt, and results page outputs. This session should focus on **what the assessment asks and measures**, not on code changes.

**Ground rules for this session:**
- Write decisions and specs to `working-notes/` files
- Do NOT edit code files directly — Devin will bring decisions back to the engineering session for implementation
- You can read any file in the repo for context
- The repo is at `~/electric-thinking-assessment/` and is synced to GitHub (`main` branch)

---

## What Electric Thinking Is

Electric Thinking is an AI fluency assessment product. It measures where someone is in their AI adoption journey and shows them personalized, work-specific outcomes for leveling up.

The product has three parts:
1. **Survey (Part A)** — Adaptive self-assessment, 5 questions per level, stops at the user's growth edge
2. **Lex Conversation (Part B)** — 8-10 minute voice/text conversation with an AI coach named Lex who digs into the user's actual work
3. **Results (Part C)** — Level placement on a 4-level map, 3 personalized outcomes, bright spots, a "first move" to try now, and a full skill breakdown

The key output is the **3 personalized outcomes** — tantalizing, specific possibilities tied to the user's real work. These are what make the assessment valuable. Devin uses these in actual training: "What were your 3 personalized outcomes?"

---

## The 4-Level Framework

| Internal | Display | Name | Description |
|----------|---------|------|-------------|
| 0 | Level 1 | Accelerator | Using AI to speed up everyday work |
| 1 | Level 2 | Thought Partner | Using AI as a collaborative thinking partner |
| 2 | Level 3 | Specialized Teammates | Building reusable AI tools and workflows |
| 3 | Level 4 | Agentic Workflow | Designing autonomous AI-powered systems |

**Level colors:** Gold, Pink, Orange, Blue (in order)

---

## Current 20 Survey Questions

Each question maps to one skill. Users answer Never (0) / Sometimes (1) / Always (2).

### Level 1 — Accelerator
| # | Skill Name | Question Text |
|---|-----------|---------------|
| 1 | Context Setting | I brief AI with my role, the task, and relevant background before asking it to do something |
| 2 | Quick Drafting | I use AI to create first drafts of emails, docs, or written content |
| 3 | Output Editing & Direction | When AI output isn't right, I redirect it — adjusting tone, structure, or specificity |
| 4 | Voice-First Capture | I use voice to capture thoughts, dictate drafts, or recap meetings with AI |
| 5 | In-the-Moment Support | When I hit friction at work, my reflex is to reach for AI |

### Level 2 — Thought Partner
| # | Skill Name | Question Text |
|---|-----------|---------------|
| 6 | Interview Me | I let AI lead with questions to surface my assumptions before I commit to a direction |
| 7 | Rapid Ideation | I use AI to generate multiple options before picking one |
| 8 | Challenge Me | I ask AI to find holes, counterarguments, or blind spots in my thinking |
| 9 | Decision Mapping | I use AI to structure trade-offs, run scenarios, or apply decision frameworks |
| 10 | Operationalize This | I use AI to turn strategy into concrete execution plans with steps and owners |

### Level 3 — Specialized Teammates
| # | Skill Name | Question Text |
|---|-----------|---------------|
| 11 | Pattern Spotting | I notice when a repeating task should become a reusable AI tool |
| 12 | Workflow Scoping | I break tasks into inputs, steps, and expected outputs before building an AI tool |
| 13 | Instruction Design | I write system prompts or instructions that produce consistent, reliable AI output |
| 14 | Testing & Refinement | I test my AI tools with real inputs and iterate through edge cases |
| 15 | Knowledge Embedding | I attach reference docs or domain context so AI has what it needs to be accurate |

### Level 4 — Agentic Workflow
| # | Skill Name | Question Text |
|---|-----------|---------------|
| 16 | Systems Mapping | I design end-to-end workflows, not just individual AI tasks |
| 17 | Automation Design | I build workflows where AI handles steps without me |
| 18 | Independent Judgment | I know which steps in a workflow need a human decision vs. can run autonomously |
| 19 | Cross-Workflow Integration | I connect multiple AI-powered processes together |
| 20 | Continuous Improvement | I monitor, measure, and refine my automated AI systems over time |

### Known Issues with Current Questions (from QA)
- **L2-4 jargon**: "system prompts," "agentic workflow," "cross-workflow integration" may confuse non-technical users
- **Survey progress counter shifts** as adaptive cutoff recalculates total questions
- Devin flagged that all 20 questions need a language simplification pass
- Some questions may be testing knowledge ("do you know what this means?") rather than behavior ("do you actually do this?")

---

## Adaptive Survey Logic

- 5 questions per level, shown one at a time
- After completing a level's 5 questions, the system checks the score:
  - Score >= 6/10: Continue to next level (solid)
  - Score 4-5/10: Continue one more level then stop (mixed, show one more to find edge)
  - Score <= 3/10: Stop here (this is below their growth edge)
- `surveyLevel` = highest level where score >= 6/10
- Most users answer 5-15 questions, not all 20
- User never sees their level after the survey — goes straight to Lex

---

## Lex Conversation Guide (V6 — Text Mode, currently in production)

The full guide is in `server/seed.ts` starting at line 53 (the `DEFAULT_ASSESSMENT_GUIDE` constant). Key phases:

1. **Opening**: "Hey [name], I'm Lex. I've got a sense of some of the things you're at with AI from your survey. Now I want to go directly into your work."
2. **Phase 1 — Work Context** (4-8 exchanges): Build rich picture of actual work. Calibration: if survey shows L3-4, skip basics and match their altitude.
3. **Phase 2 — Connect Survey + Work** (4-6 exchanges): Validate strengths, probe inconsistencies, stoke curiosity. "The curiosity-stoking IS the product."
4. **Phase 3 — Level Delivery + Outcomes**: Deliver level, paint a vivid outcome, ask "Does that feel right to you?"
5. **Closing**: Direct to End Conversation button. Stop talking.

**Lex V7 (Voice Mode)** — Same flow, adapted for voice (3 sentences max per response). File: `working-notes/lex-elevenlabs-prompt-v7.md`. Uses ElevenLabs dynamic variables for survey data. Devin needs to paste this into ElevenLabs dashboard manually.

### Lex Personality
- Sharp colleague, not therapist or professor
- Warm and sharp (not warm and fuzzy)
- Pushes for specifics: "Most people stay vague here and it makes this whole thing less useful for you"
- Never says "assessment," "nudge," or "quiz"
- Never asks two questions in one response
- Never fake-reacts with sycophantic openers

---

## Scoring Prompt

After Lex conversation ends, the full transcript + survey data + user context goes to Claude Sonnet for scoring. The scoring prompt is in `server/assessment-ai.ts` starting at line 76.

### What Scoring Produces
- **20 skill scores** (green/yellow/red with one-sentence explanations each)
- **assessmentLevel**: Highest level where user has 3+ green skills
- **activeLevel**: Lowest level where they have any non-green skills
- **contextSummary**: Rich profile of the user (powers all future personalization)
- **workContextSummary**: 2-3 sentences about recurring work activities and tools
- **3 outcomeOptions**: Each has outcomeHeadline, timeEstimate, skillName, action, whatYoullSee
- **firstMove**: One specific thing to try right now
- **brightSpots**: 2 bullet points about what they're already doing well
- **futureSelfText**: One sentence painting the next-level identity using their actual job
- **signatureSkill**: Their standout strength + rationale
- **triggerMoment**: When/where they hit friction at work

### Scoring Rules
- Green: Regular habit + at least one specific example
- Yellow: Mentioned trying it, inconsistent use, or awareness without practice
- Red: Never mentioned, explicitly don't do it, or no evidence
- Default to Yellow when unclear (conversation guide says this; scoring prompt says default to Red — there's a conflict here)
- Survey data is additional signal; conversation evidence weighted more heavily when they conflict

---

## Results Page Structure

The results page (`client/src/pages/results.tsx`) shows:

1. **Level ladder**: All 4 levels displayed, user's level highlighted with color
2. **Bright spots**: 2 bullet points about what they're doing well
3. **Future self text**: One sentence painting the next-level identity
4. **3 outcomes**: Expandable cards with headline, action, and "what you'll see"
5. **First move / try-it-now prompt**: With voice-to-text input suggestion
6. **Skill breakdown**: Collapsed by default, shows all 20 skills with green/yellow/red
7. **Share options**: Generic share (primary), LinkedIn share (secondary)
8. **Retake assessment** link

---

## Key Product Decisions (from Devin + Kenny conversation, March 24)

- **This is NOT a quiz**: "A quiz tests knowledge. A survey asks for self-assessment." — Devin
- **Outcomes are THE product**: The 3 personalized outcomes tied to someone's actual work are what make this valuable. Not the level, not the scores.
- **"Tease the destination, not the skills"**: Outcomes should be aspirational but doable. Frame as what HAPPENS, not what skill you practice.
- **No fabricated success stories**: If it's made up, remove it.
- **Universal CTA**: "Join the waitlist for our next Level N cohort" — don't hard-code different CTAs for different audiences
- **Level ladder orients the user**: "Orient me on the map" — seeing where you are on the 4-level journey is the most important element
- **Assessment-only product**: No learning paths, no weekly challenges, no Power Ups. The assessment IS the product right now.

---

## What Devin Said About Changing Direction

At the end of the March 25 session, Devin said: "I'm about to take this a full different direction." This briefing was created specifically to support whatever that new direction is. The assessment content (questions, framework, scoring, Lex behavior) is the most likely area of change.

Possible areas Devin might want to iterate on:
- Are these the right 20 questions? Are there too many? Too few?
- Is the 4-level framework right?
- Should the skill names change?
- Should the survey language be simpler?
- How should Lex behave differently?
- What should the 3 outcomes look like?
- Should scoring weight things differently?

---

## File Reference

| File | What's In It |
|------|-------------|
| `client/src/pages/survey.tsx` (lines 12-37) | The 20 survey questions + adaptive logic |
| `server/seed.ts` (lines 53-168) | Lex V6 conversation guide (text mode) |
| `server/assessment-ai.ts` (lines 76-157) | Full scoring prompt |
| `server/seed.ts` (lines 6-42) | Level and skill definitions |
| `working-notes/lex-elevenlabs-prompt-v7.md` | Lex V7 voice prompt (for ElevenLabs) |
| `client/src/pages/results.tsx` | Results page rendering |
| `working-notes/session-briefing-march25-2026.md` | Full engineering session briefing (QA rounds 7-9, all fixes, remaining items) |
| `working-notes/session-briefing-march24-2026.md` | Pivot decisions + Kenny conversation context |
| `working-notes/session-briefing-march24-2026-part2.md` | The build: survey, pipeline, results, V7 prompt |

---

## Infrastructure (for context only — don't change these)

- **Deployed on Railway**: Auto-deploys from `main` branch
- **URL**: assessment.electricthinking.ai (custom domain pending config) / electric-thinking-assessment-production.up.railway.app
- **Tech**: Express 5 + Vite 7 + React 18, PostgreSQL (Drizzle ORM), Claude API (Sonnet), ElevenLabs voice, Resend email
- **Test accounts**: admin@electricthinking.com (#1), Kenny (#4), Christina (#5, #15), Devin (#11)
