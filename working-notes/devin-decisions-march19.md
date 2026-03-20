# Devin's Product Decisions — March 19, 2026

All decisions made by Devin during this session. These are authoritative — they override previous assumptions and expert recommendations where they conflict.

---

## Slider UX

1. **Scale is 1-5, not 0-10.** No zero. "I don't even need a 0, just 1 to 5, not 0 to 5."
2. **No color coding on sliders.** No red/yellow/green. "I don't want to stigmatize being a 1. I want to make it exciting."
3. **Sliders are one-time only.** They exist for this one post-assessment moment. They are NOT an ongoing tracking UX. "Let's not overcomplicate this... it's literally just for this one part of the assessment."
4. **Labels for 1-5:** Just getting started (1), Experimenting (2), Using it sometimes (3), Regular part of my work (4), Second nature (5).

## Lex Conversation Design

5. **Kill the insight reframe entirely.** "It sounds like a waste of time. Just have Lex really try to understand what their work is." No mid-conversation skill labeling.
6. **Lex should deliver the assessment verbally.** After enough signal from work context + AI questions, Lex says: "I'd put you at [Level]. Your first Power Up should be [X]. It's going to achieve [outcome] for you." Then asks "Does that feel right to you?"
7. **If user says "hell yeah" → done.** If they push back → continue the conversation. "If the person's going to give 20 minutes because they're engaged and they really want to get it right, that's going to dramatically improve the quality of the assessment."
8. **Market as 10-minute conversation.** "I want that to not just be vaporware. I want that to be true and possible." But don't cut off engaged users. No hard cap.
9. **Voice is the primary path for beta testers.** Text is fallback.

## Lex Pause-and-Return (Slider Hosting)

10. **Devin's vision:** Lex introduces sliders → goes quiet → user adjusts sliders → Lex comes back and delivers the level + first Power Up + "does that sound right?"
11. **Technical reality (accepted):** ElevenLabs has no session memory across WebSocket connections. For beta, we're using **Option A**: Lex delivers the assessment verbally in the same call (before disconnect), then sliders appear in the app as a quick gut-check after. Full pause-and-return is a V2 enhancement.
12. **Devin agreed to this pragmatic approach** when presented with the technical constraint.

## Beta Strategy

13. **Beta testers come as orgs**, not individuals. Traceability and Wayfinder are the two test groups.
14. **Devin will roll this out as part of his org.** "If I'm going to roll this out to people, I want this to be part of my org."

## Previous Decisions (from voice notes, still active)

These were captured in an earlier session from Devin's 48-minute driving voice notes:

15. **MVP scope:** Assessment + email nudges (Power Ups) + group progress visibility.
16. **Power Up branding:** "Electric Thinking Power Ups" or "AI Power Ups." Each unit is a "Power Up."
17. **LEX interview redesign:** Work-context-first (60-70% of conversation), then AI questions.
18. **Group progress visualization:** NOT a competitive leaderboard. Anonymous group snapshot. "Look at how all of us are leveling up." Never show "behind."
19. **Email nudges:** Lead with the outcome, not the process or skill name. Every interaction should try to hook.
20. **Assessment validation:** "Here's my checkboxes on you. Does this seem right?" (user validates). IMPLEMENTED as the merged validation screen.
21. **Foundational behaviors first:** Voice-to-text and screenshots are the foundational behaviors. These come before anything else in the curriculum.
22. **Backup plan:** If app doesn't work: Google Form assessment + email generation campaign.
23. **Naming:** "Power Up" for units/sessions. "Next Power Up" as framing for each subsequent unit.

## What Devin Has NOT Decided Yet

- Whether the 5-level framework naming needs fixing (Explorer/Accelerator/Thought Partner/Specialized Teammates/Agentic Workflow — Rax flagged inconsistency)
- Whether to implement data export/deletion before beta or remove the landing page claims
- Whether the results page "I did it" flow should be moved to dashboard only
- Specific social proof strategy for the landing page
- Whether to pursue Slack integration for Power Up delivery
- How to handle assessment accuracy validation (Rax's uncomfortable question)
