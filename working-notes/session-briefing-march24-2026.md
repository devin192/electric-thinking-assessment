# Session Briefing — March 24, 2026

## THE BIG PICTURE

We are pivoting the product from a full learning platform to a focused assessment-only experience. The full platform (Power Ups, skill verification quizzes, dashboard progress tracking, badges, manager views, scheduling) is being archived. The new product is: take an assessment → see where you are → get excited about leveling up.

**Source:** Devin + Kenny conversation recorded via Otter AI (~/Downloads/AI Skills Assessment Strategy_otter_ai.txt). Full product pivot notes at working-notes/product-pivot-march24-2026.md. 18 screenshots from Kenny's testing session in ~/Downloads/ (timestamps 11:03-11:16 AM March 24).

**Kenny's key quote:** "Let's make one part world class."
**Devin's goal statement:** "The user has a very clear sense of where they're at on our 1-2-3-4-5 levels. And they are excited about upping their skills with AI because they can connect it to concrete, sexy outcomes that feel highly personalized to them."

## FRAMEWORK CHANGE: 4 LEVELS (NOT 5)

Dropped the old Level 1 "Foundations/Explorer" (have you opened an AI tool?). If you're taking the assessment, you already have access.

| Level | Name | One-liner |
|-------|------|-----------|
| 1 | Accelerator (the shortcuts) | Use AI to speed up everyday work |
| 2 | Thought Partner | Use AI to think better — brainstorm, challenge, decide |
| 3 | Specialized Teammates | Build reusable AI tools that do one job reliably |
| 4 | Agentic Workflow | Design systems where AI handles whole workflows |

Each level has 5 skills (carried forward from the existing framework, minus the old Level 1 skills).

### Level 1 - Accelerator skills:
- Context Setting: Briefing AI with role, task, and relevant inputs
- Quick Drafting: Using AI for first drafts of written content
- Output Editing & Direction: Redirecting AI output — tone, structure, specificity
- Voice-First Capture: Using voice to externalize thinking, capture recaps, dictate drafts
- In-the-Moment Support: Reflexively reaching for AI when you hit friction

### Level 2 - Thought Partner skills:
- Interview Me: Letting AI lead with questions to surface your assumptions
- Rapid Ideation: Generating multiple options before committing to one
- Challenge Me: Asking AI to find holes, counterarguments, blind spots
- Decision Mapping: Structuring trade-offs, running scenarios, applying frameworks
- Operationalize This: Converting strategy into concrete execution plans

### Level 3 - Specialized Teammates skills:
- Pattern Spotting: Recognizing when a repeating task should become a reusable tool
- Workflow Scoping: Breaking a task into inputs, steps, and expected outputs
- Instruction Design: Writing system prompts that produce consistent, reliable output
- Testing & Refinement: Testing tools with real inputs and iterating through edge cases
- Knowledge Embedding: Curating and attaching reference docs so AI has domain context

### Level 4 - Agentic Workflow skills:
- Systems Mapping: Designing end-to-end flows, not just individual tasks
- Automation Design: Building workflows where AI handles steps without you
- Independent Judgment: Knowing which steps require human decision-making
- Cross-Workflow Integration: Connecting multiple AI-powered processes together
- Continuous Improvement: Monitoring, measuring, and refining automated systems

## THE NEW PRODUCT FLOW

### Part A: Self-Assessment Survey (NOT a quiz)
- Slider-based, similar to the existing gut-check sliders
- Never / Sometimes / Always format (or equivalent fast interaction)
- 5 questions per level × 4 levels = 20 questions
- User does NOT see level groupings — just answers sequentially
- Backend calculates approximate level from answers
- **User does NOT see their level after the survey** — flows straight into Lex
- Survey results get passed to Lex via ElevenLabs dynamic variables

### Part B: Lex Voice Conversation (8-10 min)
- Lex has survey data: approximate level, strong/weak skills, name, role, platform
- Lex references survey naturally: "I've got a sense of some of the things you're at with AI. Now I want to go directly into your work."
- Phase 1: Work context ("tell me about your week")
- Phase 2: Connect survey data to work context. "The survey shows you're strong on X. Given the work you just described, how does that actually show up?" Also: "You reported you sometimes do Y — is that something you've actually tried with [their specific work context]?"
- KEY INSIGHT from Devin: Lex should start STOKING CURIOSITY. Lex combines AI skill + work context to plant seeds: "Have you tried using [skill] for [their specific task]?" This builds toward the 3 outcomes on the results page.
- Phase 2 also naturally covers: "Where are you getting stuck with AI?"
- Phase 3: Lex delivers level assessment. "Based on everything — I'd put you at Level [N]." References specific things from conversation. Person responds via voice.
- Closing: "Hit End Conversation" → goes to results page (NO sliders post-conversation — survey already did that)

