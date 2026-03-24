/**
 * Animation constants and Framer Motion variants for the RPG skill map
 * and results reveal system.
 *
 * All timing values live here so they can be tuned from one place.
 */

// -- Timing Constants (milliseconds) --

export const TIMING = {
  /** Slow breathing glow on mastered nodes */
  GLOW_BREATHE: 4000,
  /** "You are here" beacon pulse cycle */
  BEACON_PULSE: 2500,
  /** Fog drift across locked regions */
  FOG_DRIFT: 20000,
  /** Secondary fog layer (opposite direction) */
  FOG_DRIFT_ALT: 25000,
  /** Shimmer on locked node borders */
  SHIMMER: 6000,
  /** Energy flow along completed paths */
  PATH_FLOW: 3000,
  /** Flash when a skill is revealed as mastered */
  GLOW_BURST: 600,
  /** Stagger between node reveals in the results sequence */
  NODE_REVEAL_STAGGER: 150,
  /** Skill completion flash duration */
  COMPLETION_FLASH: 400,
  /** Pause before level-up text appears */
  LEVEL_UP_PAUSE: 800,
} as const;

// -- Easing Curves --

export const EASING = {
  /** For elements entering the screen */
  entrance: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** For elements leaving the screen */
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
  /** For continuous looping animations */
  continuous: "easeInOut" as const,
  /** For elements settling into place */
  settle: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
} as const;

// -- Spring Configs (Framer Motion) --

export const SPRING = {
  /** Snappy pop for checkmarks and small icons */
  snappyPop: { type: "spring" as const, stiffness: 300, damping: 20 },
  /** Gentle settle for cards and panels */
  gentleSettle: { type: "spring" as const, stiffness: 150, damping: 20 },
  /** Bouncy entrance for celebration elements */
  bouncy: { type: "spring" as const, stiffness: 400, damping: 15 },
} as const;

// -- Framer Motion Variants --

/** Node reveal: scales from 0 to 1 with a slight overshoot */
export const nodeRevealVariant = {
  hidden: { scale: 0, opacity: 0 },
  visible: (delay: number) => ({
    scale: 1,
    opacity: 1,
    transition: {
      ...SPRING.snappyPop,
      delay,
    },
  }),
};

/** Glow burst for mastered skills during reveal */
export const glowBurstVariant = {
  initial: { scale: 1, opacity: 0 },
  flash: {
    scale: [1, 1.4, 1],
    opacity: [0, 0.8, 0],
    transition: { duration: TIMING.GLOW_BURST / 1000, ease: "easeOut" },
  },
};

/** Path drawing animation for SVG pathLength */
export const pathDrawVariant = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: (duration: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: { duration, ease: "easeInOut" },
  }),
};

/** Fog drift uses CSS keyframes, but this variant handles fade-in */
export const fogFadeVariant = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 1.5, ease: "easeIn" },
  },
};

// -- Level Colors (4 levels: 0=Accelerator, 1=Thought Partner, 2=Specialized, 3=Agentic) --

export const LEVEL_COLORS: Record<number, string> = {
  0: "#FFD236",
  1: "#FF2F86",
  2: "#FF6A2B",
  3: "#1C4BFF",
};

export const LEVEL_BG_COLORS: Record<number, string> = {
  0: "rgba(255,210,54,0.06)",
  1: "rgba(255,47,134,0.06)",
  2: "rgba(255,106,43,0.06)",
  3: "rgba(28,75,255,0.06)",
};

// -- Status Colors --

export const STATUS_COLORS = {
  green: "#38A169",
  yellow: "#ECC94B",
  red: "#E53E3E",
} as const;
