# Katrina's Active Development Briefing

*Created March 26, 2026 by Devin (via Claude Code)*

**What this is:** You're taking over as the active developer/tester on the assessment app while Devin focuses on assessment content and framework design. This doc ports his brain to you — his workflow, his habits, the things that only come from having built this for two weeks straight.

**Your job:** Find bugs, fix them, push code, run QA. You're not reporting bugs to Devin — you're fixing them yourself, with Claude Code as your partner.

**Devin's job (separately):** He's working on assessment content — the actual questions, skills, Lex prompts, and scoring rubrics. That's all happening in `working-notes/` files and ElevenLabs config, NOT in code. If he needs code changes from his content work, he'll write specs into `working-notes/` and you implement them.

---

## Part 1: How Devin Works with Claude Code (Be Him)

### Voice-to-text is the default input mode

Devin talks to Claude Code out loud using voice-to-text (dictation). He rarely types long messages. On Mac this is the Globe key or Fn key to start dictation. On Windows it's Win+H.

This means:
- His messages are conversational, not formal
- He says things like "yep commit it" or "ok do that and then also check the thing we talked about"
- He gives feedback in natural language: "no not that, what I meant was..."
- He refers to things on screen: "check the most recent screenshot" (screenshots are in ~/Downloads)

**You should do the same.** Talk to Claude Code like a colleague sitting next to you. Don't write formal prompts. Just tell it what you need.

### Screenshots are a first-class input

When something looks wrong in the browser:
1. Take a screenshot (Win+Shift+S on Windows, or Snipping Tool)
2. Save it somewhere you can find it (Desktop or Downloads)
3. Tell Claude Code: "Look at this screenshot: [path]. What's wrong with this page?"

Claude Code can read images. It'll see the UI, identify problems, and propose fixes. This is WAY faster than describing what you see in words.

### Give feedback bluntly

Claude Code learns from correction. When it does something wrong:
- "No, that's not what I meant. I meant [X]."
- "Don't do that. Instead do [Y]."
- "That broke it. Revert that and try a different approach."
- "Stop. Read the file first before changing anything."

Don't be polite about technical corrections. Be clear and direct. Claude Code won't get offended and the directness makes it work better.

### The work rhythm

Devin's typical cycle:
1. **Test the app** — click through flows in the browser, try to break things
2. **Find a bug** — screenshot it or describe it
3. **Tell Claude Code** — "I found a bug where [X]. Fix it."
4. **Review the fix** — Claude Code shows you what it changed. Read the diff. If it looks right, approve it.
5. **Test again** — reload the browser, try the same flow
6. **Commit when ready** — "commit and push this" (Claude Code handles git)
7. **Wait ~2 minutes** — Railway auto-deploys from main
8. **Test on production** — go to assessment.electricthinking.ai and verify

### How to say "commit and push"

When you're happy with a fix:
- "Commit this and push to main"
- "Yep, ship it"
- "Commit and push"

Claude Code will write a commit message, stage the files, commit, and push. Railway picks up the push and deploys automatically. You'll see the new version live in ~2 minutes.

**Important:** Claude Code runs `npm run build` before pushing to make sure nothing is broken. If the build fails, the fix isn't ready — work with Claude Code to resolve the build error first.

### How to say "undo"

If you pushed something that made things worse:
- "Revert the last commit and push"
- Claude Code will do `git revert HEAD` + `git push`
- This is safe — it creates a new commit that undoes the bad one

**Never do** `git reset --hard` or `git push --force`. Those destroy history.

---

## Part 2: The 4-Level QA Process

This is the most important section. Devin learned this the hard way — **twice**. Code review alone does NOT catch real bugs. You must test the actual system.

### Level 1: Code Review (necessary but not sufficient)

Read the code, trace the logic, look for obvious issues. Claude Code is great at this:
- "Read the assessment page and look for potential bugs"
- "Trace what happens when a user completes the assessment — follow the code from button click to database"

### Level 2: API Flow Simulation (THIS IS THE ONE THAT MATTERS)

Simulate a real user journey by hitting the actual API endpoints. This catches state bugs, redirect loops, and flow breakage that code reading can't find.

Tell Claude Code:
```
Run a full API flow simulation. Here's the sequence:
1. Register a test user via POST /api/auth/register
2. Complete onboarding via PATCH /api/auth/me (set roleTitle and platform)
3. Submit a survey via POST /api/assessment/start (include surveyResponses)
4. Check: what does GET /api/assessment/active return?
5. Send a test message via POST /api/assessment/:id/message
6. Check the response — does it have messages? Did the AI respond?
7. Complete the assessment via POST /api/assessment/:id/complete
8. Wait 3 seconds, then check GET /api/assessment/latest — does it have scores?
9. Clean up: log in as admin, DELETE /api/admin/users/:id

At each step, tell me the status code and what the response looks like.
Report any unexpected status codes, missing fields, or errors.
```

This is the test that catches real bugs. The race condition that bounced users to the survey? API simulation caught it. The scoring crash on minimal transcripts? API simulation caught it. 12 rounds of code review missed both.

### Level 3: Deploy Verification

