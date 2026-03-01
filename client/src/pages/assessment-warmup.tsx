import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { setSharedAudioContext, setSharedMediaStream } from "@/lib/audio-context";
import { Mic, Shield, Clock, ArrowRight, Loader2, MessageSquare } from "lucide-react";

export default function AssessmentWarmup() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);

  const { data: voiceStatus } = useQuery<{ available: boolean }>({
    queryKey: ["/api/assessment/voice-available"],
    enabled: !!user,
  });

  const voiceAvailable = voiceStatus?.available ?? false;

  const handleStartText = () => {
    navigate("/assessment");
  };

  const handleStartVoice = async () => {
    setChecking(true);
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) throw new Error("Audio not supported");

      const ctx = new AudioCtx();
      await ctx.resume();
      setSharedAudioContext(ctx);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setSharedMediaStream(stream);
    } catch {
      setChecking(false);
      navigate("/assessment");
      return;
    }
    setChecking(false);
    navigate("/assessment?mode=voice");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Wordmark className="text-xl" />
        </div>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-8 pb-8">
            <div className="w-14 h-14 rounded-2xl bg-et-pink/15 flex items-center justify-center mx-auto mb-6">
              <Mic className="w-7 h-7 text-et-pink" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-center mb-3" data-testid="text-warmup-title">
              Here's what's about to happen
            </h1>
            <p className="text-muted-foreground text-center mb-8">
              You'll have a conversation with an AI that wants to learn how you work. There are no wrong answers — just be yourself.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/50">
                <MessageSquare className="w-5 h-5 text-et-pink mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Chat-based assessment</div>
                  <div className="text-sm text-muted-foreground">
                    You'll type your responses in a chat with an AI guide who wants to understand how you use AI.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/50">
                <Clock className="w-5 h-5 text-et-cyan mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">About 10 minutes</div>
                  <div className="text-sm text-muted-foreground">
                    Shorter if you're just getting started, a bit longer if you're advanced.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/50">
                <Shield className="w-5 h-5 text-et-green mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Your answers are private</div>
                  <div className="text-sm text-muted-foreground">
                    {user?.orgId
                      ? "Your manager can see your skill levels and progress. They cannot hear this conversation or see your specific answers."
                      : "Your conversation transcript is private and only visible to you."}
                  </div>
                </div>
              </div>
            </div>

            <Button
              className="w-full rounded-2xl py-6 text-base"
              onClick={handleStartText}
              data-testid="button-start-text"
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Start Assessment <ArrowRight className="w-5 h-5 ml-2" />
            </Button>

            {voiceAvailable && (
              <Button
                variant="outline"
                className="w-full rounded-2xl py-5 text-sm mt-3"
                onClick={handleStartVoice}
                disabled={checking}
                data-testid="button-start-voice"
              >
                {checking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                Or start with voice instead
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
