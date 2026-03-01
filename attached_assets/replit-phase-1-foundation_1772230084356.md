# Phase 1: Electric Thinking AI Assessment Platform -- Foundation

Build a full-stack web application for an AI-powered fluency assessment and personalized learning platform. This is Phase 1 of 3. This phase builds the core infrastructure, authentication, text-based assessment, results dashboard, and admin panel. Voice integration and advanced visuals come in later phases.

## What This Product Does

Enterprise teams take an AI assessment that evaluates their AI fluency across 5 levels (0-4) and 25 skills. The system places each person at a level, identifies their skill gaps, and shows them a personalized dashboard. Admins manage all content through an admin panel without touching code. This phase builds the assessment as a text conversation (voice comes in Phase 3).

## User Roles

1. **System Admin** -- Full access to admin panel: edit skills, questions, nudge generation prompts, manage all orgs. Multiple people can hold this role (user_role = system_admin).
2. **Org Admin** -- Creates the organization, manages team, has manager dashboard access (user_role = org_admin)
3. **Manager** -- Sees their team's assessment results and skill progression, can pause nudges for individuals (user_role = manager)
4. **Team Member** -- Takes the assessment, receives nudges, tracks their own progress (user_role = member)
5. A person can be both a manager and a team member

## 1. Landing Page

Before signing up, visitors see a public landing page explaining:
- What Electric Thinking Assessment is (one sentence: "Find out where you are on your AI journey, then get a personalized path to level up")
- What the assessment experience is like (conversation, under 10 minutes)
- What happens after (personalized learning nudges, skill progression)
- A "How We Handle Your Data" section: bullet points explaining what's collected and who sees it in plain English
- Two calls to action:
  - "Get Started" -- for anyone. Takes them straight to signup and assessment. No org required. This is the top-of-funnel sales tool: prospects take the assessment, experience the product firsthand, get their level, and THEN get invited to bring their team.
  - "Join Your Team" -- for invited users with an invite link from their org admin

## 2. Sign Up & Organization Setup

