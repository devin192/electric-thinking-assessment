const LEVEL_COLORS: Record<number, string> = {
  0: "#FFD236",
  1: "#FF2F86",
  2: "#FF6A2B",
  3: "#1C4BFF",
};

const LEVEL_NAMES: Record<number, string> = {
  0: "Accelerator",
  1: "Thought Partner",
  2: "Specialized",
  3: "Agentic Workflow",
};

export function generateBadgeSVG(
  badgeType: string,
  data: Record<string, any>,
  userName: string,
  earnedAt: Date
): string {
  const dateStr = earnedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (badgeType === "skill_complete") {
    const level = data.level ?? 0;
    const color = LEVEL_COLORS[level] || "#FF2F86";
    return skillBadgeSVG(data.skillName || "Skill", userName, dateStr, color);
  }

  if (badgeType === "level_up") {
    const level = data.level ?? 0;
    const color = LEVEL_COLORS[level] || "#FF2F86";
    const levelName = data.levelName || LEVEL_NAMES[level] || "Unknown";
    return levelBadgeSVG(level, levelName, userName, dateStr, color);
  }

  if (badgeType === "streak") {
    const weeks = data.weeks ?? 0;
    return streakBadgeSVG(weeks, userName, dateStr);
  }

  if (badgeType === "ultimate_master") {
    return masterBadgeSVG(userName, dateStr);
  }

  return skillBadgeSVG(badgeType, userName, dateStr, "#FF2F86");
}

function svgWrapper(content: string, accentColor: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Tomorrow:wght@400;600;700&amp;family=Source+Sans+3:wght@400;600&amp;display=swap');
    </style>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFF8F0"/>
      <stop offset="100%" stop-color="#F0E4CE"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="600" height="400" rx="20" fill="url(#bg)"/>
  <rect x="4" y="4" width="592" height="392" rx="18" fill="none" stroke="${accentColor}" stroke-width="2" opacity="0.3"/>
  ${content}
  <text x="300" y="370" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="11" fill="#999">Verified by Electric Thinking</text>
</svg>`;
}

function skillBadgeSVG(skillName: string, userName: string, date: string, color: string): string {
  return svgWrapper(`
    <circle cx="300" cy="110" r="50" fill="${color}" opacity="0.15"/>
    <circle cx="300" cy="110" r="35" fill="${color}" filter="url(#glow)"/>
    <path d="M288 110 L296 118 L312 102" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="300" y="195" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="700" font-size="22" fill="#2B2B2B">${escapeXml(skillName)}</text>
    <text x="300" y="225" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="600" font-size="14" fill="${color}">MASTERED</text>
    <text x="300" y="270" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="16" fill="#666">${escapeXml(userName)}</text>
    <text x="300" y="300" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="13" fill="#999">${date}</text>
  `, color);
}

function levelBadgeSVG(level: number, levelName: string, userName: string, date: string, color: string): string {
  return svgWrapper(`
    <circle cx="300" cy="105" r="55" fill="${color}" opacity="0.15"/>
    <circle cx="300" cy="105" r="40" fill="${color}" filter="url(#glow)"/>
    <text x="300" y="118" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="700" font-size="28" fill="white">${level + 1}</text>
    <text x="300" y="185" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="600" font-size="13" fill="${color}" letter-spacing="3">LEVEL UP</text>
    <text x="300" y="215" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="700" font-size="24" fill="#2B2B2B">${escapeXml(levelName)}</text>
    <text x="300" y="270" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="16" fill="#666">${escapeXml(userName)}</text>
    <text x="300" y="300" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="13" fill="#999">${date}</text>
  `, color);
}

function streakBadgeSVG(weeks: number, userName: string, date: string): string {
  return svgWrapper(`
    <circle cx="300" cy="105" r="50" fill="#FFD236" opacity="0.2"/>
    <circle cx="300" cy="105" r="35" fill="#FFD236" filter="url(#glow)"/>
    <text x="300" y="100" text-anchor="middle" font-size="28">🔥</text>
    <text x="300" y="185" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="600" font-size="13" fill="#FF6A2B" letter-spacing="3">LEARNING STREAK</text>
    <text x="300" y="220" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="700" font-size="28" fill="#2B2B2B">${weeks} Weeks</text>
    <text x="300" y="270" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="16" fill="#666">${escapeXml(userName)}</text>
    <text x="300" y="300" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="13" fill="#999">${date}</text>
  `, "#FFD236");
}

function masterBadgeSVG(userName: string, date: string): string {
  return svgWrapper(`
    <circle cx="300" cy="100" r="55" fill="#FF2F86" opacity="0.1"/>
    <circle cx="300" cy="100" r="42" fill="none" stroke="#FF2F86" stroke-width="2" opacity="0.4"/>
    <circle cx="300" cy="100" r="35" fill="#FF2F86" filter="url(#glow)"/>
    <text x="300" y="95" text-anchor="middle" font-size="26">⚡</text>
    <text x="300" y="178" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="600" font-size="13" fill="#FF2F86" letter-spacing="3">CERTIFIED</text>
    <text x="300" y="210" text-anchor="middle" font-family="Tomorrow, sans-serif" font-weight="700" font-size="22" fill="#2B2B2B">AI Fluency Master</text>
    <text x="300" y="240" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="14" fill="#666">All 20 skills mastered</text>
    <text x="300" y="280" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="16" fill="#2B2B2B" font-weight="600">${escapeXml(userName)}</text>
    <text x="300" y="305" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="13" fill="#999">${date}</text>
  `, "#FF2F86");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
