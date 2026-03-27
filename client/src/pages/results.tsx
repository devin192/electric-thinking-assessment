import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import type { Assessment, Level, Skill, UserSkillStatus } from "@shared/schema";
import {
  ArrowRight, Sparkles, Loader2, Crown, ChevronDown, ChevronUp,
  CheckCircle2, BarChart3, Settings, LogOut, Share2
} from "lucide-react";
import confetti from "canvas-confetti";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const LEVEL_COLORS: Record<number, string> = {
  0: "#FFD236", 1: "#FF2F86", 2: "#FF6A2B", 3: "#1C4BFF",
};

const LEVEL_NAMES: Record<number, string> = {
  0: "Accelerator", 1: "Thought Partner", 2: "Specialized Teammates", 3: "Systems Designer",
};

const LEVEL_SUBTITLES: Record<number, string> = {
  0: "Speed up everyday work",
  1: "Think better with AI",
  2: "Build dedicated AI specialists",
  3: "Design autonomous systems",
};

const LEVEL_IDENTITY: Record<number, string> = {
  0: "You're using AI to move faster on everyday work. That's where it all starts.",
  1: "You're past the basics and using AI as a real thinking partner.",
  2: "You're building dedicated AI tools and workflows that others can use.",
  3: "You're designing AI systems that run without you. Very few people are here yet.",
};

const LEVEL_SHARE_TEXT: Record<number, string> = {
  0: "I'm using AI to move faster on everyday work.",
  1: "I'm past the basics and using AI as a real thinking partner.",
  2: "I'm building dedicated AI tools and workflows.",
  3: "I'm designing AI systems that run without me.",
};

type OutcomeOption = {
  outcomeHeadline: string;
};

type Phase = "loading" | "reveal" | "results";

