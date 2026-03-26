# Emergency Runbook — Electric Thinking Assessment

**What this is:** A guide for fixing production issues when Devin is unavailable.
**Live app:** https://assessment.electricthinking.ai
**Hosting:** Railway (auto-deploys from `main` branch on GitHub)

---

## Quick Health Check

Before anything else, check if the app is actually down vs. a user-specific issue:

1. Open https://assessment.electricthinking.ai in your browser
2. If you see the landing page, the app is running
3. Try logging in as admin: `admin@electricthinking.com` / (ask Devin for password)
4. If admin login works, the database and sessions are fine

---

## The 3 Most Likely Problems

### Problem 1: "The app won't load" / blank page / 502 error

**What happened:** The Railway service crashed or is restarting.

**Fix:**
1. Go to https://railway.com and log in
2. Find the project "reasonable-enjoyment"
3. Click on the service → "Deployments" tab
4. Check if the latest deployment failed (red) or is still building (yellow)
5. If failed: click on it to see the error logs, then share with Claude Code
6. If stuck: click the three dots (⋮) on the deployment → "Redeploy" to retry
7. If the last deploy was green but the app is down: click "Restart" on the service

**Tell Claude Code:** "The Railway deployment failed with this error: [paste the error]"

### Problem 2: "Users can't log in" or "session errors"

**What happened:** Usually a database connection issue or the session secret changed.

**Fix:**
1. In Railway, go to the service → "Variables" tab
2. Confirm these exist and have values (don't need to know the values, just that they're set):
   - `DATABASE_URL`
   - `SESSION_SECRET`
3. Check the service logs (click "Logs" tab) for errors containing "ECONNREFUSED" or "session"
4. If you see database errors: check that the PostgreSQL service in Railway is running
5. Try restarting the service

**Tell Claude Code:** "Users can't log in. Here are the recent logs: [paste 20-30 lines]"

### Problem 3: "Assessment conversation doesn't work" / AI not responding

**What happened:** The Anthropic API key may have expired, hit its limit, or the scoring prompt has an issue.

**Fix:**
1. In Railway variables, confirm `ANTHROPIC_API_KEY` is set
2. Check logs for errors containing "anthropic", "401", "429", or "rate limit"
3. If 401: the API key is invalid/expired — Devin needs to generate a new one at console.anthropic.com
4. If 429: rate limited — this usually resolves itself in a few minutes
5. If the error mentions "model": Claude may have deprecated the model version

**Tell Claude Code:** "The assessment AI isn't responding. Here's the error from logs: [paste it]"

---

## How to Check Logs on Railway

1. Go to https://railway.com → project "reasonable-enjoyment"
2. Click the main service (not the database)
3. Click the "Logs" tab
4. You'll see real-time server output
5. Errors show in red — look for these first
6. You can search/filter within the logs

---

## Environment Variables Reference

These are set in Railway under the service's "Variables" tab. **Do not change these unless you know what you're doing.**

| Variable | What it does | If it breaks... |
|---|---|---|
| `DATABASE_URL` | Connects to PostgreSQL | Everything breaks — no data, no logins |
| `SESSION_SECRET` | Encrypts login cookies | Everyone gets logged out, can't log back in |
| `ANTHROPIC_API_KEY` | Powers AI conversations + scoring | Assessment chat stops working |
| `ELEVENLABS_API_KEY` | Powers voice mode | Voice mode fails, text mode still works |
| `RESEND_API_KEY` | Sends emails | Invite/welcome emails stop, app still works |
| `APP_URL` | Base URL for email links | Email links go to wrong place |
| `ADMIN_PASSWORD` | Sets admin password on first seed | Only matters on fresh database |

---

## Running the Deploy Verification Script

If you want to confirm the app is fully functional (not just "loads"), there's an automated test:

```bash
# From the project directory, after npm install:
APP_URL=https://assessment.electricthinking.ai ADMIN_PASSWORD=__ask_devin__ npx tsx scripts/verify-deploy.ts
```

This creates a test user, runs through the full assessment flow, checks all endpoints, then cleans up. It will tell you PASS or FAIL.

---

## Using Claude Code to Fix Things

If something is broken and you need to fix code:

1. Open your terminal in the project folder
2. Run `claude` to start Claude Code
3. Describe the problem. Good examples:
   - "The Railway logs show this error: [paste]. Can you find and fix the bug?"
   - "Users in the Philippines are seeing a blank screen on mobile Safari. What could cause that?"
   - "The assessment scoring is failing with a 500 error. Here are the logs: [paste]"
4. Claude Code will read the code, find the issue, and propose a fix
5. Review the fix — Claude Code will ask before making changes
6. After the fix: Claude Code will run `npm run build` to verify
7. Then commit and push: Claude Code can do this for you, or you can say "commit and push this fix"
8. Railway auto-deploys from `main` — the fix will be live in ~2 minutes

**Important:** Always let Claude Code run `npm run build` before pushing. If the build fails, the fix isn't ready.

---

## Things That Are NOT Emergencies

These are known limitations, not bugs:

- **Voice mode doesn't work on some browsers**: Safari on older iOS is flaky with WebSocket audio. Text mode always works.
- **Scoring takes 10-30 seconds**: The loading screen with rotating messages is normal. Claude is processing the transcript.
- **"Part 1 of 1" on survey**: This is expected when a user only qualifies for one level of questions.
- **First-time load is slow (~3-5s)**: Railway cold starts the service if no traffic for a while. Second load is fast.
- **Admin shows "0 active sessions"**: Sessions are stored in PostgreSQL, the count may lag.

---

## Nuclear Options (Last Resort)

If nothing else works:

### Restart the service
Railway → service → click "Restart". Takes ~30 seconds.

### Redeploy the last known working version
Railway → Deployments tab → find the last green deployment → click ⋮ → "Redeploy"

### Roll back a bad code change
```bash
# In Claude Code or terminal:
git log --oneline -10          # Find the last good commit
git revert HEAD                # Undo the most recent commit
git push origin main           # Deploy the revert
```

**Do NOT run `git reset --hard` or `git push --force`** — these can lose work permanently.

---

## Contact

- **Devin**: [add phone/email for emergencies]
- **Railway status**: https://status.railway.com
- **Anthropic status**: https://status.anthropic.com