### Results Page
1. **Hero: Level on the ladder** — Show all 4 levels, highlight where they are. This is THE most important thing: orient me on the map.
2. **3 personalized outcomes** — Horizontal cards with headlines, clickable for detail.
   - Aspirational but DOABLE (not dreamland, not trivial)
   - What they'd achieve if they fully engage with training (A+ student outcomes)
   - Specific to their work context from the Lex conversation
   - "Tease the destination, not the skills" — these are about OUTCOMES not curriculum
   - Devin wants to use these in actual training: "What were your 3 personalized outcomes?"
3. **One thing to try right now** — Concrete prompt, framed as "turn on voice-to-text and say a version of this into your AI tool" (not copy-paste)
   - Coach chat still available ("Need help?") with voice-to-text input
4. **Collapsed skill breakdown** — Expandable "See your detailed skill breakdown"
5. **CTA** — Universal (not audience-specific). Options considered:
   - "Share your results" (LinkedIn + copy link) — Devin likes this
   - "Join the waitlist for our next Level [N] cohort" — Devin found this interesting
   - "Get your team assessed" — good for lead-gen
   - "Challenge a colleague" — viral loop

### Voice/Text Mode
- Same as now: voice primary, text fallback
- Coach chat gets voice-to-text input

## WHAT GETS ARCHIVED (kept in git branch, not deleted)
- Power Ups / weekly challenges (entire nudge system)
- Skill verification quizzes (the 3-question quiz mechanic)
- Dashboard with detailed skill inventory and progress tracking
- Schedule picker / email preferences for Power Ups
- Badges and sharing (except share on results page)
- Manager team view / team analytics
- The whole "ongoing learning platform" layer
- Cron jobs for nudge generation/delivery

## WHAT STAYS (carried forward to new version)
- Voice conversation with Lex (the core product)
- Assessment AI scoring (adapted for 4 levels)
- Results page (redesigned for outcomes, not curriculum)
- One "try this now" action with coach support
- The 4-level framework with 5 skills each
- Privacy page (already updated this session)
- Auth system (register, login, password reset)
- Admin panel (simplified)

## LEX V7 PROMPT — DIRECTIONAL CHANGES

### What Lex knows going in (NEW):
- Approximate level from survey
- Which specific skills they rated high vs. low
- Their name, role title, AI platform

### Conversation flow changes:
- Opening: "I've got a sense of some of the things you're at with AI. Now I want to go directly into your work."
- Phase 1: Work context (similar to V6)
- Phase 2: Connect survey + work. "Survey shows you're strong on X, less on Y. How does that show up in the work you just described?" Plus: "You reported you sometimes do Z — with [their specific work task], is that something you've tried?"
- NEW: Lex stokes curiosity by combining AI skills with work context. Plants seeds for the 3 outcomes.
- Phase 2 includes "where are you stuck?" as one of several natural topics
- Phase 3: Level delivery + outcomes framing (not just level + Power Up)
- Closing: "Hit End Conversation" → results (no sliders)

### What stays the same:
- 3 sentences max per response
- Sharp colleague personality
- Push for specifics, mirror + follow up
- Never say "assessment" or "nudge" — say "conversation" and (TBD new term for outcomes)

## ELEVENLABS SETUP
- Clone the current ElevenLabs agent (keep old one intact)
- New agent gets V7 prompt
- Store new agent ID in DB systemConfig
- Pass survey results as dynamic variables when starting voice session

## ARCHIVE STRATEGY
1. `git tag full-platform-v1` on current main
2. `git branch full-platform-archive` from that tag
3. Continue working on main — strip down and rebuild

## INFRASTRUCTURE STATUS

### Railway
- Was on Limited Trial ($4.29 left) — **Devin upgraded** (confirmed during session)
- Auto-deploys from main branch
- URL: electric-thinking-assessment-production.up.railway.app
- Custom domain: assessment.electricthinking.ai (DNS setup needed — add CNAME in DNS provider pointing to Railway target, update APP_URL env var)

### Claude API
- $163 in credits with auto-reload
- Tier 2 or above (1,000 RPM) — sufficient for 20+ concurrent users
- Each assessment costs ~$0.27
- Model: claude-sonnet-4-20250514

### ElevenLabs
- Current agent works for voice conversations
- Need to clone for V7

## WHAT WAS BUILT/FIXED THIS SESSION (before the pivot)

