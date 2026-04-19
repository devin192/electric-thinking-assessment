import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, Pause, Play } from "lucide-react";

interface NudgeStatus {
  name: string | null;
  email: string;
  nudgesActive: boolean;
  emailPrefsNudges: boolean;
  currentLevel: number | null;
}

export default function NudgeControlPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<NudgeStatus | null>(null);

  // Extract token from URL query string
  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    document.title = "Nudge Control — Electric Thinking";
  }, []);

  useEffect(() => {
    if (!token) {
      setError("Missing token");
      setLoading(false);
      return;
    }
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/user/nudge-status?token=${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "Invalid or expired link");
          setLoading(false);
          return;
        }
        const data: NudgeStatus = await res.json();
        setStatus(data);
        setLoading(false);
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    };
    fetchStatus();
  }, [token]);

  const handleToggle = async () => {
    if (!token || !status) return;
    const action = status.nudgesActive ? "pause" : "resume";
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/user/nudge-pause", { token, action });
      const data: NudgeStatus = await res.json();
      setStatus(data);
      toast({
        title: data.nudgesActive ? "Nudges resumed" : "Nudges paused",
        description: data.nudgesActive
          ? "You'll start getting them again."
          : "You won't get any until you resume.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 px-6 py-4">
          <Wordmark className="text-lg" />
        </header>
        <div className="max-w-md mx-auto px-6 py-16 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-heading text-xl font-bold mb-2" data-testid="text-error-title">Something went wrong</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-error-description">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const isPaused = !status.nudgesActive;
  const firstName = status.name?.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4">
        <Wordmark className="text-lg" />
      </header>

      <div className="max-w-md mx-auto px-6 py-8">
        <h1 className="font-heading text-2xl font-bold mb-2" data-testid="text-page-title">
          Hey {firstName}
        </h1>
        <p className="text-sm text-muted-foreground mb-6" data-testid="text-status-display">
          You're currently <strong>{isPaused ? "paused" : "receiving nudges"}</strong>.
        </p>

        <Card className="rounded-2xl border border-border mb-6">
          <CardHeader className="pb-2">
            <h2 className="font-heading font-semibold">
              {isPaused ? "Ready to start again?" : "Need a break?"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isPaused
                ? "Resume to start getting nudges again. You'll pick up where you left off."
                : "Pause means no nudge emails. You can resume anytime — nothing is lost."}
            </p>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full rounded-2xl"
              onClick={handleToggle}
              disabled={submitting}
              data-testid={isPaused ? "button-resume-nudges" : "button-pause-nudges"}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : isPaused ? (
                <Play className="w-4 h-4 mr-2" />
              ) : (
                <Pause className="w-4 h-4 mr-2" />
              )}
              {isPaused ? "Resume nudges" : "Pause nudges"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/70 bg-muted/30 mb-6">
          <CardContent className="pt-6">
            <p className="text-sm font-medium mb-2">Pause vs. unsubscribe</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Pause</strong> stops the emails but keeps your account and preferences intact.
              Resume anytime. <strong>Unsubscribe</strong> is different — it fully opts you out of
              this email type.
            </p>
          </CardContent>
        </Card>

        <div className="text-center">
          <a
            href={`/unsubscribe/${token}`}
            className="text-xs text-muted-foreground underline hover:text-foreground"
            data-testid="link-full-unsubscribe"
          >
            Want to fully opt out? Manage email preferences
          </a>
        </div>
      </div>
    </div>
  );
}
