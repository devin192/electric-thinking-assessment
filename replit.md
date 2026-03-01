# Electric Thinking - AI Fluency Assessment Platform

## Overview
Full-stack AI-powered fluency assessment and personalized learning platform. Users take a conversational assessment with Claude AI that evaluates their AI fluency across 5 levels (0-4) and 25 skills, then receive personalized dashboards, weekly AI-generated learning nudges via email, skill verification quizzes, and managers can view team progress.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui (wouter for routing, TanStack Query for data fetching)
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Anthropic Claude API for assessment conversations, scoring, nudge generation, verification questions
- **Email**: Resend (via Replit integration connector) for nudge delivery, welcome emails, progress notifications
- **Scheduling**: node-cron for weekly nudge generation/delivery, daily re-engagement checks, quarterly re-assessment reminders
- **Auth**: Session-based with express-session + bcryptjs (email/password)

## Project Structure
```
client/src/
  App.tsx          - Main router with all routes
  lib/auth.tsx     - Auth context provider (login, register, logout)
  lib/queryClient.ts - TanStack Query config
  components/
    wordmark.tsx   - Electric Thinking logo component
    ui/            - shadcn components
  pages/
    landing.tsx    - Public landing page
    auth.tsx       - Login & Register pages
    onboarding.tsx - New user onboarding (role, AI platform)
    assessment-warmup.tsx - Pre-assessment info screen
    assessment.tsx - AI conversation chat interface
    results.tsx    - Assessment results reveal page
    dashboard.tsx  - User dashboard with skill map, nudges, verification quiz, badges
    settings.tsx   - User settings (profile, notifications, email preferences)
    admin.tsx      - System admin panel (8 tabs: analytics, users, skills, questions, assessments, nudges, system health, config)
    manager.tsx    - Manager dashboard (team overview, members, gaps, activity feed)
    unsubscribe.tsx - Public email preference management page
    privacy.tsx    - Privacy policy page
    terms.tsx      - Terms of service page
    join.tsx       - Team invite acceptance page
    not-found.tsx  - 404 page

server/
  index.ts         - Express server setup
  routes.ts        - All API routes (auth, assessment, admin, manager, nudges, verification, webhooks)
  storage.ts       - Database storage layer (IStorage interface with 40+ methods)
  db.ts            - Drizzle/pg connection
  auth.ts          - Auth middleware (sessions, password hashing, requireAuth, requireAdmin)
  seed.ts          - Database seeding (levels, skills, platforms, admin user)
  assessment-ai.ts - Claude API for assessment conversations & scoring
  nudge-ai.ts      - Claude API for nudge generation & verification question generation
  email.ts         - Email templates & sending via Resend (9 email types)
  resend-client.ts - Resend client with Replit connector auth
  cron.ts          - Scheduled jobs (nudge generation, delivery, re-engagement, abandoned assessment)

shared/
  schema.ts        - All Drizzle table schemas and Zod validation schemas
```

## Database Tables
organizations, users, assessments, levels, skills, assessment_questions, user_skill_status, nudges, nudge_voice_guide, verification_attempts, badges, invites, live_sessions, ai_platforms, system_config, activity_feed, email_logs

## Key Features

### Phase 1 (Complete)
- Email/password authentication with session management
- Public landing page with product info
- User onboarding (role title, AI platform selection)
- AI-powered assessment conversation (Claude API)
- Scoring with per-skill Red/Yellow/Green status and explanations
- Cinematic results reveal: phased animation sequence (loading → skill map build → count-up → level reveal → signature skill → bright spots → future self → first challenge → team snapshot → journey setup → shareable card), framer-motion particles/pulse rings/spring animations, count-up numbers, LinkedIn/Slack share buttons, commitment level picker, timeout cleanup on skip/unmount
- Dashboard with skill progression map
- Admin panel: analytics, user management, skills editor, questions manager, config editor
- Privacy/Terms pages, team invites via token

### Phase 3 (In Progress)
- PWA support: manifest.json, service worker (sw.js), offline-capable
- Voice assessment via ElevenLabs Conversational AI (WebSocket full-duplex, voice-to-text fallback, text-only default with voice opt-in)
- RPG-style progression map (interactive SVG with skill nodes, winding path, fog-of-war for locked levels)
- Enhanced celebrations: canvas-confetti on skill verification, level-up ceremony with glow animation
- Shareable badges: SVG generation (/api/badge/:id), Open Graph share pages (/api/badge/:id/share), LinkedIn sharing, clipboard copy
- Live sessions: admin CRUD for scheduled sessions, user dashboard card with upcoming/past sessions, .ics calendar download
- Voice waveform CSS animations (speaking/listening states, reduced-motion support)

### Phase 2 (Complete)
- AI-generated weekly learning nudges (personalized to user role, skill, AI platform)
- Nudge email delivery via Resend with brand-styled HTML templates
- Skill verification quiz (3 AI-generated multiple-choice questions per skill)
- Skill completion flow: verify → green → next skill → yellow; level-up detection with celebration
- Badge system (skill_complete, level_up badges)
- Activity feed (org-wide skill completions and level-ups)
- Manager dashboard (team overview, individual skill profiles, team gaps, nudge control, CSV export)
- Email preferences (3 toggles: nudges, progress, reminders) with public unsubscribe page
- Resend webhook handling (bounce/complaint/open tracking)
- Scheduled jobs: weekly nudge gen (Sunday), delivery (Monday), daily re-engagement, quarterly re-assessment
- Admin nudge management (manual generate/deliver), system health monitoring, email logs
- Re-engagement emails (3+ weeks inactive), abandoned assessment reminders (24h)
- Manager onboarding emails (3-part series)
- Cost protection: configurable nudge_cost_threshold in system_config

## Brand Design
- Fonts: Tomorrow (headings), Source Sans 3 (body)
- Primary: #FF2F86 (Electric Pink)
- Page bg: warm beige (#F0E4CE), Cards: cream (#FFF8F0)
- Level colors: 0=cyan (#2DD6FF), 1=gold (#FFD236), 2=pink (#FF2F86), 3=orange (#FF6A2B), 4=blue (#1C4BFF)
- Rounded 2xl buttons, 16px card radius

## Additional Files (Phase 3)
```
client/src/
  components/
    rpg-map.tsx     - Interactive SVG RPG progression map
  pages/
    assessment-warmup.tsx - Pre-assessment with voice info

server/
  badge-svg.ts     - SVG badge image generator (4 badge types)
  elevenlabs.ts    - ElevenLabs Conversational AI integration

client/public/
  manifest.json    - PWA manifest
  sw.js           - Service worker
```

## Environment Variables
- DATABASE_URL - PostgreSQL connection
- SESSION_SECRET - Express session secret
- ANTHROPIC_API_KEY - Claude API for assessment, nudges, verification
- ELEVENLABS_API_KEY - ElevenLabs voice assessment
- Resend API key via Replit integration connector (conn_resend_01KJGQ6KKVGJS2B2C446MENXXD)

## Email Config
- FROM: hello@electricthinking.ai (configurable via system_config email_from)
- Reply-to: support@electricthinking.ai (configurable via system_config email_reply_to)

## Default Admin
- Email: admin@electricthinking.com
- Password: admin123
- Role: system_admin

## Key Policies
- Re-assessment: only upgrades, never downgrades; green skills are permanent
- Manager visibility: skill scores/levels only, NOT transcripts or context summaries
- Social proof: only show benchmark data when 10+ users completed that skill
- Nudge pause: auto-pause after 6 consecutive unopened nudges
