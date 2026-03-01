import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Assessment, Level, Skill, Nudge, UserSkillStatus } from "@shared/schema";
import {
  ArrowRight, Star, CheckCircle2, Sparkles, Zap,
  Link as LinkIcon, Users, ChevronRight, Loader2, Target, Flame,
  Award, MapPin, Crown, Rocket, BarChart3
} from "lucide-react";
import { SiLinkedin, SiSlack } from "react-icons/si";

const LEVEL_COLORS: Record<number, string> = {
  0: "#2DD6FF", 1: "#FFD236", 2: "#FF2F86", 3: "#FF6A2B", 4: "#1C4BFF",
};
const LEVEL_GLOW: Record<number, string> = {
  0: "0 0 60px rgba(45,214,255,0.4), 0 0 120px rgba(45,214,255,0.15)",
  1: "0 0 60px rgba(255,210,54,0.4), 0 0 120px rgba(255,210,54,0.15)",
  2: "0 0 60px rgba(255,47,134,0.4), 0 0 120px rgba(255,47,134,0.15)",
  3: "0 0 60px rgba(255,106,43,0.4), 0 0 120px rgba(255,106,43,0.15)",
  4: "0 0 60px rgba(28,75,255,0.4), 0 0 120px rgba(28,75,255,0.15)",
};
const LEVEL_GRADIENT: Record<number, string> = {
  0: "from-[#2DD6FF]/20 via-[#2DD6FF]/5 to-transparent",
  1: "from-[#FFD236]/20 via-[#FFD236]/5 to-transparent",
  2: "from-[#FF2F86]/20 via-[#FF2F86]/5 to-transparent",
  3: "from-[#FF6A2B]/20 via-[#FF6A2B]/5 to-transparent",
  4: "from-[#1C4BFF]/20 via-[#1C4BFF]/5 to-transparent",
};

type Phase = "loading" | "building" | "countup" | "level" | "signature" | "brightspots" | "futureself" | "firstmove" | "team" | "journey" | "share";

function CountUp({ target, duration = 2, className = "" }: { target: number; duration?: number; className?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(count, target, { duration, ease: "easeOut" });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [target, duration]);

  return <span className={className}>{display}</span>;
}

function FloatingParticle({ color, delay, size = 4 }: { color: string; delay: number; size?: number }) {
  const x = Math.random() * 100;
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        left: `${x}%`,
        bottom: -10,
      }}
      initial={{ opacity: 0, y: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [0, -200 - Math.random() * 300],
        x: [0, (Math.random() - 0.5) * 100],
      }}
      transition={{
        duration: 3 + Math.random() * 2,
        delay,
        ease: "easeOut",
      }}
    />
  );
}

function ParticleField({ color, count = 20 }: { color: string; count?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <FloatingParticle key={i} color={color} delay={i * 0.15} size={3 + Math.random() * 5} />
      ))}
    </div>
  );
}

