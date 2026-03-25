import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { setSharedAudioContext, setSharedMediaStream } from "@/lib/audio-context";
import { Mic, Shield, Clock, ArrowRight, Loader2, MessageSquare } from "lucide-react";
import { useEffect } from "react";

export default function AssessmentWarmup() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);

  const { data: voiceStatus } = useQuery<{ available: boolean }>({
    queryKey: ["/api/assessment/voice-available"],
    enabled: !!user,
  });

  useEffect(() => { document.title = "Get Ready — Electric Thinking"; }, []);

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
      toast({ title: "Couldn't access your microphone", description: "Starting in text mode instead." });
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
            <h1 className="font-heading text-2xl font-bold text-center mb-2" data-testid="text-warmup-title">
              Got it. Now let's talk.
            </h1>
            <p className="text-muted-foreground text-center text-sm mb-6">
              Your personalized results are on the other side.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/50">
                <Mic className="w-5 h-5 text-et-pink mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">A quick conversation with Lex, your AI guide</div>
                  <div className="text-sm text-muted-foreground">
                    Based on your survey, Lex will dig into how AI fits your actual work.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/50">
                <Clock className="w-5 h-5 text-et-cyan mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">About 8-10 minutes</div>
                  <div className="text-sm text-muted-foreground">
                    At the end, you'll get your level and personalized outcomes.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/50">
                <Shield className="w-5 h-5 text-et-green mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Your answers are private</div>
                  <div className="text-sm text-muted-foreground">
                    {user?.orgId
                      ? "Your manager sees your skill levels, not your conversation."
                      : "Only you can see your conversation."}
                  </div>
                </div>
              </div>
            </div>

            {voiceAvailable ? (
              <>
                <Button
                  className="w-full rounded-2xl py-6 text-base"
                  onClick={handleStartVoice}
                  disabled={checking}
                  data-testid="button-start-voice"
                >
                  {checking ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
                  Start with Voice <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <button
                  className="w-full text-center text-sm text-muted-foreground mt-4 hover:text-foreground transition-colors min-h-[44px] inline-flex items-center justify-center"
                  onClick={handleStartText}
                  data-testid="button-start-text"
                >
                  Having trouble with audio? Use text instead
                </button>
              </>
            ) : (
              <Button
                className="w-full rounded-2xl py-6 text-base"
                onClick={handleStartText}
                data-testid="button-start-text"
              >
                <MessageSquare className="w-5 h-5 mr-2" />
                Start Your Conversation <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
