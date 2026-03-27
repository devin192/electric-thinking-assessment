import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { ArrowRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// 20 survey questions — 5 per level, shown sequentially without level labels
// The survey is ADAPTIVE: it stops when it finds your growth edge
const SURVEY_QUESTIONS = [
  // Level 1 — Accelerator
  { skillName: "Role, Task, Context", text: "Before I ask AI to do something, I give it a role, the task, and the context it needs to do a good job.", level: 0 },
  { skillName: "Voice-to-Text", text: "I talk to AI using voice instead of typing.", level: 0 },
  { skillName: "Show It What Good Looks Like", text: "I give AI examples, reference docs, or past work so it knows what good output looks like.", level: 0 },
  { skillName: "Back-and-Forth", text: "When AI gives me something, I give it feedback and keep going for multiple rounds instead of accepting the first response.", level: 0 },
  { skillName: "Screenshot + Explain", text: "When I'm stuck on something, I screenshot it, open AI, and talk through what I need help with.", level: 0 },
  // Level 2 — Thought Partner
  { skillName: "Interview Me", text: "I ask AI to interview me — to ask me questions one at a time before I commit to a direction.", level: 1 },
  { skillName: "Rapid Ideation", text: "I use AI to generate multiple options, framings, or approaches before I pick one.", level: 1 },
  { skillName: "Challenge Me", text: "I ask AI to poke holes in my thinking and find what could go wrong.", level: 1 },
  { skillName: "Decision Mapping", text: "When I'm stuck between options, I use AI to lay out the trade-offs and play out different scenarios.", level: 1 },
  { skillName: "Execute and Iterate", text: "After working through a problem with AI, I have it make a first version, then I give feedback on voice-to-text to keep tightening it.", level: 1 },
  // Level 3 — Specialized Teammates
  { skillName: "See the Specialist", text: "I can look at my work and see where a dedicated AI teammate should exist.", level: 2 },
  { skillName: "Onboard the Teammate", text: "I've built dedicated AI teammates — writing instructions, attaching examples, and giving them what they need to do the job well.", level: 2 },
  { skillName: "Refine Inputs, Not Outputs", text: "When my AI teammate's output isn't right, I fix the instructions rather than just fixing the output myself.", level: 2 },
  { skillName: "Expand Your Toolkit", text: "I know what my AI platform can really do, and I know when to reach for a different one.", level: 2 },
  { skillName: "Manage the Roster", text: "I have multiple AI teammates I work with regularly, and I know which one to reach for and when.", level: 2 },
  // Level 4 — Systems Designer
  { skillName: "Systems Mapping", text: "I can map my work as a system — what triggers it, what steps happen, what feeds into what, and where the decision points are.", level: 3 },
  { skillName: "Human in the Loop", text: "I know which steps in my workflows need a human and which ones can run on their own.", level: 3 },
  { skillName: "Proactive vs. Reactive", text: "I have AI workflows that run on their own — on a schedule or triggered by an event — without me starting them.", level: 3 },
  { skillName: "Self-Improving Systems", text: "When I give feedback on my AI system's output, I make sure the system itself gets updated so it's better next time.", level: 3 },
  { skillName: "What Wasn't Possible Before", text: "I've built AI systems that create entirely new outputs or capabilities that didn't exist before — not just faster versions of old processes.", level: 3 },
];

type Answer = 0 | 1 | 2; // 0=Not yet, 1=Sometimes, 2=Always
const COLUMN_LABELS = ["Not yet", "Sometimes", "Always"];

// Adaptive cutoff: after completing a level's 5 questions, check if we should continue.
// If the user scored low on this level, they've found their growth edge — stop.
// "Let the system decide" — Devin's instruction.
function shouldContinueToNextLevel(answers: Record<string, number>, completedLevel: number): boolean {
  const levelQuestions = SURVEY_QUESTIONS.filter(q => q.level === completedLevel);
  const answered = levelQuestions.filter(q => q.skillName in answers);
  if (answered.length < levelQuestions.length) return true; // not done with this level yet

  const levelScore = levelQuestions.reduce((sum, q) => sum + (answers[q.skillName] ?? 0), 0);
  return levelScore >= 4;
}

function calculateSurveyLevel(answers: Record<string, number>): number {
  let highestLevel = 0;
  for (let lvl = 0; lvl <= 3; lvl++) {
    const levelQuestions = SURVEY_QUESTIONS.filter(q => q.level === lvl);
    const levelScore = levelQuestions.reduce((sum, q) => sum + (answers[q.skillName] ?? 0), 0);
    if (levelScore >= 6) {
      highestLevel = lvl;
    }
  }
  return highestLevel;
}

function buildSurveySummary(answers: Record<string, number>): string {
  const levelNames = ["Accelerator", "Thought Partner", "Specialized Teammates", "Systems Designer"];
  const lines: string[] = [];
  for (let lvl = 0; lvl <= 3; lvl++) {
    const questions = SURVEY_QUESTIONS.filter(q => q.level === lvl);
    const answered = questions.filter(q => q.skillName in answers);
    if (answered.length === 0) continue;
    const strong = questions.filter(q => answers[q.skillName] === 2).map(q => q.skillName);
    const sometimes = questions.filter(q => answers[q.skillName] === 1).map(q => q.skillName);
    const never = questions.filter(q => answers[q.skillName] === 0 || !(q.skillName in answers)).map(q => q.skillName);
    const score = questions.reduce((sum, q) => sum + (answers[q.skillName] ?? 0), 0);
    lines.push(`${levelNames[lvl]} (${score}/10):`);
    if (strong.length > 0) lines.push(`  Always: ${strong.join(", ")}`);
    if (sometimes.length > 0) lines.push(`  Sometimes: ${sometimes.join(", ")}`);
    if (never.length > 0) lines.push(`  Not yet: ${never.join(", ")}`);
  }
  return lines.join("\n");
}

export { calculateSurveyLevel, buildSurveySummary, SURVEY_QUESTIONS };

export default function SurveyPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentLevel, setCurrentLevel] = useState(() => {
    try {
      const saved = localStorage.getItem("et-survey-level");
      if (!saved) return 0;
      const parsed = parseInt(saved, 10);
      return (parsed >= 0 && parsed <= 3) ? parsed : 0;
    } catch { return 0; }
  });
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    try {
      const saved = localStorage.getItem("et-survey-answers");
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
      // Validate: only keep keys that match known skill names with valid values (0, 1, 2)
      const validSkills = new Set(SURVEY_QUESTIONS.map(q => q.skillName));
      const validated: Record<string, Answer> = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (validSkills.has(key) && (val === 0 || val === 1 || val === 2)) {
          validated[key] = val as Answer;
        }
      }
      return validated;
    } catch { return {}; }
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { document.title = "Survey — Electric Thinking"; }, []);

  const levelQuestions = useMemo(
    () => SURVEY_QUESTIONS.filter(q => q.level === currentLevel),
    [currentLevel]
  );

  const levelAllAnswered = levelQuestions.every(q => q.skillName in answers);

  // How many total levels will be shown (for progress display)
  const totalLevels = useMemo(() => {
    for (let lvl = 0; lvl <= 3; lvl++) {
      const levelQs = SURVEY_QUESTIONS.filter(q => q.level === lvl);
      const allAnswered = levelQs.every(q => q.skillName in answers);
      if (allAnswered && lvl < 3 && !shouldContinueToNextLevel(answers, lvl)) {
        return lvl + 1;
      }
      if (!allAnswered) {
        return lvl + 1;
      }
    }
    return 4;
  }, [answers]);

  const handleAnswer = useCallback((skillName: string, value: Answer) => {
    setAnswers(prev => {
      const next = { ...prev, [skillName]: value };
      try { localStorage.setItem("et-survey-answers", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleContinue = useCallback(async () => {
    if (!levelAllAnswered || submitting) return;

    // Check adaptive cutoff
    if (currentLevel < 3 && shouldContinueToNextLevel(answers, currentLevel)) {
      setSubmitting(true);
      setCurrentLevel(prev => {
        const next = prev + 1;
        try { localStorage.setItem("et-survey-level", String(next)); } catch {}
        return next;
      });
      // Re-enable after level transition animation completes
      setTimeout(() => setSubmitting(false), 350);
    } else {
      // Survey is done — submit and go straight to warmup
      setSubmitting(true);
      try {
        const surveyLevel = calculateSurveyLevel(answers);
        const res = await apiRequest("POST", "/api/assessment/start", {
          surveyResponsesJson: answers,
          surveyLevel,
        });
        const assessment = await res.json();
        queryClient.setQueryData(["/api/assessment/active"], assessment);
        try { localStorage.removeItem("et-survey-answers"); localStorage.removeItem("et-survey-level"); } catch {}
        navigate("/assessment/warmup");
      } catch (err) {
        console.error("Failed to save survey:", err);
        toast({ title: "Couldn't save your answers", description: "Please try again.", variant: "destructive" });
        setSubmitting(false);
      }
    }
  }, [currentLevel, answers, levelAllAnswered, submitting, navigate, toast]);

  // Guard: redirect to onboarding if not complete
  if (user && !user.onboardingComplete) {
    navigate("/onboarding");
    return null;
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between">
        <button onClick={() => navigate("/dashboard")} className="opacity-80 hover:opacity-100 transition-opacity" aria-label="Exit survey">
          <Wordmark className="text-lg" />
        </button>
        {totalLevels > 1 && (
          <span className="text-sm text-muted-foreground">
            Part {currentLevel + 1} of {totalLevels}
          </span>
        )}
      </header>

      {/* Progress dots — only show if multiple parts */}
      {totalLevels > 1 && (
        <div className="px-6 flex items-center justify-center gap-2 mb-2">
          {Array.from({ length: totalLevels }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i < currentLevel
                  ? "bg-et-pink w-8"
                  : i === currentLevel
                    ? "bg-et-pink w-12"
                    : "bg-muted w-8"
              }`}
            />
          ))}
        </div>
      )}

      {/* Single progress bar when only 1 part */}
      {totalLevels === 1 && (
        <div className="px-6">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-et-pink rounded-full"
              initial={false}
              animate={{
                width: `${Math.min(100, (levelQuestions.filter(q => q.skillName in answers).length / levelQuestions.length) * 100)}%`
              }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-6 py-6">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`level-${currentLevel}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              {/* Headline + instruction text */}
              <h1 className="font-heading text-2xl font-bold text-center mb-3">
                {currentLevel === 0
                  ? "How often do you do each of these with AI?"
                  : currentLevel === 1
                  ? "Now, using AI as a thinking partner"
                  : currentLevel === 2
                  ? "Building dedicated AI teammates"
                  : "Designing AI systems"}
              </h1>
              <p className="text-sm text-muted-foreground text-center mb-8">
                {currentLevel === 0
                  ? "Be honest — there are no wrong answers. We're all building these skills together."
                  : currentLevel === 1
                  ? "Nice work. A few more — same vibe, just a step up."
                  : currentLevel === 2
                  ? "If these are unfamiliar, that's completely normal."
                  : "Last set — very few people are here yet."}
              </p>

              {/* Column headers — sticky on scroll, px-4 matches card padding so labels align with bubbles */}
              <div
                className="hidden sm:grid items-end mb-3 gap-x-4 sticky top-0 z-10 bg-background py-2 px-4"
                style={{ gridTemplateColumns: "1fr 64px 80px 64px" }}
              >
                <div />
                {COLUMN_LABELS.map(label => (
                  <span key={label} className="text-xs font-semibold text-muted-foreground text-center">
                    {label}
                  </span>
                ))}
              </div>

              {/* Question rows */}
              <div className="space-y-2">
                {levelQuestions.map((q, idx) => {
                  const selected = answers[q.skillName];
                  return (
                    <motion.div
                      key={q.skillName}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="p-4 rounded-xl border border-border bg-card"
                    >
                      {/* Desktop: grid layout */}
                      <div
                        className="hidden sm:grid items-center gap-x-4"
                        style={{ gridTemplateColumns: "1fr 64px 80px 64px" }}
                        role="radiogroup"
                        aria-label={q.text}
                      >
                        <p className="text-sm md:text-base leading-snug">
                          {q.text}
                        </p>
                        {([0, 1, 2] as Answer[]).map(value => {
                          const isSelected = selected === value;
                          return (
                            <button
                              key={value}
                              onClick={() => handleAnswer(q.skillName, value)}
                              role="radio"
                              aria-checked={isSelected}
                              className={`w-10 h-10 md:w-11 md:h-11 rounded-full border-2 transition-all duration-150 flex items-center justify-center mx-auto ${
                                isSelected
                                  ? "border-et-pink bg-et-pink/15 shadow-sm"
                                  : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-accent/30"
                              }`}
                              aria-label={COLUMN_LABELS[value]}
                            >
                              {isSelected && (
                                <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-et-pink" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {/* Mobile: stacked layout */}
                      <div className="sm:hidden" role="radiogroup" aria-label={q.text}>
                        <p className="text-sm leading-snug mb-3">
                          {q.text}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          {([0, 1, 2] as Answer[]).map(value => {
                            const isSelected = selected === value;
                            return (
                              <button
                                key={value}
                                onClick={() => handleAnswer(q.skillName, value)}
                                role="radio"
                                aria-checked={isSelected}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 transition-all duration-150 min-h-[44px] ${
                                  isSelected
                                    ? "border-et-pink bg-et-pink/15"
                                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                                }`}
                              >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  isSelected ? "border-et-pink" : "border-muted-foreground/40"
                                }`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-et-pink" />}
                                </div>
                                <span className="text-xs font-medium">{COLUMN_LABELS[value]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Continue button — appears when all 5 answered */}
              <div className="mt-8 flex justify-center">
                <AnimatePresence>
                  {levelAllAnswered && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <Button
                        onClick={handleContinue}
                        disabled={submitting}
                        className="rounded-2xl px-10 py-6 text-base"
                      >
                        {submitting ? "Saving..." : "Continue"} <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
