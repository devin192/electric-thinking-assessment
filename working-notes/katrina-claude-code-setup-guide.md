# Katrina's Claude Code Setup Guide

*Created March 26, 2026 by Devin (via Claude Code)*

This gets you fully set up with Claude Code and all the Electric Thinking tools — Google, Notion, Airtable connections, all 13 of our custom skills, and the assessment app for backup support.

**You can hand this entire file to Claude Code and say "walk me through this step by step" and it will help you through each part.**

**Time estimate:** 45-60 minutes for the full setup.

---

## Part 0: What You're Setting Up (Plain English)

### Claude Code

Claude Code is already built into the Claude desktop app you have. It's the mode where Claude can read/write files on your computer, run commands, and connect to your work tools. You access it by clicking the **Code** tab in the desktop app (look for a `>_` icon or "Code" label).

Think of regular Claude as someone you can talk to. Claude Code is that same person, but now they're sitting at your computer and can actually *do* things.

### The pieces you're connecting

**MCP connections** — These let Claude access your work tools directly. Once connected, Claude can search your Gmail, read your Google Drive, look up things in Notion, pull data from Airtable. You set each one up once, authenticate, and it works forever.

**Skills** — Markdown files on your computer that turn Claude into specialized agents. We have 13: strategic coach, client coach, email writer, workshop designer, etc. You call them by typing `/skill-name`. Think of them like Custom GPTs, except they're files you own and can update.

**CLAUDE.md** — A text file Claude reads every time you start a conversation. It's your permanent instruction manual: who you are, what tools are connected, how you like to work. Write it once, update over time.

**Memory** — Claude automatically stores things it learns about you across conversations so you don't have to repeat yourself.

### Your Claude plan

Your existing Claude account works. No separate org or team workspace needed. Same plan you're on now. If you're on Pro ($20/mo), that's fine — same features, just lower usage limits than Max ($100/mo). If you find yourself hitting rate limits regularly, that's when upgrading makes sense.

---

## Part 1: Install Two Things (Windows)

The Claude desktop app handles almost everything, but it needs these two installed on your machine first. Both are "download → run installer → click Next until done."

### 1A. Git for Windows

Claude Code needs this to work with code repositories.

1. Go to https://git-scm.com/download/win
2. Download and run the installer
3. **Click through with all the defaults** — don't change anything
4. When it's done, close and reopen any PowerShell windows you had open

### 1B. Node.js

Our projects use this for dependencies.

1. Go to https://nodejs.org
2. Click the big green **LTS** button
3. Run the installer — **all defaults, don't change anything**
4. When it's done, close and reopen any PowerShell windows

### Verify both worked

Open **PowerShell** (search for it in the Start menu) and type:
```
git --version
node --version
```
If you see version numbers for both, you're done with installs.

---

## Part 2: Open Claude Code

