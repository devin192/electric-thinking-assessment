# CLAUDE.md - Electric Thinking Assessment Platform

## Architecture

### Tech Stack
- **Client**: React 18 + Vite 7 + TypeScript, wouter routing, TanStack React Query, Tailwind CSS 3, shadcn/ui, Framer Motion
- **Server**: Express 5 (Node.js), TypeScript, esbuild for production bundling
- **Database**: PostgreSQL via Drizzle ORM (drizzle-kit for schema management)
- **Auth**: express-session + connect-pg-simple (session store in Postgres) + bcryptjs. No OAuth.
- **AI**: Anthropic Claude SDK (claude-sonnet-4-20250514 for scoring, nudge gen, verification questions)
- **Voice**: ElevenLabs Conversational AI (WebSocket, client-side audio handling)
- **Email**: Resend (direct API key via RESEND_API_KEY env var)
- **Scheduling**: node-cron (nudge generation 2am, delivery 3pm, daily checks 10am, quarterly re-assessment)

### Directory Structure
```
client/src/
  pages/          # 15 page components (landing, auth, onboarding, assessment, results, dashboard, admin, manager, settings, etc.)
  components/     # rpg-map.tsx, challenge-coach.tsx, wordmark.tsx, ui/ (shadcn primitives)
  lib/            # auth.tsx (context), queryClient.ts, audio-context.ts, animations.ts, utils.ts
  hooks/          # use-mobile.tsx, use-toast.ts
server/
  routes.ts       # All API routes (~1750 lines, single file)
  storage.ts      # DatabaseStorage class (all DB operations)
  assessment-ai.ts # Claude API for assessment chat + scoring
  nudge-ai.ts     # Claude API for nudge/challenge generation + verification questions
  elevenlabs.ts   # ElevenLabs signed URL fetching
  email.ts        # 9 email templates (raw HTML, not React Email)
  cron.ts         # 4 scheduled jobs
  auth.ts         # Session setup, password hashing, requireAuth/requireAdmin middleware
  seed.ts         # DB seeding (levels, skills, platforms, admin user, default prompts)
  badge-svg.ts    # SVG badge generation
  db.ts           # pg Pool + Drizzle connection
  resend-client.ts # Resend API client
shared/
  schema.ts       # Drizzle schema (15 tables), Zod validators, TypeScript types
```

### Assessment Data Flow
1. User starts assessment at `/assessment/warmup` (picks voice or text mode)
2. Voice mode: ElevenLabs WebSocket handles conversation. Text mode: messages go through `POST /api/assessment/:id/message` to Claude
3. On completion: `POST /api/assessment/:id/complete` sends transcript to `scoreAssessment()` in assessment-ai.ts
4. Claude returns: per-skill scores (red/yellow/green), assessmentLevel (0-4), activeLevel, contextSummary, firstMove, signatureSkill, brightSpots, futureSelf
5. Server saves scores to `assessments` table, creates `userSkillStatus` rows, fires off first challenge generation (async)
6. Client loads `/results` page, fetches `GET /api/assessment/latest`, renders cinematic multi-phase reveal
7. User lands on `/dashboard` for ongoing skill progression, challenges, verification quizzes

## Deployment
- Railway auto-deploys from `main` branch
- `npm run start` runs `drizzle-kit push --force` then `node dist/index.cjs`
- No staging environment. `main` = production.
- Live URL: electric-thinking-assessment-production.up.railway.app
- Build output: `dist/index.cjs` (server, esbuild CJS bundle) + `dist/public/` (client, Vite)

## External Services
- **ElevenLabs**: Voice assessment agent. Agent ID + prompt configured in ElevenLabs dashboard. Agent ID stored in DB `systemConfig` key `elevenlabs_agent_id`. Server only fetches signed WebSocket URLs.
- **Claude API** (ANTHROPIC_API_KEY): Scoring, nudge generation, verification question generation, embedded coach chat
- **Resend** (RESEND_API_KEY): Email delivery for nudges, welcome, skill-complete, level-up, re-engagement, invites

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `ANTHROPIC_API_KEY` - Claude API
- `ELEVENLABS_API_KEY` - ElevenLabs voice
- `RESEND_API_KEY` - Resend email
- `SESSION_SECRET` - Express session secret (defaults to hardcoded fallback)
- `APP_URL` - Base URL for email links (defaults to localhost:5000)
- `PORT` - Server port (defaults to 5000)

System config in DB (not env vars): `elevenlabs_agent_id`, `assessment_conversation_guide`, `max_nudge_cost_daily`

## Quality Gates

After any change, verify based on scope:
- **Small** (1-2 files, simple edits): `npm run build`, push
- **Medium** (3-5 files, new logic): `npm run build` + one focused audit on changed area
- **Large** (6+ files, new DB schema, new API routes, page rewrites): run quality-patrol skill OR launch multi-agent audit covering: results page data flow, dashboard, server routes/storage, AI integration, copy consistency. Do NOT declare "done" after build passes alone.

Always run `npm run build` before pushing. Always.

## The Engineering Team (invoke by name)

This codebase is owned by an engineering team of AI personas. When Devin is in Chief-of-Staff workspace and wants engineering work done, he calls them by name:

- **Eddie** (VP Engineering) — architecture, trade-offs, "is this safe to ship"
- **Nina** (Backend/Data) — schema, queries, server routes, migrations, cron
- **Felix** (Frontend) — React, hooks, animations, client-side state
- **Dex** (DevOps) — Railway, deploys, env vars, Sentry, email deliverability
- **Perry** (PM) — state tracking, standups, backlog
- **Rex** (Red-Team) — pressure-test risky changes (peer, not always on)
- **Sage** (Security) — auth, secrets, PII, GDPR (peer, invoked as needed)
- **Grayson** (Growth) — funnels, metrics, experiments (peer, invoked as needed)

Full org chart: `Chief-of-Staff/projects/assessment-platform/ENG-ORG-CHART.md`

When running inside THIS repo (not Chief-of-Staff), Claude Code isn't invoking these personas — it's just Claude Code with this CLAUDE.md as context. The personas live in the Chief-of-Staff skill library. If working cross-workspace, prefer invoking by name.

## Red-Team Rule

**Any time you propose code changes and claim they are "safe," "low risk," "simple," or "won't break anything," you MUST first red-team yourself.** Specifically:

1. **List 3 concrete ways each change could break something** before recommending it. Not hypothetical "any code can have bugs" — specific mechanisms (state race, user-gesture expiry, cascade failure, cached value staleness, backward-compat break, etc.).
2. **If you can't list 3**, you haven't thought hard enough. Read more of the code and try again.
3. **Rank the risks honestly.** "Reintroduces a bug we previously fixed" is a high risk. "Deprecated API" is low.
4. **Present the red-team BEFORE the recommendation**, not after.
5. **Distinguish** between genuinely safe (diagnostic-only, additive checks, test-only data) and "probably safe but needs staging test first."

The goal is NOT to never ship — it's to never tell Devin something is safe without showing the work. When in doubt, split the recommendation: ship the truly-safe subset immediately, flag the riskier fixes for staging testing.

**Skip the red-team** only for: pure documentation/comment edits, adding test cases, running QA against already-shipped code.

**Trigger phrases that require red-team:** "low risk," "safe to ship," "won't break anything," "quick fix," "simple change," "contained," "just a tweak." If you catch yourself about to use one of these, stop and red-team first.

## Known Gotchas
- `brightSpotsText` is a JSON-stringified array stored in a text column. Client parses with `JSON.parse()`.
- `outcomeOptionsJson` is proper JSONB. No parse needed on client.
- ElevenLabs agent prompt lives in ElevenLabs dashboard, NOT in our code. The DB key `assessment_conversation_guide` is used by the scoring engine and text-mode chat for context.
- Skill name lookups from AI use case-insensitive fallback but can still fail on hallucinated names.
- First challenge generation is fire-and-forget async. Can race with results page load.
- Level numbering: DB stores sortOrder 0-4, UI displays 1-5 (always `sortOrder + 1` for display).
- `LEVEL_COLORS` maps have Tailwind classes (for `className`). `LEVEL_HEX` has hex values (for `style` attributes). Don't mix them. Both are defined locally in dashboard.tsx, results.tsx, manager.tsx, and animations.ts.
- The assessment voice agent name is "Lex" (he/him). If you see "Alyssa" or "she" anywhere, it's stale and should be updated.
- Admin user seeded as `admin@electricthinking.com` / `admin123`.
- Cookie `secure: true` only in production (`NODE_ENV=production`). Dev runs without secure cookies.
- `routes.ts` is ~1750 lines. All routes in one file. No route splitting.

## Database
- PostgreSQL via Railway
- Drizzle ORM with `drizzle-kit push --force` on startup (auto-applies schema changes)
- 15 tables: `organizations`, `users`, `levels`, `skills`, `assessmentQuestions`, `assessments`, `userSkillStatus`, `nudges`, `nudgeVoiceGuide`, `verificationAttempts`, `badges`, `invites`, `liveSessions`, `aiPlatforms`, `systemConfig`, `activityFeed`, `emailLogs`, `coachConversations`, `challengeReflections`
- Plus `session` table (created by auth.ts for connect-pg-simple)
- Key relationships: users -> organizations, skills -> levels, assessments -> users, userSkillStatus -> (users, skills), nudges -> (users, skills)
- Should migrate to `drizzle-kit generate` for versioned migrations once real client data exists

## Common Commands
- `npm run dev` - Start dev server (Vite HMR + Express)
- `npm run build` - Production build (Vite client + esbuild server -> dist/)
- `npm run check` - TypeScript type checking only
- `npm run db:push` - Push schema changes to DB
- `npm run start` - Production start (runs db:push --force first)

## Related Skills
- **quality-patrol**: Run after large changes. Reads code and traces data flows to find bugs.
- **swarm-coordinator**: For overnight multi-agent builds. Produces agent briefs with file boundaries.
- **assessment-architect**: For refining the 4-level framework, skills, classification logic.
- **nudge-writer**: For generating challenge content.

## Key Reference Files
- `working-notes/codebase-map.md` - Full codebase map with all routes, modules, and page descriptions
- `working-notes/remaining-build-specs.md` - Outstanding build specs (11 specs, 4 phases)
- `working-notes/alyssa-elevenlabs-prompt-v3.md` - Latest ElevenLabs prompt iteration