export default function ResultsPage() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [phase, setPhase] = useState<Phase>("loading");
  useEffect(() => { document.title = "Your Results — Electric Thinking"; }, []);
  const [showSkills, setShowSkills] = useState(false);
  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);

  const { data: assessment, isLoading: assessmentLoading, isError: assessmentError } = useQuery<Assessment | null>({
    queryKey: ["/api/assessment/latest"],
    enabled: !!user,
  });
  const { data: levels, isError: levelsError } = useQuery<Level[]>({ queryKey: ["/api/levels"] });
  const { data: allSkills, isError: skillsError } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const dataError = assessmentError || levelsError || skillsError;
  const { data: userSkills } = useQuery<UserSkillStatus[]>({
    queryKey: ["/api/user/skills"],
    enabled: !!user && phase === "results",
  });

  const assessmentLevel = assessment?.assessmentLevel ?? 0;
  const levelColor = LEVEL_COLORS[assessmentLevel] || LEVEL_COLORS[0];
  const levelName = LEVEL_NAMES[assessmentLevel] || "Accelerator";
  const currentLevelInfo = levels?.find(l => l.sortOrder === assessmentLevel);

  const signatureSkillId = (assessment as any)?.signatureSkillId;
  const signatureSkill = allSkills?.find(s => s.id === signatureSkillId);

  // Parse outcomes from assessment
  let outcomes: OutcomeOption[] = [];
  try {
    const raw = (assessment as any)?.outcomeOptionsJson;
    if (Array.isArray(raw)) outcomes = raw;
  } catch {}

  // Parse bright spots
  let brightSpots: string[] = [];
  try {
    const raw = (assessment as any)?.brightSpotsText;
    if (raw) {
      const parsed = JSON.parse(raw);
      brightSpots = Array.isArray(parsed) ? parsed : [raw];
    }
  } catch {
    const raw = (assessment as any)?.brightSpotsText;
    if (raw) brightSpots = [raw];
  }


  useEffect(() => {
    if (assessment && allSkills && levels && phase === "loading") {
      const animKey = `results-animated-${assessment.id}`;
      const alreadySeen = sessionStorage.getItem(animKey) === "true";
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (alreadySeen || prefersReduced) {
        setPhase("results");
        sessionStorage.setItem(animKey, "true");
      } else {
        setTimeout(() => {
          setPhase("reveal");
          sessionStorage.setItem(animKey, "true");
          setTimeout(() => confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } }), 800);
          setTimeout(() => setPhase("results"), 3000);
        }, 2000);
      }
    }
  }, [assessment, allSkills, levels]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };


  if (!user) return null;

  if (assessmentLoading || !levels || !allSkills) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Wordmark className="text-xl mb-4 block" />
          {dataError ? (
            <>
              <p className="text-muted-foreground text-sm mb-4">Couldn't load your results. Check your connection and try again.</p>
              <Button variant="outline" className="rounded-2xl" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </>
          ) : (
            <Loader2 className="w-8 h-8 animate-spin text-et-pink mx-auto" />
          )}
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
            <h1 className="font-heading text-2xl font-bold mb-3">Ready to find your AI level?</h1>
            <p className="text-muted-foreground mb-6">Take a quick survey and have a conversation to find out.</p>
            <Button className="rounded-2xl px-8 py-5" onClick={() => navigate("/survey")}>
              Start the Assessment <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === LOADING PHASE ===
  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div className="text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Wordmark className="text-xl mb-8 block" />
          <div className="relative w-24 h-24 mx-auto mb-8">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: `${levelColor}20` }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <div className="absolute inset-2 rounded-full flex items-center justify-center" style={{ backgroundColor: `${levelColor}30` }}>
              <Sparkles className="w-8 h-8" style={{ color: levelColor }} />
            </div>
          </div>
          <p className="font-heading text-xl font-bold">Building your results...</p>
        </motion.div>
      </div>
    );
  }

  // Build skill breakdown by level — only show skills through user's level + 1
  const maxVisibleSortOrder = Math.min(assessmentLevel + 1, 3);
  const skillsByLevel = [...levels]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(level => level.sortOrder <= maxVisibleSortOrder)
    .map(level => {
      const levelSkills = (allSkills || []).filter(s => s.levelId === level.id);
      return {
        level,
        skills: levelSkills.map(skill => {
          const userStatus = userSkills?.find(us => us.skillId === skill.id);
          return { ...skill, status: userStatus?.status || "red" };
        }),
      };
    });

  // === REVEAL + RESULTS ===
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-md">
        <Wordmark className="text-lg" />
        <div className="flex items-center gap-2">
          {user.userRole === "system_admin" && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="link-admin">Admin</Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} aria-label="Settings">
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Log out">
            <LogOut className="w-4 h-4" /><span className="ml-1">Sign out</span>
          </Button>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">

        {/* === 1. LEVEL LADDER HERO === */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="space-y-2">
            {[3, 2, 1, 0].map(lvl => {
              const isCurrentLevel = lvl === assessmentLevel;
              const color = LEVEL_COLORS[lvl];
              return (
                <motion.div
                  key={lvl}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                    isCurrentLevel ? "bg-card shadow-md" : "opacity-40"
                  }`}
                  style={isCurrentLevel ? { boxShadow: `0 0 0 2px ${color}` } : {}}
                  initial={isCurrentLevel ? { scale: 0.95 } : {}}
                  animate={isCurrentLevel ? { scale: 1 } : {}}
                  transition={{ type: "spring", stiffness: 150, damping: 15 }}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-heading font-bold text-lg shrink-0 ${lvl === 0 ? "text-foreground" : "text-white"}`}
                    style={{ backgroundColor: color }}
                  >
                    {lvl + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-sm">{LEVEL_NAMES[lvl]}</p>
                    <p className="text-xs text-muted-foreground">{LEVEL_SUBTITLES[lvl]}</p>
                  </div>
                  {isCurrentLevel && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, type: "spring" }}
                    >
                      <Crown className="w-5 h-5" style={{ color }} />
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <motion.div className="text-center mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <h1 className="font-heading text-2xl font-bold">
              You're a Level {assessmentLevel + 1}{" "}
              <span style={{ color: levelColor }}>{currentLevelInfo?.displayName || levelName}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              {LEVEL_IDENTITY[assessmentLevel]}
            </p>
            {signatureSkill && (
              <p className="text-sm text-muted-foreground mt-1">
                Your strongest skill: <span className="font-medium text-foreground">{signatureSkill.name}</span>
              </p>
            )}
          </motion.div>
        </motion.section>

        {/* === BRIGHT SPOTS === */}
        <AnimatePresence>
          {phase === "results" && brightSpots.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
            >
              <p className="text-xs font-semibold text-et-green uppercase tracking-wider mb-2">
                What you're already doing well
              </p>
              <ul className="space-y-1.5">
                {brightSpots.map((spot, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-et-green shrink-0 mt-0.5" />
                    <span>{spot}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </AnimatePresence>


        {/* === 2. WHAT'S POSSIBLE — headline-only vision statements === */}
        <AnimatePresence>
          {phase === "results" && outcomes.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <p className="text-xs font-semibold text-et-pink uppercase tracking-wider mb-3">
                What's possible for you
              </p>
              <div className="space-y-2">
                {outcomes.map((outcome, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <Sparkles className="w-4 h-4 text-et-pink shrink-0 mt-0.5" />
                    <span>{outcome.outcomeHeadline}</span>
                  </div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>


        {/* === 4. COLLAPSED SKILL BREAKDOWN === */}
        <AnimatePresence>
          {phase === "results" && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <button
                onClick={() => setShowSkills(!showSkills)}
                className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                <span>See your detailed skill breakdown</span>
                {showSkills ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <AnimatePresence>
                {showSkills && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 pt-3">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground pb-2 border-b border-border/50">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Strong</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Developing</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Not yet</span>
                      </div>
                      {skillsByLevel.map(({ level, skills }) => (
                        <div key={level.id}>
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center ${level.sortOrder === 0 ? "text-foreground" : "text-white"} text-[10px] font-bold`}
                              style={{ backgroundColor: LEVEL_COLORS[level.sortOrder] }}
                            >
                              {level.sortOrder + 1}
                            </div>
                            <span className="text-xs font-semibold">{level.displayName}</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5 pl-7">
                            {skills.map(skill => (
                              <div key={skill.id} className="flex items-center gap-2 text-sm">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${
                                  skill.status === "green" ? "bg-emerald-500" :
                                  skill.status === "yellow" ? "bg-amber-500" : "bg-red-400"
                                }`} />
                                <span className={skill.status === "green" ? "text-foreground" : "text-muted-foreground"}>
                                  {skill.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}
        </AnimatePresence>

        {/* === 5. CTA SECTION === */}
        <AnimatePresence>
          {phase === "results" && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="space-y-4 pt-4"
            >
              <Button
                className="w-full rounded-2xl py-5"
                onClick={() => {
                  const postText = encodeURIComponent(
                    `I just got my AI fluency assessment results — I'm a Level ${assessmentLevel + 1} ${levelName}.\n\n${LEVEL_SHARE_TEXT[assessmentLevel]}\n\nFind out where you stand: ${window.location.origin}`
                  );
                  window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${postText}`, "_blank", "noopener");
                }}
              >
                <Share2 className="w-5 h-5 mr-2" />
                Share on LinkedIn
              </Button>
              <div className="text-center">
                <button
                  onClick={() => setShowRetakeConfirm(true)}
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
                >
                  Retake assessment
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

      </div>

      <AlertDialog open={showRetakeConfirm} onOpenChange={setShowRetakeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Start a new assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current results will be replaced with new ones once you complete the assessment again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              try { localStorage.removeItem("et-survey-answers"); localStorage.removeItem("et-survey-level"); } catch {}
              navigate("/survey");
            }}>
              Start over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
