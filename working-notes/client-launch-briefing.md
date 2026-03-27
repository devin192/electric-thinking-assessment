# Client Launch Briefing — Assessment Product

*For use by Devin's client strategy thread. Created March 26, 2026.*

**Purpose:** Give a separate Claude thread full context on the assessment product so it can help draft client communications, launch emails, and program kickoff messaging.

---

## What the Assessment Is

Electric Thinking built an AI fluency assessment that maps where someone is with AI and gives them personalized, actionable next steps. It's a web app at **assessment.electricthinking.ai**.

The experience takes about 15 minutes:

1. **Sign up** — email + password, pick a job title and primary AI platform
2. **Survey** (~3-5 minutes) — 5-20 adaptive questions. "Not yet / Sometimes / Always" on specific AI skills. The survey stops when it finds your growth edge, so most people answer 5-10 questions, not all 20.
3. **Conversation with Lex** (~8-10 minutes) — Lex is an AI guide who asks about your actual work. Voice or text. He digs into how AI fits your specific role, validates what you're already doing, and plants seeds about what's possible. At the end, he tells you your level and asks if it feels right.
4. **Results page** — Your level on the map (1-4), personalized outcomes tied to your work, a "first move" you can try right now, and a skill breakdown.

**This is NOT a quiz.** It's a survey + conversation. There are no wrong answers. The framing is "find out where you are" — no judgment, no pass/fail.

---

## The Four Levels

| Level | Name | One-liner |
|-------|------|-----------|
| 1 | Accelerator | Using AI to speed up everyday work |
| 2 | Thought Partner | Using AI as a collaborative thinking partner |
| 3 | Specialized Teammates | Building dedicated AI specialists for your work |
| 4 | Systems Designer | Designing autonomous AI-powered systems |

Most people land at Level 1 or 2. That's completely normal and expected. The levels are designed so that:
- **Level 1** feels achievable and exciting ("I can do this today")
- **Level 2** feels like a meaningful upgrade ("I'm bringing AI into my hard work, not just quick tasks")
- **Level 3** is where things get specialized ("I have AI teammates that actually know my job")
- **Level 4** is aspirational for most ("I'm designing systems, not just using tools")

**Key messaging point:** Every level is a good place to start. The assessment tells you what to focus on next, not what you're bad at.

---

## What Clients Have Been Told (So Far)

Based on Devin's conversations with Kenny and client discussions:

- Clients know there will be an "assessment" as part of the program
- They know it's personalized and AI-powered
- They likely do NOT know it's a standalone web app (this may be new info)
- They expect it to happen before the main training program starts
- The assessment results feed into the training — "What were your 3 personalized outcomes?" is a workshop question

**What hasn't been communicated yet:**
- The specific URL (assessment.electricthinking.ai)
- That it involves a voice/text conversation with an AI guide named Lex
- The four-level framework and level names
- The time commitment (~15 minutes)
- That it's individual (each person takes it separately, on their own time)

---

## The Team/Org Flow

The app supports organizations. Here's how it works for a client group:

1. **Devin (or admin) creates the org** in the admin panel and sets a **join code** (e.g., `BRACE2026`)
2. **One link goes in one email** — `assessment.electricthinking.ai/join/BRACE2026` (or they can go to `/join` and type the code)
3. **Everyone uses the same code** — it's reusable, not individual. 20 people can all use `BRACE2026`.
4. **Each team member clicks the link**, creates their account, and is automatically added to the org
5. **They take the assessment individually** on their own time
6. **Org admins/managers can see** aggregate results (levels, completion rates) but NOT individual conversation transcripts

**Privacy:** Each person's conversation with Lex is private. Managers see skill levels and assessment status, not what was said. This is important messaging for trust.

---

## What Results Look Like

After completing the assessment, each person sees:

- **Level on the map** — A visual showing all 4 levels with their position highlighted
- **Personalized outcomes** — 3 specific things tied to their actual work (e.g., "Your meeting recaps write themselves after every call")
- **First move** — One specific thing to try right now, referencing their tools and workflows
- **Bright spots** — What they're already doing well (specific to what they shared)
- **Skill breakdown** — Expandable detail on individual skills (green/yellow/red)
- **Share button** — Can share their level (not their full results)
- **Retake option** — Can retake if they want (replaces previous results)

---

## Technical Details for Launch Planning

- **URL:** assessment.electricthinking.ai
- **Works on:** Desktop and mobile browsers (Chrome, Safari, Firefox, Edge)
- **Voice mode:** Available on most desktop browsers and some mobile. If voice doesn't work, it falls back to text automatically. Text mode works everywhere.
- **Time commitment:** Under 15 minutes for most people
- **No app install required** — it's a web app, just click the link
- **Accounts:** Email + password. No SSO/Google login (yet).

---

## Launch Sequence (Suggested)

1. **Before launch email:** Devin creates the org in admin, gets the join link
2. **Launch email to the group:** Welcome, here's what we're doing, take this assessment before [date], here's the link
3. **Assessment window:** Give people ~1 week to complete it on their own time
4. **Program kickoff:** Reference their results. "What were your 3 personalized outcomes?" as a workshop exercise.

---

## Messaging Themes for the Launch Email

**Tone:** Warm, exciting, inclusive. "We're all building these skills together."

**Key points to hit:**
- This is the start of something — we're leveling up together
- The assessment is quick (~15 minutes) and actually fun
- There are no wrong answers — it's about finding where you are, not testing you
- Your conversation is private — only you see the details
- Your results will be personalized to YOUR actual work
- Take it before [date] so we can use your results in the first session
- It works on your phone if that's easier

**Framing to avoid:**
- Don't call it a "test" or "quiz" — it's an assessment / survey + conversation
- Don't imply judgment about levels — every starting point is valid
- Don't over-explain the tech (AI guide, Claude, ElevenLabs) — just say "a quick conversation with an AI guide"
- Don't promise specific outcomes until they've taken it

---

## What Devin Needs to Do Before Sending the Email

1. Create the org in the admin panel (assessment.electricthinking.ai/admin) and set a join code (e.g., `BRACE2026`)
2. The join link is `assessment.electricthinking.ai/join/BRACE2026` — put this in the email
3. Decide on the assessment deadline (when does everyone need to complete it by?)
4. Decide: should the email come from Devin, from the client contact, or from both?
5. Paste the V8 Lex prompt into ElevenLabs (if not already done)
6. Do one final end-to-end test (register → survey → Lex → results)

---

## Known Limitations to Be Aware Of

- **Voice mode on mobile Safari** can be flaky — text mode always works as fallback
- **First load can be slow** (~3-5 seconds) if the server is cold — second load is fast
- **Scoring takes 10-30 seconds** — there's a loading screen with messages, this is normal
- **No password reset via email yet** — if someone forgets their password, they need to contact support
- **No SSO** — everyone creates an account with email + password

---

## Support

If anyone has issues: **support@electricthinking.ai** (displayed in the app's privacy policy and terms).

Common issues and fixes:
- "I can't log in" → Try resetting password, or contact support
- "Voice isn't working" → Refresh the page, or switch to text mode (always available)
- "The page is blank" → Hard refresh (Ctrl+Shift+R), or try a different browser
- "My results don't seem right" → They can retake the assessment

---

*This briefing is current as of March 26, 2026. The product is deployed and functional. Devin is doing final testing before sending the launch email to the first client group.*
