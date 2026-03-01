# Council Implementation Status

Produced by Architect agent. Cross-references every recommendation from the council review against the actual codebase, with file-level evidence.

---

## Status Key

- **Fully Implemented**: Code exists and matches the behavioral intent from the council review.
- **Partially Implemented**: Some code exists but it's incomplete or weak.
- **Not Implemented**: No evidence in codebase.
- **Implemented But Misses Intent**: Code exists but doesn't achieve the psychological goal. This is the most important category.

---

## Top 5 Moves: Status

| # | Move | Status | Verdict |
|---|------|--------|---------|
| 1 | Kill "No nudges yet", deliver first challenge immediately | Partially Implemented | First challenge generates on backend and shows on results page, but dashboard still shows the dead-end copy. The Hook loop starts but doesn't fully close. |
| 2 | Make skill map feel like a game world | Implemented But Misses Intent | Map is functional with paths, fog, node states, but reads as a chart with colors, not a game world. No terrain, no character, no exploration of fogged nodes. |
| 3 | Add team layer (social proof, shared context) | Partially Implemented | Team snapshot exists on results page. Dashboard has zero team context. Social/skill-completion API exists on server but is never called from client. |
| 4 | Add investment moment (user chooses, commits, customizes) | Partially Implemented | Journey setup (frequency + day) exists on results page. But user doesn't choose which skill to work on. No skill selection, no commitment device beyond frequency. |
| 5 | Design results reveal as a moment, not a data dump | Fully Implemented | 11-phase cinematic reveal with animations, confetti, signature skill, bright spots, future self, count-up, team snapshot, journey setup, share. The emotional arc is strong. |

---

## Full Recommendation Inventory

### From Switch (Heath)

| # | Recommendation | Status | Evidence |
|---|---------------|--------|----------|
| S-Gap1 | Path has a hole: deliver first challenge immediately | Partially Implemented | Backend: `routes.ts:263-284` spawns async nudge generation with `isFirstChallenge: true` on assessment complete. Results page (`results.tsx:143-145`) fetches and displays it in ChallengeCard component (`results.tsx:1162-1286`). **BUT** dashboard (`dashboard.tsx:469-472`) still shows "No nudges yet. Your first learning nudge arrives on {day}" when no nudges exist. This dead-end copy is exactly what the council says to kill. The first challenge is generated asynchronously, so a race condition exists where the results page may not have it yet. |
| S-Gap2 | No action trigger: nudges need if-then triggers | Partially Implemented | The `triggerMoment` field is captured in the scoring prompt (`assessment-ai.ts:90-91`) and stored in the assessments table (`schema.ts:101`). It is returned in the API response (`routes.ts:296`). **BUT** it is never used: not in nudge generation (`nudge-ai.ts` has no reference), not in email templates (`email.ts` has no reference), not in cron delivery timing (`cron.ts` has no reference). Data captured, never consumed. |
| S-Gap3 | Herd is invisible: no social proof for individual users | Partially Implemented | `GET /api/team/snapshot` exists (`routes.ts:369-430`) and is shown on the results page (`results.tsx:829-923`). `GET /api/social/skill-completion` exists (`routes.ts:643-663`) returning per-skill completion rates. **BUT** the client never calls `/api/social/skill-completion`. The dashboard (`dashboard.tsx`) has zero team context. The skill map node popovers (`rpg-map.tsx:346-387`) don't show "X% of your team has mastered this." |
| S-Gap4 | No Bright Spots after assessment | Fully Implemented | `brightSpotsText` is generated in scoring (`assessment-ai.ts:88`), stored in DB (`schema.ts:99`), displayed in results reveal (`results.tsx` phase "brightspots"). The prompt instructs: "Lead with what's impressive. Be specific to things they mentioned." |
| S-Gap5 | Skill map doesn't feel like progress | Implemented But Misses Intent | The map has green checkmarks + glow for mastered, yellow pulsing for in-progress, dimmed for red (`rpg-map.tsx:279-341`). Fog of war on higher levels (`rpg-map.tsx:408-424`). Animated path progress via Framer Motion (`rpg-map.tsx:215-226`). **BUT**: green/mastered nodes are the same size as others. No visual dominance for completed territory. The map uses circles and rectangles, not terrain or landmarks. Completed area doesn't "expand" or "glow" in a way that makes progress feel dominant. |

