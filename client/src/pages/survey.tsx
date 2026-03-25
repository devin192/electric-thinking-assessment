import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { ArrowRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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

type Answer = 0 | 1 | 2; // 0=Never, 1=Sometimes, 2=Always

// Adaptive cutoff: after completing a level's 5 questions, check if we should continue.
// If the user scored low on this level, they've found their growth edge — stop.
// "Let the system decide" — Devin's instruction.
function shouldContinueToNextLevel(answers: Record<string, number>, completedLevel: number): boolean {
  const levelQuestions = SURVEY_QUESTIONS.filter(q => q.level === completedLevel);
  const answered = levelQuestions.filter(q => q.skillName in answers);
  if (answered.length < levelQuestions.length) return true; // not done with this level yet

  const levelScore = levelQuestions.reduce((sum, q) => sum + (answers[q.skillName] ?? 0), 0);
  // Max score per level = 10 (5 questions × 2)
  // Score ≤ 3: mostly Never — this is below their edge, stop here
  // Score 4-5: mixed but leaning low — show one more level to find the edge, then stop
  // Score ≥ 6: solid — continue to next level
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
    if (never.length > 0) lines.push(`  Never: ${never.join(", ")}`);
  }
  return lines.join("\n");
}

export { calculateSurveyLevel, buildSurveySummary, SURVEY_QUESTIONS };

export default function SurveyPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [currentLevel, setCurrentLevel] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [surveyComplete, setSurveyComplete] = useState(false);

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
        return lvl + 1; // we're still on this level, assume at least this many
      }
    }
    return 4;
  }, [answers]);

  const handleAnswer = useCallback((skillName: string, value: Answer) => {
    setAnswers(prev => ({ ...prev, [skillName]: value }));
  }, []);

  const handleContinue = useCallback(() => {
    if (!levelAllAnswered) return;

    // Check adaptive cutoff
    if (currentLevel < 3 && shouldContinueToNextLevel(answers, currentLevel)) {
      setCurrentLevel(prev => prev + 1);
    } else {
      setSurveyComplete(true);
    }
  }, [currentLevel, answers, levelAllAnswered]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const surveyLevel = calculateSurveyLevel(answers);
      await apiRequest("POST", "/api/assessment/start", {
        surveyResponsesJson: answers,
        surveyLevel,
      });
      navigate("/assessment/warmup");
    } catch (err) {
      console.error("Failed to save survey:", err);
      setSubmitting(false);
      setSubmitError("Something went wrong. Please try again.");
    }
  }, [answers, navigate]);

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
        <span className="text-sm text-muted-foreground">
          Part {currentLevel + 1}{!surveyComplete ? ` of ${totalLevels}` : ""}
        </span>
      </header>

      {/* Progress dots */}
      <div className="px-6 flex items-center justify-center gap-2 mb-2">
        {Array.from({ length: totalLevels }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i < currentLevel
                ? "bg-et-pink w-8"
                : i === currentLevel && !surveyComplete
                  ? "bg-et-pink w-12"
                  : i === currentLevel && surveyComplete
                    ? "bg-et-pink w-8"
                    : "bg-muted w-8"
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-6 py-6">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {surveyComplete ? (
              <motion.div
                key="complete"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-6 mt-12"
              >
                <p className="text-2xl font-heading font-bold">Got it.</p>
                <p className="text-muted-foreground">
                  Now you'll have a quick conversation with Lex, an AI guide who'll dig into how AI fits your actual work. Your personalized results are on the other side.
                </p>
                {submitError && (
                  <p className="text-sm text-red-500">{submitError}</p>
                )}
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-2xl px-8 py-6 text-base"
                >
                  {submitting ? "Saving..." : "Continue to conversation"} <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key={`level-${currentLevel}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
              >
                {/* Instruction text */}
                <p className="text-sm text-muted-foreground text-center mb-6">
                  How often do you do each of these? No right or wrong answers.
                </p>

                {/* Grid header */}
                <div className="grid grid-cols-[1fr_auto] gap-x-2 items-end mb-3">
                  <div /> {/* spacer for question column */}
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <span className="text-xs font-medium text-muted-foreground px-2 md:px-4">Never</span>
                    <span className="text-xs font-medium text-muted-foreground px-2 md:px-4">Sometimes</span>
                    <span className="text-xs font-medium text-muted-foreground px-2 md:px-4">Always</span>
                  </div>
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
                        className={`grid grid-cols-[1fr_auto] gap-x-3 items-center p-3 md:p-4 rounded-xl border transition-colors ${
                          selected !== undefined ? "border-border bg-card" : "border-border bg-card"
                        }`}
                      >
                        <p className="text-sm md:text-base leading-snug pr-2">
                          {q.text}
                        </p>
                        <div className="grid grid-cols-3 gap-1">
                          {([0, 1, 2] as Answer[]).map(value => {
                            const isSelected = selected === value;
                            return (
                              <button
                                key={value}
                                onClick={() => handleAnswer(q.skillName, value)}
                                className={`w-9 h-9 md:w-10 md:h-10 rounded-full border-2 transition-all duration-150 flex items-center justify-center mx-auto ${
                                  isSelected
                                    ? "border-et-pink bg-et-pink/15"
                                    : "border-muted-foreground/20 hover:border-muted-foreground/40"
                                }`}
                                aria-label={["Never", "Sometimes", "Always"][value]}
                              >
                                {isSelected && (
                                  <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-et-pink" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Continue button — appears when all 5 answered */}
                <div className="mt-6 flex justify-center">
                  <AnimatePresence>
                    {levelAllAnswered && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        <Button
                          onClick={handleContinue}
                          className="rounded-2xl px-8 py-5 text-base"
                        >
                          Continue <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
