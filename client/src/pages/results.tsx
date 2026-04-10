import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import type { Assessment, Level, Skill, UserSkillStatus } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, Sparkles, Loader2, Crown, ChevronDown, ChevronUp,
  CheckCircle2, BarChart3, Settings, LogOut, Share2, Download, Users
} from "lucide-react";
import confetti from "canvas-confetti";
import html2pdf from "html2pdf.js";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const LEVEL_COLORS: Record<number, string> = {
  0: "#D4A017", 1: "#FF2F86", 2: "#FF6A2B", 3: "#1C4BFF",
};

const LEVEL_NAMES: Record<number, string> = {
  0: "Accelerator", 1: "Thought Partner", 2: "Team Builder", 3: "Systems Designer",
};

const LEVEL_SUBTITLES: Record<number, string> = {
  0: "Speed up everyday work",
  1: "Think better with AI",
  2: "Build dedicated AI teammates",
  3: "Design autonomous systems",
};

const LEVEL_SHARE_TEXT: Record<number, string> = {
  0: "Using AI to move faster, but there are 4 levels and I've got a clear path up. Where do you stand?",
  1: "Not just using AI for quick answers anymore — using it to actually think through problems. 4 levels total. Curious where you'd land:",
  2: "I'm building dedicated AI teammates for my actual workflow. Most people haven't heard of the top two levels:",
  3: "Building AI systems that run on their own. This is the top of the map. Where do you stand?",
};

type OutcomeOption = {
  outcomeHeadline: string;
  description?: string;
};

type Phase = "loading" | "reveal" | "results";

