# Remaining Build Specs

Implementation specs for every council recommendation that is not fully implemented. Each spec includes behavioral intent, current state, acceptance criteria, technical approach, priority, and straightforward vs. ambitious versions.

---

## Spec 1: Kill the Dead End

**Council Source**: Move 1 (all 5 advisors), S-Gap1, M-Gap1, H-Gap1, B-Gap1, G-Gap1
**Behavioral Intent**: The user finishes an emotionally charged assessment and should never hit a screen that says "come back Monday." The momentum must flow directly into action. This is the single most important change, per unanimous council consensus.

### Current State
- Backend generates first challenge asynchronously after scoring (`routes.ts:263-284`), with `isFirstChallenge: true`.
- Results page fetches and displays it in ChallengeCard component (`results.tsx:143-145, 1162-1286`). ChallengeCard has "Keep Going" button (`results.tsx:1252-1262`).
- Dashboard still shows the exact dead-end copy: "No nudges yet. Your first learning nudge arrives on {day}" (`dashboard.tsx:469-472`).
- No "Keep Going" button on dashboard. The `/api/user/challenge/generate-next` endpoint exists but is only called from the results page.
- Race condition: async first challenge generation may not complete before the results page tries to display it.

### Requirements
- [ ] Remove "No nudges yet. Your first learning nudge arrives on {day}" copy from dashboard entirely.
- [ ] When dashboard has no nudges AND assessment is complete, show a loading state ("Your first challenge is being prepared...") with a spinner, and poll for it every 3 seconds until it appears.
- [ ] If first challenge still doesn't appear within 30 seconds, show a "Generate My First Challenge" button that calls `/api/user/challenge/generate-next`.
- [ ] Add a "Keep Going" button to the dashboard nudge section (below the latest nudge) that calls `/api/user/challenge/generate-next` and refreshes the nudge list.
- [ ] First challenge generation should be awaited (not fire-and-forget) in the assessment complete handler, OR the results page should poll for it with a visible loading indicator.

### Technical Approach
- **Component to modify**: `client/src/pages/dashboard.tsx` lines 463-475
  - Replace the "No nudges yet" empty state with:
    1. If assessment complete AND no nudges: show loading spinner + "Your first challenge is being prepared" with polling (setInterval querying `/api/user/nudges` every 3s, clearing on mount or when nudges arrive).
    2. If nudges exist: show latest nudge (existing behavior) plus a "Keep Going" button below.
- **Component to modify**: `client/src/pages/dashboard.tsx` (add "Keep Going" button)
  - Below the latest nudge card, add a button wired to `handleGenerateNext` (same as results page pattern).
- **Server option** (straightforward): Make the first challenge generation in `routes.ts:263-284` synchronous. Move it before `return res.json(...)` and include the challenge in the response. This eliminates the race condition entirely but adds ~5-10 seconds to the scoring response time.
- **Server option** (lighter): Keep async but add a `GET /api/user/nudges/first` endpoint that returns only the first challenge or 204 if not ready yet, for efficient polling.
- No database changes needed.
- No external services changes.

### Priority
- Impact: **High** (all 5 advisors, single highest-impact change)
- Effort: **Small** (copy changes + one button + conditional rendering)
- Dependencies: None
- Recommendation: **Build first**

### Straightforward vs. Ambitious
- **Straightforward**: Remove dead-end copy, add polling for first challenge, add "Keep Going" button on dashboard. One sprint.
- **Ambitious**: Make first challenge generation synchronous so it's always present by the time results page loads. Add a "mark as done" button on each challenge that triggers the next one automatically. Show a completion counter ("Challenges completed: 3") on the dashboard.

---

## Spec 2: Skill Map Visual Overhaul

**Council Source**: Move 2 (all 5 advisors), S-Gap5, H-Gap5, B-Gap5, G-Gap3
**Behavioral Intent**: The skill map should make someone say "whoa." It should feel like a game world you're exploring, not a chart with better colors. Mastered territory should feel dominant. Future territory should feel mysterious. The user should feel "look how far I've come," not "look how far I have to go."

### Current State
- SVG-based map with circles for nodes, rectangles for level regions (`rpg-map.tsx`, 428 lines).
- Three node states: green (filled circle + checkmark + glow), yellow (pulsing border), red (dimmed circle).
- Fog of war as static gradient overlay on levels beyond current+1 (`rpg-map.tsx:408-424`).
- Bezier curve paths connecting nodes with animated progress via Framer Motion (`rpg-map.tsx:204-226`).
- Level regions are labeled rectangles with light background fills.
- Click popover on unlocked nodes shows skill name, description, status, explanation, verify button.
- Fogged nodes are not clickable (`rpg-map.tsx:271`: `cursor: isLocked ? "default" : "pointer"`).

