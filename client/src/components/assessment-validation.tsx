import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ArrowRight, AlertTriangle } from "lucide-react";
import type { Level, Skill } from "@shared/schema";

const LEVEL_HEX: Record<number, string> = {
  0: "#2DD6FF", 1: "#FFD236", 2: "#FF2F86", 3: "#FF6A2B", 4: "#1C4BFF",
};

interface AssessmentValidationProps {
  assessmentLevel: number;
  levelInfo: Level | undefined;
  brightSpots: string[];
  firstMove: { skillName?: string; suggestion?: string };
  foundationalGaps?: string[];
  onConfirm: () => void;
  onAdjust: () => void;
  confirming?: boolean;
}

export function AssessmentValidation({
  assessmentLevel,
  levelInfo,
  brightSpots,
  firstMove,
  foundationalGaps,
  onConfirm,
  onAdjust,
  confirming,
}: AssessmentValidationProps) {
  const levelColor = LEVEL_HEX[assessmentLevel] || "#888";
  const levelName = levelInfo?.displayName || `Level ${assessmentLevel + 1}`;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center">
        <motion.h2
          className="font-heading text-2xl font-bold mb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          Here's my read on you
        </motion.h2>
      </div>

      {/* Level assignment */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 150, damping: 20 }}
      >
        <Card className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: `${levelColor}40` }}>
          <div className="h-1.5" style={{ backgroundColor: levelColor }} />
          <CardContent className="pt-6 pb-6 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{
                backgroundColor: levelColor,
                boxShadow: `0 0 30px ${levelColor}30`,
              }}
            >
              <span className="text-white font-heading text-3xl font-bold">{assessmentLevel + 1}</span>
            </div>
            <p className="font-heading text-xl font-bold" style={{ color: levelColor }}>
              {levelName}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Bright spots */}
      {brightSpots.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card className="rounded-2xl border border-border">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
                What you're already doing well
              </p>
              <ul className="space-y-2">
                {brightSpots.slice(0, 3).map((spot, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{spot}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* First move / next Power Up */}
      {firstMove.skillName && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="rounded-2xl border border-border">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: levelColor }}>
                Your first Power Up
              </p>
              <p className="text-sm font-medium mb-1">{firstMove.skillName}</p>
              {firstMove.suggestion && (
                <p className="text-sm text-muted-foreground">{firstMove.suggestion}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Foundational gaps warning (Level 3+) */}
      {foundationalGaps && foundationalGaps.length > 0 && assessmentLevel >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <Card className="rounded-2xl border border-et-gold/30 bg-et-gold/5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-et-orange mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm">
                    You're advanced, but we spotted a couple fundamentals worth shoring up:{" "}
                    <span className="font-medium">{foundationalGaps.join(", ")}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Action buttons */}
      <motion.div
        className="space-y-3 pt-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <Button
          className="w-full rounded-2xl py-6 text-base font-semibold"
          style={{ backgroundColor: levelColor }}
          onClick={onConfirm}
          disabled={confirming}
          data-testid="button-that-sounds-right"
        >
          {confirming ? "Confirming..." : "That sounds right"}
          {!confirming && <ArrowRight className="w-5 h-5 ml-2" />}
        </Button>
        <button
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          onClick={onAdjust}
          data-testid="link-let-me-adjust"
        >
          Let me adjust
        </button>
      </motion.div>
    </motion.div>
  );
}