### From Power of Moments (Heath)

| # | Recommendation | Status | Evidence |
|---|---------------|--------|----------|
| M-Gap1 | Ending is a pit, not a peak (Peak-End Rule) | Partially Implemented | The results page itself ends well, with share and journey setup. **BUT** the transition to dashboard hits the "No nudges yet" wall (`dashboard.tsx:469`). The last thing a user experiences after the results cinematic is the dashboard, and if they reach it before the async first challenge finishes generating, they hit the anti-moment. |
| M-Gap2 | No Connection moment | Partially Implemented | Team snapshot on results page (`results.tsx:829-923`) shows member count, average level, user rank, level distribution, recent completions. Solo users get "Just you so far" message with invite button (`results.tsx:848-854`). **BUT** this is a one-time display during results reveal. No ongoing connection moment. No team activity on dashboard. No synchronized assessment experience. |
| M-Gap3 | Pride moment is passive | Fully Implemented | The skill map builds node by node over 12 seconds (`results.tsx:187-198`). Count-up animation for mastered skills (`results.tsx:200`). Level reveal with PulseRing, ParticleField, and confetti (`results.tsx` phase "level"). Signature skill designation with personalized rationale (`results.tsx` phase "signature"). These are active, not passive. |
| M-Gap4 | No Elevation at transition | Partially Implemented | Results page has bright spots and future self sections, which include personalized, specific content generated by Claude. **BUT** there's no "script-breaking surprise" element. The council suggests a hidden metric or unexpected personal observation. The `triggerMoment` field exists but is displayed nowhere. No "26th dimension" surprise. |

### From Hooked (Eyal)

| # | Recommendation | Status | Evidence |
|---|---------------|--------|----------|
| H-Gap1 | Loop breaks after peak moment | Partially Implemented | First challenge is generated (`routes.ts:263-284`) and shown on results page in ChallengeCard (`results.tsx:1162-1286`) with expandable content (opener, idea, use case, action, reflection, story). "Keep Going" button exists (`results.tsx:1252-1262`) that calls `/api/user/challenge/generate-next`. **BUT** the first challenge is async, so it may not exist yet when results load. And the ChallengeCard presents the challenge as content to read, not as a completable micro-action with a completion state. No "I did it" button. No progress update after doing the challenge. The Hook loop: trigger (results) > action (read challenge) > reward (content) > investment (???). The investment phase is missing. |
| H-Gap2 | No variable reward after assessment | Not Implemented | Dashboard (`dashboard.tsx`) is static. Same layout every visit. No "Skill of the Day," no "Did You Know?" element, no rotating insight from assessment data. The latest nudge is the only varying content, and it only changes when a new one is generated (weekly or less). |
| H-Gap3 | Investment phase missing | Partially Implemented | Journey setup lets user set frequency and day (`results.tsx` phase "journey", `routes.ts:350-367`). **BUT** user doesn't choose which skill to work on (system auto-assigns via `firstMove`). No skill selection UI. No "I commit to X" moment beyond frequency choice. No skill moments log. No personal AI journal. |
| H-Gap4 | No bridge to internal triggers | Not Implemented | Nudges don't include explicit action triggers ("Next time you open ChatGPT to draft an email, try this instead"). The `triggerMoment` captured during assessment is never woven into nudge content. No "notice when you..." framing in nudge prompts (`nudge-ai.ts:36-60`). |
| H-Gap5 | Skill map as decoration, not reward mechanism | Implemented But Misses Intent | Map shows node states and has fog of war. Yellow nodes pulse. **BUT**: no "itch to fill in the next node." No visual showing what it takes to unlock the next skill. No glow on nodes close to unlocking. No animation or sound on completion. No hidden skills or Easter eggs. The map is a status display, not a pull mechanism. |

### From StoryBrand (Miller)

