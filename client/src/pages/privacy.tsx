import { useLocation } from "wouter";
import { Wordmark } from "@/components/wordmark";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-muted-foreground" data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Wordmark className="text-lg" />
      </header>
      <div className="max-w-2xl mx-auto px-6 py-10 prose prose-sm">
        <h1 className="font-heading text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-8">Last updated: March 2026</p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">What We Collect</h2>
        <ul className="text-muted-foreground space-y-2">
          <li>Assessment conversation transcript</li>
          <li>Skill scores and level placement</li>
          <li>Role and context information you share</li>
          <li>Email address and name</li>
          <li>AI platform preference</li>
        </ul>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">How It's Stored</h2>
        <p className="text-muted-foreground">
          Your data is stored in an encrypted PostgreSQL database hosted on infrastructure that is independently SOC 2 Type II certified.
          All data is encrypted at rest and in transit.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">Who Can See What</h2>
        <ul className="text-muted-foreground space-y-2">
          <li><strong>You:</strong> See all your own data, including transcript, scores, and learning history.</li>
          <li><strong>Your Manager:</strong> Can see your skill scores and levels. Cannot see your conversation transcript or specific answers. Your responses are private.</li>
          <li><strong>System Admin:</strong> Can see aggregate analytics and access individual data for support purposes.</li>
        </ul>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">What It's Used For</h2>
        <p className="text-muted-foreground">
          Your data is used exclusively for personalized learning content. No advertising, no profiling, no selling. Ever.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">Third-Party Services</h2>
        <ul className="text-muted-foreground space-y-2">
          <li><strong>Anthropic (Claude):</strong> AI analysis of assessment conversations and coaching. Anthropic does not train on API data.</li>
          <li><strong>ElevenLabs:</strong> Voice conversation processing (if you choose the voice option). Audio is processed in real-time and not stored by ElevenLabs after the session.</li>
          <li><strong>Resend:</strong> Email delivery for account notifications and Power Ups.</li>
        </ul>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">Data Retention</h2>
        <p className="text-muted-foreground">
          Data is retained while your account is active. Upon deletion request, all data is removed within 30 days.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">Your Rights</h2>
        <ul className="text-muted-foreground space-y-2">
          <li>Request a copy of your data by contacting support</li>
          <li>Request deletion of your account and data (processed within 30 days)</li>
          <li>Pause or stop Power Ups at any time</li>
        </ul>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">Enterprise Note</h2>
        <p className="text-muted-foreground">
          Hosted on independently SOC 2 Type II certified infrastructure with data encrypted at rest and in transit.
        </p>
      </div>
    </div>
  );
}
