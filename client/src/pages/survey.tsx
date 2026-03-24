import { useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { ArrowRight, ArrowLeft } from "lucide-react";
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
const ANSWER_LABELS: { value: Answer; label: string; description: string }[] = [
  { value: 0, label: "Never", description: "I don't do this" },
  { value: 1, label: "Sometimes", description: "I do this occasionally" },
  { value: 2, label: "Always", description: "This is a regular habit" },
];

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  const [surveyComplete, setSurveyComplete] = useState(false);

  const question = SURVEY_QUESTIONS[currentIndex];
  const currentAnswer = answers[question.skillName];

  // Compute how many questions are active (factoring in adaptive cutoff)
  const activeQuestions = useMemo(() => {
    const active: typeof SURVEY_QUESTIONS = [];
    for (let lvl = 0; lvl <= 3; lvl++) {
      const levelQs = SURVEY_QUESTIONS.filter(q => q.level === lvl);
      active.push(...levelQs);
      // After adding a level's questions, check if we have enough answers to decide cutoff
      if (lvl < 3) {
        const allAnswered = levelQs.every(q => q.skillName in answers);
        if (allAnswered && !shouldContinueToNextLevel(answers, lvl)) {
          break; // Stop — found the growth edge
        }
      }
    }
    return active;
  }, [answers]);

  const totalActive = activeQuestions.length;
  const answeredCount = activeQuestions.filter(q => q.skillName in answers).length;

  // Check if the survey is done after each answer
  const checkComplete = useCallback((updatedAnswers: Record<string, Answer>) => {
    // Walk through levels and check adaptive cutoff
    for (let lvl = 0; lvl <= 3; lvl++) {
      const levelQs = SURVEY_QUESTIONS.filter(q => q.level === lvl);
      const allLevelAnswered = levelQs.every(q => q.skillName in updatedAnswers);
      if (!allLevelAnswered) return false; // still have questions in this level

      if (lvl < 3 && !shouldContinueToNextLevel(updatedAnswers, lvl)) {
        return true; // cutoff — survey is done
      }
    }
    // If we got through all 4 levels with answers, we're done
    const allQs = SURVEY_QUESTIONS;
    return allQs.every(q => q.skillName in updatedAnswers);
  }, []);

  const handleAnswer = useCallback((value: Answer) => {
    const updated = { ...answers, [question.skillName]: value };
    setAnswers(updated);

    const done = checkComplete(updated);
    if (done) {
      setSurveyComplete(true);
      return;
    }

    // Auto-advance to next question
    setTimeout(() => {
      // Find next unanswered question in active set
      const nextIdx = currentIndex + 1;
      if (nextIdx < SURVEY_QUESTIONS.length) {
        // Check if this next question is still within the active range
        const nextQ = SURVEY_QUESTIONS[nextIdx];
        const nextLevel = nextQ.level;
        // Only advance if the next level is still active
        if (nextLevel === question.level || shouldContinueToNextLevel(updated, question.level)) {
          setDirection(1);
          setCurrentIndex(nextIdx);
        } else {
          // We just completed a level and the cutoff says stop
          setSurveyComplete(true);
        }
      }
    }, 300);
  }, [currentIndex, question, answers, checkComplete]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
      setSurveyComplete(false); // re-open if going back
    }
  }, [currentIndex]);

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
        <Wordmark className="text-lg" />
        <span className="text-sm text-muted-foreground">
          {answeredCount} of {totalActive}
        </span>
      </header>

      {/* Progress bar */}
      <div className="px-6">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-et-pink rounded-full"
            initial={false}
            animate={{ width: `${Math.min(100, (answeredCount / totalActive) * 100)}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Question area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          {answeredCount === 0 && !surveyComplete && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground text-center mb-4"
            >
              How often do you do each of these? No right or wrong answers.
            </motion.p>
          )}
          {surveyComplete ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-6"
            >
              <p className="text-2xl font-heading font-bold">Got it.</p>
              <p className="text-muted-foreground">
                Now you'll have a quick conversation with Lex, an AI guide who'll dig into how AI fits your actual work.
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: direction * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -40 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                <p className="text-xl md:text-2xl font-heading font-semibold leading-snug text-center">
                  {question.text}
                </p>

                <div className="space-y-3">
                  {ANSWER_LABELS.map(({ value, label, description }) => {
                    const isSelected = currentAnswer === value;
                    return (
                      <button
                        key={value}
                        onClick={() => handleAnswer(value)}
                        className={`
                          w-full text-left px-5 py-4 rounded-2xl border-2 transition-all duration-150
                          ${isSelected
                            ? "border-et-pink bg-et-pink/10 shadow-sm"
                            : "border-border bg-card hover:border-muted-foreground/30"
                          }
                        `}
                      >
                        <span className={`text-base font-medium ${isSelected ? "text-et-pink" : "text-foreground"}`}>
                          {label}
                        </span>
                        <span className="text-sm text-muted-foreground ml-2">{description}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Navigation footer */}
      {!surveyComplete && (
        <div className="px-6 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={currentIndex === 0}
            className="min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="min-h-[44px]" />{/* spacer to keep Back aligned left */}
        </div>
      )}
    </div>
  );
}