| # | Recommendation | Status | Evidence |
|---|---------------|--------|----------|
| B-Gap1 | Plan disappears at moment it matters most | Partially Implemented | First challenge appears on results page in ChallengeCard. **BUT** dashboard shows "No nudges yet" when the user returns. The plan (weekly challenges) is invisible during the peak emotional moment if there's any delay in async generation. |
| B-Gap2 | No Direct CTA after assessment | Partially Implemented | Results page has "Ready for your first challenge?" button that expands the ChallengeCard (`results.tsx:1276`). Also "Go to Your Dashboard" at the end (`results.tsx:1151`). **BUT** no "Start Your First Skill Now" as a prominent, direct CTA. The ChallengeCard expand button is present but it's a reading experience, not an action-taking experience. No transitional CTA like "Share Your Results with Your Team" (the share section exists but comes later, after journey setup). |
| B-Gap3 | No Stakes (cost of inaction) | Not Implemented | No drift indicator on dashboard. No "skills decay" messaging. No time-based urgency. No team comparison that creates healthy tension. The dashboard shows current state with zero consequences for doing nothing. |
| B-Gap4 | Success ending undefined | Partially Implemented | `futureSelfText` is generated by Claude (`assessment-ai.ts:89`) and displayed on results page (phase "futureself"). **BUT** it only appears once during results reveal. Not visible on dashboard. No "day in the life" snapshots for each level. The dashboard shows "You're Level X" without painting what Level X+1 looks like. |
| B-Gap5 | Skill map isn't telling a story | Implemented But Misses Intent | Same as S-Gap5 and H-Gap5. The map shows data points, not a narrative arc. No spatial logic that reads as a journey upward. Level regions are labeled rectangles, not territories with identity. |
| B-Gap6 | No One-Liner | Not Implemented | No concise Problem + Solution + Result statement exists in the product. The landing page (`landing.tsx`) has "Find out where you are on your AI journey" which is closer to a tagline than a One-Liner in Miller's sense. No shareable personal story format generated for users. |

### From Reality is Broken (McGonigal)

