# Expert Reviews Synthesis — March 19, 2026

Three AI expert agents reviewed the entire product. This is the consolidated findings.

## Agents

- **Nova** (UX Product Expert): Walked through all 11 steps of the user journey evaluating clarity, motivation, friction, value exchange, and recovery.
- **Vox** (ElevenLabs Expert): Reviewed the Lex V4 prompt against voice agent best practices and evaluated WebSocket integration.
- **Rax** (Challenger): Full product critique across 10 dimensions.

---

## LAUNCH BLOCKERS (fixed in Wave 1)

| Issue | Status | Agent |
|---|---|---|
| No password reset flow | FIXED — full flow implemented | Rax + Nova |
| "End Conversation" has no confirmation dialog | FIXED — dialog added to all 3 modes | Nova |
| Scoring has no retry on failure | FIXED — 3 retries with backoff | Nova + Rax |
| Sliders were 0-10, too much cognitive load | FIXED — changed to 1-5 | Nova + Rax |
| Sliders + validation were two separate screens | FIXED — merged into one | Nova |

## LAUNCH BLOCKERS (not yet fixed)

| Issue | Agent | Notes |
|---|---|---|
| Session secret has hardcoded fallback | Rax | `SESSION_SECRET \|\| "electric-thinking-secret-key"` in auth.ts. Combined with admin/admin123, anyone who reads the repo can forge admin sessions. FIX: crash if env var not set in production. |
| Landing page privacy promises not implemented | Rax + Nova | "Download or delete your data anytime" — neither exists. GDPR liability. FIX: either implement or remove the claims. |
| Admin password is admin123 | Rax | Seeded in seed.ts line 189. Must change manually via admin panel or DB. |

---

## HIGH PRIORITY (not yet implemented)

### From Nova (UX):
1. **Time-to-value is ~15 minutes**: 5 screens before conversation starts, then 10-min conversation, then scoring + validation. Landing → Register → Onboarding (2 steps) → Warmup → Conversation → Scoring → Validation → Results. Consider: deferring onboarding questions to after assessment, or collecting job title/AI platform inside the Lex conversation.
2. **No progress indicator across the full journey**: User has no idea they're 40% through or that results are coming.
3. **Mobile voice mode risky**: No detection of mobile before offering voice. iOS Safari has WebAudio restrictions. Consider defaulting to text on mobile.
4. **Abandoned assessment re-entry is rough**: No "Welcome back, you left off here" banner when returning to a partial assessment.
5. **Results page "I did it" button is premature**: Most users won't do the challenge in-session. Make dashboard the primary exit, not the challenge action.
6. **Share URL broken**: Share links point to /results (auth-required). Should point to landing page.
7. **Dashboard is dense on first visit**: No "What to do next" prioritization. Everything has equal visual weight.
8. **No onboarding tooltip for "Verify" button**: Users don't know what skill verification means.
9. **Power Up email CTA goes to generic /dashboard**: Should deep-link to specific nudge.
10. **Confetti fires too often**: Results reveal, reflection submit, skip reflection, quiz pass, level up. Reserve for significant moments only.

### From Vox (ElevenLabs):
1. **V4 prompt had minute-based timing** — FIXED in V5 (exchange count only).
2. **Opening was 3 sentences** — FIXED in V5 (trimmed to 2).
3. **Insight reframe felt generic** — FIXED in V5 (removed entirely per Devin's decision).
4. **No edge case handling** — FIXED in V5 (silence, short answers, off-topic).
5. **`agent_response_correction` not handled in transcript** (assessment.tsx line 249-250): Correction events update isSpeaking but don't replace previous agent message. Can produce duplicate messages in saved transcript.
6. **No user context passed to ElevenLabs**: Signed URL doesn't inject user name/context via dynamic variables. Lex can't greet by name in voice mode.
7. **createScriptProcessor is deprecated**: Works now but Chrome logging warnings. Migrate to AudioWorklet eventually.
8. **Transcript save on disconnect is best-effort**: If WebSocket closes abruptly (network loss), final exchanges may be lost.

### From Rax (Challenger):
1. **Scoring prompt generates ~40 structured outputs in one Claude call**: 25 skill scores + level + narrative + outcome options + bright spots + signature skill. High risk of malformed JSON. FIX: split into two calls (scores/level + narrative).
2. **triggerMoment is dead data**: Captured in scoring but never used in nudges, emails, or dashboard. This is the most powerful personalization signal being thrown away.
3. **Power Up emails are the ONLY retention mechanism**: No in-app notifications, no push, no SMS. If emails fail or land in spam, the product goes silent.
4. **Email delivery failures are not logged to DB**: console.error only. emailLogs table exists but isn't populated on failure.
5. **First challenge generation is fire-and-forget**: Async with no retry. Dashboard shows "Refresh in a moment" dead end.
6. **Enterprise vs individual tension unresolved**: Manager dashboard is thin. Individual dashboard has almost zero team context.
7. **Framework naming inconsistent**: Explorer/Accelerator are identities, Thought Partner is a relationship, Specialized Teammates is plural, Agentic Workflow is a technical concept.
8. **No re-assessment on demand**: Only quarterly email trigger. Users can't retake to prove growth.
9. **No transcript viewer**: Users can't review their conversation.
10. **Copy audit needed**: "nudge" still leaks through in API routes, variable names, and edge case UI.

---

## RAX'S UNCOMFORTABLE QUESTION

> Have you validated that the assessment itself is accurate? Have you had 20 people take it and independently checked whether the levels were correct? The entire product — dashboard, Power Ups, skill progression, team analytics — is downstream of one Claude API call parsing a 10-minute transcript. If that scoring is unreliable, everything built on top of it is decoration.

## RAX'S SECOND UNCOMFORTABLE QUESTION

> The most valuable moment — the 10-minute voice conversation — happens exactly once. Everything after that is less engaging. Have you considered that the assessment IS the product, and everything you're building around it is trying to justify a subscription for something that's fundamentally a one-time experience?

## NOVA'S TIME-TO-VALUE ANALYSIS

| Step | Time | Cumulative | Value Received |
|---|---|---|---|
| Landing | 30s | 0:30 | Promise |
| Registration | 45s | 1:15 | Nothing |
| Onboarding (2 steps) | 35s | 1:50 | Nothing |
| Warmup | 20s | 2:10 | Nothing |
| Conversation | 10:00 | 12:10 | One insight reframe (removed in V5) |
| Scoring wait | 45s | 12:55 | Nothing |
| Validation (merged) | 30s | 13:25 | **First real insight** |

Time-to-first-value is ~13 minutes. The conversation itself is engaging but isn't "value delivered" — it's investment. The payoff arrives at the validation screen.

## VOX'S LEX PROMPT RECOMMENDATIONS (applied to V5)

| Recommendation | Status |
|---|---|
| Remove minute references, exchange count only | DONE |
| Soft cap at 14-15 exchanges | DONE |
| Remove hard cap, let engaged users continue | DONE |
| Trim opening to 2 sentences | DONE |
| Promote 3-sentence max to first voice rule | DONE |
| Kill insight reframe | DONE |
| Add Assessment Delivery phase | DONE |
| Add edge case handling | DONE |
| Equal-weight Phase 1 and Phase 2 scoring | DONE |
| Remove SCORING GUIDANCE from voice prompt | DONE |
| Add follow-up breadth probe for AI question | DONE |
| Update closing to tee up sliders | DONE |
| Pass user name as dynamic variable to ElevenLabs | NOT DONE (enhancement) |
| Detect handoff line and auto-disconnect | NOT DONE (enhancement) |
| Fix agent_response_correction transcript handling | NOT DONE (bug) |
