# Katrina's Setup Guide

Hey Katrina! This gets you set up so you can fix production issues while Devin is on vacation. You won't need to write code yourself — Claude Code does that part. Your job is to describe the problem and let Claude Code find and fix it.

**Time to set up: ~20 minutes**

---

## Step 1: Install Claude Code (5 min)

Claude Code is a terminal app that reads code, finds bugs, and writes fixes. Think of it as a developer on call that lives in your terminal.

### Mac:
1. Open **Terminal** (search for it in Spotlight with Cmd+Space)
2. Paste this and press Enter:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
3. If you get a "npm not found" error, install Node.js first:
   - Go to https://nodejs.org
   - Download the **LTS** version (the green button)
   - Install it, then try the `npm install` command again

### Verify it worked:
```
claude --version
```
You should see a version number. If so, you're good.

---

## Step 2: Set Up Your Anthropic API Key (3 min)

Claude Code needs an API key to work. Devin will share this with you.

1. In Terminal, run:
   ```
   export ANTHROPIC_API_KEY=sk-ant-xxxxx
   ```
   (Replace `sk-ant-xxxxx` with the key Devin gives you)

2. To make this permanent (so you don't have to type it every time), run:
   ```
   echo 'export ANTHROPIC_API_KEY=sk-ant-xxxxx' >> ~/.zshrc
   ```

---

## Step 3: Clone the Code (3 min)

This downloads the project to your computer.

1. Devin will invite you to the GitHub repo (you'll get an email — accept it)
2. In Terminal, run:
   ```
   cd ~/Desktop
   git clone https://github.com/devin192/electric-thinking-assessment.git
   cd electric-thinking-assessment
   ```
3. Install dependencies:
   ```
   npm install
   ```

---

## Step 4: Get Railway Access (2 min)

Railway is where the app runs. You need access to see logs and restart things.

1. Devin will invite you to the Railway project (you'll get an email)
2. Accept the invite and create a Railway account if you don't have one
3. Bookmark: https://railway.com — this is where you go to check logs

---

## Step 5: Test That Everything Works (2 min)

1. In Terminal, make sure you're in the project folder:
   ```
   cd ~/Desktop/electric-thinking-assessment
   ```
2. Start Claude Code:
   ```
   claude
   ```
3. You should see a prompt where you can type. Try:
   ```
   What does this project do? Give me a one-paragraph summary.
   ```
4. Claude Code will read the codebase and answer. If it does, you're fully set up!
5. Type `/exit` to quit Claude Code when done

---

## When Something Goes Wrong

### Your workflow:

1. **Check the app**: Go to https://assessment.electricthinking.ai — is it loading?
2. **Check Railway logs**: Log into Railway → find the service → click "Logs"
3. **Open Claude Code**:
   ```
   cd ~/Desktop/electric-thinking-assessment
   git pull                    # Get the latest code
   claude                      # Start Claude Code
   ```
4. **Describe the problem**. Copy-paste relevant info. Examples:
   - "A user reported they can't start the assessment. Here are the Railway logs from the last 5 minutes: [paste]"
   - "The app is showing a 502 error. The Railway deployment shows this: [paste]"
5. **Let Claude Code work**. It will:
   - Read the relevant code
   - Find the bug
   - Propose a fix
   - Ask your permission before changing anything
6. **Review and approve**. Claude Code explains what it's doing in plain English.
7. **Deploy the fix**. Tell Claude Code: "commit this fix and push to main"
8. **Wait ~2 minutes** for Railway to auto-deploy
9. **Verify**: Check the app again, or ask Claude Code to run the deploy verification script

### Helpful phrases for Claude Code:

- "Read the EMERGENCY-RUNBOOK.md for context on common issues"
- "Check the Railway logs I pasted and tell me what went wrong"
- "Fix this bug, run the build to make sure it works, then commit and push"
- "Run the deploy verification script against production"
- "Is this a real emergency or a known limitation?"

---

## Important Ground Rules

- **Always `git pull` before starting Claude Code** — so you have the latest code
- **Don't change environment variables in Railway** unless Claude Code specifically tells you to and explains why
- **Don't delete the database** (there's no "delete database" button, but just in case)
- **If you're unsure, do nothing** — the app being temporarily down is better than making it worse
- **You can always restart the Railway service** — that's always safe and fixes many issues
- **Screenshot everything** — if something looks weird, screenshot it before and after

---

## Quick Reference

| What | Where |
|---|---|
| Live app | https://assessment.electricthinking.ai |
| GitHub repo | https://github.com/devin192/electric-thinking-assessment |
| Railway dashboard | https://railway.com (project: "reasonable-enjoyment") |
| Admin login | admin@electricthinking.com / (ask Devin) |
| Emergency runbook | `EMERGENCY-RUNBOOK.md` in the project folder |
| This guide | `KATRINA-SETUP.md` in the project folder |