| # | Recommendation | Status | Evidence |
|---|---------------|--------|----------|
| G-Gap1 | Momentum cliff | Partially Implemented | Same as S-Gap1, M-Gap1, H-Gap1. First challenge exists on results page but dashboard dead end remains. |
| G-Gap2 | No immediate action loop | Partially Implemented | Challenge content exists (nudge with action, reflection, story). Verification quiz exists for yellow skills (`dashboard.tsx:160-208`, `routes.ts` verify endpoints). **BUT** no "Try This Now" button next to in-progress skills on dashboard. No progress bar per skill ("0/3 practice sessions"). No visible, frequent progress tied to effort. The dashboard is a report card, not a workspace. |
| G-Gap3 | Skill map feels like chart, not world | Implemented But Misses Intent | Same as S-Gap5, H-Gap5, B-Gap5. No locked "?" nodes. No "you are here" distinct indicator (yellow nodes pulse but don't differentiate the ACTIVE skill from other yellow skills). No pathway lighting on progress. No explorable hidden nodes. |
| G-Gap4 | No social fabric | Partially Implemented | Same as S-Gap3, M-Gap2. Team snapshot on results page only. No cooperative skill quests. No paired challenges. No "team skills" view on dashboard. |
| G-Gap5 | No voluntary obstacles | Partially Implemented | User chooses frequency and day (journey setup). **BUT** user doesn't choose which skill to work on. No "Pick your path" moment. No "Hard Mode" option. No optional constraints. The system assigns everything. Autonomy is limited to scheduling, not content. |

---

## Cross-Reference: Recommendations That Converge

Several gaps from different frameworks describe the same underlying problem. Grouping them:

### The Dead End (All 5 advisors)
S-Gap1, M-Gap1, H-Gap1, B-Gap1, G-Gap1
**Files affected**: `dashboard.tsx:463-475`, `routes.ts:263-284`, `results.tsx:143-145`
**Core issue**: Dashboard "No nudges yet" copy + async first challenge generation race condition + no Keep Going button on dashboard.

### The Invisible Herd (4 advisors: Switch, PoM, Hooked, McGonigal)
S-Gap3, M-Gap2, H-Gap2 (partial), G-Gap4
**Files affected**: `dashboard.tsx` (no team section), `rpg-map.tsx` (no social proof on nodes), `routes.ts:643-663` (API exists, unused)
**Core issue**: Social/skill-completion data is computed on the server but never surfaced to individual users.

### The Chart-Not-A-World (All 5 advisors)
S-Gap5, M-Gap3 (partial), H-Gap5, B-Gap5, G-Gap3
**Files affected**: `rpg-map.tsx` (all 428 lines)
**Core issue**: Circles and rectangles instead of terrain and landmarks. No exploration. No character. No spatial identity.

### The Missing Investment (4 advisors: Switch, Hooked, StoryBrand, McGonigal)
S-Gap2, H-Gap3, B-Gap2, G-Gap5
**Files affected**: `results.tsx` (journey section), `dashboard.tsx` (no skill choice)
**Core issue**: User commits to a schedule but doesn't choose their path, log skill moments, or make public micro-commitments.

### The Static Dashboard (3 advisors: Hooked, StoryBrand, McGonigal)
H-Gap2, B-Gap3, G-Gap2
**Files affected**: `dashboard.tsx` (all 668 lines)
**Core issue**: Dashboard shows the same information every visit. No variable reward. No stakes. No action loop.

---

## Don't Break List

These are the things the council explicitly praised. They are working well and should be preserved during any changes.

1. **The assessment conversation with Alyssa**: Voice-first, insight reframes ("you just described three Level 1 skills"), genuine fiero moments. All five advisors praised this. Files: `assessment.tsx`, `assessment-ai.ts`, `assessment-warmup.tsx`.

2. **The scoring outputs**: signatureSkillName, signatureSkillRationale, brightSpotsText, futureSelfText, contextSummary. These are generated well and displayed in the results reveal. Files: `assessment-ai.ts:72-114`, `results.tsx` phases "signature", "brightspots", "futureself".

3. **The 11-phase results reveal**: Animated map build, count-up, level reveal with confetti/particles, signature skill, bright spots, future self, first challenge, team snapshot, journey setup, share. This is the best-implemented feature. File: `results.tsx`.

4. **The 25-skill, 5-level framework as identity**: "You're a Level 3 Specialized Teammates" gives users an identity, not just a score. Level-based language throughout. Files: `schema.ts` levels/skills tables, `seed.ts`, all client pages.

5. **The nudge content structure**: One skill, one use case, one action, 10 minutes. "Shrink the Change" architecture. Files: `nudge-ai.ts:36-60`, nudge display in `dashboard.tsx:423-461` and `results.tsx` ChallengeCard.

6. **The verification quiz**: 3 MCQ questions for yellow-to-green skill verification. Personalized to user context. Satisfying pass/fail with confetti and level-up celebration. Files: `nudge-ai.ts:90-165`, `dashboard.tsx:160-208, 542-629`, `routes.ts` verify endpoints.

7. **The journey setup / frequency commitment**: User picks challenge pace (weekly to daily) and preferred day. Cron respects per-user frequency. Files: `results.tsx` phase "journey", `routes.ts:350-367`, `cron.ts` runNudgeGeneration.

8. **The team snapshot on results page**: Shows member count, user rank, average level, level distribution chart, recent completions. Solo-user messaging is good ("Just you so far"). File: `results.tsx:829-923`.

9. **The badge system**: skill_complete, level_up, streak badges. SVG generation. LinkedIn sharing. Download. Files: `badge-svg.ts`, `dashboard.tsx:478-525`, `routes.ts` badge endpoints.

10. **Email delivery infrastructure**: 9 templates, preference controls, unsubscribe tokens, webhook tracking, bounce handling. Files: `email.ts`, `cron.ts`, `routes.ts` webhook handler.

---

## Summary Statistics

- **Total unique recommendations extracted**: 25 gaps across 5 frameworks
- **Converged into**: 14 distinct recommendations (some gaps describe the same problem from different angles)
- **Fully Implemented**: 3 (M-Gap3 Pride active, S-Gap4 Bright Spots, Move 5 Results Reveal)
- **Partially Implemented**: 8 (The Dead End, Invisible Herd, Missing Investment, No Connection, No Elevation, Success Ending, Action Loop, Momentum Cliff)
- **Implemented But Misses Intent**: 3 (Skill Map x3 converged, H-Gap5 Skill Map as Reward)
- **Not Implemented**: 4 (Variable Reward on Dashboard, Action Triggers in Nudges, Stakes/Cost of Inaction, One-Liner)