Run the automated verification script against the live site:

```bash
APP_URL=https://assessment.electricthinking.ai ADMIN_PASSWORD=__ask_devin__ npx tsx scripts/verify-deploy.ts
```

This creates a test user, runs the full flow, checks all endpoints, scores an assessment, and cleans up. It reports PASS or FAIL with details.

**Run this after every deploy.** Not sometimes. Every time.

### Level 4: Declare Blind Spots

Every QA round must end with what you COULDN'T test:
- Mobile rendering (you'd need to test on a phone or use browser DevTools mobile view)
- Browser-specific issues (Safari on iOS is the most problematic)
- Voice/WebSocket behavior (requires microphone + ElevenLabs to be configured)
- CSS visual glitches (screenshots help here — test in the actual browser)
- Real network conditions (slow connections, timeouts)

Being honest about what you didn't test is as important as what you did test.

---

## Part 3: The Assessment App — What You Need to Know

### The User Flow

```
Landing → Register → Onboarding (job title + AI platform) → Survey (adaptive, 5 questions per level)
→ Warmup ("Got it. Now let's talk.") → Assessment (voice or text with Lex) → Scoring → Results
```

### Key States

- **No assessment**: User sees survey or dashboard
- **in_progress**: User is in the conversation with Lex
- **scoring**: Assessment is being scored by Claude API (takes 10-30 seconds)
- **completed**: Results are ready

### The Architecture

| Layer | File(s) | What it does |
|-------|---------|-------------|
| Frontend pages | `client/src/pages/*.tsx` | React pages for each step |
| API routes | `server/routes.ts` (~1557 lines) | All backend endpoints |
| Assessment AI | `server/assessment-ai.ts` | Lex conversation + scoring via Claude API |
| Voice | `server/elevenlabs.ts` | ElevenLabs voice agent integration |
| Database | `shared/schema.ts` + `server/storage.ts` | Drizzle ORM + PostgreSQL |
| Seed data | `server/seed.ts` | Levels, skills, default configs, admin user |

### Key Files You'll Touch Most

- **`client/src/pages/assessment.tsx`** (~1290 lines) — The main assessment conversation page. Most UI bugs live here.
- **`client/src/pages/survey.tsx`** — The adaptive survey. Grid layout, 5 questions per level.
- **`client/src/pages/results.tsx`** — Results display. Level ladder, outcomes, skill breakdown.
- **`server/routes.ts`** — All API endpoints. State management, scoring triggers, admin functions.
- **`server/assessment-ai.ts`** — The Claude API calls for Lex conversation and scoring.

### Common Bug Patterns

1. **React Query race conditions**: A query returns `undefined` while loading, code treats it as "no data." Fix: check `isLoading` before acting on query data.
2. **Stale closures in useCallback/useEffect**: Dependencies array missing a variable → callback captures old value. Fix: add the variable to deps.
3. **State transition bugs**: User is in one state, UI assumes another. Example: user leaves mid-conversation, comes back, app doesn't know they have an active assessment. Fix: always check all possible states.
4. **Scoring edge cases**: Minimal transcripts, malformed AI responses, timeouts. Fix: graceful fallbacks that use survey data instead of crashing.

---

## Part 4: Running the App Locally (Optional)

You don't NEED to run locally — you can test everything on the live site. But if you want to:

```bash
# From the project root:
npm install
npm run dev
# Opens at http://localhost:5000
```

You'll need a `.env` file with:
```
DATABASE_URL=postgresql://...  (ask Devin or check Railway variables)
ANTHROPIC_API_KEY=sk-ant-...
SESSION_SECRET=anything-random
```

The live site is usually fine for testing. Local is only needed if you want to test changes before pushing.

---

## Part 5: Available Scripts

| Script | When to run | What it does |
|--------|-------------|-------------|
| `npm run build` | Before every push | TypeScript compile + Vite build. If this fails, don't push. |
| `npm run dev` | Local development | Starts dev server at localhost:5000 |
| `npm run pre-deploy` | Before pushing | TypeScript check + build + structural tests |
| `npm run verify-deploy` | After every deploy | Hits live endpoints, full assessment flow, PASS/FAIL |
| `npm run check-schema` | If DB issues suspected | Checks for schema drift |
| `npm run test:e2e` | Full API test | E2E API flow + adversarial tests |

---

## Part 6: Context Files (Your Reading List)

These are the files that contain the "why" behind decisions. Read them when you need context.

### Must-read (before your first QA round)

| File | What's in it |
|------|-------------|
| `EMERGENCY-RUNBOOK.md` | Production emergency guide — the 3 most likely problems and how to fix them |
| `working-notes/session-briefing-march25-2026-part2.md` | Most recent state: what's working, what needs testing, known issues |
| `working-notes/product-pivot-march24-2026.md` | Why we went assessment-only (the Kenny conversation) |

### Read when relevant

| File | When |
|------|------|
| `working-notes/session-briefing-march25-2026.md` | QA rounds 7-9, security fixes, data quality |
| `working-notes/session-briefing-march24-2026-part2.md` through `part5.md` | The build + QA rounds 1-8 |
| `working-notes/assessment-design-briefing.md` | If Devin asks you to implement content changes |
| `working-notes/lex-elevenlabs-prompt-v7.md` | Current Lex voice prompt (pasted into ElevenLabs manually) |
| `working-notes/copy-audit.md` | UI copy decisions and rationale |
| `working-notes/privacy-security-brief.md` | Security posture and known limitations |

### Don't worry about

- `working-notes/alyssa-*.md` — Old voice agent, pre-rename to Lex
- `working-notes/painter-storyboard.md` — Aspirational, not implemented
- `working-notes/remaining-build-specs.md` — Pre-pivot, mostly irrelevant
- `working-notes/council-implementation-status.md` — Old architecture, archived

---

## Part 7: Skills You Can Use

When doing QA and development, these Claude Code skills are useful:

| Skill | Use it for |
|-------|-----------|
| `/simplify` | After making changes — reviews for quality, reuse, efficiency |
| `/strategic-coach` | When you need to think through an approach before coding |

And your general QA toolkit phrases:

- "Run a full API flow simulation" — Level 2 QA
- "Read [file] and look for bugs" — Level 1 QA
- "What state is the user in after [action]?" — State tracing
- "Trace the code from [button click] to [database write]" — Flow tracing
- "Check the most recent screenshot at [path]" — Visual bug analysis

---

## Part 8: Things That Are Easy to Break (Watch Out)

1. **The scoring pipeline**: If you change anything in `assessment-ai.ts`, run a full flow test. Scoring failures leave users stuck in a "scoring" state with no results.

2. **The adaptive survey cutoff**: The survey stops when it detects the user's growth edge. If you change survey logic, make sure the cutoff still works — a broken cutoff means users answer all 20 questions (bad UX).

3. **Session/auth flow**: Changes to login, register, or session handling can lock everyone out. Always test login after touching auth code.

4. **The useEffect redirect chain on the assessment page**: There's a complex chain of redirects based on user state (no assessment → survey, completed → results, active → show conversation). This is the most fragile piece of frontend code. Touch it carefully.

5. **Database schema changes**: `drizzle-kit push` runs on every deploy. If you change `shared/schema.ts`, the migration runs automatically. But Drizzle can fail silently on existing tables — the `ensureMigrations()` function in `seed.ts` exists as a safety net. If you add a column, also add it there.

---

## Part 9: Known Issues (Your Starting Backlog)

These are known but not yet fixed. Pick them up as you find time or if they cause user complaints:

### Security
- `__TRANSCRIPT_SAVE__` magic string can overwrite transcript (low risk, requires auth)
- No rate limiting on AI endpoints (could be abused for cost)
- No per-route body size limits

### Performance
- N+1 queries on 5 endpoints (admin-facing, not user-critical)
- `getAnalytics` loads all rows (no pagination)
- No graceful shutdown on SIGTERM

### UX
- Voice connecting: no cancel button for first 15 seconds
- No back button on warmup page
- Assessment textarea missing aria-label
- Assessment needs minimum 3 messages before "End Conversation" appears

### Lex (AI behavior)
- No topic drift protection in text mode
- No jailbreak protection in text mode (Lex himself flagged this in Devin's test)
- Lex has no turn counter — can't pace the conversation by knowing which turn he's on

---

## Part 10: Communication Protocol with Devin

- **You own the code.** Make decisions, push fixes, don't wait for approval.
- **Message Devin only when:** you're blocked on something you truly can't figure out, or you need a decision about product direction (not code).
- **If Devin sends content changes** (new questions, new Lex prompt text, new scoring rubrics), he'll put specs in `working-notes/`. Check for new files periodically or when he tells you.
- **Keep a running log**: After each session, tell Claude Code "Write a session briefing to working-notes/" documenting what you fixed. This is how Devin stays aware of progress without being in the code.

---

## Part 11: The Golden Rule

**Test it like a user, not like an engineer.**

Click through the app. Use a phone. Try to break it by doing things users do: hitting back, refreshing mid-assessment, closing the tab and coming back, leaving the page during scoring, trying to retake while a previous assessment is scoring.

12 rounds of code-level QA missed bugs that 2 minutes of actually using the app would have caught. The API flow simulation exists specifically because of this lesson. Use it.

---

## Quick Start Checklist

Your first session should be:

1. [ ] Read `EMERGENCY-RUNBOOK.md` and `session-briefing-march25-2026-part2.md`
2. [ ] Open https://assessment.electricthinking.ai in your browser
3. [ ] Create a test account and go through the full flow (register → survey → Lex → results)
4. [ ] Note anything that feels wrong, broken, or confusing
5. [ ] Open Claude Code in the assessment app folder
6. [ ] Tell it what you found: "I went through the app and found these issues: [list]. Fix them."
7. [ ] Review the fixes, test them on the live site after deploy
8. [ ] Run the verify-deploy script
9. [ ] Write a session briefing

---

*You've got this. The app is 90% there. Your job is to find the last 10% of bugs and polish before real users hit it. Claude Code does the heavy lifting — you bring the human eyes and judgment.*