### Requirements
- [ ] **"You Are Here" indicator**: The active skill (first yellow skill at the user's active level) gets a distinct pulsing marker, a glow ring or character icon, that is visually different from other yellow nodes. Not just another pulsing circle.
- [ ] **Node visual hierarchy**: Green/mastered nodes should be visually larger or more prominent than red/not-started nodes. Mastered territory should dominate the visual field.
- [ ] **Fog-of-war click interaction**: Clicking a fogged node shows a silhouette or "?" with text: "Keep going to discover this skill." Not just a dead click.
- [ ] **Level regions with identity**: Each level region gets a name and visual identity beyond a colored rectangle. At minimum: a thematic icon or illustration per region (village icon for Foundations, road icon for Accelerator, workshop icon for Thought Partner, command center for Specialized Teammates, space/rocket for Agentic Workflow).
- [ ] **Fog-lift animation on level-up**: When a user completes a level, the fog on the next region lifts with an animation (opacity transition, reveal sweep, or particle effect). This can be triggered in the level-up celebration dialog already in `dashboard.tsx:631-651`.
- [ ] **Path lighting**: The path between nodes should light up (change color from muted to bright) as skills are mastered, not just show a progress fraction.
- [ ] **Mobile layout**: On screens below 600px width, the map should reflow to a vertical scrollable layout rather than just shrinking the SVG.

### Technical Approach
- **Component to modify**: `client/src/components/rpg-map.tsx` (full rewrite of visual layer, keep data/logic layer)
- **"You Are Here"**: Add a computed `activeSkillId` (first yellow skill at `activeLevel`). Render a distinct marker: larger glow ring, MapPin icon, or small character SVG centered on that node. Animate with Framer Motion `animate={{ scale: [1, 1.1, 1] }}`.
- **Node hierarchy**: Green nodes: `r={NODE_RADIUS + 4}`, with filled glow filter. Red nodes: `r={NODE_RADIUS - 2}`, lower opacity. This makes mastered territory visually dominant.
- **Fogged click**: Remove the `isLocked` cursor check. Add a separate popover for fogged nodes with mystery text and a lock icon.
- **Level region identity**: Add per-level SVG icons or emoji renders inside each region rectangle. Map `visualTheme` field from the levels table (already exists in `schema.ts:62`) to icons.
- **Fog-lift animation**: Track a `newlyUnlockedLevel` state in the RPGMap component. When detected (compare previous and current assessmentLevel), animate the fog rect from `opacity: 0.7` to `opacity: 0` over 1.5 seconds.
- **Path lighting**: Instead of a single progress path, render individual path segments between consecutive nodes. Color each segment based on whether both endpoints are green.
- **Mobile**: Use CSS media query or the `use-mobile.tsx` hook. Below 768px, switch viewBox to a taller, narrower layout. Or render a `<div>` list of level sections with horizontal scroll per level.
- No API changes needed.
- No database changes needed (visualTheme field already exists).

### Priority
- Impact: **High** (all 5 advisors, the map is the primary visual metaphor)
- Effort: **Large** (significant SVG rework, visual design decisions needed)
- Dependencies: None (can be built independently)
- Recommendation: **Build next** (after Spec 1, because Spec 1 is smaller and higher urgency)

### Straightforward vs. Ambitious
- **Straightforward**: "You Are Here" marker, node size hierarchy, fogged node click with mystery text, path lighting. Keep the existing SVG structure, just enhance it. One sprint.
- **Ambitious**: Full terrain-based map with illustrated regions (village, road, workshop, command center, space station). Character icon that moves along the path. Hidden "Easter egg" nodes that appear after mastering certain skill combinations. Parallax scrolling effect. Custom illustration or Lottie animations per region. Two sprints.

---

## Spec 3: Team Layer on Dashboard

**Council Source**: Move 3 (4 advisors), S-Gap3, M-Gap2, G-Gap4
**Behavioral Intent**: The product knows who's on a team together and doesn't use that information beyond the results page. An enterprise product without ongoing social proof treats AI fluency as a solo journey inside a team context. The Herd should be visible.

### Current State
- `GET /api/team/snapshot` returns memberCount, completedCount, averageLevel, levelDistribution, recentCompletions, userRank (`routes.ts:369-430`).
- `GET /api/social/skill-completion` returns per-skill completion rates for the org (`routes.ts:643-663`). **Never called from client.**
- `GET /api/activity/org` returns org activity feed (`routes.ts:635-640`). Only called from manager dashboard, not user dashboard.
- Results page has team section (`results.tsx:829-923`).
- Dashboard (`dashboard.tsx`) has zero team context.
- Skill map node popovers (`rpg-map.tsx:346-387`) show no team completion data.

### Requirements
- [ ] **Dashboard team activity feed**: Add a "Team Activity" section to the dashboard showing recent org activity (assessment completions, skill verifications, level-ups). Use the existing `/api/activity/org` endpoint or create a user-facing version that shows anonymized first names only.
- [ ] **Skill node social proof**: On the RPG map node popovers, show "X of Y team members have mastered this skill" for each skill. Call `/api/social/skill-completion` and pass data to RPGMap component.
- [ ] **Dashboard team snapshot card**: Show a compact team snapshot on dashboard (member count, average level, user's position). Reuse the `/api/team/snapshot` endpoint.
- [ ] **Solo user messaging**: When user has no orgId, show "Just you so far. This gets even better with your team." with an invite link. (Already done on results page, replicate on dashboard.)
- [ ] **Active skill benchmark**: On the "Your Active Skill" card on dashboard, add "Most people at your level complete this skill in about X weeks" (can be a static estimate or computed from data).

### Technical Approach
- **Component to modify**: `client/src/pages/dashboard.tsx`
  - Add `useQuery` for `/api/team/snapshot` (already used on results page, copy the pattern).
  - Add `useQuery` for `/api/social/skill-completion`.
  - Add `useQuery` for `/api/activity/org` (or a user-facing variant).
  - Add a "Team" card below the 3 stat cards, showing compact team snapshot.
  - Add a "Team Activity" section below the RPG map, showing recent activity items.
- **Component to modify**: `client/src/components/rpg-map.tsx`
  - Add `socialCompletion` prop: `Record<number, { completed: number; total: number }>`.
  - In the PopoverContent for each node, add a line: `{socialCompletion[skill.id]?.total > 1 && <p>{socialCompletion[skill.id].completed} of {socialCompletion[skill.id].total} team members have mastered this</p>}`.
- **API change**: The `/api/social/skill-completion` endpoint is expensive (loops through all members and all skills). Add caching (compute once per hour) or restructure the query to use a single SQL aggregation.
- No database changes needed.

### Priority
- Impact: **High** (4 advisors, fundamental for enterprise product)
- Effort: **Medium** (UI work + passing data through, API already exists)
- Dependencies: None (can be built independently)
- Recommendation: **Build next** (alongside or after Spec 1)

### Straightforward vs. Ambitious
- **Straightforward**: Dashboard team snapshot card, skill node completion percentages, basic activity feed (recent completions only). One sprint.
- **Ambitious**: Team skill map overlay showing aggregate team progression. Skill-claiming ("Sarah is your team's prompt engineering person"). Cooperative skill quests where teammates work on the same skill. "Assessment Day" team ritual mode.

---

## Spec 4: Investment Moment (Skill Choice + Commitment)

**Council Source**: Move 4 (4 advisors), H-Gap3, B-Gap2, G-Gap5, S-Gap2 (partial)
**Behavioral Intent**: The user needs to put something in after results. Choosing your path is what turns an assignment into a quest. Investment creates stored value, the IKEA effect, and loads the next trigger. Without it, the product is better for a stranger tomorrow than it is for the user.

### Current State
- Journey setup exists on results page: frequency (weekly/twice_weekly/every_other_day/daily) + preferred day (`results.tsx` phase "journey", `routes.ts:350-367`).
- System auto-assigns the first skill via `firstMove` in the scoring prompt (`assessment-ai.ts:84`).
- User cannot choose which skill to work on. No skill selection UI anywhere.
- No "I commit to X" public commitment. No logged skill moments. No personal AI journal.

### Requirements
- [ ] **Skill choice on results page**: After showing the system's recommended first move, present 2-3 alternative yellow skills and let the user pick. Frame it as: "Alyssa recommends [X]. But you could also start with [Y] or [Z]. Which one speaks to you?" The chosen skill becomes the active skill for challenge generation.
- [ ] **Active skill stored on user or assessment**: Add an `activeSkillId` field to the users table (or use the assessment's `firstMoveJson` field). The cron job and challenge generation should use this field to determine which skill to target.
- [ ] **Dashboard skill choice**: On the "Your Active Skill" card, add a "Switch Skill" button that lets the user change their active skill to any other yellow skill.
- [ ] **Challenge completion logging**: Add a "I tried this" or "Mark as Done" button on each challenge (nudge). When clicked, increment a counter on the `userSkillStatus` record (add a `practiceCount` field) and show a brief celebration.

### Technical Approach
- **Component to modify**: `client/src/pages/results.tsx` (phase "firstmove")
  - After showing the ChallengeCard, add a skill picker section. Show the recommended skill plus 2 alternatives (next yellow skills from the same level or the next level).
  - When user picks a skill, call `PATCH /api/auth/me` with `activeSkillId` or a new endpoint.
- **API to add**: `PATCH /api/user/active-skill` or add `activeSkillId` to the allowed fields in `PATCH /api/auth/me` (`routes.ts:105-108`).
- **Database change**: Add `activeSkillId` column to users table (`schema.ts`). Integer, nullable, references skills.id.
- **Component to modify**: `client/src/pages/dashboard.tsx` (active skill card, lines 332-349)
  - Add a "Switch Skill" dropdown or modal that shows all yellow skills.
- **Component to modify**: `client/src/pages/dashboard.tsx` (nudge section)
  - Add "I tried this" button on each nudge card. On click, call a new endpoint or update the nudge's `inAppRead` to true AND increment `userSkillStatus.streakCount` (or a new `practiceCount` field).
- **Server change**: `server/cron.ts` `runNudgeGeneration` should prefer the user's `activeSkillId` over random yellow skill selection.
- **Database change** (optional): Add `practiceCount` integer column to `userSkillStatus` table.

### Priority
- Impact: **High** (4 advisors, closes the Hook loop)
- Effort: **Medium** (new DB field, skill picker UI, endpoint changes)
- Dependencies: None (can be built independently, but pairs well with Spec 1)
- Recommendation: **Build next** (Phase 2, after Spec 1)

### Straightforward vs. Ambitious
- **Straightforward**: Skill choice (pick from 2-3 alternatives), "Switch Skill" on dashboard, "I tried this" button on challenges. One sprint.
- **Ambitious**: Skill moments journal (voice or text entries about AI use during the week, Alyssa responds with a 15-second analysis). Public micro-commitments visible on team dashboard. "Hard Mode" option for each challenge with constraints and double XP.

---

## Spec 5: Action Triggers in Nudges

**Council Source**: S-Gap2, H-Gap4
**Behavioral Intent**: Nudges should include a specific action trigger: "Next time you open ChatGPT to draft an email, try this instead." The format is: trigger moment + new behavior + time estimate. Not "here's a skill to learn" but "here's exactly when to use it and what to do." The `triggerMoment` captured during assessment should personalize this.

### Current State
- `triggerMoment` is captured in the scoring prompt (`assessment-ai.ts:90-91`) and stored in the assessments table (`schema.ts:101`).
- `triggerMoment` is returned in the API response (`routes.ts:296`).
- `triggerMoment` is NEVER used: not in nudge generation (`nudge-ai.ts`), not in email templates (`email.ts`), not in cron delivery timing (`cron.ts`).
- The nudge generation prompt (`nudge-ai.ts:36-60`) generates an "action" component but it's not framed as an if-then trigger. It describes what to do, but not when to do it.

### Requirements
- [ ] **Weave triggerMoment into nudge generation prompt**: In `nudge-ai.ts`, pass the user's `triggerMoment` (from their latest assessment's contextSummary or triggerMoment field) into the nudge generation prompt. Add a line: "The user said they typically reach for AI during: [triggerMoment]. Frame the action around that specific moment."
- [ ] **Add trigger_context to nudge content schema**: Add a `trigger_context` field to the nudge JSON content. Example: "Next time you're planning your week on Monday morning, open ChatGPT and try this..."
- [ ] **Display trigger context in nudge UI**: Show the trigger_context prominently at the top of the challenge card, before the opener. Frame it as "When to try this."
- [ ] **Email template trigger**: Include the trigger_context in the nudge email template so the email subject line or first line references the user's specific workflow moment.

### Technical Approach
- **File to modify**: `server/nudge-ai.ts` function `generateNudge`
  - After line 25 (`const contextSummary = ...`), also fetch `triggerMoment` from the assessment: `const triggerMoment = latestAssessment?.triggerMoment || "";`
  - Add to the user prompt (around line 43): `Trigger moment: ${triggerMoment || "Not specified"}`
  - Add to the JSON output format: `8. "trigger_context": Frame this as an if-then trigger tied to their daily workflow. If they mentioned a trigger moment, use it. Example: "Next time you [trigger], try [action]." If no trigger moment, suggest a natural one.`
- **File to modify**: `server/email.ts` function `sendNudgeEmail`
  - Pull `trigger_context` from `nudge.contentJson` and display it as a callout before the main content.
- **File to modify**: `client/src/pages/dashboard.tsx` nudge display section (lines 423-461)
  - Show `content.trigger_context` as a highlighted line above the opener.
- **File to modify**: `client/src/pages/results.tsx` ChallengeCard component
  - Show `content.trigger_context` in the expanded challenge view.
- No database schema changes (contentJson already stores arbitrary JSON).

### Priority
- Impact: **Medium** (2 advisors, improves nudge effectiveness but not the primary blocker)
- Effort: **Small** (prompt changes + UI display)
- Dependencies: None
- Recommendation: **Build in Phase 2**

### Straightforward vs. Ambitious
- **Straightforward**: Add triggerMoment to nudge prompt, add trigger_context to nudge JSON, display in UI and email. One sprint.
- **Ambitious**: Let users set their own triggers during assessment. Alyssa asks: "When do you usually reach for AI?" Personalized delivery timing (send the nudge the night before their trigger moment, e.g., Sunday night for "Monday morning planning"). Browser extension or Slack integration that surfaces a one-line prompt in context.

---

## Spec 6: Variable Reward on Dashboard

**Council Source**: H-Gap2, B-Gap3, G-Gap2
**Behavioral Intent**: The dashboard should not be a receipt. Each visit should reveal something new. Predictable rewards stop working. The dashboard needs variability tied to the user's data, not just a static display of their current state.

### Current State
- Dashboard (`dashboard.tsx`) shows: level badge, skills mastered count, latest nudge, active skill card, live sessions, badges, RPG map.
- This is the same layout every visit. The only varying content is the latest nudge (which changes weekly or less).
- No "Skill of the Day," no rotating insights, no team signal feed, no progress streaks, no "Did You Know?" element.

### Requirements
- [ ] **Rotating insight card**: Add a card to the dashboard that surfaces a different insight each visit. Pull from assessment data. Examples: "You mentioned using AI for email drafts. That's actually a Level 2 skill called Prompt Refinement." "Your signature skill is [X]. Only 15% of users score as high on this." "You're 1 skill away from Level 4." Rotate through a set of 5-10 generated insights.
- [ ] **Progress streak display**: Show current streak (consecutive weeks with challenge completion). Already have `streakCount` on `userSkillStatus`. Surface it prominently with a flame icon and count.
- [ ] **Team signal feed** (if user has org): Show 2-3 recent team events. "3 people on your team leveled up this week." "Your team's most-practiced skill this month: [X]." Reuses `/api/activity/org` data.
- [ ] **Stakes indicator** (optional): Show days since last assessment and a gentle "skills drift" nudge after 60+ days. "Your AI fluency was assessed 45 days ago. Skills develop quickly when you practice."

### Technical Approach
- **Component to create**: `client/src/components/insight-card.tsx`
  - Receives assessment data, user skills, and team data.
  - Generates an array of insight strings from the data.
  - Uses a daily seed (date-based hash) to select which insight to show, so it changes daily but stays consistent within a day.
- **Component to modify**: `client/src/pages/dashboard.tsx`
  - Add InsightCard between the 3 stat cards and the active skill card.
  - Add team signal section (if orgId exists) using `/api/activity/org`.
  - Add streak display near the badges section (reuse existing streak data from user or userSkillStatus).
- **API**: No new endpoints needed. Insight generation is client-side from existing data. Team activity uses existing endpoint.
- **Database**: No changes needed.

### Priority
- Impact: **Medium** (3 advisors, improves retention but not the primary conversion blocker)
- Effort: **Small-Medium** (new component + data wiring)
- Dependencies: Spec 3 (team layer) for team signal feed
- Recommendation: **Build in Phase 2**

### Straightforward vs. Ambitious
- **Straightforward**: Rotating insight card from assessment data, streak display, days-since-assessment counter. One sprint.
- **Ambitious**: AI-generated daily insights that adapt to user behavior patterns. "You haven't opened a challenge in 2 weeks. Here's a 5-minute one." Gamified daily check-in with XP system. "Skill of the Day" with a targeted micro-exercise.

---

## Spec 7: User-Facing Copy Audit (Nudge to Challenge)

**Council Source**: From the Final Replit Push (not council directly, but supports identity framing from all 5 advisors)
**Behavioral Intent**: "Nudge" is behavioral design jargon. Users don't know what a nudge is. "Challenge" or "mission" creates a game-like frame that's more engaging. The council's emphasis on quest structure, hero identity, and game mechanics all support this naming change.

### Current State
- Dashboard (`dashboard.tsx`):
  - Line 326: `"unread nudge"` / `"unread nudges"`
  - Line 419: `"Latest Nudge"` (section header)
  - Line 469: `"No nudges yet"`
  - Line 471: `"Your first learning nudge arrives on {day}"`
- Settings (`settings.tsx`):
  - Line 156-157: `"Weekly nudge emails"`, `"Receive weekly learning nudges via email"`
- Manager (`manager.tsx`):
  - Line 257: `"Nudges"` label next to toggle switch
  - Line 372-373: `"read a nudge"` in activity feed
- Email templates (`email.ts`):
  - Line 108: `"Your nudge for ${skill.name}"`
  - Line 139: `"personalized nudge"`
  - Lines 170, 223, 327, 361, 373: various "nudge" references

### Requirements
- [ ] Replace all user-facing "nudge" with "challenge" in `dashboard.tsx`.
- [ ] Replace all user-facing "nudge" with "challenge" in `settings.tsx`.
- [ ] Replace all user-facing "nudge" with "challenge" in `manager.tsx`.
- [ ] Replace all user-facing "nudge" with "challenge" in `email.ts` email templates.
- [ ] Keep all internal variable names, API routes, and database columns as "nudge" (per spec).

### Technical Approach
- String replacements only. No logic changes, no API changes, no database changes.
- Each file: find user-facing strings containing "nudge" and replace with "challenge."
- **Dashboard**: "Latest Nudge" -> "Latest Challenge", "unread nudge" -> "unread challenge", "No nudges yet" -> this copy gets rewritten per Spec 1.
- **Settings**: "Weekly nudge emails" -> "Weekly challenge emails", "learning nudges" -> "learning challenges".
- **Manager**: "Nudges" toggle label -> "Challenges", "read a nudge" -> "read a challenge".
- **Email**: "Your nudge for" -> "Your challenge for", "personalized nudge" -> "personalized challenge".

### Priority
- Impact: **Low-Medium** (supports game framing, but won't move metrics alone)
- Effort: **Small** (string replacements)
- Dependencies: Build alongside Spec 1 (since both modify dashboard copy)
- Recommendation: **Build in Phase 1** (easy wins, do during Spec 1)

### Straightforward vs. Ambitious
- **Straightforward**: Find-and-replace all user-facing "nudge" strings. 30 minutes.
- **Ambitious**: Full copy audit of all user-facing text against StoryBrand and identity frameworks. Rewrite section headers, button labels, empty states, and email subject lines for heroic framing.

---

## Spec 8: Elevation at the Transition (Surprise Element)

**Council Source**: M-Gap4 (Power of Moments)
**Behavioral Intent**: Add one unexpected element to the results page. A script-breaking reframe at the exact moment the user expects generic congratulations. The user should feel surprise, not just satisfaction.

### Current State
- Results page has bright spots and future self, which are personalized. But they're expected sections in the reveal sequence, not surprises.
- `triggerMoment` is stored but displayed nowhere on results page.
- No "hidden metric" or unexpected personal observation.

### Requirements
- [ ] **Display triggerMoment**: If the assessment captured a triggerMoment (non-empty string), show it during the results reveal as a personal observation. "Alyssa noticed something: you said you reach for AI during [triggerMoment]. That's actually a strong signal, people who have a natural AI trigger moment build skills 2x faster." Frame it as a surprise insight.
- [ ] **Personalized comparison line**: Add a line in the bright spots section or after the level reveal. "Based on what you told Alyssa, you're ahead of most people at your level on [X]." This requires adding a `percentile` or `comparison` field to the scoring output.
- [ ] **Visual surprise**: One moment in the reveal that breaks the pattern. All other phases fade up from below. One phase should enter differently, a zoom, a color flash, or a sound. The signature skill reveal is the best candidate.

### Technical Approach
- **Component to modify**: `client/src/pages/results.tsx`
  - Add a phase between "futureself" and "firstmove" called "insight" (or insert triggerMoment display into an existing phase).
  - If `assessment.triggerMoment` is non-empty, render it with distinct styling (different card color, different animation).
  - For the signature skill phase, change the `initial` animation from `{ opacity: 0, y: 30 }` to `{ opacity: 0, scale: 0.8, rotate: -5 }` for a distinct entrance.
- **Server change** (optional for comparison line): Add a `comparisonText` field to the scoring prompt in `assessment-ai.ts`. "Generate a one-sentence comparison: how does this user stack up against others at their level? Be specific." This requires no real data, just Claude's estimation based on the conversation quality.
- No database changes (triggerMoment already stored).

### Priority
- Impact: **Medium** (1 advisor, but moments disproportionately affect memory of the entire experience)
- Effort: **Small** (display existing data + animation tweak)
- Dependencies: None
- Recommendation: **Build in Phase 2**

### Straightforward vs. Ambitious
- **Straightforward**: Display triggerMoment as a surprise insight card, vary the signature skill animation. 2-3 hours.
- **Ambitious**: Hidden "26th metric" (AI instinct score, curiosity index, or similar) generated by the scoring prompt and revealed as a surprise. "There's one more thing. Alyssa noticed you naturally ask the right follow-up questions when AI gives you something incomplete. That's not one of the 25 skills. It's something we track separately, and it's rare."

---

## Spec 9: Success Vision on Dashboard

**Council Source**: B-Gap4 (StoryBrand)
**Behavioral Intent**: The user sees "You're Level 3" on their dashboard but never sees what Level 4 looks and feels like. "20/25 skills mastered" is a stat, not a vision. The hero needs to see what success looks like.

### Current State
- `futureSelfText` is generated by Claude during scoring (`assessment-ai.ts:89`) and displayed on the results page during the "futureself" phase.
- Dashboard shows level number and name, mastered count, and progress bar. No vision of the next level.
- No "day in the life" snapshots for any level.

### Requirements
- [ ] **Future self on dashboard**: Show the `futureSelfText` on the dashboard, below the level badge card or near the active skill card. Label it "What's ahead" or "Your next level."
- [ ] **Level aspiration text**: For each level, store or generate a 1-2 sentence "day in the life" description. Show the next level's description on the dashboard. "Level 4 means: You have AI systems that handle your weekly reporting, flag anomalies, and draft responses you only need to edit."

### Technical Approach
- **Component to modify**: `client/src/pages/dashboard.tsx`
  - After the 3 stat cards, add a card showing `assessment.futureSelfText` with a label like "Your path forward."
  - Optionally, add a level aspiration text. This could come from the levels table `description` field (already exists in `schema.ts:60`) or be hardcoded for the 5 levels.
- No API changes (futureSelfText already returned with assessment data).
- No database changes.

### Priority
- Impact: **Low-Medium** (1 advisor, but contributes to ongoing motivation)
- Effort: **Small** (display existing data)
- Dependencies: None
- Recommendation: **Build in Phase 3**

### Straightforward vs. Ambitious
- **Straightforward**: Show futureSelfText on dashboard. Add static "day in the life" text per level to the levels table descriptions. 1-2 hours.
- **Ambitious**: AI-generated, role-specific level aspirations that update based on the user's progression. "As a product manager who's already mastered workflow design, Level 4 for you means..."

---

## Spec 10: Stakes / Cost of Inaction

**Council Source**: B-Gap3 (StoryBrand)
**Behavioral Intent**: Without consequence, clarity fades. The hero needs to understand what happens if they do nothing. Not fear-mongering, but honest framing of skill decay and peer comparison.

### Current State
- No drift indicator anywhere.
- No time-based urgency messaging.
- No cost-of-inaction framing.
- Re-assessment reminder email goes out at 90 days (`cron.ts`), but the dashboard shows nothing before that.

### Requirements
- [ ] **Days since assessment**: Show "Assessed X days ago" on the dashboard level card.
- [ ] **Gentle drift messaging**: After 30 days, add a yellow-tinted callout: "AI skills develop fastest with regular practice. It's been [X] days since your assessment." After 60 days: "Consider a re-assessment to see how you've grown." After 90 days: "Time for a check-in. Retake the assessment to update your skill map."
- [ ] **Peer context** (optional): "You're Level 3. 2 people on your team have reached Level 4." Show only when relevant (team context exists and someone is ahead).

### Technical Approach
- **Component to modify**: `client/src/pages/dashboard.tsx`
  - Compute `daysSinceAssessment` from `assessment.completedAt`.
  - Add conditional callout card based on day thresholds.
- No API changes. No database changes.

### Priority
- Impact: **Low** (1 advisor, and stakes messaging must be handled carefully to avoid being annoying)
- Effort: **Small** (conditional rendering based on date math)
- Dependencies: None
- Recommendation: **Build in Phase 3**

### Straightforward vs. Ambitious
- **Straightforward**: Days-since counter and threshold-based messaging. 1-2 hours.
- **Ambitious**: "Skills decay" visualization on the RPG map (mastered nodes slowly dim if not practiced, reversible with activity). Peer comparison with specific names and levels.

---

## Spec 11: One-Liner / Shareable Story

**Council Source**: B-Gap6 (StoryBrand)
**Behavioral Intent**: The user can't repeat what this product does to a colleague in one sentence. Miller's formula: Problem + Solution + Result. A personal, shareable version gives users language to describe their own experience.

### Current State
- Landing page has "Find out where you are on your AI journey" which is a tagline, not a One-Liner.
- Results page share section (`results.tsx` phase "share") generates a shareable link but no personal story text.
- No "Here's your story" output anywhere.

### Requirements
- [ ] **Personal story line on results page**: After results, show: "Here's your story: You came in as a [Level X]. You discovered [key insight from bright spots]. Your next move is [first skill]." Make it copyable for sharing.
- [ ] **Product One-Liner**: Add a consistent problem-solution-result statement to the landing page, share cards, and email templates. Draft: "Most people don't know what they don't know about AI. A 10-minute conversation maps exactly where you stand, so you know the one skill that will change how you work this month."

### Technical Approach
- **Component to modify**: `client/src/pages/results.tsx` (share section)
  - Generate a personal story string from assessment data: level, bright spots first sentence, first move skill name.
  - Add a "Copy your story" button.
- **Component to modify**: `client/src/pages/landing.tsx`
  - Add the One-Liner to the hero section or below it.
- No API changes. No database changes.

### Priority
- Impact: **Low** (1 advisor, but supports virality and word-of-mouth)
- Effort: **Small** (copy generation from existing data)
- Dependencies: None
- Recommendation: **Build in Phase 3**

### Straightforward vs. Ambitious
- **Straightforward**: Personal story line on results page share section, One-Liner on landing page. 1-2 hours.
- **Ambitious**: AI-generated shareable stories tailored to the user's role and industry. Social card images with the user's level, signature skill, and a branded visual. OG meta tags for rich link previews when shared on LinkedIn/Slack.

---

## Sequenced Build Plan

### Phase 1: Unblock Everything (Size: S, 1-2 days)

These changes are small, high-impact, and unblock the rest of the system.

| Spec | What to Build | Files | Size |
|------|---------------|-------|------|
| Spec 1 | Kill "No nudges yet" dead end, add polling/loading state for first challenge, add "Keep Going" button on dashboard | `dashboard.tsx` | S |
| Spec 7 | Replace all user-facing "nudge" with "challenge" | `dashboard.tsx`, `settings.tsx`, `manager.tsx`, `email.ts` | S |

**Why first**: All 5 advisors flagged the dead end as the single highest priority. The copy audit rides along since you're already in the dashboard file.

### Phase 2: High Impact, Medium Effort (Size: M, 3-5 days)

These are the features that transform the product from "functional assessment tool" into "engaging learning platform."

| Spec | What to Build | Files | Size |
|------|---------------|-------|------|
| Spec 3 | Team layer on dashboard (team snapshot card, activity feed, skill node social proof) | `dashboard.tsx`, `rpg-map.tsx` | M |
| Spec 4 | Investment moment (skill choice, "I tried this" button, active skill switching) | `results.tsx`, `dashboard.tsx`, `schema.ts`, `routes.ts`, `cron.ts` | M |
| Spec 5 | Action triggers in nudges (use triggerMoment, add trigger_context to nudge content) | `nudge-ai.ts`, `email.ts`, `dashboard.tsx`, `results.tsx` | S |
| Spec 8 | Elevation surprise (display triggerMoment, vary signature skill animation) | `results.tsx` | S |

**Dependencies**: Spec 4 requires a DB migration (add `activeSkillId` to users). Spec 3 and Spec 5 are independent. Spec 8 is independent.

### Phase 3: Polish and Depth (Size: M-L, 3-5 days)

These improve retention and long-term engagement.

| Spec | What to Build | Files | Size |
|------|---------------|-------|------|
| Spec 6 | Variable reward on dashboard (insight card, streak display, team signal feed) | `dashboard.tsx`, new `insight-card.tsx` | M |
| Spec 9 | Success vision on dashboard (futureSelfText, level aspiration) | `dashboard.tsx` | S |
| Spec 10 | Stakes / cost of inaction (days since assessment, drift messaging) | `dashboard.tsx` | S |
| Spec 11 | One-Liner / shareable story (personal story on results, product One-Liner) | `results.tsx`, `landing.tsx` | S |

### Phase 4: The Ambitious Map (Size: L, 5-10 days)

The skill map overhaul is the biggest single effort and benefits from all other specs being in place first.

| Spec | What to Build | Files | Size |
|------|---------------|-------|------|
| Spec 2 | Skill map visual overhaul ("You Are Here" marker, node hierarchy, fogged node interaction, level region identity, fog-lift animation, path lighting, mobile layout) | `rpg-map.tsx` (rewrite) | L |

**Why last**: The map overhaul is the largest effort and needs design decisions. The straightforward version (marker + hierarchy + fogged click) could ship in Phase 2, but the full "game world" vision needs more time and likely visual design input from Katrina.

**Alternative sequencing**: Pull the straightforward map improvements (You Are Here marker, fogged node click, node size hierarchy) into Phase 2 and leave the ambitious terrain/illustration work for Phase 4.

---

## Dependency Map

```
Phase 1 (S)
  Spec 1: Kill dead end ──────────────────┐
  Spec 7: Copy audit (rides along) ───────┤
                                          │
Phase 2 (M)                               │
  Spec 3: Team layer (independent) ───────┤
  Spec 4: Investment moment ──────────────┤── needs DB migration
  Spec 5: Action triggers (independent) ──┤
  Spec 8: Elevation surprise (independent)│
                                          │
Phase 3 (M)                               │
  Spec 6: Variable reward ────────────────┤── depends on Spec 3 for team feed
  Spec 9: Success vision (independent) ───┤
  Spec 10: Stakes (independent) ──────────┤
  Spec 11: One-Liner (independent) ───────┤
                                          │
Phase 4 (L)                               │
  Spec 2: Skill map overhaul ─────────────┘── benefits from Spec 3 (social data on nodes)
```

Most specs are independent. The main dependencies are:
- Spec 6 (variable reward) benefits from Spec 3 (team layer) for the team signal feed.
- Spec 2 (skill map) benefits from Spec 3 (social data to show on node popovers).
- Spec 4 (investment) requires a database migration, which should happen early.

---

## Don't Break List

Preserve these during all builds:

1. **Assessment conversation** (assessment.tsx, assessment-ai.ts): Don't change Alyssa's conversational style, insight reframes, or voice-first approach.
2. **11-phase results reveal** (results.tsx): Don't remove phases, change timing, or reduce animation quality. Add to it, don't subtract.
3. **Scoring outputs** (assessment-ai.ts scoring prompt): Don't remove signatureSkillName, brightSpotsText, futureSelfText, triggerMoment, or contextSummary. They're all well-designed and correctly generated.
4. **Nudge content structure** (nudge-ai.ts): opener, idea, use_case, action, reflection, story. This structure works. Add to it (trigger_context), don't replace it.
5. **Verification quiz** (nudge-ai.ts verification, dashboard quiz dialog): The 3-MCQ quiz with confetti on pass and level-up celebration works well. Don't change the flow.
6. **Badge system** (badge-svg.ts, dashboard badges): Download, LinkedIn share, copy link. Working well.
7. **Journey setup** (results.tsx journey phase, routes.ts journey-setup): Frequency picker and day selector. Working well.
8. **Team snapshot on results page** (results.tsx team section): Already good. Don't remove it; extend it to dashboard.
9. **Email preference system** (settings, unsubscribe, email.ts checks): Respect opt-outs. Don't break unsubscribe flow.
10. **Admin testing tools** (admin.tsx, routes.ts admin test endpoints): Keep all 6 test buttons. They're essential for QA.
