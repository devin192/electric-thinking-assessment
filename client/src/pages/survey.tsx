import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// 20 survey questions — 5 per level, shown sequentially without level labels
const SURVEY_QUESTIONS = [
  // Level 1 — Accelerator
  { skillName: "Context Setting", text: "I brief AI with my role, the task, and relevant background before asking it to do something" },
  { skillName: "Quick Drafting", text: "I use AI to create first drafts of emails, docs, or written content" },
  { skillName: "Output Editing & Direction", text: "When AI output isn't right, I redirect it — adjusting tone, structure, or specificity" },
  { skillName: "Voice-First Capture", text: "I use voice to capture thoughts, dictate drafts, or recap meetings with AI" },
  { skillName: "In-the-Moment Support", text: "When I hit friction at work, my reflex is to reach for AI" },
  // Level 2 — Thought Partner
  { skillName: "Interview Me", text: "I let AI lead with questions to surface my assumptions before I commit to a direction" },
  { skillName: "Rapid Ideation", text: "I use AI to generate multiple options before picking one" },
  { skillName: "Challenge Me", text: "I ask AI to find holes, counterarguments, or blind spots in my thinking" },
  { skillName: "Decision Mapping", text: "I use AI to structure trade-offs, run scenarios, or apply decision frameworks" },
  { skillName: "Operationalize This", text: "I use AI to turn strategy into concrete execution plans with steps and owners" },
  // Level 3 — Specialized Teammates
  { skillName: "Pattern Spotting", text: "I notice when a repeating task should become a reusable AI tool" },
  { skillName: "Workflow Scoping", text: "I break tasks into inputs, steps, and expected outputs before building an AI tool" },
  { skillName: "Instruction Design", text: "I write system prompts or instructions that produce consistent, reliable AI output" },
  { skillName: "Testing & Refinement", text: "I test my AI tools with real inputs and iterate through edge cases" },
  { skillName: "Knowledge Embedding", text: "I attach reference docs or domain context so AI has what it needs to be accurate" },
  // Level 4 — Agentic Workflow
  { skillName: "Systems Mapping", text: "I design end-to-end workflows, not just individual AI tasks" },
  { skillName: "Automation Design", text: "I build workflows where AI handles steps without me" },
  { skillName: "Independent Judgment", text: "I know which steps in a workflow need a human decision vs. can run autonomously" },
  { skillName: "Cross-Workflow Integration", text: "I connect multiple AI-powered processes together" },
  { skillName: "Continuous Improvement", text: "I monitor, measure, and refine my automated AI systems over time" },
];

type Answer = 0 | 1 | 2; // 0=Never, 1=Sometimes, 2=Always
const ANSWER_LABELS: { value: Answer; label: string; description: string }[] = [
  { value: 0, label: "Never", description: "I don't do this" },
  { value: 1, label: "Sometimes", description: "I do this occasionally" },
  { value: 2, label: "Always", description: "This is a regular habit" },
];

function calculateSurveyLevel(answers: Record<string, number>): number {
  // 5 questions per level, levels mapped by index ranges
  const levelRanges = [
    SURVEY_QUESTIONS.slice(0, 5),   // Level 0 (Accelerator)
    SURVEY_QUESTIONS.slice(5, 10),  // Level 1 (Thought Partner)
    SURVEY_QUESTIONS.slice(10, 15), // Level 2 (Specialized Teammates)
    SURVEY_QUESTIONS.slice(15, 20), // Level 3 (Agentic Workflow)
  ];

  let highestLevel = 0;
  for (let i = 0; i < levelRanges.length; i++) {
    const levelScore = levelRanges[i].reduce((sum, q) => sum + (answers[q.skillName] || 0), 0);
    // Level is achieved if score >= 6 out of 10 (mostly Sometimes/Always)
    if (levelScore >= 6) {
      highestLevel = i;
    }
  }
  return highestLevel;
}

function buildSurveySummary(answers: Record<string, number>): string {
  const levelNames = ["Accelerator", "Thought Partner", "Specialized Teammates", "Agentic Workflow"];
  const levelRanges = [
    SURVEY_QUESTIONS.slice(0, 5),
    SURVEY_QUESTIONS.slice(5, 10),
    SURVEY_QUESTIONS.slice(10, 15),
    SURVEY_QUESTIONS.slice(15, 20),
  ];

  const lines: string[] = [];
  for (let i = 0; i < levelRanges.length; i++) {
    const skills = levelRanges[i];
    const strong = skills.filter(q => answers[q.skillName] === 2).map(q => q.skillName);
    const sometimes = skills.filter(q => answers[q.skillName] === 1).map(q => q.skillName);
    const never = skills.filter(q => answers[q.skillName] === 0).map(q => q.skillName);
    const score = skills.reduce((sum, q) => sum + (answers[q.skillName] || 0), 0);

    lines.push(`${levelNames[i]} (${score}/10):`);
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
  const [direction, setDirection] = useState(1); // 1=forward, -1=back

  const total = SURVEY_QUESTIONS.length;
  const question = SURVEY_QUESTIONS[currentIndex];
  const currentAnswer = answers[question.skillName];
  const progress = Object.keys(answers).length;

  const handleAnswer = useCallback((value: Answer) => {
    setAnswers(prev => ({ ...prev, [question.skillName]: value }));

    // Auto-advance after a short delay
    setTimeout(() => {
      if (currentIndex < total - 1) {
        setDirection(1);
        setCurrentIndex(prev => prev + 1);
      }
    }, 300);
  }, [currentIndex, total, question.skillName]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const handleSubmit = useCallback(async () => {
    if (progress < total) return;
    setSubmitting(true);
    try {
      const surveyLevel = calculateSurveyLevel(answers);
      // Create assessment with survey data
      await apiRequest("POST", "/api/assessment/start", {
        surveyResponsesJson: answers,
        surveyLevel,
      });
      navigate("/assessment/warmup");
    } catch (err) {
      console.error("Failed to save survey:", err);
      setSubmitting(false);
    }
  }, [answers, progress, total, navigate]);

  if (!user) return null;

  const isLast = currentIndex === total - 1;
  const allAnswered = progress === total;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between">
        <Wordmark className="text-lg" />
        <span className="text-sm text-muted-foreground">{progress} of {total}</span>
      </header>

      {/* Progress bar */}
      <div className="px-6">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-et-pink rounded-full"
            initial={false}
            animate={{ width: `${(progress / total) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Question area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Question text */}
              <p className="text-xl md:text-2xl font-heading font-semibold leading-snug text-center">
                {question.text}
              </p>

              {/* Answer options */}
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
        </div>
      </div>

      {/* Navigation footer */}
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

        {isLast && allAnswered ? (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-2xl px-6 py-5 min-h-[44px]"
          >
            {submitting ? "Saving..." : "Continue to conversation"} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (currentIndex < total - 1) {
                setDirection(1);
                setCurrentIndex(prev => prev + 1);
              }
            }}
            disabled={currentIndex >= total - 1}
            className="min-h-[44px]"
          >
            Skip <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