- Three auth methods: Google OAuth, Microsoft OAuth (Azure AD), or email + password
- Use NextAuth (or Auth.js) with multiple providers configured
- **Password reset flow**: Email/password users need a "Forgot Password" link on the login screen. Clicking it sends a reset email (via Resend in Phase 2, or NextAuth's built-in email provider for Phase 1) with a secure, time-limited token link. The reset page lets them set a new password. Also build a "Change Password" option in user settings. Without this, any email/password user who forgets their password is permanently locked out.
- First-time flow has THREE paths:
  - "Take My Assessment" -- individual mode, no org. User signs up, takes the assessment, sees their results. They don't get nudges or team features. But they experience the product. After seeing their results, they see a CTA: "Want this for your whole team? Create an organization." This is how the product sells itself.
  - "Create Organization" -- org admin flow
  - "Join Organization" -- via invite link
- Org admin enters: organization name, company size (optional), industry (optional)
- Org admin can invite team members via email -- generates an invite link that goes to the landing page with org context
- **Invite flow edge cases (handle all of these):**
  - Invited user already has an account (e.g., they took the individual assessment): link their existing account to the org. Don't force a new signup. Preserve their assessment data.
  - Invite link is older than 30 days: show "This invite has expired. Contact your admin for a new one." with the admin's email.
  - Invited user is already in a different org: show "You're already part of [Org Name]. Contact support if you need to switch organizations." Multi-org is not supported in v1.
  - Invited user signs up with a different email than the invite was sent to: allow it, but match on the invite token, not the email address. The invite is consumed regardless of which email they sign up with.
  - Duplicate invite to same email: don't send a second email if an active (unexpired, unaccepted) invite exists. Show the admin "Already invited" status.
- Invited users click link, sign in with any auth method, are automatically added to the org
- Org admin can designate other users as managers
- Each user selects their primary AI platform during onboarding: ChatGPT, Microsoft Copilot, Google Gemini, Claude, or Other (with a text field to specify). The platform list is stored in the database and configurable by admin.
- Users can change their platform selection at any time in settings

## 3. Text-Based Assessment (Voice comes in Phase 3)

After onboarding, users enter a text conversation with an AI assessment agent. In Phase 3 this will be upgraded to real-time voice, but for now it's a chat-style interface.

**Pre-Assessment Warm-Up Screen:**
Before the conversation starts, show a brief warm-up screen:
- "Here's what's about to happen. You'll have a conversation with an AI that wants to learn how you work. There are no wrong answers. It takes about 10 minutes. Just talk naturally."
- **Manager visibility consent**: "Your manager can see your skill levels and progress over time. They cannot see this conversation or your specific answers. Your responses are private."
- One button: "I'm Ready"
- This screen reduces anxiety (especially for Level 0 people who may have never talked to an AI) and sets expectations. Without it, the first 2 minutes of every assessment are wasted on the user figuring out what's happening.

**Assessment Logic:**
- The AI uses a bank of 27 validated assessment questions as its scoring backbone (stored in the database as configurable data)
- It does NOT ask all 27 questions robotically. It conducts a natural conversation and adapts based on responses
- It starts with calibration questions to quickly gauge approximate level
- Key adaptive behavior: if someone clearly demonstrates Level 2+ thinking early, the AI does NOT skip Level 0/1 entirely. Instead, it shows a checklist of lower-level skills and says something like: "You're clearly advanced. Just glance through these foundational skills and tell me if any are actually new to you." This catches gaps without wasting time.
- If someone has barely used AI, the conversation is short and supportive (under 5 minutes). Encouraging, not judgmental.
- For advanced users, it probes deeper with scenario-based questions about their actual workflows (10-15 minutes)
- The AI's personality: curious, warm, genuinely interested in how the person works. Like talking to a smart colleague who's fascinated by your job. Not clinical. Not robotic. Occasional humor is fine.
- **Insight reframes**: The AI should look for moments to help the user "trip over the truth" about their own skills. When someone describes behaviors that map to specific skills without realizing it, the AI reframes: "You just described three Level 1 skills without even realizing it. You're further along than you think." Aim for at least one reframe moment per conversation.
- **Deep context collection**: The assessment isn't just measuring AI fluency. It's building a rich profile of WHO this person is so that nudges feel like they were written by someone who actually knows them. The AI should actively explore:
  - Their job title and what they actually DO day-to-day (not just the title -- the real work)
  - Their recurring weekly tasks (the stuff that fills their calendar)
  - What they care about most in their role (what makes them proud, what keeps them up at night)
  - Their communication style and preferences
  - What frustrates them about their current workflow
  - What excites them about AI (or scares them)
  - Specific examples of tasks they've described -- store these verbatim, they're gold for nudge personalization
  - Their team dynamics (do they work solo? collaborate heavily? manage others?)
  All of this goes into the context_summary field and directly powers how personal the nudges feel.
- Auto-save assessment progress so if connection drops, the user can resume
- **Concurrent assessment prevention**: Before starting a new assessment, check for an existing assessment with status = 'in_progress' for that user. If one exists, resume it instead of creating a new one. One active assessment per user at a time. This prevents the two-tabs problem (someone opens the assessment on their phone and laptop simultaneously, creating two conflicting records).

**Conversation Ending:**
- The AI controls when the conversation wraps up. After it has enough signal to score all relevant skills, it says something like: "I think I have a really good picture of where you are. Ready to see your results?"
- The user can also end early via an "End Conversation" button (always visible but not prominent). If they end early, the AI scores whatever it has and marks unassessed skills as Red with a note: "Not enough information to assess."
- If a user closes the browser or loses connection and doesn't return within 24 hours, send an **abandoned assessment email**: "You started your AI fluency assessment but didn't finish. It only takes a few more minutes. Pick up where you left off." Direct link to the resume flow. Without this, partial assessments become dead weight.

**Use the Anthropic Claude API (Opus model)** for running the conversation. Send the conversation history with each turn.

**Assessment Conversation Guide** (stored in the admin panel, NOT hardcoded):
- Just like the Nudge Voice Guide, the assessment needs a configurable master system prompt stored in the database and editable in the admin panel. Call it the "Assessment Conversation Guide."
- This prompt contains: the AI personality instructions, the 27 questions as reference, the skill definitions, the adaptive behavior rules (when to probe deeper, when to show the checklist, when to do insight reframes), the context collection instructions, and any conversation flow notes.
- This is the BRAIN of the assessment. It needs to be tunable without code changes. Store it in the system_config table with key = 'assessment_conversation_guide'.
- Build a dedicated editing section in the admin panel for this, with a large text area and a "Preview/Test" button that lets the admin start a test conversation with the current prompt.

**Assessment Framework -- 5 Levels, 5 Skills Each:**

Level 0 -- Foundations:
- Tool Access & Activation (have you actually opened and used an AI tool?)
- First Real Conversation (have you had a back-and-forth, not just a one-shot query?)
- Output Judgment (can you tell when AI output is good vs. bad?)
- Use Case Recognition (can you identify where AI could help in your work?)
- Willingness to Iterate (do you try again when the first response isn't right?)

Level 1 -- Accelerator:
- Context Setting (briefing AI with role, task, and relevant inputs)
- Quick Drafting (using AI for first drafts of written content)
- Output Editing & Direction (redirecting AI output -- tone, structure, specificity)
- Voice-First Capture (using voice to externalize thinking, capture recaps, dictate drafts)
- In-the-Moment Support (reflexively reaching for AI when you hit friction)

Level 2 -- Thought Partner:
- Interview Me (letting AI lead with questions to surface your assumptions)
- Rapid Ideation (generating multiple options before committing to one)
- Challenge Me (asking AI to find holes, counterarguments, blind spots in your thinking)
- Decision Mapping (structuring trade-offs, running scenarios, applying frameworks)
- Operationalize This (converting strategy into concrete execution plans)

Level 3 -- Specialized Teammates:
- Pattern Spotting (recognizing when a repeating task should become a reusable tool)
- Workflow Scoping (breaking a task into inputs, steps, and expected outputs)
- Instruction Design (writing system prompts that produce consistent, reliable output)
- Testing & Refinement (testing tools with real inputs and iterating through edge cases)
- Knowledge Embedding (curating and attaching reference docs so AI has domain context)

Level 4 -- Agentic Workflow:
- Systems Mapping (designing end-to-end flows, not just individual tasks)
- Automation Design (building workflows where AI handles steps without you)
- Independent Judgment (knowing which steps require human decision-making)
- Cross-Workflow Integration (connecting multiple AI-powered processes together)
- Continuous Improvement (monitoring, measuring, and refining automated systems)

The framework MUST support adding future levels (5, 6, etc.) without code changes. Levels and skills are database records with a sort_order field.

**Scoring:**
- After the conversation ends, the full transcript is analyzed by Claude (Opus model) with the scoring rubric
- Each skill gets a score: Red (not demonstrated), Yellow (emerging/partial), Green (demonstrated)
- Level placement logic: The user's "assessment level" is the highest level where they have 3+ Green skills. Their "active level" (where they start working) is the lowest level where they have any non-Green skills. Example: someone tests at Level 2 but has two Red skills in Level 1. They're told "You're a Level 2 Thought Partner" (identity framing) but their first active skills are those two Level 1 gaps. They must Green all skills at lower levels before advancing.
- **Scoring transparency**: For each skill, generate a one-sentence explanation of WHY it got Red, Yellow, or Green. Examples: "You described evaluating and editing AI output regularly -- that's Output Judgment in action." (Green) or "We didn't hear you describe using AI for first drafts of written content." (Red). Store these in the scores_json alongside the Red/Yellow/Green status. Display them on the dashboard when a user taps/clicks a skill. This makes scoring feel fair, not arbitrary, and gives users a clear starting point.
- A "user context summary" is also generated and stored: their role, work description, AI platform, specific examples mentioned, communication style, excitements, frustrations.

## 4. Results Dashboard (Individual) -- "The Reveal"

The assessment result reveal is designed as a MOMENT, not just a data display:

**Scoring Loading Experience (critical -- this takes 30-60 seconds):**
Opus scoring a full transcript is not instant. The user will wait 30-60 seconds. Do NOT show a generic spinner. Design this as an unfolding experience:
- Phase 1 (0-10s): "Reading your conversation..." with a subtle animation
- Phase 2 (10-25s): "Evaluating your thinking patterns..." -- optionally show skills being "scanned" one by one with a progress bar moving through levels
- Phase 3 (25-45s): "Building your skill profile..." -- the skill map skeleton starts appearing, nodes dimmed
- Phase 4 (45s+): "Almost there..." -- if scoring takes longer than expected
- When results arrive, transition smoothly into the reveal (don't jump-cut from loading to results)
- If scoring fails or takes over 90 seconds: "Your results are taking a bit longer than usual. We'll email you as soon as they're ready." Queue for retry. Don't leave them waiting.

**The Reveal:**
- The user's level appears with visual ceremony (not just a number on screen)
- Identity framing: "You're a Level 2 Thought Partner" (not "You scored Level 2")
- If they have gaps in lower levels: "Before we dive into Thought Partner skills, let's quickly shore up a couple of Accelerator skills you haven't locked in yet."

**Immediate Post-Assessment Action (don't let the energy die):**
Right after the reveal, before the user leaves the results page, show a "Your First Move" card:
- Highlights their first active skill (the Yellow one)
- Gives one concrete thing they can try right now, in the next 5 minutes. This isn't a full nudge (those come in Phase 2). It's a brief, actionable prompt generated as part of the scoring response: "Your first skill to work on is Context Setting. Next time you open ChatGPT, try starting with: who you are, what you're working on, and what kind of output you need. See how the response changes."
- This bridges the gap between the exciting assessment reveal and the first weekly nudge (which could be days away). Without this, all the momentum from the reveal dies in silence.

The dashboard shows:
- A skill progression view showing each level and its 5 skills. (In Phase 3 this becomes an RPG-style map. For now, build it as a clean, visual card/grid layout with clear level sections.)
  - Completed skills glow/highlighted as Green
  - Current active skill is highlighted/pulsing as Yellow
  - Future skills in current level are visible but dimmed
  - Next level is partially visible (teaser)
  - Levels beyond the next are locked/greyed out, revealed as you progress
  - Each level has its own visual identity using the brand color palette
- Skill-by-skill breakdown: Red (not yet started), Yellow (in progress/current focus), Green (completed and verified)
- Progress framing: always emphasize distance traveled, not remaining work. Show "4 of 5 skills complete" not "1 skill remaining." Progress bars fill from the left. Milestone markers celebrate what's behind them.
- The "active skill" is highlighted -- this is what nudges will target
- A "My Learning" section (placeholder for now -- nudges come in Phase 2)
- Notification preferences: users can choose nudge delivery day, pause nudges temporarily, resume anytime. Build the preferences UI now with just nudge day and pause/resume. Phase 2 adds granular email type controls (learning nudges, progress celebrations, assessment reminders as separate toggles, plus a "Turn off all emails" option for CAN-SPAM compliance).
- Option to re-take the assessment (available after 90 days, or manually unlocked by a manager/admin)
- **Re-assessment policy**: Re-assessment can only UPGRADE, never downgrade. Green skills are permanent -- you earned them through verification. A re-assessment can reveal new skills you've developed and raise your assessment level, but it cannot take away completed skills or lower your level. The new assessment supplements the existing profile, it doesn't replace it. Update the context_summary with any new information from the conversation.
- User settings page: change AI platform, update profile, notification preferences, request data deletion, **download my data** (generates a ZIP with assessment transcript, scores with explanations, context summary, nudge history, skill timeline -- GDPR data portability compliance)

## 5. Admin Panel (System Admin Only)

A dedicated admin interface for system administrators to manage all content without touching code. Multiple users can hold the system_admin role.

- **Skills Manager:** Add, edit, reorder, or deactivate skills. Add new levels (5, 6, etc.). Edit skill names, descriptions, and sort order. **Skill change safeguards**: Renaming a skill updates everywhere (it's a database record). Adding a new skill to an existing level: the new skill shows as Red for users who already completed that level, and their level-up status is recalculated. Deactivating a skill (soft delete, never hard delete if user_skill_status records exist): mark it inactive so it stops appearing for new users, but existing Green records are preserved. Show a warning: "X users have progress on this skill. Deactivating it will preserve their records but remove it from active progression."
- **Assessment Questions:** Add, edit, or remove assessment questions. Assign them to skills. Edit scoring logic. (Seed with placeholder questions -- real questions will be entered manually after build.)
- **Nudge Voice Guide:** A text area to edit the master system prompt that controls how nudges are generated. (Nudge generation comes in Phase 2, but build the storage and editing UI now.)
- **Platform List:** Add or remove AI platform options.
- **Organizations:** View all orgs, user counts, assessment completion rates. **User removal from org**: "Remove from Organization" button sets org_id = null (reverts user to individual mode), preserves their assessment and skill data, removes them from the manager's dashboard. Distinct from "Delete Account" which fully removes all data. When an admin removes someone, their data stays in analytics (anonymized) unless explicitly deleted.
- **Data Management Tools (for testing and support):**
  - "Delete Assessment" -- removes an assessment record and resets that user's skill statuses to pre-assessment state. Confirmation dialog required.
  - "Reset User Progress" -- clears all skill statuses, badges, and nudge history for a user while keeping their account. For when Devin/Kenny/Katrina are testing.
  - "Delete Test User" -- fully removes a user and all associated data (assessment, skills, nudges, badges, activity feed). Nuclear option with double confirmation.
  - These are critical for the testing phase. Without them, the database fills with test garbage that pollutes analytics and demos.
- **Assessment Transcript Review:** For each completed assessment, the admin can view: the full conversation transcript, the per-skill scores with the one-sentence explanations, the generated context summary, and a flag/override option per skill (change a Red to Yellow, etc.). This is your quality assurance loop. Before trusting Opus scoring at scale, you need to be able to spot-check that the AI is scoring accurately. Show these in a list view sorted by most recent, with filters for org and level.
- **Analytics Dashboard:**
  - What level do most people assess at?
  - Assessment completion rate
  - (More analytics come in Phase 2 when nudges/skills are active)
- **Email Templates:** Placeholder for Phase 2. Build the admin UI with a "coming soon" state.
- **Live Sessions:** Placeholder for Phase 3. Build the admin UI with a "coming soon" state.

## 6. Privacy & Data Handling

Build these as actual pages within the app:

**Terms of Service page** (/terms): Standard SaaS terms. Include a "last updated" date. Users must accept during signup.

**Privacy Policy page** (/privacy): Plain-language explanation of:
- What data is collected: assessment transcript, skill scores, role/context info, email address, AI platform preference
- How it's stored: encrypted PostgreSQL database hosted on Replit's infrastructure (which is independently SOC 2 Type II certified). Data encrypted at rest and in transit.
- Who can see what: Users see their own data. Managers see skill scores and levels, NOT transcripts. System admin sees aggregate analytics and can access individual data for support.
- What it's used for: personalized learning content only. No advertising, no profiling, no selling.
- Third-party services: Anthropic (AI analysis). Additional services (ElevenLabs, Resend) noted for future phases.
- Data retention: retained while account active, deleted within 30 days of deletion request.
- Enterprise note: "Hosted on independently SOC 2 Type II certified infrastructure with data encrypted at rest and in transit."

**Data deletion**: Users can request full data deletion through settings. One-click request, confirmation email sent.

**Manager visibility boundary**: Managers see skill scores, levels, and progression timelines. They do NOT see assessment transcripts, user context summaries, or nudge content. Hard line.

## Technical Architecture

- **Multi-tenant architecture**: Each organization is fully isolated. Users belong to one org. Data never leaks between orgs.
- **Authentication**: Google OAuth, Microsoft OAuth (Azure AD), and email + password via NextAuth/Auth.js
- **Database**: PostgreSQL. All data stored relationally.
- **All content is configurable data in the database**: skills, levels, assessment questions, scoring rubrics, nudge voice guide, platform list. Nothing is hardcoded.
- **Anthropic Claude API**: Claude Opus for the assessment conversation and transcript scoring.
- **Long transcript safeguard**: A chatty Level 3/4 user in a 15-minute conversation generates a very long transcript. When sending transcript + scoring rubric + 25 skill definitions to Opus for scoring, this can approach context limits. Safeguards: (a) instruct the assessment AI to keep its own responses concise (don't let the AI write paragraphs when a sentence will do), (b) if the transcript exceeds 15,000 tokens, summarize earlier portions before sending to the scoring prompt, (c) set a soft cap in the Assessment Conversation Guide: after 20 minutes or 30 exchanges, the AI should start wrapping up regardless of signal quality.
- **REST API layer**: All admin panel operations and data mutations go through a proper REST API (not just server-side form actions). This enables future programmatic access via external tools.
- **Modern React frontend** with a polished, engaging UI. Not corporate or boring. Professional but with personality.
- **Responsive design**: Works on desktop and mobile.
- **Accessibility**: Screen reader support, keyboard navigation, sufficient color contrast ratios.
- **Branded error pages**: 404 (page not found), 500 (server error), and 403 (no permission) pages should use the Electric Thinking design system: ET wordmark, friendly message ("This page doesn't exist" / "Something went wrong" / "You don't have access to this"), and a "Go Home" button. Never show a raw framework error page.

**Loading States (design these for every AI-powered feature):**
Every Claude API call has latency. Each needs a designed loading state that tells the user what's happening:
- Assessment chat (each turn): typing indicator with subtle animation, like the AI is thinking. "..." dots or a pulsing indicator. Should appear within 200ms of the user sending a message.
- Assessment scoring: the full reveal experience described above (30-60 second designed sequence)
- Dashboard data: skeleton screens (grey placeholder shapes matching the layout) while data loads
- Verification question generation: "Preparing your questions..." with a brief animation (2-5 seconds)
- Any admin panel data load: skeleton screens or subtle loading bars, never blank flashes
- Rule: if something takes more than 300ms, show a loading state. If it takes more than 5 seconds, show a progress message. If it takes more than 30 seconds, show a progress message with a "this is taking longer than usual" fallback. Never a dead spinner.

**Empty States (design these, don't leave blank pages):**
- Dashboard before assessment: "You haven't taken your assessment yet. Ready to find out your AI fluency level?" with a prominent "Start Assessment" button. Show a preview/teaser of what the dashboard will look like.
- Manager dashboard with no team members: "Your team hasn't taken the assessment yet. Send them an invite to get started." with the invite flow.
- Manager dashboard with 1 of 20 completed: Show the one person's data clearly, with a "Waiting for X more team members" indicator.
- My Learning feed with no nudges: "Your first nudge arrives on [day]. Here's what to expect..." with a preview of what a nudge looks like.
- Every empty state should have a clear message explaining what's missing and a call to action to fix it. No blank pages.

**API Failure Handling:**
- Assessment conversation: if Claude API doesn't respond within 15 seconds, show a friendly error: "Our AI is taking a moment. We've saved your progress -- you can pick up right where you left off." Auto-save the transcript so far. Offer a "Try Again" button and a "We'll email you when it's back" option.
- Assessment scoring: if scoring fails after the conversation, queue it for retry. Show the user a "Your results are being calculated -- we'll notify you when they're ready" message instead of an error.
- All API calls should have timeouts, retry logic (max 2 retries with exponential backoff), and graceful fallback states.

**Rate Limiting:**
- Assessment attempts: 1 per user per 90 days (unless manually unlocked by admin). Prevent accidental or intentional re-takes.
- Verification attempts: max 5 per skill per day. Prevents brute-forcing the quiz.
- API cost protection: if any single cron batch exceeds a configurable cost threshold (stored in system_config), pause the batch and email the system admin.

**Bulk User Import:**
- In the org admin invite flow, add a "Bulk Import" option: upload a CSV with columns (email, name, role_title). System sends invite emails to all. This makes enterprise rollouts (20-200 people) painless.

**Environment variables needed:**
- ANTHROPIC_API_KEY
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- MICROSOFT_CLIENT_ID
- MICROSOFT_CLIENT_SECRET
- DATABASE_URL
- NEXTAUTH_SECRET

(ELEVENLABS_API_KEY and RESEND_API_KEY come in later phases. Create the env var slots but they're not needed yet.)

## Database Schema (Build ALL tables now, even if some are used in later phases)

- **organizations**: id, name, industry, size, settings_json (jsonb -- org-level customization: default_nudge_day, social_proof_anonymized boolean, custom_welcome_message text, assessment_framing varchar 'optional'/'expected'), created_at
- **users**: id, org_id (FK, NULLABLE -- null for individual/free users who haven't joined an org yet), email, name, role_title, ai_platform, user_role (system_admin/org_admin/manager/member), nudges_active (boolean default true), nudge_day (varchar default 'Monday'), timezone (varchar default 'America/Los_Angeles'), created_at
- **assessments**: id, user_id, transcript (full text), context_summary (text), assessment_level (integer 0-4), active_level (integer 0-4), scores_json (jsonb, per-skill Red/Yellow/Green), first_move_json (jsonb, the immediate post-assessment action), status (varchar: in_progress/completed/abandoned, default 'in_progress'), started_at (timestamp), completed_at (timestamp nullable)
- **levels**: id, name (varchar), display_name (varchar, e.g. "Thought Partner"), sort_order (integer), description (text), visual_theme (varchar)
- **skills**: id, level_id (FK), name (varchar), description (text), sort_order (integer)
- **assessment_questions**: id, skill_id (FK), question_text (text), question_type (varchar: scenario/frequency/binary/multiselect), scoring_logic_json (jsonb), sort_order (integer)
- **user_skill_status**: id, user_id (FK), skill_id (FK), status (varchar: red/yellow/green), completed_at (timestamp nullable), streak_count (integer default 0)
- **nudges**: id, user_id (FK), skill_id (FK), content_json (jsonb), email_sent (boolean default false), email_opened (boolean default false), in_app_read (boolean default false), sent_at (timestamp), created_at
- **nudge_voice_guide**: id, prompt_text (text), updated_at
- **verification_attempts**: id, user_id (FK), skill_id (FK), questions_json (jsonb), answers_json (jsonb), passed (boolean), attempted_at (timestamp)
- **badges**: id, user_id (FK), badge_type (varchar: skill_complete/level_up/streak), badge_data_json (jsonb), earned_at (timestamp)
- **invites**: id, org_id (FK), email (varchar), invited_by (FK to users), accepted (boolean default false), expires_at (timestamp, default 30 days from created_at), created_at
- **live_sessions**: id, level_id (FK), title (varchar), session_date (timestamp), join_link (varchar), recording_link (varchar), created_at
- **ai_platforms**: id, name (varchar), display_name (varchar), is_active (boolean default true), sort_order (integer)
- **system_config**: key (varchar primary key), value (text)
- **activity_feed**: id, org_id (FK), user_id (FK), event_type (varchar: skill_complete/level_up/streak), event_data_json (jsonb), created_at

**Database Indexes (add these in the schema definition, not as afterthought migrations):**
- `users(email)` -- unique, for login lookups
- `users(org_id)` -- for team queries
- `assessments(user_id, status)` -- for finding active/completed assessments
- `user_skill_status(user_id, skill_id)` -- unique composite, for skill lookups
- `user_skill_status(skill_id, status)` -- for social proof queries ("X% of your team completed this")
- `nudges(user_id, skill_id)` -- for nudge history and repetition prevention
- `activity_feed(org_id, created_at)` -- for team activity feed queries
- `invites(email, org_id)` -- for duplicate invite checks
- `invites(org_id, accepted)` -- for pending invite counts

**Seed data on first run:**
- Create the 5 levels (0-4) with names: Foundations, Accelerator, Thought Partner, Specialized Teammates, Agentic Workflow
- Create all 25 skills with descriptions from the framework above
- Create default AI platforms: ChatGPT, Microsoft Copilot, Google Gemini, Claude, Other
- Create a default nudge_voice_guide record with placeholder text
- Create a default system_admin user (email configurable via env var or first signup)

## Brand & Visual Design

Use these brand values as CSS custom properties throughout the app. Every color, font, and visual decision should reference these variables.

**Typography:**
- Headings: `Tomorrow` (Bold) -- import from Google Fonts
- Body: `Source Sans 3` (Regular/Semibold) -- import from Google Fonts
- Text color: #2B2B2B (Charcoal)

**Color Palette:**
```css
:root {
  --et-pink: #FF2F86;
  --et-orange: #FF6A2B;
  --et-gold: #FFD236;
  --et-cyan: #2DD6FF;
  --et-blue: #1C4BFF;
  --et-page-bg: #F0E4CE;
  --et-card-bg: #FFF8F0;
  --et-charcoal: #2B2B2B;
  --et-white: #FFFFFF;
  --et-border: #E5E0DF;
  --et-red: #E53E3E;
  --et-yellow: #ECC94B;
  --et-green: #38A169;
}
```

**Wordmark (temporary logo):**
- Text: "ELECTRIC THINKING" in Tomorrow Bold, single line
- "ELECTRIC" in #FF2F86 (magenta), "THINKING" in #2B2B2B (charcoal)

**Buttons:**
- Primary: background #FF2F86, text #FFFFFF, border-radius 16px, no border, generous padding. Hover: darken ~8%. Disabled: 40% opacity.
- Secondary: background transparent, border 2px solid #FF2F86, text #FF2F86, border-radius 16px. Hover: light magenta tint.

**Links:** Color #1C4BFF (blue), underlined. No magenta links in body copy.

**Form Inputs:** Background #FFF8F0, border 1px solid #E5E0DF, border-radius 12px. Focus: border #1C4BFF. Error: border #FF6A2B.

**Cards:** Background #FFF8F0, border-radius 16px, border 1px solid #E5E0DF, medium subtle shadow, solid.

**Icons:** Line icons, medium stroke (Feather or Phosphor). Default #2B2B2B, active #FF2F86. No filled cartoon icons.

**Errors & Warnings:** Use #FF6A2B (orange) for all errors/warnings. No new red tones.

**Page background:** #F0E4CE (warm beige). This is the signature look. Don't default to white. Cards sit on warm cream (#FFF8F0) against the beige page.

**Spacing:** Consistent vertical rhythm, generous white space, readability over density.

**App feel:** Clean, structured, neutral foundation. Color appears through buttons, links, headers, active states. Not constantly. Think Duolingo's playfulness meets Linear's polish. Tech-forward but human.
