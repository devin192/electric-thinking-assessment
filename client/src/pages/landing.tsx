import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { MessageCircle, TrendingUp, Shield, ArrowRight, Brain, Target } from "lucide-react";

export default function LandingPage() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      navigate(user.userRole === "system_admin" ? "/admin" : "/dashboard");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Wordmark className="text-xl" />
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")} data-testid="link-login">
              Log in
            </Button>
            <Button size="sm" onClick={() => navigate("/register")} data-testid="link-register">
              Get Started
            </Button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 tracking-tight">
            Find out where you are{" "}
            <span className="text-et-pink">with AI</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            A quick survey and a conversation with an AI guide. In under 15 minutes, you'll know exactly where you stand and what to do next.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="text-base px-8 py-6 rounded-2xl"
              onClick={() => navigate("/register")}
              data-testid="button-get-started"
            >
              Take the Assessment
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-base px-8 py-6 rounded-2xl border-2"
              onClick={() => navigate("/join")}
              data-testid="button-join-team"
            >
              Join Your Team
            </Button>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="p-8 rounded-2xl border border-border">
            <div className="w-12 h-12 rounded-xl bg-et-cyan/15 flex items-center justify-center mb-5">
              <MessageCircle className="w-6 h-6 text-et-cyan" />
            </div>
            <h3 className="font-heading text-lg font-semibold mb-3">Know exactly where you stand</h3>
            <p className="text-muted-foreground leading-relaxed">
              A quick survey and a conversation map your AI skills across 4 levels. No guessing.
              You'll see your strengths and the gaps you didn't know you had.
            </p>
          </Card>
          <Card className="p-8 rounded-2xl border border-border">
            <div className="w-12 h-12 rounded-xl bg-et-gold/20 flex items-center justify-center mb-5">
              <Target className="w-6 h-6 text-et-orange" />
            </div>
            <h3 className="font-heading text-lg font-semibold mb-3">Get the one skill that matters most</h3>
            <p className="text-muted-foreground leading-relaxed">
              Stop wondering what to learn next. Walk away with a specific, actionable first move
              matched to your role, your tools, and your actual workflow.
            </p>
          </Card>
          <Card className="p-8 rounded-2xl border border-border">
            <div className="w-12 h-12 rounded-xl bg-et-green/15 flex items-center justify-center mb-5">
              <TrendingUp className="w-6 h-6 text-et-green" />
            </div>
            <h3 className="font-heading text-lg font-semibold mb-3">Walk away with a plan</h3>
            <p className="text-muted-foreground leading-relaxed">
              Three personalized outcomes tied to your actual work, plus one thing you can try right now.
              Not generic advice — specific to you.
            </p>
          </Card>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-center mb-12">
            Four levels of AI fluency
          </h2>
          <div className="space-y-4">
            {[
              { level: 0, name: "Accelerator", color: "bg-et-gold", desc: "Using AI to speed up everyday work" },
              { level: 1, name: "Thought Partner", color: "bg-et-pink", desc: "AI as a collaborative thinking partner" },
              { level: 2, name: "Specialized Teammates", color: "bg-et-orange", desc: "Building reusable AI tools" },
              { level: 3, name: "Agentic Workflow", color: "bg-et-blue", desc: "Designing autonomous AI systems" },
            ].map(item => (
              <div key={item.level} className="flex items-center gap-4 p-4 rounded-xl bg-card">
                <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center text-white font-heading font-bold text-sm shrink-0`}>
                  {item.level + 1}
                </div>
                <div className="min-w-0">
                  <div className="font-heading font-semibold">{item.name}</div>
                  <div className="text-sm text-muted-foreground">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <Card className="p-8 md:p-12 rounded-2xl border border-border">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 rounded-lg bg-et-blue/15 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-et-blue" />
            </div>
            <h2 className="font-heading text-2xl font-bold">How We Handle Your Data</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 text-muted-foreground">
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-et-green mt-2 shrink-0" />
                <span>Your conversation is private. Only you see your full results.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-et-green mt-2 shrink-0" />
                <span>Your data is stored securely and encrypted.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-et-green mt-2 shrink-0" />
                <span>No advertising, no profiling, no data selling. Ever.</span>
              </li>
            </ul>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-et-green mt-2 shrink-0" />
                <span>Used only to personalize your assessment results.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-et-green mt-2 shrink-0" />
                <span>Request a copy or deletion of your data by contacting us.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-et-green mt-2 shrink-0" />
                <span>Full privacy policy and terms available for review.</span>
              </li>
            </ul>
          </div>
        </Card>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <Card className="p-8 md:p-12 rounded-2xl border-2 border-et-pink/20 bg-gradient-to-br from-et-pink/5 to-transparent text-center">
          <div className="w-14 h-14 rounded-2xl bg-et-pink/15 flex items-center justify-center mx-auto mb-6">
            <Brain className="w-7 h-7 text-et-pink" />
          </div>
          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-4">
            Under 15 minutes to know where you're at and what to focus on next
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            No trick questions. Just a short survey and a real conversation about how you work.
          </p>
          <Button
            size="lg"
            className="text-base px-8 py-6 rounded-2xl"
            onClick={() => navigate("/register")}
            data-testid="button-cta-bottom"
          >
            Find Out Where You Stand
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </Card>
      </section>

      <footer className="border-t border-border/50 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <Wordmark className="text-base" />
          <div className="flex items-center gap-6 flex-wrap">
            <a href="/privacy" className="text-et-blue underline" data-testid="link-privacy">Privacy Policy</a>
            <a href="/terms" className="text-et-blue underline" data-testid="link-terms">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
