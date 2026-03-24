import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, Lock, Star, MapPin, Compass, Zap, Brain, Settings, Network } from "lucide-react";
import type { Level, Skill, UserSkillStatus } from "@shared/schema";
import { LEVEL_COLORS, LEVEL_BG_COLORS, STATUS_COLORS } from "@/lib/animations";

// ── Layout Constants ──

const MAP_WIDTH = 600;
const REGION_HEIGHT = 240;
const NODE_RADIUS = 24;
const PATH_MARGIN_X = 80;

// ── Level Theme Icons (suggest the feel of each level) ──

const LEVEL_ICONS: Record<number, typeof Compass> = {
  0: Compass,
  1: Zap,
  2: Brain,
  3: Settings,
  4: Network,
};

// ── Node Position Calculation ──

function getSkillNodePositions(skillCount: number, regionIndex: number, totalRegions: number) {
  const positions: { x: number; y: number }[] = [];
  const regionTop = (totalRegions - 1 - regionIndex) * REGION_HEIGHT + 50;
  const usableWidth = MAP_WIDTH - PATH_MARGIN_X * 2;

  for (let i = 0; i < skillCount; i++) {
    const progress = skillCount === 1 ? 0.5 : i / (skillCount - 1);
    const waveX = PATH_MARGIN_X + progress * usableWidth;
    const sineOffset = Math.sin(progress * Math.PI + regionIndex * 1.2) * 40;
    const x = waveX + (regionIndex % 2 === 0 ? sineOffset : -sineOffset);
    const verticalSpread = Math.min(140, REGION_HEIGHT - 80);
    const y = regionTop + 40 + (i / Math.max(skillCount - 1, 1)) * verticalSpread;
    positions.push({ x: Math.max(55, Math.min(MAP_WIDTH - 55, x)), y });
  }
  return positions;
}

// ── Path Generation ──

function generatePathD(allPositions: { x: number; y: number }[]) {
  if (allPositions.length < 2) return "";
  let d = `M ${allPositions[0].x} ${allPositions[0].y}`;
  for (let i = 1; i < allPositions.length; i++) {
    const prev = allPositions[i - 1];
    const curr = allPositions[i];
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
    const cpy1 = prev.y;
    const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
    const cpy2 = curr.y;
    d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
  }
  return d;
}

// Generate a sub-path for segments between specific node indices
function generateSubPathD(allPositions: { x: number; y: number }[], fromIdx: number, toIdx: number) {
  if (fromIdx < 0 || toIdx >= allPositions.length || fromIdx >= toIdx) return "";
  const slice = allPositions.slice(fromIdx, toIdx + 1);
  return generatePathD(slice);
}

// ── Types ──

interface RPGMapProps {
  levels: Level[];
  skills: Skill[];
  userSkills: UserSkillStatus[];
  scores: Record<string, { status: string; explanation: string }>;
  assessmentLevel: number | null;
  onVerifySkill: (skill: Skill) => void;
}

type NodeState = "green" | "yellow" | "red" | "locked" | "fogged";

// ── Main Component ──

