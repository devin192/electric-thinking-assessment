# Product Pivot — March 24, 2026

## The Decision

Archive the full learning platform. Focus exclusively on making the opening assessment world-class.

Source: Devin + Kenny conversation (Otter transcript in ~/Downloads/AI Skills Assessment Strategy_otter_ai.txt)

## The Goal

> The user has a very clear sense of where they're at on our 1-2-3-4-5 levels. And they are excited about upping their skills with AI because they can connect it to concrete, sexy outcomes that feel highly personalized to them.

Kenny: "Tease the destination, not the skills."
Kenny: "Let's make one part world class."

## Framework Change: 4 Levels (not 5)

Dropping old Level 1 "Foundations/Explorer" (have you opened an AI tool?). If you're taking the assessment, you already have access.

| Level | Name | One-liner |
|-------|------|-----------|
| 1 | Accelerator (the shortcuts) | Use AI to speed up everyday work |
| 2 | Thought Partner | Use AI to think better |
| 3 | Specialized Teammates | Build reusable AI tools |
| 4 | Agentic Workflow | Design autonomous AI systems |

Each level still has 5 skills.

## The New Product Flow

### Part A: Self-Assessment Survey (NOT a quiz)
- All skills, all levels, presented sequentially
- User does NOT see level groupings — just answers questions
- Format: Slider-like, never/sometimes/always (fastest possible)
- 5 questions per level × 4 levels = 20 questions
- Backend calculates approximate level from answers
- User does NOT see their level yet — goes straight to Lex
- Quiz results get passed to Lex as context

### Part B: Lex Voice Conversation (8-10 min)
- Lex has quiz data: knows approximate level, strong/weak skills
- Lex explicitly references quiz: "I can see from the first part that you're strong on X..."
- Still opens with "tell me about your work/week"
- Covers: work context, where AI fits in, where they're stuck
- "Where are you stuck?" is one of several natural topics, not THE main question
- At the end, Lex delivers the level assessment (same as now)
- Person gets to respond/react via voice

### Results Page
1. **Hero: Level on the ladder** — show all 4 levels, highlight where you are
2. **3 personalized outcomes** — horizontal cards, clickable for detail
   - Aspirational but DOABLE (not dreamland, not trivial)
   - Tied to what they'd achieve if they fully engage with training
   - Specific to their work context from the Lex conversation
   - "Tease the destination, not the skills"
3. **One thing to try right now** — concrete prompt, framed as "say a version of this into your AI tool" (voice-to-text, not copy-paste)
   - Coach chat still available for help (with voice-to-text input)
4. **Collapsed skill breakdown** — expandable "See your detailed skill breakdown"
5. **CTA** — universal (not audience-specific), something like share/social

### Voice/Text Mode
- Same as now: voice primary, text fallback

## What Gets Archived
- Power Ups / weekly challenges
- Skill verification quizzes
- Dashboard with progress tracking
- Schedule picker / email preferences
- Badges and sharing (except maybe on results)
- Manager team view
- Ongoing learning platform features

## What Stays (carried forward)
- Voice conversation with Lex
- Assessment scoring
- 4-level framework with skills
- Coach chat (with voice-to-text)
- Results page (redesigned)
- Privacy page

## Other Decisions
- Create new ElevenLabs agent (clone existing, keep old intact)
- V7 prompt file for the new Lex prompt
- Platform preference: still ask, but less important without targeted Power Ups
- CTA: universal, not hard-coded for different audiences
- Timeline: Building TODAY (March 24, 2026)
- Archive strategy: git tag + branch

## Kenny's Bugs Found
- Double voice streams when interrupting Lex
- Wrong level after quiz (said Level 4 after passing Level 4 quiz, should've been Level 5)
- Stuck at top — no content after completing all Level 4 skills
- Quiz modal doesn't fit viewport (had to zoom to 67%)
- Skills not probed by Lex — gave Level 4 but never asked about specific gaps
