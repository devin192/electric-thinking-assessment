import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Assessment, Level, Skill, Nudge } from "@shared/schema";
import {
  ArrowRight, Sparkles, Loader2, Crown,
  Clock, CheckCircle2, MessageCircle, CalendarClock,
  ChevronDown, Share2, BarChart3
} from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import confetti from "canvas-confetti";

const LEVEL_COLORS: Record<number, string> = {
  0: "#2DD6FF", 1: "#FFD236", 2: "#FF2F86", 3: "#FF6A2B", 4: "#1C4BFF",
};

const LEVEL_NAMES: Record<number, string> = {
  0: "Explorer", 1: "Accelerator", 2: "Thought Partner", 3: "Specialized Teammates", 4: "Agentic Workflow",
};

const NEXT_LEVEL_DESCRIPTIONS: Record<number, string> = {
  0: "At Level 2, AI stops being a tool you open and becomes a reflex you reach for.",
  1: "At Level 3, AI stops being your assistant and becomes your thinking partner.",
  2: "At Level 4, you build reusable AI systems that work without you babysitting them.",
  3: "At Level 5, your AI runs entire workflows while you focus on the decisions only you can make.",
  4: "You've reached the highest level. Now it's about depth, not altitude.",
};

type Phase = "loading" | "reveal" | "choose" | "action" | "done";

interface OutcomeOption {
  outcomeHeadline: string;
  timeEstimate: string;
  skillName: string;
  action: string;
  whatYoullSee: string;
}