function PulseRing({ color, delay = 0 }: { color: string; delay?: number }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full border-2"
      style={{ borderColor: color }}
      initial={{ scale: 1, opacity: 0.6 }}
      animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
      transition={{ duration: 2, delay, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

/** Rotating ring behind the loading orb, adds organic "gears turning" feel */
function RotatingRing({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute inset-[-12px] rounded-full pointer-events-none"
      style={{
        border: `2px dashed ${color}40`,
      }}
      animate={{ rotate: 360 }}
      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
    />
  );
}

/** One-shot impact flash for the level reveal moment */
function ImpactFlash({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full pointer-events-none"
      style={{ backgroundColor: color }}
      initial={{ scale: 0.8, opacity: 0.6 }}
      animate={{ scale: 3, opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    />
  );
}

export default function ResultsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [skillsRevealed, setSkillsRevealed] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [generatingNext, setGeneratingNext] = useState(false);
  const [journeyFrequency, setJourneyFrequency] = useState("weekly");
  const [journeyDay, setJourneyDay] = useState("Monday");
  const [journeySaving, setJourneySaving] = useState(false);
  const [expandedChallenge, setExpandedChallenge] = useState(false);
  const [levelRevealed, setLevelRevealed] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const { data: assessment, isLoading: assessmentLoading } = useQuery<Assessment | null>({
    queryKey: ["/api/assessment/latest"],
    enabled: !!user,
  });
  const { data: levels } = useQuery<Level[]>({ queryKey: ["/api/levels"] });
  const { data: allSkills } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const { data: userSkills } = useQuery<UserSkillStatus[]>({
    queryKey: ["/api/user/skills"],
    enabled: !!user,
  });
  const { data: nudges, refetch: refetchNudges } = useQuery<Nudge[]>({
    queryKey: ["/api/user/nudges"],
    enabled: !!user,
  });
  const { data: teamSnapshot } = useQuery<{
    teamName: string | null;
    memberCount: number;
    completedCount: number;
    averageLevel: number;
    levelDistribution: Record<number, number>;
    recentCompletions: Array<{ name: string; level: number; completedAt: string }>;
    userRank: number;
  }>({
    queryKey: ["/api/team/snapshot"],
    enabled: !!user,
  });

  const firstChallenge = nudges?.find((n: any) => n.isFirstChallenge);
  const latestChallenge = nudges?.[0];
  const currentChallenge = firstChallenge || latestChallenge;

  const assessmentLevel = assessment?.assessmentLevel ?? 0;
  const scores = (assessment?.scoresJson || {}) as Record<string, { status: string; explanation: string }>;
  const firstMove = (assessment?.firstMoveJson || {}) as { skillName: string; suggestion: string };
  const signatureSkillId = (assessment as any)?.signatureSkillId;
  const signatureSkillRationale = (assessment as any)?.signatureSkillRationale || "";
  const brightSpotsText = (assessment as any)?.brightSpotsText || "";
  const futureSelfText = (assessment as any)?.futureSelfText || "";
  const currentLevelInfo = levels?.find(l => l.sortOrder === assessmentLevel);
  const totalSkills = allSkills?.length || 25;
  const totalMastered = allSkills?.filter(s => scores[s.name]?.status === "green").length || 0;
  const signatureSkill = allSkills?.find(s => s.id === signatureSkillId);
  const levelColor = LEVEL_COLORS[assessmentLevel] || LEVEL_COLORS[0];

  const skillsByLevel: Record<number, Skill[]> = {};
  if (allSkills && levels) {
    allSkills.forEach(s => {
      const level = levels.find(l => l.id === s.levelId);
      if (level) {
        if (!skillsByLevel[level.sortOrder]) skillsByLevel[level.sortOrder] = [];
        skillsByLevel[level.sortOrder].push(s);
      }
    });
  }

  const scheduleTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const runRevealSequence = useCallback(() => {
    if (!assessment || !allSkills || !levels) return;

    scheduleTimeout(() => setPhase("building"), 3000);

    const skillCount = allSkills.length;
    const buildDuration = 12000;
    const perSkillDelay = buildDuration / skillCount;

    for (let i = 0; i < skillCount; i++) {
      scheduleTimeout(() => {
        setSkillsRevealed(i + 1);
        const revealed = allSkills.slice(0, i + 1);
        const green = revealed.filter(s => scores[s.name]?.status === "green").length;
        setMasteredCount(green);
      }, 3000 + (i * perSkillDelay));
    }

    scheduleTimeout(() => setPhase("countup"), 3000 + buildDuration + 500);
    scheduleTimeout(() => {
      setPhase("level");
      // Trigger the impact flash after a short delay
      scheduleTimeout(() => setLevelRevealed(true), 200);
    }, 3000 + buildDuration + 3500);
    scheduleTimeout(() => setPhase("signature"), 3000 + buildDuration + 6500);
    scheduleTimeout(() => setPhase("brightspots"), 3000 + buildDuration + 9000);
    scheduleTimeout(() => setPhase("futureself"), 3000 + buildDuration + 11500);
    scheduleTimeout(() => setPhase("firstmove"), 3000 + buildDuration + 14000);
    scheduleTimeout(() => setPhase("team"), 3000 + buildDuration + 16000);
    scheduleTimeout(() => setPhase("journey"), 3000 + buildDuration + 18000);
    scheduleTimeout(() => setPhase("share"), 3000 + buildDuration + 20000);
  }, [assessment, allSkills, levels, scores, scheduleTimeout]);

  useEffect(() => {
    if (assessment && allSkills && levels && phase === "loading") {
      runRevealSequence();
    }
    return () => clearAllTimeouts();
  }, [assessment, allSkills, levels]);

  const skipToEnd = () => {
    clearAllTimeouts();
    setPhase("share");
    setSkillsRevealed(totalSkills);
    setMasteredCount(totalMastered);
    setLevelRevealed(true);
  };

  const handleGenerateNext = async () => {
    setGeneratingNext(true);
    try {
      await apiRequest("POST", "/api/user/challenge/generate-next");
      await refetchNudges();
      toast({ title: "New challenge generated!" });
    } catch (e: any) {
      toast({ title: "Couldn't generate", description: e.message, variant: "destructive" });
    }
    setGeneratingNext(false);
  };

  const handleJourneySave = async () => {
    setJourneySaving(true);
    try {
      await apiRequest("POST", "/api/user/journey-setup", {
        challengeFrequency: journeyFrequency,
        nudgeDay: journeyDay,
      });
      toast({ title: "Journey preferences saved!" });
      setTimeout(() => setPhase("share"), 800);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setJourneySaving(false);
  };

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/results` : "";
  const shareText = `I just completed my AI Fluency assessment on Electric Thinking! I'm a Level ${assessmentLevel} ${currentLevelInfo?.displayName || ""}. ${totalMastered} of ${totalSkills} skills mastered.`;

  const handleShareLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(shareText)}`, "_blank");
  };
  const handleShareSlack = () => {
    window.open(`https://slack.com/share?text=${encodeURIComponent(shareText + "\n" + shareUrl)}`, "_blank");
  };
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied!" });
  };

  if (!user) return null;

  if (assessmentLoading || !levels || !allSkills) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Wordmark className="text-xl mb-4 block" />
          <div className="space-y-3 max-w-sm mx-auto">
            <div className="h-8 bg-muted rounded-lg animate-pulse" />
            <div className="h-4 bg-muted rounded-lg animate-pulse w-3/4 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md rounded-2xl border border-border text-center">
          <CardContent className="pt-8 pb-8">
            <div className="w-14 h-14 rounded-2xl bg-et-pink/15 flex items-center justify-center mx-auto mb-6">
              <BarChart3 className="w-7 h-7 text-et-pink" />
            </div>
            <h1 className="font-heading text-2xl font-bold mb-3">You haven't taken your assessment yet</h1>
            <p className="text-muted-foreground mb-6">Ready to find out your AI fluency level? It takes about 10 minutes.</p>
            <Button className="rounded-2xl px-8 py-5" onClick={() => navigate("/assessment/warmup")} data-testid="button-start-assessment">
              Start Assessment <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const phaseOrder: Phase[] = ["loading", "building", "countup", "level", "signature", "brightspots", "futureself", "firstmove", "team", "journey", "share"];
  const phaseIndex = phaseOrder.indexOf(phase);
  const isPast = (p: Phase) => phaseIndex >= phaseOrder.indexOf(p);

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <ParticleField color={levelColor} count={15} />
        <motion.div
          className="text-center max-w-md relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <Wordmark className="text-xl mb-12 block" />
          <div className="relative w-32 h-32 mx-auto mb-10">
            {/* Rotating dashed ring behind the orb */}
            <RotatingRing color={levelColor} />
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: `${levelColor}10` }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-4 rounded-full"
              style={{ backgroundColor: `${levelColor}20` }}
              animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
            />
            <motion.div
              className="absolute inset-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${levelColor}30` }}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
            >
              <Sparkles className="w-10 h-10" style={{ color: levelColor }} />
            </motion.div>
            <PulseRing color={levelColor} delay={0} />
            <PulseRing color={levelColor} delay={0.7} />
          </div>

          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            <p className="font-heading text-2xl font-bold mb-1">Analyzing your conversation</p>
            <p className="text-muted-foreground">Building your skill profile...</p>
          </motion.div>

          <div className="flex justify-center gap-1.5 mt-6">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: levelColor }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-50 bg-background/80 backdrop-blur-md">
        <Wordmark className="text-lg" />
        <div className="flex items-center gap-2">
          {phase !== "share" && (
            <Button variant="ghost" size="sm" onClick={skipToEnd} data-testid="button-skip" className="text-xs">
              Skip Animation
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} data-testid="button-dashboard" className="text-xs">
            Dashboard <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* -- SKILL MAP BUILD -- */}
        <AnimatePresence>
          {isPast("building") && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-center mb-8">
                <motion.p
                  className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-2"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  Mapping Your Skills
                </motion.p>
                <div className="flex items-center justify-center gap-3">
                  <motion.span
                    className="font-heading text-5xl font-bold tabular-nums"
                    style={{ color: levelColor }}
                    data-testid="text-mastered-count"
                  >
                    {masteredCount}
                  </motion.span>
                  <span className="text-lg text-muted-foreground">/ {totalSkills} mastered</span>
                </div>
              </div>

              <div className="space-y-3">
                {levels.map((level, levelIdx) => {
                  const levelSkills = skillsByLevel[level.sortOrder] || [];
                  const revealedInLevel = levelSkills.filter((_, i) => {
                    const globalIndex = allSkills.indexOf(levelSkills[i]);
                    return globalIndex < skillsRevealed;
                  });

                  if (revealedInLevel.length === 0 && phase !== "share") return null;

                  const isLocked = level.sortOrder > assessmentLevel + 1;
                  const displaySkills = phase === "share" ? levelSkills : revealedInLevel;
                  const greenCount = displaySkills.filter(s => scores[s.name]?.status === "green").length;
                  const progress = levelSkills.length > 0 ? (greenCount / levelSkills.length) * 100 : 0;
                  const isCurrentLevel = level.sortOrder === assessmentLevel;

                  return (
                    <motion.div
                      key={level.id}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: isLocked ? 0.3 : 1, x: 0 }}
                      transition={{ duration: 0.5, delay: levelIdx * 0.1 }}
                      data-testid={`card-level-${level.sortOrder}`}
                      className="relative"
                    >
                      {isCurrentLevel && (
                        <motion.div
                          className="absolute -left-3 top-1/2 -translate-y-1/2 flex items-center"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 }}
                        >
                          <MapPin className="w-5 h-5" style={{ color: LEVEL_COLORS[level.sortOrder] }} />
                        </motion.div>
                      )}

                      <Card className={`rounded-2xl border overflow-hidden transition-all ${isCurrentLevel ? "border-2" : "border-border"}`}
                        style={isCurrentLevel ? { borderColor: LEVEL_COLORS[level.sortOrder] + "40" } : undefined}
                      >
                        <CardContent className="py-4 px-5">
                          <div className="flex items-center justify-between gap-3 mb-2.5">
                            <div className="flex items-center gap-3">
                              <motion.div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-heading font-bold text-sm relative"
                                style={{ backgroundColor: LEVEL_COLORS[level.sortOrder] }}
                                whileHover={{ scale: 1.1 }}
                              >
                                {level.sortOrder}
                                {isCurrentLevel && (
                                  <motion.div
                                    className="absolute inset-0 rounded-xl"
                                    style={{ boxShadow: `0 0 20px ${LEVEL_COLORS[level.sortOrder]}50` }}
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                  />
                                )}
                              </motion.div>
                              <div>
                                <h3 className="font-heading font-semibold text-sm">{level.displayName}</h3>
                                {isCurrentLevel && (
                                  <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: LEVEL_COLORS[level.sortOrder] }}>
                                    You are here
                                  </span>
                                )}
                              </div>
                            </div>
                            {!isLocked && (
                              <span className="text-xs font-mono font-medium text-muted-foreground">{greenCount}/{levelSkills.length}</span>
                            )}
                          </div>

                          {!isLocked && (
                            <>
                              <div className="w-full h-1.5 bg-muted/50 rounded-full mb-3 overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: LEVEL_COLORS[level.sortOrder] }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progress}%` }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                />
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {displaySkills.map((skill, i) => {
                                  const status = scores[skill.name]?.status || "red";
                                  const isGreen = status === "green";
                                  const isYellow = status === "yellow";

                                  return (
                                    <motion.div
                                      key={skill.id}
                                      initial={{ opacity: 0, scale: 0.5 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={{
                                        duration: 0.4,
                                        delay: phase === "share" ? 0 : i * 0.12,
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 20,
                                      }}
                                      whileHover={{ scale: 1.05, y: -1 }}
                                      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium cursor-default transition-shadow
                                        ${isGreen ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm" :
                                          isYellow ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" :
                                          "bg-muted/30 text-muted-foreground border border-border/50"}`}
                                      data-testid={`skill-node-${skill.id}`}
                                    >
                                      {isGreen && (
                                        <motion.div
                                          initial={{ scale: 0 }}
                                          animate={{ scale: 1 }}
                                          transition={{ type: "spring", delay: 0.2 }}
                                        >
                                          <CheckCircle2 className="w-3 h-3" />
                                        </motion.div>
                                      )}
                                      {isYellow && <Target className="w-3 h-3" />}
                                      {skill.name}
                                      {/* Glow burst on green skills during reveal */}
                                      {isGreen && phase !== "share" && (
                                        <motion.div
                                          className="absolute inset-0 rounded-xl"
                                          style={{ backgroundColor: "#38A169" }}
                                          initial={{ opacity: 0.5, scale: 1 }}
                                          animate={{ opacity: 0, scale: 1.3 }}
                                          transition={{ duration: 0.6, ease: "easeOut" }}
                                        />
                                      )}
                                      {isGreen && (
                                        <motion.div
                                          className="absolute inset-0 rounded-xl border border-emerald-400/30"
                                          animate={{ opacity: [0, 0.5, 0] }}
                                          transition={{ duration: 2, repeat: Infinity }}
                                        />
                                      )}
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- COUNT-UP MOMENT -- */}
        <AnimatePresence>
          {isPast("countup") && !isPast("level") && (
            <motion.section
              className="text-center py-8 relative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              <ParticleField color={levelColor} count={12} />
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-4">Skills Mastered</p>
                <div className="font-heading text-7xl md:text-8xl font-bold" style={{ color: levelColor }} data-testid="text-countup-total">
                  <CountUp target={totalMastered} duration={2} />
                  <span className="text-3xl text-muted-foreground font-normal ml-2">/ {totalSkills}</span>
                </div>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- LEVEL REVEAL -- */}
        <AnimatePresence>
          {isPast("level") && (
            <motion.section
              className="relative py-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              data-testid="section-level-reveal"
            >
              <div className={`absolute inset-0 bg-gradient-to-b ${LEVEL_GRADIENT[assessmentLevel]} rounded-3xl -mx-2`} />
              <ParticleField color={levelColor} count={25} />

              <div className="relative text-center">
                <motion.div
                  className="relative w-36 h-36 mx-auto mb-8"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 150, damping: 15, delay: 0.2 }}
                >
                  {/* Impact flash on first appearance */}
                  {levelRevealed && <ImpactFlash color={levelColor} />}

                  <div
                    className="absolute inset-0 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: levelColor,
                      boxShadow: LEVEL_GLOW[assessmentLevel],
                    }}
                  >
                    <span className="text-white font-heading text-6xl font-bold">{assessmentLevel}</span>
                  </div>
                  <PulseRing color={levelColor} delay={0} />
                  <PulseRing color={levelColor} delay={1} />

                  <motion.div
                    className="absolute -top-2 -right-2"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8, type: "spring" }}
                  >
                    <div className="w-10 h-10 rounded-full bg-card border-2 border-border flex items-center justify-center shadow-lg">
                      <Crown className="w-5 h-5" style={{ color: levelColor }} />
                    </div>
                  </motion.div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.6 }}
                >
                  <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground mb-3">Your AI Fluency Level</p>
                  <h1 className="font-heading text-4xl md:text-5xl font-bold mb-2" data-testid="text-level-title">
                    Level {assessmentLevel}{" "}
                    <span style={{ color: levelColor }}>{currentLevelInfo?.displayName}</span>
                  </h1>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto mt-3">
                    {currentLevelInfo?.description || `You've demonstrated strong AI fluency at this level.`}
                  </p>
                </motion.div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- SIGNATURE SKILL BADGE -- */}
        <AnimatePresence>
          {isPast("signature") && signatureSkill && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              data-testid="section-signature-skill"
            >
              <Card className="rounded-2xl border-2 overflow-hidden relative" style={{ borderColor: `${levelColor}30` }}>
                <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: levelColor }} />
                <CardContent className="pt-8 pb-6">
                  <div className="flex flex-col items-center text-center">
                    <motion.div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 relative"
                      style={{ backgroundColor: `${levelColor}15` }}
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
                    >
                      <Star className="w-10 h-10" style={{ color: levelColor }} />
                      <motion.div
                        className="absolute inset-0 rounded-2xl"
                        style={{ boxShadow: `0 0 30px ${levelColor}30` }}
                        animate={{ opacity: [0.3, 0.8, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity }}
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: levelColor }}>
                        Signature Skill
                      </p>
                      <h3 className="font-heading text-2xl font-bold mb-3">{signatureSkill.name}</h3>
                      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-4"
                        style={{ backgroundColor: `${levelColor}10`, color: levelColor }}>
                        <Award className="w-3.5 h-3.5" />
                        Rare Strength
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                        {signatureSkillRationale || "You showed real depth here -- it's rare and worth building on."}
                      </p>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- BRIGHT SPOTS NARRATIVE -- */}
        <AnimatePresence>
          {isPast("brightspots") && brightSpotsText && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              data-testid="section-bright-spots"
            >
              <Card className="rounded-2xl border border-emerald-500/20 overflow-hidden">
                <div className="bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex items-start gap-4">
                      <motion.div
                        className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", delay: 0.2 }}
                      >
                        <Sparkles className="w-6 h-6 text-emerald-500" />
                      </motion.div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.15em] mb-2">
                          Bright Spots
                        </p>
                        <motion.p
                          className="text-sm text-foreground leading-relaxed"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3, duration: 0.8 }}
                        >
                          {brightSpotsText}
                        </motion.p>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- FUTURE SELF PARAGRAPH -- */}
        <AnimatePresence>
          {isPast("futureself") && futureSelfText && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              data-testid="section-future-self"
            >
              <Card className="rounded-2xl border border-et-blue/20 overflow-hidden">
                <div className="bg-gradient-to-br from-[#1C4BFF]/5 via-transparent to-transparent">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex items-start gap-4">
                      <motion.div
                        className="w-12 h-12 rounded-xl bg-et-blue/15 flex items-center justify-center shrink-0"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", delay: 0.2 }}
                      >
                        <Rocket className="w-6 h-6 text-et-blue" />
                      </motion.div>
                      <div>
                        <p className="text-xs font-semibold text-et-blue uppercase tracking-[0.15em] mb-2">
                          Your Future Self
                        </p>
                        <motion.p
                          className="text-sm text-foreground leading-relaxed"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3, duration: 0.8 }}
                        >
                          {futureSelfText}
                        </motion.p>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- FIRST CHALLENGE CTA -- */}
        <AnimatePresence>
          {isPast("firstmove") && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              data-testid="section-first-move"
            >
              {currentChallenge ? (
                <ChallengeCard
                  challenge={currentChallenge}
                  skills={allSkills}
                  isFirst={!!(currentChallenge as any)?.isFirstChallenge}
                  onKeepGoing={handleGenerateNext}
                  generating={generatingNext}
                  expanded={expandedChallenge}
                  onToggle={() => setExpandedChallenge(!expandedChallenge)}
                  levelColor={levelColor}
                />
              ) : firstMove.skillName ? (
                <Card className="rounded-2xl border-2 border-amber-500/20 overflow-hidden">
                  <div className="bg-gradient-to-br from-amber-500/5 via-transparent to-transparent">
                    <CardContent className="pt-6 pb-6">
                      <div className="flex items-start gap-4">
                        <motion.div
                          className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", delay: 0.2 }}
                        >
                          <Zap className="w-6 h-6 text-amber-500" />
                        </motion.div>
                        <div>
                          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-[0.15em] mb-1">Your First Challenge</p>
                          <h3 className="font-heading text-lg font-bold mb-2">{firstMove.skillName}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">{firstMove.suggestion}</p>
                          <p className="text-xs text-muted-foreground mt-3 italic">Your first skill challenge is being generated...</p>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ) : null}
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- TEAM SNAPSHOT -- */}
        <AnimatePresence>
          {isPast("team") && teamSnapshot && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              data-testid="section-team"
            >
              <Card className="rounded-2xl border border-border overflow-hidden">
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold text-sm">{teamSnapshot.teamName || "Your Team"}</h3>
                      <p className="text-xs text-muted-foreground">{teamSnapshot.memberCount} member{teamSnapshot.memberCount !== 1 ? "s" : ""}</p>
                    </div>
                  </div>

                  {teamSnapshot.completedCount === 0 && !teamSnapshot.teamName ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-3">Just you so far. This gets even better with your team.</p>
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate("/dashboard")} data-testid="button-invite-team">
                        Invite Your Team <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  ) : teamSnapshot.completedCount <= 1 ? (
                    <div className="text-center py-4">
                      <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                        <Flame className="w-6 h-6 text-amber-500" />
                      </div>
                      <p className="text-sm font-medium mb-1">You're the first to finish!</p>
                      <p className="text-xs text-muted-foreground mb-3">Share the link to get your teammates started.</p>
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/join`);
                        toast({ title: "Invite link copied!" });
                      }} data-testid="button-share-invite">
                        <LinkIcon className="w-3.5 h-3.5 mr-1.5" /> Copy Invite Link
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm leading-relaxed">
                        You're <span className="font-bold">#{teamSnapshot.userRank}</span> on {teamSnapshot.teamName}.
                        Team average: Level <span className="font-bold">{teamSnapshot.averageLevel}</span>.
                        You: Level <span className="font-bold" style={{ color: levelColor }}>{assessmentLevel}</span>.
                      </p>

                      <div className="flex items-end gap-2 h-16">
                        {[0, 1, 2, 3, 4].map(lvl => {
                          const count = teamSnapshot.levelDistribution[lvl] || 0;
                          const maxCount = Math.max(...Object.values(teamSnapshot.levelDistribution), 1);
                          const height = Math.max(8, (count / maxCount) * 100);
                          return (
                            <motion.div
                              key={lvl}
                              className="flex-1 flex flex-col items-center gap-1"
                              initial={{ scaleY: 0 }}
                              animate={{ scaleY: 1 }}
                              transition={{ delay: lvl * 0.1 }}
                              style={{ transformOrigin: "bottom" }}
                            >
                              <span className="text-[10px] font-mono text-muted-foreground">{count}</span>
                              <div
                                className="w-full rounded-sm transition-all"
                                style={{
                                  height: `${height}%`,
                                  backgroundColor: LEVEL_COLORS[lvl],
                                  opacity: lvl === assessmentLevel ? 1 : 0.5,
                                }}
                              />
                              <span className="text-[10px] text-muted-foreground">L{lvl}</span>
                            </motion.div>
                          );
                        })}
                      </div>

                      {teamSnapshot.recentCompletions?.length > 0 && (
                        <div className="pt-2 border-t border-border/50">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Recent completions</p>
                          <div className="space-y-1.5">
                            {teamSnapshot.recentCompletions.slice(0, 3).map((c, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-foreground">{c.name}</span>
                                <span className="font-mono" style={{ color: LEVEL_COLORS[c.level] }}>Level {c.level}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- JOURNEY / COMMITMENT LEVEL -- */}
        <AnimatePresence>
          {isPast("journey") && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              data-testid="section-journey"
            >
              <Card className="rounded-2xl border border-border overflow-hidden">
                <div className="bg-gradient-to-br from-background via-accent/10 to-transparent">
                  <CardContent className="pt-6 pb-6">
                    <div className="text-center mb-6">
                      <h3 className="font-heading text-xl font-bold mb-1">How fast do you want to level up?</h3>
                      <p className="text-sm text-muted-foreground">Set your challenge pace</p>
                    </div>

                    <div className="space-y-2 mb-5">
                      {[
                        { value: "weekly", label: "Once a week", sublabel: "Steady learner", icon: "🚶", speed: 1 },
                        { value: "twice_weekly", label: "Twice a week", sublabel: "Building momentum", icon: "🏃", speed: 2 },
                        { value: "every_other_day", label: "Every other day", sublabel: "Fast track", icon: "⚡", speed: 3 },
                        { value: "daily", label: "Daily", sublabel: "All in", icon: "🚀", speed: 4 },
                      ].map(opt => (
                        <motion.button
                          key={opt.value}
                          onClick={() => setJourneyFrequency(opt.value)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all
                            ${journeyFrequency === opt.value
                              ? "border-2 bg-card shadow-sm"
                              : "border-border hover:border-muted-foreground/20"}`}
                          style={journeyFrequency === opt.value ? { borderColor: levelColor } : undefined}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          data-testid={`button-freq-${opt.value}`}
                        >
                          <span className="text-2xl">{opt.icon}</span>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.sublabel}</p>
                          </div>
                          {journeyFrequency === opt.value && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring" }}
                            >
                              <CheckCircle2 className="w-5 h-5" style={{ color: levelColor }} />
                            </motion.div>
                          )}
                          <div className="flex gap-0.5">
                            {Array.from({ length: 4 }).map((_, i) => (
                              <div
                                key={i}
                                className="w-1.5 h-4 rounded-full"
                                style={{
                                  backgroundColor: i < opt.speed ? levelColor : undefined,
                                  opacity: i < opt.speed ? (journeyFrequency === opt.value ? 1 : 0.4) : 0.1,
                                }}
                              />
                            ))}
                          </div>
                        </motion.button>
                      ))}
                    </div>

                    {journeyFrequency === "weekly" && (
                      <motion.div
                        className="mb-5"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                      >
                        <p className="text-sm font-medium mb-2">Best day for a skill challenge?</p>
                        <div className="flex flex-wrap gap-1.5">
                          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(day => (
                            <button
                              key={day}
                              onClick={() => setJourneyDay(day)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                                ${journeyDay === day
                                  ? "text-white"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                              style={journeyDay === day ? { backgroundColor: levelColor } : undefined}
                              data-testid={`button-day-${day.toLowerCase()}`}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    <Button
                      className="w-full rounded-xl h-12 font-heading font-semibold text-sm"
                      onClick={handleJourneySave}
                      disabled={journeySaving}
                      data-testid="button-save-journey"
                    >
                      {journeySaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Flame className="w-4 h-4 mr-2" />}
                      Lock In My Journey
                    </Button>
                  </CardContent>
                </div>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* -- SHAREABLE RESULTS CARD -- */}
        <AnimatePresence>
          {isPast("share") && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              data-testid="section-share"
            >
              <Card className="rounded-2xl border-2 border-border overflow-hidden shadow-lg">
                <div className="relative overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, ${levelColor}15, transparent 60%), linear-gradient(225deg, ${levelColor}10, transparent 40%)`,
                    }}
                  />

                  <div className="relative px-8 pt-8 pb-6 text-center">
                    <Wordmark className="text-sm mb-6 block" />

                    <motion.div
                      className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center relative"
                      style={{
                        backgroundColor: levelColor,
                        boxShadow: `0 0 40px ${levelColor}40`,
                      }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.3 }}
                    >
                      <span className="text-white font-heading text-4xl font-bold">{assessmentLevel}</span>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <p className="font-heading text-2xl font-bold mb-1" data-testid="text-share-level">
                        Level {assessmentLevel}: {currentLevelInfo?.displayName}
                      </p>
                      {signatureSkill && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mt-2"
                          style={{ backgroundColor: `${levelColor}15`, color: levelColor }}>
                          <Star className="w-3 h-3" /> {signatureSkill.name}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground mt-3">
                        <span className="font-bold" style={{ color: levelColor }}>{totalMastered}</span> of {totalSkills} skills mastered
                      </p>
                    </motion.div>

                    <div className="flex items-center justify-center gap-2 mt-3">
                      {[0, 1, 2, 3, 4].map(lvl => (
                        <div
                          key={lvl}
                          className="w-6 h-1.5 rounded-full"
                          style={{
                            backgroundColor: lvl <= assessmentLevel ? LEVEL_COLORS[lvl] : undefined,
                            opacity: lvl <= assessmentLevel ? 1 : 0.15,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-center text-muted-foreground mb-3">Share your results</p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-1.5"
                        onClick={handleShareLinkedIn}
                        data-testid="button-share-linkedin"
                      >
                        <SiLinkedin className="w-4 h-4 text-[#0A66C2]" /> LinkedIn
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-1.5"
                        onClick={handleShareSlack}
                        data-testid="button-share-slack"
                      >
                        <SiSlack className="w-4 h-4 text-[#E01E5A]" /> Slack
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl gap-1.5"
                        onClick={handleCopyLink}
                        data-testid="button-copy-link"
                      >
                        <LinkIcon className="w-3.5 h-3.5" /> Copy Link
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>

              <motion.div
                className="text-center mt-10 mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  size="lg"
                  className="rounded-2xl px-12 h-14 font-heading font-semibold text-base shadow-lg hover:shadow-xl transition-shadow"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-go-to-dashboard"
                >
                  Go to Your Dashboard <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ChallengeCard({
  challenge,
  skills,
  isFirst,
  onKeepGoing,
  generating,
  expanded,
  onToggle,
  levelColor,
}: {
  challenge: Nudge;
  skills: Skill[];
  isFirst: boolean;
  onKeepGoing: () => void;
  generating: boolean;
  expanded: boolean;
  onToggle: () => void;
  levelColor: string;
}) {
  const content = (challenge.contentJson || {}) as any;
  const skill = skills.find(s => s.id === challenge.skillId);

  return (
    <Card className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: `${levelColor}25` }}>
      <div className="bg-gradient-to-br from-amber-500/5 via-transparent to-transparent">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start gap-4">
            <motion.div
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 relative"
              style={{ backgroundColor: `${levelColor}15` }}
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <Zap className="w-7 h-7" style={{ color: levelColor }} />
              <motion.div
                className="absolute inset-0 rounded-xl"
                style={{ boxShadow: `0 0 20px ${levelColor}20` }}
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] mb-1" style={{ color: levelColor }}>
                {isFirst ? "Your First Challenge" : "Skill Challenge"}
              </p>
              {skill && <p className="text-xs text-muted-foreground mb-2">Skill: {skill.name}</p>}

              {content.opener && (
                <p className="text-sm font-medium mb-3 leading-relaxed">{content.opener}</p>
              )}

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    {content.idea && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">The Idea</p>
                        <p className="text-sm leading-relaxed">{content.idea}</p>
                      </div>
                    )}
                    {content.use_case && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Try This</p>
                        <p className="text-sm leading-relaxed">{content.use_case}</p>
                      </div>
                    )}
                    {content.action && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Your Action</p>
                        <p className="text-sm leading-relaxed">{content.action}</p>
                      </div>
                    )}
                    {content.reflection && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Reflect</p>
                        <p className="text-sm italic leading-relaxed">{content.reflection}</p>
                      </div>
                    )}
                    {content.story && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">From the Field</p>
                        <p className="text-sm leading-relaxed">{content.story}</p>
                      </div>
                    )}

                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={onKeepGoing}
                        disabled={generating}
                        data-testid="button-keep-going"
                      >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Flame className="w-4 h-4 mr-1" />}
                        Keep Going, Next Challenge
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!expanded && (
                <Button
                  size="sm"
                  className="mt-2 rounded-xl"
                  style={{ backgroundColor: levelColor }}
                  onClick={onToggle}
                  data-testid="button-start-challenge"
                >
                  {isFirst ? "Ready for your first challenge?" : "Start This Challenge"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