### Deployed fixes:
1. Coach endpoint 500 error — root cause was missing `coach_conversations` table (schema drift). Fixed by adding explicit CREATE TABLE IF NOT EXISTS to ensureMigrations().
2. Reflection save error — same root cause, missing `challenge_reflections` table. Fixed same way.
3. Static Anthropic SDK import in routes.ts (was dynamic, broke in CJS bundle)
4. Warmup page copy simplified (removed redundant subtitle, tightened cards)
5. Privacy page updated (added ElevenLabs + Resend to third-party services, fixed false "download data" claim)

### Completed but NOT YET deployed (pending build + push):
6. "90 seconds" overpromise fixed in assessment-ai.ts (changed to "~5 minutes")
7. Skill rating UI — sliders open by default, "Looks right, continue" button, subtle skip link
8. Batch UX quick wins across 7 files:
   - Sign-out button: added "Sign out" text label
   - Landing page: removed "AI Skill Discovery" badge, "AI curve" → "with AI", simplified SOC 2 language, "Power Ups" → "Weekly tips matched to your level"
   - Register: "AI fluency journey" → "Create your account to get started"
   - Join: "Paste your invite token" → "Paste the code from your invite email"
   - Onboarding: broadened role placeholder examples
   - Assessment: softened voice guilt-trip dialog, "Lex will build" → "we'll build"
   - Coach: "AI Coach" → "Need help?"
   - Results: removed share buttons and schedule picker

### Research/docs created:
9. Privacy/security brief for Braceability: working-notes/privacy-security-brief.md
10. UX simplification review: working-notes/ux-simplification-review.md
11. Lex V6 prompt properly versioned: working-notes/lex-elevenlabs-prompt-v6.md
12. Product pivot notes: working-notes/product-pivot-march24-2026.md

## PENDING ITEMS / BACKLOG

### Must-do for launch:
- [ ] Archive current version (git tag + branch)
- [ ] Restructure to 4 levels (renumber in DB seed, update all references)
- [ ] Build Part A: self-assessment survey UI
- [ ] Build survey → Lex data pipeline (pass results to ElevenLabs)
- [ ] Write Lex V7 prompt
- [ ] Clone ElevenLabs agent, apply V7 prompt
- [ ] Redesign results page (level ladder, 3 outcomes, try-it-now, collapsed skills, CTA)
- [ ] Strip out archived features from the UI (Power Ups, dashboard complexity, etc.)
- [ ] Update assessment scoring for 4-level framework
- [ ] Add voice-to-text to coach input
- [ ] Custom domain: assessment.electricthinking.ai
- [ ] Delete test accounts before real rollout
- [ ] Deploy and test full flow

### Nice-to-have / later:
- [ ] "None yet" option for AI platform in onboarding
- [ ] StoryBrand review of outcome copy
- [ ] Mobile testing (Taylor Reeves persona ready: test-taylor@electricthinking.ai / Electric123!)
- [ ] Add "Join waitlist for Level [N] cohort" CTA
- [ ] Double voice stream bug (ElevenLabs interruption handling)
- [ ] Google Form reference for survey design: https://docs.google.com/forms/d/e/1FAIpQLSe3dgy4VPJqj_qT2ieq5MYSf8kOyTlVyouwF_0wL8sBZzYNKQ/viewform

## TEST ACCOUNTS
- Convention: test-{firstname}@electricthinking.ai / Electric123!
- Active: test-branden (Level 1 warehouse ops), test-taylor (not yet used)
- Kenny's account: kenny@... (Level 4, used for testing with screenshots)
- Admin: admin@electricthinking.com / ADMIN_PASSWORD env var
- DELETE all test accounts before real rollout

## KEY FILES
- Product pivot: working-notes/product-pivot-march24-2026.md
- Kenny transcript: ~/Downloads/AI Skills Assessment Strategy_otter_ai.txt
- Kenny screenshots: ~/Downloads/Screenshot 2026-03-24 at 11.0*.png (18 files)
- Current Lex prompt: working-notes/lex-elevenlabs-prompt-v6.md
- Privacy brief: working-notes/privacy-security-brief.md
- UX review: working-notes/ux-simplification-review.md
- Session briefings: working-notes/session-briefing-march19/20/21-2026.md
- Devin's product decisions: working-notes/devin-decisions-march19.md
- Memory index: ~/.claude/projects/-Users-devin-ai-lab/memory/MEMORY.md

## MEMORY UPDATES NEEDED
- Update project_app_priorities memory to reflect the pivot
- Save Kenny conversation insights
- Note: Railway upgraded from trial, 4-level framework, assessment-only focus