1. Open the **Claude desktop app** (the regular app you already use)
2. Look for the **Code** tab — it might be a `>_` icon at the bottom of the window, or a "Code" label
3. Click it
4. It will ask you to pick a folder to work in — pick your **Documents** folder for now (you'll switch to specific project folders later)
5. You're in Claude Code. You'll see a text input where you can type instructions.

**Test it:** Type "What can you do?" and hit Enter. Claude should explain that it can read files, run commands, etc.

---

## Part 3: Connect Google Workspace

This is the most valuable connection. It lets Claude search your Gmail, read your Google Drive, Docs, Sheets, and Slides. It's "hardened" — Claude can search and read everything, draft emails, but **cannot send emails or share documents** without you clicking send. That's a safety feature.

This is also the most annoying part to set up (Google makes you jump through hoops). But you only do it once, and Claude Code can help you through it.

### 3A. Install Python + uv

Google Workspace connection needs Python. One more install:

1. Go to https://www.python.org/downloads/
2. Download and install — **CHECK THE BOX that says "Add Python to PATH"** (this is the one thing you need to not miss)
3. Open PowerShell and run:
   ```
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```
4. Close and reopen PowerShell, then verify:
   ```
   python --version
   uv --version
   ```

### 3B. Clone the connector code

In PowerShell:
```
cd %USERPROFILE%
git clone https://github.com/c0webster/hardened-google-workspace-mcp.git
```

### 3C. Create Google OAuth credentials

This is the annoying-but-one-time part. You're creating an app in Google Cloud so Claude can authenticate as you.

1. Go to https://console.cloud.google.com/
2. Sign in with your Electric Thinking Google account
3. Click **Select a project** (top left) → **New Project** → name it "Claude MCP" → Create
4. Make sure "Claude MCP" is selected as the active project
5. Go to **APIs & Services** (left sidebar) → **OAuth consent screen**
   - Choose **External** user type → Create
   - App name: "Claude Code MCP"
   - User support email: your email
   - Developer contact email: your email
   - Click through the rest with defaults
   - On the **Test users** page: click **Add users** → add your Electric Thinking email address
6. Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: **Desktop app**
   - Name: anything (e.g., "Claude Code")
   - Click Create
   - **Copy the Client ID and Client Secret** — you'll need these in a moment
7. Go to **APIs & Services** → **Library** and search for + enable each of these:
   - Gmail API
   - Google Drive API
   - Google Docs API
   - Google Sheets API
   - Google Slides API

### 3D. Connect it to Claude Code

Open Claude Code (the Code tab in the desktop app) and tell it:

> Add a Google Workspace MCP server to my config file. Here are the details:
> - Name: "hardened-workspace"
> - Command: "uv"
> - Args: ["run", "--directory", "C:\\Users\\MY_USERNAME\\hardened-google-workspace-mcp", "python", "-m", "main", "--single-user", "--tool-tier", "katrina"]
> - Environment variables: GOOGLE_OAUTH_CLIENT_ID = [paste your client ID], GOOGLE_OAUTH_CLIENT_SECRET = [paste your client secret]
>
> Replace MY_USERNAME with my actual Windows username.

Claude Code will edit the config file for you.

### 3E. Test it

Restart Claude Code (close the Code tab and reopen it), then type:

> Search my Gmail for recent emails from Devin

A browser window will open for Google sign-in. Sign in with your ET account, grant access, and you're connected forever.

---

## Part 4: Connect Notion

This one is easy. Tell Claude Code:

> Add a Notion MCP server to my config. The type is "http" and the URL is "https://mcp.notion.com/mcp"

Restart Claude Code, then type:

> Search Notion for recent pages

A browser window will open for Notion sign-in. Sign in with your ET account and grant access to the Electric Thinking workspace.

---

## Part 5: Connect Airtable

1. Go to https://airtable.com/create/tokens
2. Click **Create new token**
3. Name: "Claude Code"
4. Add these scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
5. Under **Access**, add the bases you want Claude to see (or "All current and future bases")
6. Click **Create token** and **copy it**

Then tell Claude Code:

> Add an Airtable MCP server to my config. Command: "npx", args: ["-y", "airtable-mcp-server"], with environment variable AIRTABLE_API_KEY set to [paste your token]

Restart Claude Code. Test it:

> List my Airtable bases

---

## Part 6: Set Up Skills

Skills are the Electric Thinking custom agents. They live as files on your computer that Claude Code reads when you invoke them.

### 6A. Get the skills repo

Devin will invite you to the `mindstone-rebel-workspace` GitHub repo. Once you accept the invite, tell Claude Code:

> Clone the repo https://github.com/devin192/mindstone-rebel-workspace.git into my Documents folder as "et-skills", then create a directory junction from my .claude/skills folder to that location so Claude Code can find them.

Claude Code will handle the git clone and the Windows junction for you.

### 6B. What you get

| Skill | What it does | Type this to use it |
|-------|-------------|-------------------|
| **strategic-coach** | Sharpens ideas, pressure-tests plans, surfaces blind spots | `/strategic-coach` |
| **client-coach** | Prep for client calls, pitches, negotiations | `/client-coach` |
| **email-writer** | Drafts emails in the Electric Thinking voice | `/email-writer` |
| **proposal-writer** | Turns opportunities into proposals through strategic questioning | `/proposal-writer` |
| **workshop-designer** | Designs training outlines using the ET methodology | `/workshop-designer` |
| **content-engine** | Turns workshop experiences into posts, case studies, exec emails | `/content-engine` |
| **recap-generator** | Brainstorm transcripts → polished recaps by theme | `/recap-generator` |
| **transcript-organizer** | Meeting recordings → decisions, action items, topics | `/transcript-organizer` |
| **assessment-architect** | Designs and stress-tests the 4-level AI fluency framework | `/assessment-architect` |
| **nudge-writer** | Short skill-building micro-messages for the assessment system | `/nudge-writer` |
| **enterprise-copilot-expert** | Microsoft 365 Copilot advisor for enterprise training | `/enterprise-copilot-expert` |
| **carrie-stakeholder** | Roleplay as Carrie Brzezinski-Hsu (Disney) for pitch prep | `/carrie-stakeholder` |
| **humanizer** | Removes AI-sounding patterns from text | `/humanizer` |

### 6C. Keeping skills updated

When Devin updates a skill, just tell Claude Code:

> Pull the latest skills updates

Or in PowerShell:
```
cd %USERPROFILE%\Documents\et-skills
git pull
```

---

## Part 7: Clone the Assessment App

This is the Electric Thinking assessment platform. You're Devin's backup while he's on vacation, and Claude Code can fix any production issues that come up.

Tell Claude Code:

> Clone the repo https://github.com/devin192/electric-thinking-assessment.git to my Desktop, then run npm install to set up the dependencies.

Devin will also invite you to **Railway** (where the app is hosted) so you can see server logs. Accept that email invite when it comes.

### If something breaks while Devin is away

1. Check if the app loads: https://assessment.electricthinking.ai
2. Check Railway logs: log into railway.com → project "reasonable-enjoyment" → service → "Logs" tab
3. Open Claude Code in the assessment app folder and tell it:

> Read the EMERGENCY-RUNBOOK.md. The app is having this issue: [describe what's happening]. Here are the Railway logs: [paste them]. Find and fix the bug.

4. Claude Code finds the bug, proposes a fix, and asks your permission
5. Tell it: "commit and push this to main" — Railway auto-deploys in ~2 minutes

**If you're ever unsure:** Restarting the Railway service is always safe (Railway → service → Restart). And doing nothing is better than guessing — Devin can fix it when he's back if it's not critical.

---

## Part 8: Create Your CLAUDE.md

This is your personal instruction manual that Claude reads at the start of every conversation. Tell Claude Code:

> Help me create a CLAUDE.md file in my working directory. Here's what to include:
> - I'm Katrina, I work at Electric Thinking
> - My role is [describe your role]
> - I'm connected to Google Workspace, Notion, and Airtable via MCP
> - I have access to the ET skills library
> - [Add any preferences about how you like Claude to communicate with you]

Claude will write it for you. You can refine it over time — it's a living document.

---

## Part 9: Set Up Permissions

Right now Claude Code asks "can I do this?" for every single action. This gets old fast. Tell Claude Code:

> Update my settings at ~/.claude/settings.json to allow MCP tools, file reads and writes in my home directory, bash commands, and web fetches without asking each time. Set effort level to high.

Claude Code will create the settings file for you.

---

## Setup Checklist

Go in this order:

- [ ] Install Git for Windows (Part 1A)
- [ ] Install Node.js (Part 1B)
- [ ] Open Claude Code in the desktop app (Part 2)
- [ ] Install Python + uv (Part 3A)
- [ ] Connect Google Workspace (Parts 3B-3E)
- [ ] Connect Notion (Part 4)
- [ ] Connect Airtable (Part 5)
- [ ] Clone + connect the skills repo (Part 6)
- [ ] Clone the assessment app (Part 7)
- [ ] Create your CLAUDE.md (Part 8)
- [ ] Set up permissions (Part 9)
- [ ] Test a skill: type `/strategic-coach` and have a conversation

---

## Troubleshooting

If anything goes wrong at any point, just tell Claude Code what happened. Paste the error message. It will help you fix it. That's the whole point.

Common issues:

**"npm not found" or "git not found"** — Close and reopen PowerShell after installing. Windows doesn't pick up new programs until you do.

**"MCP server failed to start"** — Usually a missing dependency. Tell Claude Code the exact error.

**Google OAuth errors** — Make sure your email is added as a test user in Google Cloud Console, and all 5 APIs are enabled.

**Skills not showing up** — Tell Claude Code: "Check if my skills folder is set up correctly and list what's in it."

---

## Quick Reference

| What | Where |
|------|-------|
| Claude config (MCP servers) | `%USERPROFILE%\.claude.json` |
| Claude settings (permissions) | `%USERPROFILE%\.claude\settings.json` |
| Skills folder | `%USERPROFILE%\.claude\skills\` |
| Assessment app | `%USERPROFILE%\Desktop\electric-thinking-assessment\` |
| Skills repo | `%USERPROFILE%\Documents\et-skills\` |
| Emergency runbook | `EMERGENCY-RUNBOOK.md` in the assessment app folder |
| This guide | You're reading it |

---

*If something doesn't work, paste the error into Claude Code and say "help me fix this." That's literally what it's for.*
