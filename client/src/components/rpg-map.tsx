import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, Lock, Star, BookCheck } from "lucide-react";
import type { Level, Skill, UserSkillStatus } from "@shared/schema";

const LEVEL_COLORS: Record<number, string> = {
  0: "#2DD6FF",
  1: "#FFD236",
  2: "#FF2F86",
  3: "#FF6A2B",
  4: "#1C4BFF",
};

const LEVEL_BG_COLORS: Record<number, string> = {
  0: "rgba(45,214,255,0.08)",
  1: "rgba(255,210,54,0.08)",
  2: "rgba(255,47,134,0.08)",
  3: "rgba(255,106,43,0.08)",
  4: "rgba(28,75,255,0.08)",
};

interface RPGMapProps {
  levels: Level[];
  skills: Skill[];
  userSkills: UserSkillStatus[];
  scores: Record<string, { status: string; explanation: string }>;
  assessmentLevel: number | null;
  onVerifySkill: (skill: Skill) => void;
}

const MAP_WIDTH = 600;
const REGION_HEIGHT = 220;
const NODE_RADIUS = 22;
const PATH_MARGIN_X = 80;

function getSkillNodePositions(skillCount: number, regionIndex: number, totalRegions: number) {
  const positions: { x: number; y: number }[] = [];
  const regionTop = (totalRegions - 1 - regionIndex) * REGION_HEIGHT + 40;
  const usableWidth = MAP_WIDTH - PATH_MARGIN_X * 2;

  for (let i = 0; i < skillCount; i++) {
    const progress = skillCount === 1 ? 0.5 : i / (skillCount - 1);
    const waveX = PATH_MARGIN_X + progress * usableWidth;
    const sineOffset = Math.sin(progress * Math.PI + regionIndex * 1.2) * 40;
    const x = waveX + (regionIndex % 2 === 0 ? sineOffset : -sineOffset);
    const verticalSpread = Math.min(140, REGION_HEIGHT - 60);
    const y = regionTop + 30 + (i / Math.max(skillCount - 1, 1)) * verticalSpread;
    positions.push({ x: Math.max(50, Math.min(MAP_WIDTH - 50, x)), y });
  }
  return positions;
}

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