export default function ResultsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [reflectionNote, setReflectionNote] = useState("");
  const [showReflection, setShowReflection] = useState(false);
  const [completingChallenge, setCompletingChallenge] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDay, setScheduleDay] = useState("Monday");
  const [showShareCard, setShowShareCard] = useState(false);

  const { data: assessment, isLoading: assessmentLoading } = useQuery<Assessment | null>({
    queryKey: ["/api/assessment/latest"],
    enabled: !!user,
  });
  const { data: levels } = useQuery<Level[]>({ queryKey: ["/api/levels"] });
  const { data: allSkills } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const { data: nudges, refetch: refetchNudges } = useQuery<Nudge[]>({
    queryKey: ["/api/user/nudges"],
    enabled: !!user,
  });

  const firstChallenge = nudges?.find((n: any) => n.isFirstChallenge);

  const assessmentLevel = assessment?.assessmentLevel ?? 0;
  const levelColor = LEVEL_COLORS[assessmentLevel] || LEVEL_COLORS[0];
  const levelName = LEVEL_NAMES[assessmentLevel] || "Explorer";
  const currentLevelInfo = levels?.find(l => l.sortOrder === assessmentLevel);
  const nextLevelName = LEVEL_NAMES[Math.min(assessmentLevel + 1, 4)] || "";

  // Parse the new data shape
  const outcomeOptions: OutcomeOption[] = (assessment as any)?.outcomeOptionsJson || [];
  const signatureSkillRationale = (assessment as any)?.signatureSkillRationale || "";
  const signatureSkillId = (assessment as any)?.signatureSkillId;
  const signatureSkill = allSkills?.find(s => s.id === signatureSkillId);

  // brightSpotsText is now JSON stringified array
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

  const futureSelfText = (assessment as any)?.futureSelfText || "";
  const nextLevelIdentity = (assessment as any)?.nextLevelIdentity || nextLevelName;

  // Fallback outcome options from firstMove if new format not available
  const firstMove = (assessment?.firstMoveJson || {}) as { skillName?: string; suggestion?: string };
  const hasOutcomeOptions = outcomeOptions.length >= 2;

  useEffect(() => {
    if (assessment && allSkills && levels && phase === "loading") {
      const animKey = `results-animated-${assessment.id}`;
      const alreadySeen = sessionStorage.getItem(animKey) === "true";

      if (alreadySeen) {
        setPhase("choose");
      } else {
        // Brief loading moment, then reveal
        setTimeout(() => {
          setPhase("reveal");
          sessionStorage.setItem(animKey, "true");
          // Fire confetti on reveal
          const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (!prefersReduced) {
            setTimeout(() => {
              confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            }, 800);
          }
          // Auto-advance to choose after the reveal settles
          setTimeout(() => setPhase("choose"), 3000);
        }, 2000);
      }
    }
  }, [assessment, allSkills, levels]);

  const handleSelectOption = (index: number) => {
    setSelectedOption(index);
    setPhase("action");
  };

  const handleDidIt = async () => {
    setShowReflection(true);
  };

  const handleSubmitReflection = async () => {
    setCompletingChallenge(true);
    try {
      // If we have a first challenge nudge, mark it as read and save reflection
      if (firstChallenge && reflectionNote.trim()) {
        await apiRequest("POST", `/api/challenge/${firstChallenge.id}/reflect`, {
          note: reflectionNote.trim(),
        });
      } else if (firstChallenge) {
        // Just mark as read without reflection
        await apiRequest("PATCH", `/api/nudges/${firstChallenge.id}/read`);
      }
      await refetchNudges();
      queryClient.invalidateQueries({ queryKey: ["/api/user/skills"] });

      // Celebrate
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!prefersReduced) {
        confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } });
      }

      setPhase("done");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setCompletingChallenge(false);
  };

  const handleSkipReflection = async () => {
    setCompletingChallenge(true);
    try {
      if (firstChallenge) {
        await apiRequest("PATCH", `/api/nudges/${firstChallenge.id}/read`);
      }
      await refetchNudges();

      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!prefersReduced) {
        confetti({ particleCount: 80, spread: 80, origin: { y: 0.5 } });
      }
      setPhase("done");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setCompletingChallenge(false);
  };

  const handleScheduleLater = async () => {
    // For now, just save the journey preferences and go to dashboard
    try {
      await apiRequest("POST", "/api/user/journey-setup", {
        challengeFrequency: "weekly",
        nudgeDay: scheduleDay,
      });
      toast({ title: `Power Ups will arrive on ${scheduleDay}s` });
      navigate("/dashboard");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "";
  const shareText = `I just discovered my AI fluency level. I'm a Level ${assessmentLevel + 1} ${levelName}. Take yours:`;

  const handleShareLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, "_blank");
  };
  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
    toast({ title: "Copied to clipboard!" });
  };

  if (!user) return null;

  if (assessmentLoading || !levels || !allSkills) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Wordmark className="text-xl mb-4 block" />
          <Loader2 className="w-8 h-8 animate-spin text-et-pink mx-auto" />
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
            <p className="text-muted-foreground mb-6">Have a quick conversation and find out where you stand.</p>
            <Button className="rounded-2xl px-8 py-5" onClick={() => navigate("/assessment/warmup")}>
              Start Your Conversation <ArrowRight className="w-5 h-5 ml-2" />
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
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Wordmark className="text-xl mb-8 block" />
          <div className="relative w-24 h-24 mx-auto mb-8">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: `${levelColor}20` }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <div
              className="absolute inset-2 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${levelColor}30` }}
            >
              <Sparkles className="w-8 h-8" style={{ color: levelColor }} />
            </div>
          </div>
          <p className="font-heading text-xl font-bold">Building your results...</p>
        </motion.div>
      </div>
    );
  }

  // === REVEAL + CHOOSE + ACTION + DONE (single scrollable page) ===
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-3 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-md">
        <Wordmark className="text-lg" />
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="text-xs">
          Go to Dashboard <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </header>

      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">
        {/* === IDENTITY SECTION === */}
        <motion.section
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Level circle */}
          <motion.div
            className="relative w-28 h-28 mx-auto mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 150, damping: 15 }}
          >
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: levelColor,
                boxShadow: `0 0 40px ${levelColor}40, 0 0 80px ${levelColor}15`,
              }}
            >
              <span className="text-white font-heading text-5xl font-bold">{assessmentLevel + 1}</span>
            </div>
            <motion.div
              className="absolute -top-1 -right-1"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
            >
              <div className="w-8 h-8 rounded-full bg-card border-2 border-border flex items-center justify-center shadow-lg">
                <Crown className="w-4 h-4" style={{ color: levelColor }} />
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h1 className="font-heading text-3xl font-bold mb-1">
              You're a <span style={{ color: levelColor }}>{currentLevelInfo?.displayName || levelName}</span>
            </h1>
            {signatureSkill && (
              <p className="text-sm text-muted-foreground mt-2">
                Your signature skill: <span className="font-medium text-foreground">{signatureSkill.name}</span>
              </p>
            )}
          </motion.div>

          {/* Share button right after identity */}
          <motion.div
            className="mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <button
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowShareCard(!showShareCard)}
            >
              <Share2 className="w-3.5 h-3.5" /> Share your results
            </button>
            <AnimatePresence>
              {showShareCard && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex justify-center gap-3 mt-3"
                >
                  <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={handleShareLinkedIn}>
                    <SiLinkedin className="w-3.5 h-3.5 mr-1.5" /> LinkedIn
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={handleCopyLink}>
                    Copy Link
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.section>

        {/* === BRIGHT SPOTS + ASPIRATION === */}
        <AnimatePresence>
          {(phase === "choose" || phase === "action" || phase === "done") && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="rounded-2xl border border-border overflow-hidden">
                <CardContent className="pt-6 pb-6 space-y-4">
                  {/* Bright spots as bullets */}
                  {brightSpots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">
                        What you're already doing well
                      </p>
                      <ul className="space-y-2">
                        {brightSpots.map((spot, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                            <span>{spot}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Aspiration line */}
                  {assessmentLevel < 4 && (
                    <div className="pt-3 border-t border-border/50">
                      <p className="text-sm">
                        <span className="font-medium" style={{ color: LEVEL_COLORS[Math.min(assessmentLevel + 1, 4)] }}>
                          Next: {nextLevelIdentity}
                        </span>
                        {" "}<span className="text-muted-foreground">{futureSelfText || NEXT_LEVEL_DESCRIPTIONS[assessmentLevel]}</span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* === OUTCOME CARDS === */}
        <AnimatePresence>
          {phase === "choose" && hasOutcomeOptions && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <p className="text-center text-sm font-medium mb-4">Pick the outcome you want first:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {outcomeOptions.slice(0, 2).map((option, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Card
                      className="rounded-2xl border-2 cursor-pointer transition-all hover:shadow-lg h-full"
                      style={{ borderColor: `${levelColor}30` }}
                      onClick={() => handleSelectOption(i)}
                    >
                      <CardContent className="pt-6 pb-6 flex flex-col h-full">
                        <p className="font-heading text-base font-bold leading-snug mb-3 flex-1">
                          {option.outcomeHeadline}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          {option.timeEstimate}
                        </div>
                        <Button
                          className="w-full rounded-xl mt-4"
                          style={{ backgroundColor: levelColor }}
                        >
                          Let's do this <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Fallback if no outcome options (legacy assessments) */}
          {phase === "choose" && !hasOutcomeOptions && firstMove.skillName && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="rounded-2xl border-2 cursor-pointer" style={{ borderColor: `${levelColor}30` }}>
                <CardContent className="pt-6 pb-6">
                  <p className="font-heading text-lg font-bold mb-2">{firstMove.skillName}</p>
                  <p className="text-sm text-muted-foreground mb-4">{firstMove.suggestion}</p>
                  <Button
                    className="rounded-xl"
                    style={{ backgroundColor: levelColor }}
                    onClick={() => { setSelectedOption(0); setPhase("action"); }}
                  >
                    Start <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>

        {/* === ACTION PHASE === */}
        <AnimatePresence>
          {phase === "action" && selectedOption !== null && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              {hasOutcomeOptions && outcomeOptions[selectedOption] ? (
                <Card className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: `${levelColor}40` }}>
                  <div className="h-1" style={{ backgroundColor: levelColor }} />
                  <CardContent className="pt-6 pb-6 space-y-5">
                    <div>
                      <p className="font-heading text-xl font-bold mb-1">
                        {outcomeOptions[selectedOption].outcomeHeadline}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {outcomeOptions[selectedOption].timeEstimate}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: levelColor }}>
                        What to do
                      </p>
                      <p className="text-sm leading-relaxed">
                        {outcomeOptions[selectedOption].action}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        What you'll see
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {outcomeOptions[selectedOption].whatYoullSee}
                      </p>
                    </div>

                    {firstChallenge && (
                      <button
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2"
                        onClick={() => navigate(`/dashboard`)}
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Need help? Open the coach on your dashboard
                      </button>
                    )}
                  </CardContent>
                </Card>
              ) : firstMove.skillName && (
                <Card className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: `${levelColor}40` }}>
                  <div className="h-1" style={{ backgroundColor: levelColor }} />
                  <CardContent className="pt-6 pb-6 space-y-3">
                    <p className="font-heading text-xl font-bold">{firstMove.skillName}</p>
                    <p className="text-sm leading-relaxed">{firstMove.suggestion}</p>
                  </CardContent>
                </Card>
              )}

              {/* Action buttons */}
              <div className="space-y-3">
                {!showReflection ? (
                  <>
                    <Button
                      className="w-full rounded-2xl py-6 text-base font-semibold"
                      style={{ backgroundColor: levelColor }}
                      onClick={handleDidIt}
                      disabled={completingChallenge}
                    >
                      {completingChallenge ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                      I did it
                    </Button>

                    <button
                      className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowSchedule(!showSchedule)}
                    >
                      <CalendarClock className="w-3.5 h-3.5 inline mr-1" />
                      Schedule for later
                    </button>

                    <AnimatePresence>
                      {showSchedule && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <Card className="rounded-xl border border-border">
                            <CardContent className="pt-4 pb-4">
                              <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                  <label className="text-xs text-muted-foreground block mb-1">Preferred day</label>
                                  <select
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                    value={scheduleDay}
                                    onChange={(e) => setScheduleDay(e.target.value)}
                                  >
                                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(d => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                </div>
                                <Button size="sm" className="rounded-lg" onClick={handleScheduleLater}>
                                  Set
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                      className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors pt-2"
                      onClick={() => {
                        // Generate a different challenge
                        if (hasOutcomeOptions && outcomeOptions.length > 1) {
                          const otherIndex = selectedOption === 0 ? 1 : 0;
                          setSelectedOption(otherIndex);
                        }
                      }}
                    >
                      Show me something different
                    </button>
                  </>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <p className="text-sm font-medium">Quick: what surprised you?</p>
                    <input
                      type="text"
                      placeholder="Optional, just a line..."
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                      value={reflectionNote}
                      onChange={(e) => setReflectionNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSubmitReflection(); }}
                      autoFocus
                    />
                    <div className="flex gap-3">
                      <Button
                        className="flex-1 rounded-xl"
                        style={{ backgroundColor: levelColor }}
                        onClick={handleSubmitReflection}
                        disabled={completingChallenge}
                      >
                        {completingChallenge ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & continue"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="rounded-xl"
                        onClick={handleSkipReflection}
                        disabled={completingChallenge}
                      >
                        Skip
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* === DONE PHASE === */}
        <AnimatePresence>
          {phase === "done" && (
            <motion.section
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: "spring" }}
              className="text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h2 className="font-heading text-2xl font-bold mb-2">Nice work.</h2>
                {hasOutcomeOptions && selectedOption !== null && outcomeOptions[selectedOption] && (
                  <p className="text-sm text-muted-foreground">
                    You just practiced <span className="font-medium text-foreground">{outcomeOptions[selectedOption].skillName}</span>. That's a {levelName} skill.
                  </p>
                )}
              </div>

              <Button
                className="rounded-2xl px-8 py-5 text-base"
                onClick={() => navigate("/dashboard")}
              >
                Go to Your Dashboard <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
