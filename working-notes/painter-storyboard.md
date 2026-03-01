# Painter Storyboard: RPG Map and Results Reveal

## Overview

Transform the RPG skill map from "chart with colors" into a game world people want to screenshot. Enhance the results reveal with tighter cinematic timing. Build a reusable animation system underneath both.

---

## RPG Map: Visual Experience Moment by Moment

### Page Load (Dashboard)

The user scrolls to "Skill Progression" on their dashboard. The map appears inside an SVG viewport with a warm, slightly textured feel.

### What They See First

Five level regions stacked vertically, each with a distinct color identity. The region containing their current level glows subtly, drawing the eye. Nodes sit along winding paths within each region.

### The Five Node States

**Green (Mastered)**
- Filled circle in that level's brand color (not generic green; the level color with a green checkmark overlay)
- Subtle inner glow that pulses very slowly (4s cycle, barely noticeable)
- White checkmark icon inside
- On hover: glow intensifies, slight scale up to 1.08

**Yellow (Active / "You Are Here")**
- The standout element on the entire map
- Filled with the level color at 25% opacity, stroked in the level color
- A pulsing beacon ring radiates outward from this node (2.5s cycle)
- A small "You Are Here" diamond marker sits above or beside it
- On hover: glow brightens, shows skill name and "Working on this"

**Red (Not Started, Visible)**
- Outlined circle, muted border, no fill (just a ghost)
- Slightly desaturated compared to everything else
- On hover: slight brightening, skill name visible

**Locked (Next Level)**
- Silhouetted circle with a dashed outline
- A subtle shimmer animation crawls along the border (6s cycle)
- The shape is there but the content is hidden
- On click: popover with "Keep going to discover this skill"

**Fogged (2+ Levels Away)**
- Behind layered fog. Multiple semi-transparent gradient overlays that drift slowly
- Fog uses CSS filters: blur, reduced opacity, slight movement
- Shapes are barely visible behind the fog, enough to sense something is there
- No hover interaction

### Pathways

- Between two green nodes: solid line in the level color, with a flowing gradient animation (energy moving along the path, 3s cycle)
- Leading to the yellow node: dashed line that pulses toward the active node
- Between unstarted/red nodes: very faint dashed line, 20% opacity
- Cross-level connection (last node of one level to first of next): a brighter, slightly thicker segment with a small visual "gate" marker at the boundary

### Fog of War

Not a flat rectangle. Three layered elements:
1. A base gradient overlay (background color at 70% opacity)
2. A slowly drifting cloud layer using CSS animation (moving left to right over 20s, repeating)
3. A secondary cloud layer drifting in the opposite direction at a different speed (25s)

The effect: organic, alive fog that you can almost see through. Shapes are silhouetted behind it.

### Level Regions

Each level region gets:
- A subtle background fill using the level's brand color at low opacity
- A label in the top-left with the level name in the heading font
- A thin decorative top border in the level color
- A small icon that suggests the level's theme (compass for Foundations, lightning for Accelerator, brain for Thought Partner, gear for Specialized Teammates, network for Agentic)

### "You Are Here" Indicator

A diamond-shaped marker positioned near the active (yellow) skill node. It pulses with the same timing as the node's beacon. Uses the level color. Contains a small arrow or pin icon.

---

## Results Reveal: Enhanced Cinematic Sequence

The existing results reveal is already strong (11 phases, particle fields, pulse rings). Enhancements focus on the skill map building phase and the identity reveal moment.

### Beat 1: "Analyzing..." (0-3s) -- EXISTING, ENHANCE

Currently: Pulsing circles, particle field, "Analyzing your conversation" text.
Enhancement: Add a subtle rotating ring animation behind the central icon, making the loading feel more organic, like gears turning.

### Beat 2: Skill Map Build (3s-15s) -- EXISTING, ENHANCE

