import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ArrowRight } from "lucide-react";
import type { Skill, Level, UserSkillStatus } from "@shared/schema";

const LEVEL_HEX: Record<number, string> = {
  0: "#2DD6FF", 1: "#FFD236", 2: "#FF2F86", 3: "#FF6A2B", 4: "#1C4BFF",
};

const LEVEL_NAMES: Record<number, string> = {
  0: "Explorer", 1: "Accelerator", 2: "Thought Partner", 3: "Specialized", 4: "Agentic",
};

const SLIDER_LABELS: Record<number, string> = {
  0: "Never / Don't know",
  1: "Heard of it",
  2: "Tried once or twice",
  3: "Occasionally",
  4: "Sometimes",
  5: "About half the time",
  6: "Fairly often",
  7: "Regularly",
  8: "Most of the time",
  9: "Almost always",
  10: "All the time / Very comfortable",
};

interface SkillWithScore {
  skill: Skill;
  status: string;
  levelSortOrder: number;
}

interface SkillSlidersProps {
  skills: Skill[];
  levels: Level[];
  userSkills: UserSkillStatus[];
  assessmentLevel: number;
  scoresJson: Record<string, { status: string; explanation: string }>;
  onConfirm: (adjustedScores: Record<number, number>) => void;
}

function getDefaultValue(status: string): number {
  switch (status) {
    case "green": return 8;
    case "yellow": return 5;
    case "red": return 1;
    default: return 0;
  }
}

export function SkillSliders({
  skills,
  levels,
  userSkills,
  assessmentLevel,
  scoresJson,
  onConfirm,
}: SkillSlidersProps) {
  // Build the list: skills at user's level, one below, plus any yellow skills from other levels
  const relevantSkills: SkillWithScore[] = [];
  const seen = new Set<number>();

  for (const skill of skills) {
    const level = levels.find(l => l.id === skill.levelId);
    if (!level) continue;
    const sortOrder = level.sortOrder;

    // Include skills at assessment level and one below
    const isCurrentOrBelow = sortOrder === assessmentLevel || sortOrder === assessmentLevel - 1;

    // Check status from userSkills or scoresJson
    const userStatus = userSkills.find(us => us.skillId === skill.id);
    const status = userStatus?.status || scoresJson[skill.name]?.status || "red";

    // Include yellow skills from any level
    const isYellow = status === "yellow";

    if ((isCurrentOrBelow || isYellow) && !seen.has(skill.id)) {
      relevantSkills.push({ skill, status, levelSortOrder: sortOrder });
      seen.add(skill.id);
    }
  }

  // Group by level
  const grouped: Record<number, SkillWithScore[]> = {};
  for (const item of relevantSkills) {
    if (!grouped[item.levelSortOrder]) grouped[item.levelSortOrder] = [];
    grouped[item.levelSortOrder].push(item);
  }

  // Initialize slider values with defaults based on status
  const [values, setValues] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    for (const item of relevantSkills) {
      init[item.skill.id] = getDefaultValue(item.status);
    }
    return init;
  });

  const handleSliderChange = (skillId: number, val: number[]) => {
    setValues(prev => ({ ...prev, [skillId]: val[0] }));
  };

  const sortedLevels = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="font-heading text-2xl font-bold mb-2">Fine-tune your results</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Slide each skill to match how often you actually use it. This helps us calibrate your level and first Power Up.
        </p>
      </div>

      {sortedLevels.map(levelOrder => {
        const levelSkills = grouped[levelOrder];
        const color = LEVEL_HEX[levelOrder] || "#888";
        const levelName = LEVEL_NAMES[levelOrder] || `Level ${levelOrder + 1}`;

        return (
          <div key={levelOrder} className="space-y-4">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-white font-heading font-bold text-xs"
                style={{ backgroundColor: color }}
              >
                {levelOrder + 1}
              </div>
              <h3 className="font-heading font-semibold text-sm" style={{ color }}>
                {levelName}
              </h3>
            </div>

            <div className="space-y-5 pl-1">
              {levelSkills.map(({ skill }) => {
                const val = values[skill.id] ?? 0;
                return (
                  <div key={skill.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{skill.name}</p>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                        {val}/10
                      </span>
                    </div>
                    <div className="px-1">
                      <Slider
                        value={[val]}
                        min={0}
                        max={10}
                        step={1}
                        onValueChange={(v) => handleSliderChange(skill.id, v)}
                        className="touch-none"
                        data-testid={`slider-skill-${skill.id}`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground italic pl-1">
                      {SLIDER_LABELS[val] || ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <Button
        className="w-full rounded-2xl py-6 text-base font-semibold"
        onClick={() => onConfirm(values)}
        data-testid="button-confirm-sliders"
      >
        Looks right <ArrowRight className="w-5 h-5 ml-2" />
      </Button>
    </div>
  );
}