export function RPGMap({ levels, skills, userSkills, scores, assessmentLevel, onVerifySkill }: RPGMapProps) {
  const [openPopover, setOpenPopover] = useState<number | null>(null);

  const sortedLevels = useMemo(() =>
    [...levels].sort((a, b) => a.sortOrder - b.sortOrder),
    [levels]
  );

  const totalRegions = sortedLevels.length || 5;
  const totalHeight = totalRegions * REGION_HEIGHT + 80;

  const skillsByLevel = useMemo(() => {
    const map: Record<number, Skill[]> = {};
    skills.forEach(s => {
      const level = levels.find(l => l.id === s.levelId);
      if (level) {
        if (!map[level.sortOrder]) map[level.sortOrder] = [];
        map[level.sortOrder].push(s);
      }
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.sortOrder - b.sortOrder));
    return map;
  }, [skills, levels]);

  // Determine the five-state status for each skill
  const getNodeState = (skill: Skill, levelSort: number): NodeState => {
    const currentLevel = assessmentLevel ?? 0;
    // Fogged: 2+ levels beyond current
    if (levelSort > currentLevel + 1) return "fogged";
    // Locked: next level (1 beyond current)
    if (levelSort === currentLevel + 1) return "locked";
    // Within visible range: check actual status
    const userStatus = userSkills?.find(us => us.skillId === skill.id);
    if (userStatus) return userStatus.status as NodeState;
    const scoreStatus = scores[skill.name]?.status;
    if (scoreStatus === "green" || scoreStatus === "yellow") return scoreStatus as NodeState;
    return "red";
  };

  // Build all node data
  const allNodeData = useMemo(() => {
    const nodes: { skill: Skill; x: number; y: number; state: NodeState; levelSort: number }[] = [];
    sortedLevels.forEach(level => {
      const lvlSkills = skillsByLevel[level.sortOrder] || [];
      const positions = getSkillNodePositions(lvlSkills.length, level.sortOrder, totalRegions);
      lvlSkills.forEach((skill, i) => {
        nodes.push({
          skill,
          x: positions[i]?.x ?? MAP_WIDTH / 2,
          y: positions[i]?.y ?? 0,
          state: getNodeState(skill, level.sortOrder),
          levelSort: level.sortOrder,
        });
      });
    });
    return nodes;
  }, [sortedLevels, skillsByLevel, userSkills, scores, totalRegions, assessmentLevel]);

  // Full path through all nodes
  const pathD = useMemo(() => generatePathD(allNodeData.map(n => ({ x: n.x, y: n.y }))), [allNodeData]);

  // Find the first yellow node (active skill)
  const activeNodeIndex = useMemo(() => {
    return allNodeData.findIndex(n => n.state === "yellow");
  }, [allNodeData]);

  // Calculate how far the green progress path should go
  const lastGreenIndex = useMemo(() => {
    let idx = -1;
    allNodeData.forEach((n, i) => {
      if (n.state === "green") idx = i;
    });
    return idx;
  }, [allNodeData]);

  const progressFraction = allNodeData.length > 1
    ? Math.min(1, (lastGreenIndex + 1) / allNodeData.length)
    : 0;

  return (
    <div data-testid="rpg-map" className="w-full overflow-x-hidden overflow-y-auto">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${totalHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
        style={{ minHeight: 400 }}
      >
        <defs>
          {/* Glow filters */}
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-active" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Fog gradients for each fogged region */}
          <linearGradient id="fog-grad-primary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--background))" stopOpacity="0.85" />
            <stop offset="50%" stopColor="hsl(var(--background))" stopOpacity="0.65" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="fog-grad-secondary" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="hsl(var(--background))" stopOpacity="0.6" />
            <stop offset="40%" stopColor="hsl(var(--background))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="0.2" />
          </linearGradient>

          {/* Path flow pattern for completed paths */}
          <pattern id="path-flow-pattern" x="0" y="0" width="12" height="4" patternUnits="userSpaceOnUse">
            <rect width="8" height="4" fill={STATUS_COLORS.green} opacity="0.8" rx="2" />
          </pattern>
        </defs>

        {/* ── Level Regions ── */}
        <AnimatePresence>
          {sortedLevels.map(level => {
            const regionTop = (totalRegions - 1 - level.sortOrder) * REGION_HEIGHT;
            const color = LEVEL_COLORS[level.sortOrder] || "#888";
            const bgColor = LEVEL_BG_COLORS[level.sortOrder] || "rgba(128,128,128,0.06)";
            const isFogged = level.sortOrder > (assessmentLevel ?? 0) + 1;
            const isLocked = level.sortOrder === (assessmentLevel ?? 0) + 1;
            const isCurrent = level.sortOrder === (assessmentLevel ?? 0);
            const LevelIcon = LEVEL_ICONS[level.sortOrder] || Compass;

            return (
              <motion.g
                key={level.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, delay: level.sortOrder * 0.08 }}
              >
                {/* Region background */}
                <rect
                  x={8}
                  y={regionTop + 4}
                  width={MAP_WIDTH - 16}
                  height={REGION_HEIGHT - 8}
                  rx={16}
                  fill={bgColor}
                  stroke={color}
                  strokeWidth={isCurrent ? 1.5 : 0.5}
                  strokeOpacity={isCurrent ? 0.5 : 0.2}
                />

                {/* Decorative top accent line */}
                <rect
                  x={24}
                  y={regionTop + 4}
                  width={60}
                  height={2}
                  rx={1}
                  fill={color}
                  opacity={isFogged ? 0.1 : (isLocked ? 0.2 : 0.6)}
                />

                {/* Level icon */}
                <foreignObject
                  x={20}
                  y={regionTop + 14}
                  width={20}
                  height={20}
                  style={{ overflow: "visible", opacity: isFogged ? 0.15 : (isLocked ? 0.3 : 0.7) }}
                >
                  <LevelIcon
                    style={{ width: 14, height: 14, color }}
                  />
                </foreignObject>

                {/* Level name */}
                <text
                  x={40}
                  y={regionTop + 28}
                  fill={color}
                  fontSize={12}
                  fontWeight={700}
                  fontFamily="var(--font-heading)"
                  opacity={isFogged ? 0.15 : (isLocked ? 0.35 : 0.85)}
                >
                  {level.displayName}
                </text>

                {/* "You are here" text for current level */}
                {isCurrent && (
                  <text
                    x={MAP_WIDTH - 24}
                    y={regionTop + 28}
                    textAnchor="end"
                    fill={color}
                    fontSize={9}
                    fontWeight={600}
                    fontFamily="var(--font-heading)"
                    opacity={0.6}
                    letterSpacing="0.1em"
                  >
                    YOUR LEVEL
                  </text>
                )}
              </motion.g>
            );
          })}
        </AnimatePresence>

        {/* ── Inactive Path (faint dashed line for the full route) ── */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={2}
            strokeDasharray="6 8"
            opacity={0.3}
          />
        )}

        {/* ── Completed Path (solid glowing line through mastered nodes) ── */}
        {pathD && progressFraction > 0 && (
          <>
            {/* Base green path */}
            <motion.path
              d={pathD}
              fill="none"
              stroke={STATUS_COLORS.green}
              strokeWidth={3}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: progressFraction }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
            {/* Flowing energy overlay on completed path */}
            <motion.path
              d={pathD}
              fill="none"
              stroke={STATUS_COLORS.green}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="8 16"
              className="rpg-path-flow"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: progressFraction, opacity: 0.4 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </>
        )}

        {/* ── Active Path (pulsing dashed line toward yellow node) ── */}
        {activeNodeIndex > 0 && lastGreenIndex >= 0 && activeNodeIndex > lastGreenIndex && (
          <motion.path
            d={generateSubPathD(
              allNodeData.map(n => ({ x: n.x, y: n.y })),
              lastGreenIndex,
              activeNodeIndex
            )}
            fill="none"
            stroke={STATUS_COLORS.yellow}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="4 6"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* ── Skill Nodes ── */}
        {allNodeData.map((node, idx) => {
          const levelColor = LEVEL_COLORS[node.levelSort] || "#888";
          const isActive = idx === activeNodeIndex;

          return (
            <g key={node.skill.id} data-testid={`skill-node-${node.skill.id}`}>

              {/* ── GREEN NODE (Mastered) ── */}
              {node.state === "green" && (
                <>
                  {/* Breathing glow behind the node */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 8}
                    fill={STATUS_COLORS.green}
                    className="rpg-glow-breathe"
                    filter="url(#glow-green)"
                  />
                  {/* Main circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill={STATUS_COLORS.green}
                  />
                  {/* Checkmark */}
                  <path
                    d={`M ${node.x - 7} ${node.y} l 5 5 l 9 -9`}
                    stroke="white"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* ── YELLOW NODE (Active / You Are Here) ── */}
              {node.state === "yellow" && (
                <>
                  {/* Beacon pulse rings */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill="none"
                    stroke={STATUS_COLORS.yellow}
                    strokeWidth={2}
                    className="rpg-beacon"
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill="none"
                    stroke={STATUS_COLORS.yellow}
                    strokeWidth={2}
                    className="rpg-beacon-delayed"
                  />
                  {/* Active glow */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 6}
                    fill={STATUS_COLORS.yellow}
                    opacity={0.12}
                    filter="url(#glow-active)"
                  />
                  {/* Main circle - larger than others */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 2}
                    fill={`${STATUS_COLORS.yellow}30`}
                    stroke={STATUS_COLORS.yellow}
                    strokeWidth={3}
                  />
                  {/* Inner fill */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS - 6}
                    fill={STATUS_COLORS.yellow}
                    opacity={0.25}
                  />
                  {/* Star icon in center */}
                  <foreignObject
                    x={node.x - 8}
                    y={node.y - 8}
                    width={16}
                    height={16}
                    style={{ overflow: "visible" }}
                  >
                    <Star style={{ width: 16, height: 16, color: STATUS_COLORS.yellow }} />
                  </foreignObject>

                  {/* "You Are Here" diamond marker */}
                  {isActive && (
                    <g className="rpg-marker-pulse" style={{ transformOrigin: `${node.x}px ${node.y - NODE_RADIUS - 18}px` }}>
                      <polygon
                        points={`${node.x},${node.y - NODE_RADIUS - 26} ${node.x + 8},${node.y - NODE_RADIUS - 16} ${node.x},${node.y - NODE_RADIUS - 6} ${node.x - 8},${node.y - NODE_RADIUS - 16}`}
                        fill={STATUS_COLORS.yellow}
                      />
                      <foreignObject
                        x={node.x - 5}
                        y={node.y - NODE_RADIUS - 22}
                        width={10}
                        height={10}
                        style={{ overflow: "visible" }}
                      >
                        <MapPin style={{ width: 10, height: 10, color: "white" }} />
                      </foreignObject>
                    </g>
                  )}
                </>
              )}

              {/* ── RED NODE (Not Started, Visible) ── */}
              {node.state === "red" && (
                <>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill="none"
                    stroke="hsl(var(--border))"
                    strokeWidth={2}
                    opacity={0.5}
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS - 3}
                    fill="hsl(var(--muted))"
                    opacity={0.3}
                  />
                </>
              )}

              {/* ── LOCKED NODE (Next Level, Silhouetted) ── */}
              {node.state === "locked" && (
                <>
                  {/* Dashed outline with shimmer */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill="none"
                    stroke={levelColor}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    opacity={0.3}
                    className="rpg-shimmer"
                  />
                  {/* Faint silhouette fill */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS - 4}
                    fill={levelColor}
                    opacity={0.06}
                  />
                  {/* Lock icon */}
                  <foreignObject
                    x={node.x - 7}
                    y={node.y - 7}
                    width={14}
                    height={14}
                    style={{ overflow: "visible" }}
                  >
                    <Lock style={{ width: 14, height: 14, color: levelColor, opacity: 0.25 }} />
                  </foreignObject>
                </>
              )}

              {/* ── FOGGED NODE (2+ levels away) ── */}
              {node.state === "fogged" && (
                <>
                  {/* Ghost circle barely visible behind fog */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill="hsl(var(--muted))"
                    opacity={0.08}
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill="none"
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                    opacity={0.1}
                  />
                </>
              )}

              {/* ── Popover Trigger (for green, yellow, red, locked) ── */}
              {node.state !== "fogged" && (
                <foreignObject
                  x={node.x - NODE_RADIUS - 6}
                  y={node.y - NODE_RADIUS - 6}
                  width={(NODE_RADIUS + 6) * 2}
                  height={(NODE_RADIUS + 6) * 2}
                  style={{ overflow: "visible" }}
                >
                  <Popover
                    open={openPopover === node.skill.id}
                    onOpenChange={(open) => setOpenPopover(open ? node.skill.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        className="block w-full h-full focus:outline-none"
                        style={{
                          cursor: "pointer",
                          width: (NODE_RADIUS + 6) * 2,
                          height: (NODE_RADIUS + 6) * 2,
                          background: "transparent",
                          border: "none",
                        }}
                        onClick={() => setOpenPopover(node.skill.id)}
                        aria-label={node.skill.name}
                      />
                    </PopoverTrigger>
                    <PopoverContent side="right" align="center" className="w-64 p-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {node.state === "green" && <Check className="w-4 h-4 text-et-green" />}
                          {node.state === "yellow" && <Star className="w-4 h-4 text-et-yellow" />}
                          {node.state === "red" && <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40" />}
                          {node.state === "locked" && <Lock className="w-4 h-4 text-muted-foreground/50" />}
                          <span className="font-heading font-semibold text-sm">{node.skill.name}</span>
                        </div>

                        {node.state === "locked" ? (
                          <p className="text-xs text-muted-foreground italic">
                            Keep going to discover this skill.
                          </p>
                        ) : (
                          <>
                            {node.skill.description && (
                              <p className="text-xs text-muted-foreground">{node.skill.description}</p>
                            )}
                            <p className="text-xs">
                              Status:{" "}
                              <span className={
                                node.state === "green" ? "text-et-green font-medium" :
                                node.state === "yellow" ? "text-et-yellow font-medium" :
                                "text-muted-foreground"
                              }>
                                {node.state === "green" ? "Mastered" : node.state === "yellow" ? "Working on this" : "Not started"}
                              </span>
                            </p>
                            {scores[node.skill.name]?.explanation && (
                              <p className="text-xs text-muted-foreground italic">
                                {scores[node.skill.name].explanation}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </foreignObject>
              )}

              {/* ── Node Label ── */}
              <text
                x={node.x}
                y={node.y + NODE_RADIUS + 18}
                textAnchor="middle"
                fontSize={10}
                fill="hsl(var(--foreground))"
                opacity={
                  node.state === "fogged" ? 0 :
                  node.state === "locked" ? 0.2 :
                  node.state === "red" ? 0.5 :
                  0.75
                }
                fontFamily="var(--font-sans)"
                fontWeight={node.state === "yellow" ? 600 : 400}
              >
                {node.skill.name.length > 18
                  ? node.skill.name.substring(0, 16) + "..."
                  : node.skill.name}
              </text>
            </g>
          );
        })}

        {/* ── Fog of War (layered, drifting) ── */}
        {sortedLevels.map(level => {
          if (level.sortOrder <= (assessmentLevel ?? 0) + 1) return null;
          const regionTop = (totalRegions - 1 - level.sortOrder) * REGION_HEIGHT;

          return (
            <g key={`fog-${level.id}`}>
              {/* Primary fog layer */}
              <motion.rect
                x={0}
                y={regionTop - 5}
                width={MAP_WIDTH}
                height={REGION_HEIGHT + 10}
                fill="url(#fog-grad-primary)"
                rx={16}
                className="rpg-fog-layer-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                transition={{ duration: 1, delay: 0.3 }}
              />
              {/* Secondary fog layer (opposite drift) */}
              <motion.rect
                x={-20}
                y={regionTop}
                width={MAP_WIDTH + 40}
                height={REGION_HEIGHT}
                fill="url(#fog-grad-secondary)"
                rx={12}
                className="rpg-fog-layer-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ duration: 1.2, delay: 0.5 }}
              />
            </g>
          );
        })}

        {/* ── Level Gate Markers (between levels) ── */}
        {sortedLevels.map((level, idx) => {
          if (idx === 0) return null;
          const currentLevel = assessmentLevel ?? 0;
          if (level.sortOrder > currentLevel + 1) return null;

          const regionTop = (totalRegions - 1 - level.sortOrder) * REGION_HEIGHT;
          const gateY = regionTop + REGION_HEIGHT - 2;
          const gateColor = LEVEL_COLORS[level.sortOrder] || "#888";
          const prevColor = LEVEL_COLORS[level.sortOrder - 1] || "#888";
          const isUnlocked = level.sortOrder <= currentLevel;

          return (
            <g key={`gate-${level.id}`}>
              {/* Gate line */}
              <line
                x1={MAP_WIDTH * 0.2}
                y1={gateY}
                x2={MAP_WIDTH * 0.8}
                y2={gateY}
                stroke={isUnlocked ? gateColor : prevColor}
                strokeWidth={1}
                strokeDasharray={isUnlocked ? "none" : "4 4"}
                opacity={isUnlocked ? 0.3 : 0.15}
              />
              {/* Gate diamond */}
              <polygon
                points={`${MAP_WIDTH / 2},${gateY - 6} ${MAP_WIDTH / 2 + 6},${gateY} ${MAP_WIDTH / 2},${gateY + 6} ${MAP_WIDTH / 2 - 6},${gateY}`}
                fill={isUnlocked ? gateColor : "hsl(var(--muted))"}
                opacity={isUnlocked ? 0.5 : 0.2}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
