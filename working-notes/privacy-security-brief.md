# Privacy & Security Brief for Braceability
*Prepared March 24, 2026*

---

## 1. What to Tell the Client (copy-paste ready)

**Short version for Slack/email:**

Electric Thinking takes data privacy seriously. Here's the quick version: your team's assessment conversations are private. Managers can see skill levels and progress (which skills are red/yellow/green) but cannot see conversation transcripts or what anyone specifically said during their assessment. The platform is hosted on Railway, which is SOC 2 Type II certified, and all data is encrypted in transit and at rest. We use Anthropic's Claude API to power the AI conversations, and per Anthropic's API data usage policy, they do not train their models on any data sent through the API.

Each person on your team will have their own account with a password. They'll have a conversation with an AI agent (voice or text) that assesses where they are with AI tools, then get a personalized learning path with weekly "Power Ups" (micro-challenges sent by email). The only people who can see detailed conversation data are the individual user themselves and me (Devin) as the system administrator, and I only access that for support and QA purposes. Your managers will see a dashboard showing each person's level, their skill map (red/yellow/green per skill), and whether they're engaging with their Power Ups. That's it.

If anyone on the team wants their data deleted, they can request it and we'll remove everything. We're a small operation, not a giant SaaS company, so you're dealing directly with me on any privacy questions.

---

## 2. Detailed Data Flow Breakdown

### What data is collected per user

| Data | Stored in DB | Who can see it |
|------|-------------|----------------|
| Name, email | `users` table | User, manager, admin |
| Job title / role | `users` table | User, manager, admin |
| AI platform preference | `users` table | User, admin |
| Password | `users` table (bcrypt hashed, 12 rounds) | Nobody (hashed) |
| Assessment transcript (full conversation) | `assessments.transcript` | User, admin only. **NOT managers.** |
| Context summary (AI-generated profile) | `assessments.context_summary` | Admin only (used internally for personalization) |
| Work context summary | `assessments.work_context_summary` | Admin only (used to personalize Power Ups) |
| Skill scores (red/yellow/green per skill) | `user_skill_status` table | User, manager, admin |
| Assessment level (1-5) | `assessments.assessment_level` | User, manager, admin |
| Bright spots, future self text, signature skill | `assessments` table | User, admin |
| Power Up content (weekly challenges) | `nudges` table | User, admin |
| Coach conversation messages | `coach_conversations` table | User, admin |
| Challenge reflections (user notes) | `challenge_reflections` table | User, admin |
| Email delivery logs | `email_logs` table | Admin only |
| Activity feed (completions, level-ups) | `activity_feed` table | Manager (anonymizable), admin |
| Email preferences (opt-in/out) | `users` table | User, admin |
| Badges earned | `badges` table | User, manager, admin |

### What goes to third-party services

**Anthropic (Claude API) -- claude-sonnet-4-20250514**
- *What's sent:* Assessment conversation messages (user responses + AI responses), user name, role title, AI platform preference, context summaries for Power Up generation, coach conversation messages
- *Data retention:* Anthropic's API data usage policy states they do not use API inputs/outputs to train their models. Data may be retained for up to 30 days for trust and safety purposes (abuse monitoring), then deleted. See: https://www.anthropic.com/policies/privacy
- *Where it's used:* 3 places in the codebase -- assessment conversation (`assessment-ai.ts`), assessment scoring (`assessment-ai.ts`), Power Up generation (`nudge-ai.ts`), verification question generation (`nudge-ai.ts`), and in-app coaching (`routes.ts` coach endpoint)

**ElevenLabs (voice agent)**
- *What's sent:* Audio of the user's voice during voice-mode assessment conversations. The voice agent (Lex) runs on ElevenLabs' Conversational AI infrastructure.
- *Data retention:* ElevenLabs processes audio in real-time for speech-to-text. Per their privacy policy, audio data from Conversational AI may be retained for service improvement unless opted out at the enterprise level. The transcript text comes back to our server and is stored there.
- *Important note:* Voice mode is optional. Users can choose text-only assessment. When voice is used, the user's actual voice audio passes through ElevenLabs servers.

**Resend (email delivery)**
- *What's sent:* Recipient email address, email subject lines, full HTML email content (which includes user names, skill names, level info, Power Up content)
- *Data retention:* Resend retains email delivery metadata (sent, opened, bounced status). Email content is processed for delivery. Standard email service provider data handling.
- *Webhook:* Resend sends delivery status webhooks back to the app (open tracking, bounces, complaints). These are authenticated with a webhook secret.

**Railway (hosting)**
- *What it hosts:* The entire application (Node.js server, PostgreSQL database)
- *Compliance:* SOC 2 Type II certified. Data encrypted at rest and in transit (TLS).
- *Location:* US-based infrastructure

### Authentication and access control

- Passwords hashed with bcrypt (12 rounds)
- Sessions stored in PostgreSQL with `connect-pg-simple`
- Session cookies: HttpOnly, SameSite=Lax, Secure in production
- Rate limiting on auth endpoints: 15 requests per 15 minutes
- XSS protection: HTML escaping on user inputs
- Admin field allowlist: prevents mass-assignment attacks
- Webhook authentication: Resend webhooks validated with shared secret

### Role-based access

