# Phase 3: Electric Thinking -- Voice, RPG Map, Celebrations & Polish

This is Phase 3 of 3. Phases 1 and 2 already built: authentication, org setup, text-based assessment with scoring, results dashboard with social proof, admin panel, nudge generation with Opus, email delivery via Resend/React Email, skill verification, manager dashboard, and the full brand system. DO NOT rebuild any of that. This phase upgrades and polishes.

This phase adds: ElevenLabs voice assessment, RPG progression map, enhanced celebrations, shareable badges, PWA, and live sessions integration.

## 1. Voice Assessment (Upgrade from Text to Voice)

Replace the text-based assessment chat (from Phase 1) with a real-time voice conversation using the **ElevenLabs Conversational AI API**.

**Implementation:**
- Use ElevenLabs Conversational AI for full-duplex, real-time voice interaction via WebSocket
- The user speaks naturally, the AI responds in a warm, professional voice
- The entire conversation is transcribed in real-time and stored in the assessments table transcript field
- The assessment is a **hybrid screen + voice experience**: the AI talks to the user, but the app simultaneously pushes visual content to the screen (skill checklists, summary cards, visual prompts) while the conversation continues. This means the frontend needs to handle both the voice WebSocket AND update UI elements based on conversation state.

**Pre-Assessment Warm-Up (upgrade from Phase 1):**
- The warm-up screen from Phase 1 now includes a microphone permission request: "This assessment uses voice. Click below to allow microphone access, then we'll get started."
- On iOS: the "I'm Ready" button is the user gesture that initializes the AudioContext (required by Safari)
- Manager visibility consent is still shown here: "Your manager can see your skill levels. They cannot hear this conversation."

**Voice Hierarchy (strict, not a toggle):**
- **DEFAULT**: Full duplex voice conversation. This is the real experience. The assessment page opens directly into voice mode.
- **FALLBACK 1**: Voice-to-text mode. Accessible via a small "Having trouble with live voice?" link below the main interface. User clicks a mic button, speaks, it transcribes to text; AI still responds with voice audio. For users whose browsers don't support full duplex or who are in a noisy environment.
- **FALLBACK 2**: Text-only mode. Buried behind a "My device doesn't support audio" link with a confirmation dialog: "We strongly recommend voice for this experience. Voice-to-text builds a critical AI skill. If your device truly doesn't support audio, you can continue in text." This falls back to the text chat from Phase 1. Last resort only.

**Voice Assessment Screen Layout:**
- Central area: animated waveform or avatar showing the AI is speaking/listening
- Side panel or overlay: visual content pushed during conversation (skill checklist for lower levels, summary cards for context confirmation, progress indicator)
- Bottom: subtle controls (mute, end conversation, "Having trouble?" link)
- The screen should feel like a conversation, not a phone call UI

**Technical Integration:**
- Create an ElevenLabs Conversational AI agent in their platform with the assessment personality and question bank
- Connect via WebSocket from the frontend
- The ElevenLabs agent uses the same assessment logic as the text version: 27-question backbone, adaptive conversation, insight reframes, context collection
- Pass the agent's system prompt the same content used for the text assessment (skills, questions, scoring rubric, personality instructions)
- Transcription comes from ElevenLabs' built-in transcription
- After conversation ends, the transcript is scored by Claude Opus (same scoring flow as Phase 1)
- Auto-save: if WebSocket connection drops, save the partial transcript. When user returns, offer to resume ("We lost connection. Want to pick up where we left off?")
- **API/connection failure handling**: If ElevenLabs WebSocket fails to connect or drops mid-conversation, show a friendly message: "Having trouble with the voice connection. We've saved your progress." Offer three options: (1) "Try Again" to reconnect, (2) "Switch to Voice-to-Text" (Fallback 1), (3) "Continue in Text" (falls back to Phase 1 text chat). Never leave the user staring at a spinner.
- **Voice connection loading state**: When initiating the WebSocket connection, show "Connecting to your assessment guide..." with a warm animation (waveform building up, or the avatar "waking up"). If connection takes more than 5 seconds: "Still connecting..." If more than 15 seconds: auto-suggest fallback options. The moment between tapping "Start Conversation" and hearing the first AI voice is critical. Make it feel intentional, not broken.
- **Mobile voice caveats**: iOS Safari requires a user tap gesture to start any audio context (AudioContext, WebSocket audio, microphone). The voice assessment page MUST have a prominent "Start Conversation" button that the user taps to initiate. Do NOT auto-start audio on page load -- it will silently fail on iOS. Test on iOS Safari, Android Chrome, and desktop browsers. If full-duplex WebSocket audio doesn't work on a mobile browser, the fallback hierarchy should activate automatically (detect the failure, suggest voice-to-text).

**Environment variable needed:**
- ELEVENLABS_API_KEY

## 2. RPG Progression Map (Upgrade Dashboard)

Replace the skill card/grid layout from Phase 1 with an interactive RPG-style progression map.

**Visual Design:**
- A winding path or landscape with distinct regions for each level
- Each level has its own visual personality using the brand color palette:
  - Level 0 (Foundations): Use --et-cyan tones. Calm, starting area.
  - Level 1 (Accelerator): Use --et-blue tones. Building momentum.
  - Level 2 (Thought Partner): Use --et-pink tones. The signature ET color.
  - Level 3 (Specialized Teammates): Use --et-orange tones. Getting advanced.
  - Level 4 (Agentic Workflow): Use --et-gold tones. Mastery.
