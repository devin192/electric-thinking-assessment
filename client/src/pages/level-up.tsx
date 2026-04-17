import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, CheckCircle2, ArrowUp, ArrowDown } from "lucide-react";

interface LevelInfo {
  currentLevel: number;
  currentLevelName: string;
  nextLevel: number | null;
  nextLevelName: string | null;
  nextLevelSkills: Array<{ id: number; name: string; description: string | null }>;
  canGoDown: boolean;
  prevLevel: number | null;
  prevLevelName: string | null;
}

export default function LevelUpPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ level: number; name: string } | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);

  // Extract token from URL query string
  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    document.title = "Level Up — Electric Thinking";
  }, []);

  useEffect(() => {
    if (!token) {
      setError("Missing token");
      setLoading(false);
      return;
    }
    const fetchLevelInfo = async () => {
      try {
        const res = await fetch(`/api/user/level-info?token=${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "Invalid or expired link");
          setLoading(false);
          return;
        }
        const data: LevelInfo = await res.json();
        setLevelInfo(data);
        setLoading(false);
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    };
    fetchLevelInfo();
  }, [token]);

  const handleLevelChange = async (direction: "up" | "down") => {
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/user/level-up", { token, direction });
      const data: LevelInfo = await res.json();
      setSuccess({ level: data.currentLevel, name: data.currentLevelName });
      setLevelInfo(data);
      toast({ title: direction === "up" ? "You leveled up!" : "Level adjusted" });
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
          <h1 className="font-heading text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (success && levelInfo) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 px-6 py-4">
          <Wordmark className="text-lg" />
        </header>
        <div className="max-w-md mx-auto px-6 py-16 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h1 className="font-heading text-xl font-bold mb-2">
            You're now Level {success.level}!
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {success.name} — your next nudges will be at this level.
          </p>
          {levelInfo.canGoDown && (
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                setSuccess(null);
              }}
            >
              Change my level
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!levelInfo) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4">
        <Wordmark className="text-lg" />
      </header>

      <div className="max-w-md mx-auto px-6 py-8">
        <h1 className="font-heading text-2xl font-bold mb-2">Level Up</h1>
        <p className="text-sm text-muted-foreground mb-6">
          You're currently <strong>Level {levelInfo.currentLevel}</strong> ({levelInfo.currentLevelName}).
        </p>

        {levelInfo.nextLevel && levelInfo.nextLevelName && (
          <Card className="rounded-2xl border border-border mb-6">
            <CardHeader className="pb-2">
              <h2 className="font-heading font-semibold">
                Ready for Level {levelInfo.nextLevel}?
              </h2>
              <p className="text-sm text-muted-foreground">
                {levelInfo.nextLevelName}
              </p>
            </CardHeader>
            <CardContent>
              {levelInfo.nextLevelSkills.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium mb-2">
                    Skills we'd expect you to be practicing:
                  </p>
                  <ul className="space-y-2">
                    {levelInfo.nextLevelSkills.map((skill) => (
                      <li key={skill.id} className="text-sm">
                        <span className="font-medium">{skill.name}</span>
                        {skill.description && (
                          <span className="text-muted-foreground"> — {skill.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button
                className="w-full rounded-2xl"
                onClick={() => handleLevelChange("up")}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ArrowUp className="w-4 h-4 mr-2" />
                )}
                I'm ready — level me up
              </Button>
            </CardContent>
          </Card>
        )}

        {!levelInfo.nextLevel && (
          <Card className="rounded-2xl border border-border mb-6">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">
                You're at the highest level. Nice work.
              </p>
            </CardContent>
          </Card>
        )}

        {levelInfo.canGoDown && levelInfo.prevLevelName && (
          <Button
            variant="outline"
            className="w-full rounded-2xl"
            onClick={() => handleLevelChange("down")}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowDown className="w-4 h-4 mr-2" />
            )}
            Go back to Level {levelInfo.prevLevel} ({levelInfo.prevLevelName})
          </Button>
        )}
      </div>
    </div>
  );
}
