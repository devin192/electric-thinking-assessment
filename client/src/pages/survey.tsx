import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { ArrowRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// 20 survey questions — 5 per level, shown sequentially without level labels
// The survey is ADAPTIVE: it stops when it finds your growth edge
const SURVEY_QUESTIONS = [
  // Level 1 — Accelerator
  { skillName: "Context Setting", text: "I brief AI with my role, the task, and relevant background before asking it to do something", level: 0 },
  { skillName: "Quick Drafting", text: "I use AI to create first drafts of emails, docs, or written content", level: 0 },
  { skillName: "Output Editing & Direction", text: "When AI output isn't right, I redirect it — adjusting tone, structure, or specificity", level: 0 },
  { skillName: "Voice-First Capture", text: "I use voice to capture thoughts, dictate drafts, or recap meetings with AI", level: 0 },
  { skillName: "In-the-Moment Support", text: "When I hit friction at work, my reflex is to reach for AI", level: 0 },
  // Level 2 — Thought Partner
  { skillName: "Interview Me", text: "I let AI lead with questions to surface my assumptions before I commit to a direction", level: 1 },
  { skillName: "Rapid Ideation", text: "I use AI to generate multiple options before picking one", level: 1 },
  { skillName: "Challenge Me", text: "I ask AI to find holes, counterarguments, or blind spots in my thinking", level: 1 },
  { skillName: "Decision Mapping", text: "I use AI to structure trade-offs, run scenarios, or apply decision frameworks", level: 1 },
  { skillName: "Operationalize This", text: "I use AI to turn strategy into concrete execution plans with steps and owners", level: 1 },
  // Level 3 — Specialized Teammates
  { skillName: "Pattern Spotting", text: "I notice when a repeating task should become a reusable AI tool", level: 2 },
  { skillName: "Workflow Scoping", text: "I break tasks into inputs, steps, and expected outputs before building an AI tool", level: 2 },
  { skillName: "Instruction Design", text: "I write system prompts or instructions that produce consistent, reliable AI output", level: 2 },
  { skillName: "Testing & Refinement", text: "I test my AI tools with real inputs and iterate through edge cases", level: 2 },
  { skillName: "Knowledge Embedding", text: "I attach reference docs or domain context so AI has what it needs to be accurate", level: 2 },
  // Level 4 — Agentic Workflow
  { skillName: "Systems Mapping", text: "I design end-to-end workflows, not just individual AI tasks", level: 3 },
  { skillName: "Automation Design", text: "I build workflows where AI handles steps without me", level: 3 },
  { skillName: "Independent Judgment", text: "I know which steps in a workflow need a human decision vs. can run autonomously", level: 3 },
  { skillName: "Cross-Workflow Integration", text: "I connect multiple AI-powered processes together", level: 3 },
  { skillName: "Continuous Improvement", text: "I monitor, measure, and refine my automated AI systems over time", level: 3 },
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
  const levelNames = ["Accelerator", "Thought Partner", "Specialized Teammates", "Agentic Workflow"];
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
        await apiRequest("POST", "/api/assessment/start", {
          surveyResponsesJson: answers,
          surveyLevel,
        });
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
              {/* Instruction text */}
              <p className="text-base text-muted-foreground text-center mb-8">
                {currentLevel === 0
                  ? "How often do you do each of these? Be honest — most people are strong in some areas and still building in others. That's the whole point."
                  : currentLevel === 1
                  ? "Nice. Now a few about using AI as a thinking partner."
                  : currentLevel === 2
                  ? "These are about building reusable AI tools. If they're unfamiliar, that's completely normal."
                  : "Last set — these are about designing systems. Very few people are here yet."}
              </p>

              {/* Column headers — sticky on scroll */}
              <div
                className="hidden sm:grid items-end mb-3 gap-x-4 sticky top-0 z-10 bg-background py-2"
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
