import { useLocation } from "wouter";
import { Wordmark } from "@/components/wordmark";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
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
        <h1 className="font-heading text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground text-sm mb-8">Last updated: February 2026</p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">1. Service Description</h2>
        <p className="text-muted-foreground">
          Electric Thinking provides an AI-powered fluency assessment and personalized learning platform.
          By using this service, you agree to these terms.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">2. User Accounts</h2>
        <p className="text-muted-foreground">
          You are responsible for maintaining the security of your account credentials. You must provide accurate
          information during registration. One account per person.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">3. Acceptable Use</h2>
        <p className="text-muted-foreground">
          You agree to use the service for its intended purpose of AI fluency assessment and learning.
          Do not attempt to manipulate assessment results or misuse the platform.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">4. Data and Privacy</h2>
        <p className="text-muted-foreground">
          Your use of the service is also governed by our Privacy Policy. Assessment data is used solely
          for personalized learning and will not be sold or shared for advertising purposes.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">5. Intellectual Property</h2>
        <p className="text-muted-foreground">
          The Electric Thinking assessment framework, skill definitions, and platform are proprietary.
          Your assessment results and conversation transcripts belong to you.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">6. Organization Accounts</h2>
        <p className="text-muted-foreground">
          Organization administrators are responsible for managing their team's access.
          Managers can view skill levels but not conversation transcripts.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">7. Limitation of Liability</h2>
        <p className="text-muted-foreground">
          The service is provided "as is." Electric Thinking is not liable for decisions made based
          on assessment results. Results represent a point-in-time evaluation and should be used as
          one input among many for professional development decisions.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">8. Account Deletion</h2>
        <p className="text-muted-foreground">
          You may request deletion of your account and all associated data at any time through
          the settings page. Deletion will be completed within 30 days.
        </p>

        <h2 className="font-heading text-xl font-semibold mt-8 mb-3">9. Changes to Terms</h2>
        <p className="text-muted-foreground">
          We may update these terms from time to time. Material changes will be communicated
          via email. Continued use after changes constitutes acceptance.
        </p>
      </div>
    </div>
  );
}
