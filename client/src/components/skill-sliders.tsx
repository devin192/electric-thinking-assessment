import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import type { Skill, Level, UserSkillStatus } from "@shared/schema";

const SLIDER_LABELS: Record<number, string> = {
  1: "Just getting started",
  2: "Experimenting",
  3: "Using it sometimes",
  4: "Regular part of my work",
  5: "Second nature",
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
  onValuesChange?: (values: Record<number, number>) => void;
}

function getDefaultValue(status: string): number {
  switch (status) {
    case "green": return 4;
    case "yellow": return 3;
    case "red": return 1;
    default: return 1;
  }
}

export function SkillSliders({
  skills,
  levels,
  userSkills,
  assessmentLevel,
  scoresJson,
  onValuesChange,
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
  const initialValues: Record<number, number> = {};
  for (const item of relevantSkills) {
    initialValues[item.skill.id] = getDefaultValue(item.status);
  }
  const [values, setValues] = useState<Record<number, number>>(initialValues);

  const handleSliderChange = (skillId: number, val: number[]) => {
    const newValues = { ...values, [skillId]: val[0] };
    setValues(newValues);
    onValuesChange?.(newValues);
  };

  // Expose initial values on mount
  useEffect(() => {
    onValuesChange?.(initialValues);
  }, []);

  const sortedLevels = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  const LEVEL_NAMES: Record<number, string> = {
    0: "Explorer", 1: "Accelerator", 2: "Thought Partner", 3: "Specialized", 4: "Agentic",
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="font-heading text-lg font-semibold mb-1">Quick gut-check</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Do these feel right? Adjust anything that's off, or skip if they look good.
        </p>
      </div>

      {sortedLevels.map(levelOrder => {
        const levelSkills = grouped[levelOrder];
        const levelName = LEVEL_NAMES[levelOrder] || `Level ${levelOrder + 1}`;

        return (
          <div key={levelOrder} className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center bg-muted text-muted-foreground font-heading font-bold text-xs">
                {levelOrder + 1}
              </div>
              <h4 className="font-heading font-semibold text-sm text-muted-foreground">
                {levelName}
              </h4>
            </div>

            <div className="space-y-5 pl-1">
              {levelSkills.map(({ skill }) => {
                const val = values[skill.id] ?? 1;
                return (
                  <div key={skill.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{skill.name}</p>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
                        {val}/5
                      </span>
                    </div>
                    <div className="px-1">
                      <Slider
                        value={[val]}
                        min={1}
                        max={5}
                        step={1}
                        onValueChange={(v) => handleSliderChange(skill.id, v)}
                        className="touch-pan-y"
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
    </div>
  );
}