Currently: Level cards appear with skills popping in one by one.
Enhancement: Add a brief "glow burst" on each green skill as it appears (the node flashes bright for 200ms then settles). This makes mastered skills feel earned, not just present.

### Beat 3: Count-Up (15s-18s) -- EXISTING, GOOD AS-IS

The count-up animation from 0 to mastered count is solid.

### Beat 4: Level Reveal (18s-21s) -- EXISTING, ENHANCE

Currently: Big circle with level number, pulse rings, particles, crown badge.
Enhancement: Add a brief "impact" effect when the level circle first appears -- a single bright flash that ripples outward (one-shot, not repeating). This sells the "landing" moment.

### Beat 5: Signature Skill (21s-24s) -- EXISTING, GOOD AS-IS

The signature skill card with star icon and rationale works well.

### Beat 6-11: Remaining phases -- EXISTING, GOOD AS-IS

Bright spots, future self, first challenge, team, journey, share all work.

### New: Skill Completion Micro-Celebration (Dashboard)

When a user verifies a skill on the dashboard:
1. Node flashes bright (scale 1.0 to 1.15 and back, 400ms)
2. Color transitions to mastered state (300ms)
3. Checkmark pops in with spring animation (200ms, 100ms delay)
4. Connected path starts glowing (200ms per segment)

### New: Level-Up Enhancement (Dashboard Dialog)

The existing level-up dialog is functional but flat. Add:
1. The glow circle already exists, keep it
2. Add a brief pause (800ms) before the "Level Up!" text appears
3. The text should scale up from 0.8 to 1.0 (spring animation)
4. Confetti already fires, keep it

---

## Animation System Design

### Constants (new file: client/src/lib/animations.ts)

All timing values, easing curves, and durations in one place. Other components import from here.

- NODE_PULSE_DURATION: 2500ms
- FOG_DRIFT_DURATION: 20000ms
- PATH_FLOW_DURATION: 3000ms
- SHIMMER_DURATION: 6000ms
- GLOW_BURST_DURATION: 600ms
- NODE_REVEAL_STAGGER: 150ms
- Standard easings: entrance, exit, continuous, spring configs

### CSS Keyframes (in index.css)

- @keyframes rpg-fog-drift: translateX animation for fog layers
- @keyframes rpg-fog-drift-reverse: opposite direction fog
- @keyframes rpg-shimmer: border shimmer for locked nodes
- @keyframes rpg-path-flow: flowing gradient on completed paths
- @keyframes rpg-beacon: the "you are here" expanding ring
- @keyframes rpg-glow-breathe: slow breathing glow on mastered nodes

All with @media (prefers-reduced-motion: reduce) fallbacks that disable movement.

### Brand Palette Confirmation

Using existing colors from the codebase:
- et-green (#38A169) for mastered status
- et-yellow (#ECC94B) for in-progress status
- Level colors: cyan (#2DD6FF), gold (#FFD236), pink (#FF2F86), orange (#FF6A2B), blue (#1C4BFF)
- et-pageBg (#F0E4CE) for fog base color
- et-charcoal (#2B2B2B) for text

No new colors needed. Everything draws from the existing palette.

---

## Accessibility

Every animation includes @media (prefers-reduced-motion: reduce) that:
- Stops all motion (animation: none)
- Shows static equivalents of animated states
- Keeps color-based status indicators (not motion-dependent)
- The fog becomes a simple static overlay instead of drifting

---

## Files to Create or Edit

1. CREATE: `/client/src/lib/animations.ts` -- animation constants and Framer Motion variants
2. EDIT: `/client/src/index.css` -- add CSS keyframes for fog, shimmer, beacon, path flow
3. EDIT: `/client/src/components/rpg-map.tsx` -- full overhaul of the map component
4. EDIT: `/client/src/pages/results.tsx` -- enhance skill map building phase with glow bursts
5. EDIT: `/client/src/pages/dashboard.tsx` -- enhance level-up dialog timing
