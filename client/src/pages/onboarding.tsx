import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AiPlatform } from "@shared/schema";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [roleTitle, setRoleTitle] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: platforms } = useQuery<AiPlatform[]>({
    queryKey: ["/api/platforms"],
  });

  const handleComplete = async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/auth/me", {
        roleTitle,
        aiPlatform: selectedPlatform,
        onboardingComplete: true,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/assessment/warmup");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Wordmark className="text-2xl" />
        </div>

        {step === 0 && (
          <Card className="rounded-2xl border border-border">
            <CardContent className="pt-8 pb-8">
              <h1 className="font-heading text-2xl font-bold text-center mb-2">
                Welcome, {user.name}!
              </h1>
              <p className="text-muted-foreground text-center mb-8">
                Let's set up your profile before your conversation.
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="role">What's your job title?</Label>
                  <Input
                    id="role"
                    placeholder="e.g. Product Manager, Software Engineer"
                    value={roleTitle}
                    onChange={e => setRoleTitle(e.target.value)}
                    className="rounded-xl"
                    data-testid="input-role-title"
                  />
                </div>
                <Button
                  className="w-full rounded-2xl py-5"
                  onClick={() => setStep(1)}
                  disabled={!roleTitle.trim()}
                  data-testid="button-next-step"
                >
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card className="rounded-2xl border border-border">
            <CardContent className="pt-8 pb-8">
              <h1 className="font-heading text-2xl font-bold text-center mb-2">
                Your AI platform
              </h1>
              <p className="text-muted-foreground text-center mb-8">
                Which AI tool do you use most? You can change this later.
              </p>
              <div className="grid grid-cols-1 gap-3 mb-6">
                {(platforms || []).filter(p => p.isActive).map(platform => (
                  <button
                    key={platform.id}
                    onClick={() => setSelectedPlatform(platform.name)}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left
                      ${selectedPlatform === platform.name
                        ? "border-et-pink bg-et-pink/5"
                        : "border-border hover:border-muted-foreground/30 hover:bg-accent/30"
                      }`}
                    data-testid={`button-platform-${platform.name}`}
                  >
                    {selectedPlatform === platform.name && (
                      <CheckCircle2 className="w-5 h-5 text-et-pink shrink-0" />
                    )}
                    <span className="font-medium">{platform.displayName}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(0)} className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 w-full text-center">{"\u2190"} Back</button>
              <Button
                className="w-full rounded-2xl py-5"
                onClick={handleComplete}
                disabled={!selectedPlatform || loading}
                data-testid="button-complete-onboarding"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Start Conversation <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-center gap-2 mt-6">
          <div className={`w-2 h-2 rounded-full ${step === 0 ? "bg-et-pink" : "bg-muted"}`} />
          <div className={`w-2 h-2 rounded-full ${step === 1 ? "bg-et-pink" : "bg-muted"}`} />
        </div>
      </div>
    </div>
  );
}