| Role | Can see |
|------|---------|
| `member` | Own data only (transcript, scores, Power Ups, coach conversations) |
| `manager` | Own data + team members' names, emails, role titles, skill statuses (red/yellow/green), assessment levels, badges, nudge on/off status. **Cannot see transcripts, context summaries, or conversation content.** Can export team CSV (names, emails, roles, levels, skill statuses). |
| `org_admin` | Same as manager + can send invites, manage org settings |
| `system_admin` | Everything, including all assessments with transcripts, all user data, system config, email logs. This is Devin's role for support/QA. |

---

## 3. What the Privacy Page Currently Says vs. Reality

**File:** `client/src/pages/privacy.tsx`
**Last updated date shown:** February 2026

### Accurate claims:
- "Assessment conversation transcript" -- collected, correct
- "Skill scores and level placement" -- collected, correct
- "Role and context information you share" -- collected, correct
- "Email address and name" -- collected, correct
- "AI platform preference" -- collected, correct
- "Your data is stored in an encrypted PostgreSQL database hosted on infrastructure that is independently SOC 2 Type II certified" -- correct (Railway is SOC 2 Type II)
- "All data is encrypted at rest and in transit" -- correct (Railway + TLS)
- "Your Manager: Can see your skill scores and levels. Cannot see your conversation transcript or specific answers." -- **ACCURATE.** The manager API endpoints explicitly exclude transcript data.
- "Your data is used exclusively for personalized learning content. No advertising, no profiling, no selling." -- correct

### Issues to flag:

1. **"System Admin: Can see aggregate analytics and access individual data for support purposes."** -- This is technically accurate but vague. The admin can see EVERYTHING including full transcripts, context summaries, and all conversation data. The current wording ("individual data for support purposes") is honest but understated. **Recommendation: Keep this wording. It's accurate and doesn't overpromise. For the Braceability conversation, be upfront that "system admin" means Devin and it's for support/QA only.**

2. **"Download a copy of all your data at any time"** -- THIS IS NOT IMPLEMENTED. There is no user-facing data export endpoint. The only export is the manager CSV export (team-level, no transcripts). **This claim is currently false.** Users cannot download their data.

3. **"Request complete deletion of your account and data"** -- PARTIALLY IMPLEMENTED. There is an admin-only `DELETE /api/admin/users/:id` endpoint, but no user-facing deletion request flow. A user would have to email Devin to request deletion. **The claim is aspirational but the mechanism is manual.**

4. **"Pause or stop Power Ups at any time"** -- TRUE. Users can toggle nudges via their settings. Managers can also toggle nudges for team members.

5. **Third-Party Services section is incomplete.** It only mentions Anthropic/Claude. It does NOT mention:
   - ElevenLabs (voice conversations -- processes actual audio of users' voices)
   - Resend (email delivery -- processes email addresses and email content)
   These are material omissions, especially ElevenLabs since it involves voice/audio data.

6. **"Data is retained while your account is active. Upon deletion request, all data is removed within 30 days."** -- The 30-day deletion commitment is a manual process. No automated deletion pipeline exists.

7. **The page doesn't mention coach conversations** -- These are stored and sent to Anthropic. Not a huge issue since they're covered under the general "AI analysis" language, but worth noting.

8. **No mention of email tracking.** The system tracks email opens via Resend webhooks and logs delivery events. This is standard for email services but not disclosed.

---

## 4. Recommendations Before Sending to 20 People

### Must-fix (do before Braceability rollout):

1. **Update Third-Party Services section** to mention ElevenLabs and Resend by name. Users should know their voice audio goes to ElevenLabs if they choose voice mode. Suggested copy:
   > We use Anthropic (Claude) for AI-powered conversations and assessment analysis. If you choose voice mode, ElevenLabs processes your audio for the voice conversation. Resend handles email delivery. None of these services use your data to train their AI models.

2. **Remove or qualify "Download a copy of all your data at any time"** -- Either build the feature (not trivial) or change to something honest like:
   > Request a copy of your data by contacting support. We'll provide it within 5 business days.

3. **Clarify the deletion process.** Change from implying self-service to:
   > Request account and data deletion by contacting support. All data is removed within 30 days of a confirmed request.

### Should-fix (nice to have before rollout):

4. **Update "Last updated" date** from February 2026 to the current date after making changes.

5. **Add a note about email tracking** -- Even a brief mention:
   > We track email delivery status (sent, opened, bounced) to ensure our emails reach you.

6. **Consider adding a "Voice mode" subsection** under data collection, since voice involves audio data flowing to a third party. This is a different category than text input.

### Can wait (post-launch):

7. Build the actual user data export feature (self-serve download).
8. Build a self-serve account deletion flow.
9. Add a cookie/session disclosure (sessions are stored server-side, standard session cookie used).

---

## 5. Summary of What Braceability Managers Will See

For the ~20 person rollout, managers will see:
- Each team member's name, email, job title
- Their assessment level (1-5)
- Their skill map: which of the 25 skills are red (not demonstrated), yellow (partial), or green (demonstrated)
- Whether their Power Ups are active or paused
- An activity feed (can be anonymized in org settings)
- A CSV export with names, emails, roles, levels, and skill statuses

Managers will NOT see:
- What anyone said during their assessment conversation
- The transcript
- The AI-generated context summary or work context summary
- Coach conversation messages
- Challenge reflections (personal notes)
- Individual Power Up content details

This separation is enforced at the API level, not just the UI level. The manager endpoints explicitly select only the allowed fields.