export default function ResultsPage() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [phase, setPhase] = useState<Phase>("loading");
  useEffect(() => { document.title = "Your Results — Electric Thinking"; }, []);
  const [expandedOutcome, setExpandedOutcome] = useState<number | null>(null);
  const [showSkills, setShowSkills] = useState(false);
  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(() => {
    try { return localStorage.getItem("et-waitlist-joined") === "true"; } catch { return false; }
  });
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [npsSubmitted, setNpsSubmitted] = useState(false);
  const [npsSubmitting, setNpsSubmitting] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const { toast } = useToast();

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

      <div id="results-content" className="max-w-2xl mx-auto px-6 py-10 space-y-8">

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
              <span style={{ color: levelColor }}>{levelName}</span>
            </h1>
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


        {/* === 2. WHAT'S POSSIBLE — expandable outcome cards === */}
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
              <div className="space-y-3">
                {outcomes.map((outcome, i) => (
                  <Card
                    key={i}
                    className="rounded-2xl border border-border cursor-pointer hover:border-et-pink/50 transition-colors"
                    tabIndex={0}
                    role="button"
                    aria-expanded={expandedOutcome === i}
                    onClick={() => setExpandedOutcome(expandedOutcome === i ? null : i)}
                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedOutcome(expandedOutcome === i ? null : i); } }}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-heading font-semibold text-sm flex-1 min-w-0">{outcome.outcomeHeadline}</p>
                        <span className="print:hidden">
                          {expandedOutcome === i ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          )}
                        </span>
                      </div>
                      {/* Print-only: always show description */}
                      {outcome.description && (
                        <p className="hidden print:block text-sm text-muted-foreground mt-3 pt-3 border-t border-border/50 leading-relaxed">
                          {outcome.description}
                        </p>
                      )}
                      {/* Screen: animated expand/collapse */}
                      <AnimatePresence>
                        {expandedOutcome === i && outcome.description && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden print:hidden"
                          >
                            <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border/50 leading-relaxed">
                              {outcome.description}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
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

        {/* === 5. WAITLIST CTA === */}
        <AnimatePresence>
          {phase === "results" && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
            >
              <Card className="rounded-2xl border border-border">
                <CardContent className="pt-6 pb-6 text-center">
                  {waitlistJoined ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-et-green/15 flex items-center justify-center mx-auto mb-3">
                        <CheckCircle2 className="w-6 h-6 text-et-green" />
                      </div>
                      <p className="font-heading font-semibold text-sm mb-1">You're on the list!</p>
                      <p className="text-xs text-muted-foreground">We'll reach out when the next cohort opens at your level.</p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${levelColor}15` }}>
                        <Users className="w-6 h-6" style={{ color: levelColor }} />
                      </div>
                      <p className="font-heading font-semibold text-sm mb-1">
                        Level up with a cohort
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        We run small-group cohorts at every level. Join the waitlist for the next Level {assessmentLevel + 1} {levelName} cohort.
                      </p>
                      <Button
                        className="rounded-2xl px-8 py-5"
                        disabled={waitlistLoading}
                        onClick={async () => {
                          setWaitlistLoading(true);
                          try {
                            await apiRequest("POST", "/api/waitlist", {
                              level: assessmentLevel,
                              levelName,
                            });
                            setWaitlistJoined(true);
                            try { localStorage.setItem("et-waitlist-joined", "true"); } catch {}
                          } catch {
                            toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
                          }
                          setWaitlistLoading(false);
                        }}
                      >
                        {waitlistLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Join the waitlist
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* === 6. NPS === */}
        <AnimatePresence>
          {phase === "results" && assessment && (assessment as any).npsScore === null && !npsSubmitted && (
            <motion.section
              key="nps-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28 }}
            >
              <Card className="rounded-2xl border border-border">
                <CardContent className="pt-6 pb-6 text-center">
                  <p className="font-heading font-semibold text-sm mb-1">How was this experience?</p>
                  <p className="text-xs text-muted-foreground mb-4">How likely are you to recommend this to a colleague?</p>
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <button
                        key={n}
                        disabled={npsSubmitting}
                        onClick={async () => {
                          setNpsSubmitting(true);
                          try {
                            await apiRequest("POST", `/api/assessment/${assessment.id}/nps`, { score: n });
                            setNpsSubmitted(true);
                          } catch {
                            toast({ title: "Couldn't save your rating", variant: "destructive" });
                          }
                          setNpsSubmitting(false);
                        }}
                        className="w-9 h-9 rounded-full border-2 border-muted-foreground/25 hover:border-et-pink hover:bg-et-pink/10 transition-all text-xs font-semibold"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-[10px] text-muted-foreground">Not likely</span>
                    <span className="text-[10px] text-muted-foreground">Extremely likely</span>
                  </div>
                </CardContent>
              </Card>
            </motion.section>
          )}
          {phase === "results" && npsSubmitted && (
            <motion.section
              key="nps-thanks"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="rounded-2xl border border-border">
                <CardContent className="pt-6 pb-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-et-green/15 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 className="w-5 h-5 text-et-green" />
                  </div>
                  <p className="text-sm font-medium">Thanks for your feedback!</p>
                </CardContent>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* === 6b. MICRO-SURVEY FEEDBACK === */}
        <AnimatePresence>
          {phase === "results" && assessment && !feedbackSubmitted && (assessment as any).userFeedbackText === null && (
            npsSubmitted || (assessment as any).npsScore !== null
          ) && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="text-center space-y-3 py-2">
                <p className="text-sm text-muted-foreground">Did anything feel broken or frustrating?</p>
                <Textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Optional — helps us improve"
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-et-pink/30 focus:border-et-pink/50 transition-all"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={feedbackSubmitting || feedbackText.trim().length === 0}
                  className="rounded-xl text-xs"
                  onClick={async () => {
                    setFeedbackSubmitting(true);
                    try {
                      await apiRequest("POST", `/api/assessment/${assessment.id}/feedback`, { feedbackText: feedbackText.trim() });
                      setFeedbackSubmitted(true);
                    } catch {
                      toast({ title: "Couldn't save feedback", variant: "destructive" });
                    }
                    setFeedbackSubmitting(false);
                  }}
                >
                  {feedbackSubmitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Send
                </Button>
              </div>
            </motion.section>
          )}
          {phase === "results" && feedbackSubmitted && (
            <motion.section
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center py-2"
            >
              <p className="text-sm text-muted-foreground">Thanks for the feedback</p>
            </motion.section>
          )}
        </AnimatePresence>

        {/* === 7. SHARE + ACTIONS === */}
        <AnimatePresence>
          {phase === "results" && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="space-y-3 pt-2"
            >
              <Button
                className="w-full rounded-2xl py-5"
                onClick={() => {
                  const postText = `Just took an AI fluency assessment — I'm a Level ${assessmentLevel + 1} ${levelName}. ${LEVEL_SHARE_TEXT[assessmentLevel]}\n\n${window.location.origin}`;
                  window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(postText)}`, "_blank", "noopener");
                }}
              >
                <Share2 className="w-5 h-5 mr-2" />
                Share on LinkedIn
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-2xl py-5"
                disabled={pdfGenerating}
                onClick={async () => {
                  setPdfGenerating(true);
                  try {
                    const el = document.getElementById("results-content");
                    if (!el) throw new Error("Results element not found");
                    // Temporarily expand all sections for PDF capture
                    const prevOutcome = expandedOutcome;
                    const prevSkills = showSkills;
                    setExpandedOutcome(0); // expand first outcome
                    setShowSkills(true);
                    // Wait for React to render
                    await new Promise(r => setTimeout(r, 300));
                    await html2pdf().set({
                      margin: [10, 10, 10, 10],
                      filename: `electric-thinking-level-${assessmentLevel + 1}-${levelName.toLowerCase().replace(/\s+/g, "-")}.pdf`,
                      image: { type: "jpeg", quality: 0.95 },
                      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#EFE3CC" },
                      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                    }).from(el).save();
                    setExpandedOutcome(prevOutcome);
                    setShowSkills(prevSkills);
                  } catch (err) {
                    console.error("PDF generation failed:", err);
                    // Fallback to print
                    window.print();
                  }
                  setPdfGenerating(false);
                }}
              >
                {pdfGenerating ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Download className="w-5 h-5 mr-2" />}
                {pdfGenerating ? "Generating PDF..." : "Download results"}
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