- Skills are nodes along the path within each level region
- **Completed skills (Green)**: Glow, fully lit up, solid colored node
- **Active skill (Yellow)**: Pulses or has a subtle animation (breathing glow), clearly the "you are here" marker
- **Future skills in current level**: Visible but dimmed/desaturated
- **Next level**: Partially visible, exciting teaser, slightly fogged
- **Levels beyond next**: Full fog-of-war (Zelda style). Just silhouettes or clouds. Dramatically revealed when you reach them.

**Interactions:**
- Click/tap any visible skill node to see its details (name, description, status, nudge history)
- Active skill node opens to show the current nudge and "Mark Complete" button
- Completed skills show a small badge/checkmark
- Path between nodes has a subtle animated line showing your progress trail

**Implementation Notes:**
- Build this as an SVG or Canvas-based component, NOT a CSS-only layout. It needs to feel like a game world.
- The map should be responsive -- works on mobile (scroll/pan) and desktop
- Consider using a library like Framer Motion for animations or build custom SVG animations
- The fog reveal on level-up should be dramatic: animation, particles, the new region materializing

## 3. Enhanced Celebrations

Upgrade the celebration moments from Phase 2:

**Skill Completion:**
- Confetti animation (use a library like canvas-confetti)
- The skill node on the RPG map glows and locks in with a satisfying animation
- Sound effect (optional, respect user's audio preferences)
- The pride message appears as a toast/modal: "Nice. Context Setting: locked in."

**Level Up:**
- MAJOR celebration. Full-screen moment:
  - The fog-of-war on the next level dramatically clears/dissolves
  - New level region materializes with particle effects
  - Identity upgrade text animates in: "You're now a Thought Partner"
  - Confetti, screen glow, maybe a brief sound
  - After the celebration: show the new level's skills revealed on the map
- The shareable badge (from Phase 2 email) should also be downloadable from the dashboard with a "Share on LinkedIn" and "Share on Slack" button that pre-fills a post with the badge image and a short message

**Ultimate Completion (all levels done):**
- Unique, one-time celebration that's different from any level-up
- The entire map is fully lit, glowing, complete
- Special badge: "AI Fluency Master" or similar
- A moment worth screenshotting

**Streak Celebrations:**
- At streak milestones (3, 5, 10 weeks), show a streak badge animation on the dashboard
- Streak counter visible on the profile/dashboard

## 4. Shareable Badges

Build a badge generation system:
- **Badge image strategy**: Don't generate and store PNG files on disk (Replit's filesystem is ephemeral on redeploy). Instead, build badges as SVG templates rendered on-the-fly. Create a `/badge/[id]` route that reads the badge record from the database and renders a branded SVG with dynamic data (user name, skill/level name, date earned, brand colors, Tomorrow font). This route doubles as the public badge verification page. For "Download as image," render the SVG to PNG on the server using a library like sharp or puppeteer.
- Badge design: ET brand colors, Tomorrow font, the level name, user's name, date earned
- Examples:
  - Skill badge: "[Skill Name] -- Mastered" with the skill's level color
  - Level badge: "Level 2: AI Thought Partner -- Certified by Electric Thinking"
  - Streak badge: "10-Week Learning Streak"
  - Ultimate badge: "AI Fluency Master"
- Badges are stored in the badges table and displayed on the user's profile
- Each badge has a "Share" button with options:
  - Download as image
  - Share to LinkedIn (opens LinkedIn share dialog with pre-filled text and image)
  - Copy link (generates a public badge verification page: assessment.electricthinking.ai/badge/[id])

## 5. Progressive Web App (PWA)

Make the app installable as a PWA:
- Add a web app manifest (manifest.json) with:
  - App name: "Electric Thinking Assessment"
  - Short name: "ET Assessment"
  - Theme color: #FF2F86
  - Background color: #F0E4CE
  - Display: standalone
  - Icons at multiple sizes (generate from the ELECTRIC THINKING wordmark)
- Add a service worker for basic offline support (cache static assets, show offline message for dynamic content)
- Add an "Install App" prompt/banner for mobile users
- This makes the app installable on iOS and Android home screens without App Store submission

## 6. Live Sessions Integration

Build the live sessions feature (admin panel placeholder from Phase 1):

**Admin Panel:**
- Create/edit live session entries: title, description, date/time, Zoom join link, recording link (added after session), associated level (FK to levels table)

**User Dashboard:**
- "Your Next Live Session" card showing: session title, date, time, join link
- Only shows sessions associated with the user's current active level
- "Past Sessions" section with recordings (video links, not hosted in app)
- Calendar integration: "Add to Calendar" button (generates .ics file)

This is lightweight -- just links and calendar info, not a video platform.

## 7. Custom Domain

Configure the app to run on **assessment.electricthinking.ai**. Replit supports custom domains natively in deployment settings. Set this up during deployment.

## Final Polish Checklist

Before considering Phase 3 complete:
- [ ] Voice assessment works on desktop Chrome, Safari, Firefox
- [ ] Voice assessment works on mobile Safari (iOS) -- tap-to-start, microphone permissions, WebSocket audio all function
- [ ] Voice assessment works on mobile Chrome (Android)
- [ ] Fallback hierarchy auto-detects when full duplex fails and suggests alternatives
- [ ] "Start Conversation" button required on mobile (no auto-start audio)
- [ ] RPG map renders correctly on mobile (scrollable/pannable) and desktop
- [ ] Level-up fog reveal animation plays smoothly
- [ ] Shareable badges generate correctly with brand colors and fonts
- [ ] PWA installs correctly on iOS and Android
- [ ] All celebration animations respect reduced-motion preferences (CSS prefers-reduced-motion)
- [ ] Live sessions show on dashboard when configured
- [ ] Assessment auto-saves on connection drop and offers resume
- [ ] Individual users (no org) can take the assessment and see results, with CTA to create an org