export function RPGMap({ levels, skills, userSkills, scores, assessmentLevel, onVerifySkill }: RPGMapProps) {
  const [openPopover, setOpenPopover] = useState<number | null>(null);

  const sortedLevels = useMemo(() =>
    [...levels].sort((a, b) => a.sortOrder - b.sortOrder),
    [levels]
  );

  const totalRegions = sortedLevels.length || 5;
  const totalHeight = totalRegions * REGION_HEIGHT + 60;

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

  const getSkillStatus = (skill: Skill) => {
    const userStatus = userSkills?.find(us => us.skillId === skill.id);
    if (userStatus) return userStatus.status;
    return scores[skill.name]?.status || "red";
  };

  const allNodeData = useMemo(() => {
    const nodes: { skill: Skill; x: number; y: number; status: string; levelSort: number }[] = [];
    sortedLevels.forEach(level => {
      const lvlSkills = skillsByLevel[level.sortOrder] || [];
      const positions = getSkillNodePositions(lvlSkills.length, level.sortOrder, totalRegions);
      lvlSkills.forEach((skill, i) => {
        nodes.push({
          skill,
          x: positions[i]?.x ?? MAP_WIDTH / 2,
          y: positions[i]?.y ?? 0,
          status: getSkillStatus(skill),
          levelSort: level.sortOrder,
        });
      });
    });
    return nodes;
  }, [sortedLevels, skillsByLevel, userSkills, scores, totalRegions]);

  const pathD = useMemo(() => generatePathD(allNodeData.map(n => ({ x: n.x, y: n.y }))), [allNodeData]);

  const lastGreenIndex = useMemo(() => {
    let idx = -1;
    allNodeData.forEach((n, i) => {
      if (n.status === "green") idx = i;
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
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-yellow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="fog-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--background))" stopOpacity="0.95" />
            <stop offset="40%" stopColor="hsl(var(--background))" stopOpacity="0.7" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="0" />
          </linearGradient>
        </defs>

        <AnimatePresence>
          {sortedLevels.map(level => {
            const regionTop = (totalRegions - 1 - level.sortOrder) * REGION_HEIGHT;
            const color = LEVEL_COLORS[level.sortOrder] || "#888";
            const bgColor = LEVEL_BG_COLORS[level.sortOrder] || "rgba(128,128,128,0.08)";
            const isLocked = level.sortOrder > (assessmentLevel ?? 0) + 1;

            return (
              <motion.g
                key={level.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, delay: level.sortOrder * 0.1 }}
              >
                <rect
                  x={10}
                  y={regionTop + 5}
                  width={MAP_WIDTH - 20}
                  height={REGION_HEIGHT - 10}
                  rx={12}
                  fill={bgColor}
                  stroke={color}
                  strokeWidth={0.5}
                  strokeOpacity={0.3}
                />
                <text
                  x={24}
                  y={regionTop + 28}
                  fill={color}
                  fontSize={13}
                  fontWeight={700}
                  fontFamily="var(--font-heading)"
                  opacity={isLocked ? 0.4 : 0.9}
                >
                  {level.displayName}
                </text>
              </motion.g>
            );
          })}
        </AnimatePresence>

        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={3}
            strokeDasharray="8 6"
            opacity={0.5}
          />
        )}

        {pathD && progressFraction > 0 && (
          <motion.path
            d={pathD}
            fill="none"
            stroke="#38A169"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: progressFraction }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        )}

        {allNodeData.map((node, idx) => {
          const isLocked = node.levelSort > (assessmentLevel ?? 0) + 1;
          const isFogged = node.levelSort > (assessmentLevel ?? 0) + 1;
          const isNextLevel = node.levelSort === (assessmentLevel ?? 0) + 1;

          return (
            <g key={node.skill.id} data-testid={`skill-node-${node.skill.id}`}>
              {isFogged && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS + 12}
                  fill="hsl(var(--background))"
                  opacity={0.6}
                />
              )}

              {node.status === "green" && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS + 4}
                  fill="#38A169"
                  opacity={0.2}
                  filter="url(#glow-green)"
                />
              )}

              <foreignObject
                x={node.x - NODE_RADIUS - 4}
                y={node.y - NODE_RADIUS - 4}
                width={(NODE_RADIUS + 4) * 2}
                height={(NODE_RADIUS + 4) * 2}
                style={{ overflow: "visible" }}
              >
                <Popover
                  open={openPopover === node.skill.id}
                  onOpenChange={(open) => setOpenPopover(open ? node.skill.id : null)}
                >
                  <PopoverTrigger asChild>
                    <button
                      className="block w-full h-full focus:outline-none"
                      style={{ cursor: isLocked ? "default" : "pointer" }}
                      onClick={() => !isLocked && setOpenPopover(node.skill.id)}
                      aria-label={node.skill.name}
                    >
                      <svg
                        width={(NODE_RADIUS + 4) * 2}
                        height={(NODE_RADIUS + 4) * 2}
                        viewBox={`0 0 ${(NODE_RADIUS + 4) * 2} ${(NODE_RADIUS + 4) * 2}`}
                      >
                        {node.status === "green" && (
                          <>
                            <circle
                              cx={NODE_RADIUS + 4}
                              cy={NODE_RADIUS + 4}
                              r={NODE_RADIUS}
                              fill="#38A169"
                            />
                            <path
                              d={`M ${NODE_RADIUS - 4} ${NODE_RADIUS + 4} l 6 6 l 10 -10`}
                              stroke="white"
                              strokeWidth={3}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </>
                        )}

                        {node.status === "yellow" && (
                          <>
                            <circle
                              cx={NODE_RADIUS + 4}
                              cy={NODE_RADIUS + 4}
                              r={NODE_RADIUS}
                              fill="transparent"
                              stroke="#ECC94B"
                              strokeWidth={3}
                            >
                              <animate
                                attributeName="r"
                                values={`${NODE_RADIUS};${NODE_RADIUS * 1.15};${NODE_RADIUS}`}
                                dur="2s"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="stroke-opacity"
                                values="1;0.6;1"
                                dur="2s"
                                repeatCount="indefinite"
                              />
                            </circle>
                            <circle
                              cx={NODE_RADIUS + 4}
                              cy={NODE_RADIUS + 4}
                              r={NODE_RADIUS - 4}
                              fill="#ECC94B"
                              opacity={0.2}
                            />
                          </>
                        )}

                        {node.status === "red" && (
                          <circle
                            cx={NODE_RADIUS + 4}
                            cy={NODE_RADIUS + 4}
                            r={NODE_RADIUS}
                            fill="hsl(var(--muted))"
                            stroke="hsl(var(--border))"
                            strokeWidth={2}
                            opacity={isNextLevel ? 0.4 : (isLocked ? 0.2 : 0.6)}
                          />
                        )}
                      </svg>
                    </button>
                  </PopoverTrigger>
                  {!isLocked && (
                    <PopoverContent side="right" align="center" className="w-64 p-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {node.status === "green" && <Check className="w-4 h-4 text-et-green" />}
                          {node.status === "yellow" && <Star className="w-4 h-4 text-et-yellow" />}
                          {node.status === "red" && <Lock className="w-4 h-4 text-muted-foreground" />}
                          <span className="font-heading font-semibold text-sm">{node.skill.name}</span>
                        </div>
                        {node.skill.description && (
                          <p className="text-xs text-muted-foreground">{node.skill.description}</p>
                        )}
                        <p className="text-xs">
                          Status:{" "}
                          <span className={
                            node.status === "green" ? "text-et-green font-medium" :
                            node.status === "yellow" ? "text-et-yellow font-medium" :
                            "text-muted-foreground"
                          }>
                            {node.status === "green" ? "Mastered" : node.status === "yellow" ? "Almost there" : "Not started"}
                          </span>
                        </p>
                        {scores[node.skill.name]?.explanation && (
                          <p className="text-xs text-muted-foreground italic">
                            {scores[node.skill.name].explanation}
                          </p>
                        )}
                        {node.status === "yellow" && (
                          <Button
                            size="sm"
                            className="w-full mt-2"
                            onClick={() => {
                              setOpenPopover(null);
                              onVerifySkill(node.skill);
                            }}
                            data-testid={`button-verify-map-${node.skill.id}`}
                          >
                            <BookCheck className="w-3 h-3 mr-1" /> Verify Skill
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  )}
                </Popover>
              </foreignObject>

              <text
                x={node.x}
                y={node.y + NODE_RADIUS + 16}
                textAnchor="middle"
                fontSize={10}
                fill="hsl(var(--foreground))"
                opacity={isLocked ? 0.2 : 0.7}
                fontFamily="var(--font-sans)"
              >
                {node.skill.name.length > 18
                  ? node.skill.name.substring(0, 16) + "..."
                  : node.skill.name}
              </text>
            </g>
          );
        })}

        {sortedLevels.map(level => {
          if (level.sortOrder <= (assessmentLevel ?? 0) + 1) return null;
          const regionTop = (totalRegions - 1 - level.sortOrder) * REGION_HEIGHT;
          return (
            <motion.rect
              key={`fog-${level.id}`}
              x={0}
              y={regionTop}
              width={MAP_WIDTH}
              height={REGION_HEIGHT}
              fill="url(#fog-gradient)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ duration: 0.8 }}
            />
          );
        })}
      </svg>
    </div>
  );
}
