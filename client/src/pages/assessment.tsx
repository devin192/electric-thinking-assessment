import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useVoiceConnection } from "@/hooks/useVoiceConnection";
import {
  Send, Loader2, CheckCircle2, Mic, MicOff, Volume2,
  AlertCircle, RefreshCw, MessageSquare, Phone
} from "lucide-react";
import type { Assessment } from "@shared/schema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Strip bracketed annotations from transcript display:
 *  - AI stage directions like [excited], [empathetic] at start of messages
 *  - Speech-to-text artifacts like [smacks lips], [keyboard clacking] anywhere */
function cleanTranscriptText(msg: ChatMessage): string {
  let text = msg.content;
  if (msg.role === "assistant") {
    text = text.replace(/^\[.*?\]\s*/g, "");
  }
  // Strip speech artifacts from all messages (ElevenLabs transcription noise)
  text = text.replace(/\[(?:lip smacks?|smacks lips?|keyboard clacking|background noise|inaudible|coughs?|laughs?|sighs?|clears throat)\]/gi, "").replace(/\s{2,}/g, " ").trim();
  return text;
}

type VoiceMode = "full-duplex" | "voice-to-text" | "text-only";

export default function AssessmentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoringPhase, setScoringPhase] = useState(0);
  const [scoringFailed, setScoringFailed] = useState(false);
  const isScoringRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();


  const urlParams = new URLSearchParams(window.location.search);
  const requestedMode = urlParams.get("mode");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(requestedMode === "voice" ? "full-duplex" : "text-only");
  const [showFallbackConfirm, setShowFallbackConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  useEffect(() => { document.title = "Conversation — Electric Thinking"; }, []);
  const [showTranscript, setShowTranscript] = useState(requestedMode !== "voice");

  const { data: activeAssessment, isLoading: activeLoading } = useQuery<Assessment | null>({
    queryKey: ["/api/assessment/active"],
    enabled: !!user,
  });

  useEffect(() => {
    if (activeAssessment) {
      setAssessmentId(activeAssessment.id);
      try {
        const parsed = JSON.parse(activeAssessment.transcript || "[]");
        setMessages(parsed);
      } catch { setMessages([]); }
    }
  }, [activeAssessment]);

  // If there's no active (in_progress) assessment, check if user already completed one.
  // This handles the case where a user refreshes during the post-scoring slider/validation phase:
  // the assessment is already "completed" so activeAssessment is null, but we shouldn't
  // start a new assessment -- we should send them to results.
  const { data: latestCompleted } = useQuery<Assessment | null>({
    queryKey: ["/api/assessment/latest"],
    enabled: !!user && !activeAssessment && assessmentId === null,
  });

  useEffect(() => {
    // Don't make redirect decisions until the active assessment query has loaded
    if (activeLoading) return;
    if (!activeAssessment && user && assessmentId === null) {
      // If the user already has a completed assessment, redirect to results
      // instead of starting a new one (they likely refreshed during sliders/validation)
      if (latestCompleted && latestCompleted.status === "completed") {
        navigate("/results");
        return;
      }
      // Only start a new assessment if there's truly no completed one either
      // Redirect to survey first — assessment needs survey data to personalize
      if (latestCompleted === null) {
        navigate("/survey");
      }
    }
  }, [activeAssessment, activeLoading, user, latestCompleted]);

  // ── Voice connection hook ──────────────────────────────────────────
  const handleVoiceFallback = useCallback((opts: { startTextGreeting?: boolean }) => {
    setVoiceMode("text-only");
    setShowTranscript(true);
    if (opts.startTextGreeting && assessmentId) {
      setIsTyping(true);
      apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
        message: "Hi, I'm ready to start my assessment.",
      }).then(async (res) => {
        const msgData = await res.json();
        setMessages(prev => prev.length === 0 ? msgData.messages : prev);
      }).catch(err => { console.warn("Initial message error:", err); })
        .finally(() => setIsTyping(false));
    }
  }, [assessmentId]);

  const {
    voiceConnecting, voiceConnected, voiceError, connectSeconds,
    isMuted, isSpeaking, isListening, setIsMuted,
    connectVoice, disconnectVoice, resetReconnectAttempts, messagesRef,
  } = useVoiceConnection({
    assessmentId,
    activeAssessment: activeAssessment ?? null,
    user: user ?? null,
    toast,
    onTranscriptUpdate: setMessages,
    onVoiceFallback: handleVoiceFallback,
  });

  // Keep the hook's messagesRef in sync with our messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages, messagesRef]);

  // Auto-connect voice when in full-duplex mode with an active assessment
  useEffect(() => {
    if (voiceMode === "full-duplex" && assessmentId && activeAssessment && !voiceConnected && !voiceConnecting && !voiceError) {
      connectVoice();
    }
  }, [voiceMode, assessmentId, activeAssessment, voiceConnected, voiceConnecting, voiceError, connectVoice]);

  // When loading an existing empty assessment in text-only mode, send the initial greeting
  const greetingSentRef = useRef(false);
  useEffect(() => {
    if (
      voiceMode === "text-only" &&
      assessmentId &&
      messages.length === 0 &&
      !isTyping &&
      activeAssessment &&
      !greetingSentRef.current
    ) {
      greetingSentRef.current = true;
      setIsTyping(true);
      apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
        message: "Hi, I'm ready to start my assessment.",
      }).then(async (res) => {
        const data = await res.json();
        setMessages(data.messages);
      }).catch((err) => {
        console.warn("Initial greeting error:", err);
      }).finally(() => setIsTyping(false));
    }
  }, [voiceMode, assessmentId, messages.length, isTyping, activeAssessment]);

  const startAssessment = async () => {
    try {
      const res = await apiRequest("POST", "/api/assessment/start");
      const data = await res.json();
      setAssessmentId(data.id);

      if (!data.transcript || JSON.parse(data.transcript || "[]").length === 0) {
        if (voiceMode === "text-only") {
          setIsTyping(true);
          try {
            const msgRes = await apiRequest("POST", `/api/assessment/${data.id}/message`, {
              message: "Hi, I'm ready to start my assessment.",
            });
            const msgData = await msgRes.json();
            setMessages(msgData.messages);
          } catch (greetErr) {
            console.warn("Initial greeting error:", greetErr);
          }
          setIsTyping(false);
        }
      }
    } catch (err: any) {
      toast({ title: "Error starting conversation", description: err.message, variant: "destructive" });
    }
  };


  const switchToMode = async (mode: VoiceMode) => {
    disconnectVoice();
    setVoiceMode(mode);

    if (mode === "text-only" && messages.length === 0) {
      let id = assessmentId;
      // If assessment hasn't started yet, start it now
      if (!id) {
        try {
          const res = await apiRequest("POST", "/api/assessment/start");
          const data = await res.json();
          id = data.id;
          setAssessmentId(id);
        } catch (err: any) {
          toast({ title: "Error starting conversation", description: err.message, variant: "destructive" });
          return;
        }
      }
      setIsTyping(true);
      apiRequest("POST", `/api/assessment/${id}/message`, {
        message: "Hi, I'm ready to start my assessment.",
      }).then(async (res) => {
        const data = await res.json();
        setMessages(data.messages);
        setIsTyping(false);
      }).catch(() => setIsTyping(false));
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async () => {
    if (!input.trim() || !assessmentId || isTyping) return;
    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsTyping(true);

    try {
      const res = await apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
        message: userMessage,
      });
      const data = await res.json();
      setMessages(data.messages);
    } catch (err: any) {
      // Roll back the optimistic message — it never reached the server
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "user" && last.content === userMessage) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      setInput(userMessage);
      toast({
        title: "Couldn't send message",
        description: "Your earlier progress is saved. Try sending again.",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
      textareaRef.current?.focus();
    }
  };

  const handleEndConversation = async () => {
    if (isScoringRef.current) return;
    isScoringRef.current = true;
    setIsScoring(true);
    setScoringFailed(false);
    if (!assessmentId) {
      console.error("handleEndConversation: no assessmentId");
      isScoringRef.current = false;
      setIsScoring(false);
      toast({
        title: "Something went wrong",
        description: "Please refresh the page and try again.",
        variant: "destructive",
      });
      return;
    }

    if (voiceMode === "full-duplex" && messages.length > 0) {
      try {
        await apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
          message: "__TRANSCRIPT_SAVE__",
          transcript: JSON.stringify(messages),
        });
      } catch (err) { console.warn("Transcript save error:", err); }
    }

    disconnectVoice();
    setScoringPhase(0);

    const phaseTimers: ReturnType<typeof setTimeout>[] = [];
    const phases = [
      { delay: 8000, phase: 1 },
      { delay: 20000, phase: 2 },
      { delay: 40000, phase: 3 },
    ];
    phases.forEach(({ delay, phase }) => {
      phaseTimers.push(setTimeout(() => setScoringPhase(phase), delay));
    });

    const completeScoring = async (id: number) => {
      try {
        await apiRequest("POST", `/api/assessment/${id}/complete`);
      } catch {
        // Scoring may have already completed on the server (e.g. timeout on client
        // but server finished). Check if the assessment is now completed.
        console.warn("Complete endpoint failed, checking if assessment was scored anyway...");
      }
      // Always try to fetch the latest scored assessment
      const latestRes = await apiRequest("GET", "/api/assessment/latest");
      const latestData = await latestRes.json();
      if (latestData && latestData.status === "completed" && latestData.id === id) {
        return latestData;
      }
      throw new Error("Assessment not yet scored");
    };

    try {
      const scored = await completeScoring(assessmentId);
      phaseTimers.forEach(clearTimeout);

      // Invalidate cached queries so results page fetches fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/assessment/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assessment/active"] });
      setIsScoring(false);
      navigate("/results");
    } catch {
      // First attempt failed. Wait a moment and retry once — the server may
      // still be processing (Claude scoring takes 30-60s).
      try {
        await new Promise(r => setTimeout(r, 5000));
        const retryRes = await apiRequest("GET", "/api/assessment/latest");
        const retryData = await retryRes.json();
        if (retryData && retryData.status === "completed" && retryData.id === assessmentId) {
          phaseTimers.forEach(clearTimeout);

          queryClient.invalidateQueries({ queryKey: ["/api/assessment/latest"] });
          queryClient.invalidateQueries({ queryKey: ["/api/assessment/active"] });
          setIsScoring(false);
          navigate("/results");
          return;
        }
      } catch { /* retry also failed */ }

      phaseTimers.forEach(clearTimeout);
      setIsScoring(false);
      setScoringFailed(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-resize textarea as content changes (supports voice-to-text dictation)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [input]);

  if (scoringFailed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Wordmark className="text-xl mb-8 block" />
          <AlertCircle className="w-12 h-12 text-et-orange mx-auto mb-4" />
          <p className="font-heading text-xl font-semibold mb-3">
            Something went wrong with scoring
          </p>
          <p className="text-muted-foreground text-sm mb-6">
            Your conversation has been saved. You can try again and we'll rebuild your results.
          </p>
          <div className="flex flex-col gap-3">
            <Button
              className="min-h-[44px]"
              onClick={() => {
                setScoringFailed(false);
                handleEndConversation();
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button
              variant="ghost"
              className="min-h-[44px]"
              onClick={() => navigate("/dashboard")}
            >
              Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isScoring) {
    const scoringMessages = [
      "Reading your conversation...",
      "Evaluating your thinking patterns...",
      "Building your skill profile...",
      "Almost there...",
    ];

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Wordmark className="text-xl mb-8 block" />
          <div className="w-20 h-20 rounded-full bg-et-pink/15 flex items-center justify-center mx-auto mb-8 animate-pulse-glow">
            <div className="w-10 h-10 rounded-full bg-et-pink/30 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-et-pink" />
            </div>
          </div>
          <div aria-live="polite" aria-atomic="true">
            <p className="font-heading text-xl font-semibold mb-3 animate-fade-up" key={scoringPhase}>
              {scoringMessages[scoringPhase]}
            </p>
          </div>
          <p className="text-muted-foreground text-sm">
            This takes about 30-60 seconds
          </p>
          <div className="w-full max-w-xs mx-auto mt-8 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-et-pink rounded-full transition-all duration-[10000ms] ease-linear"
              style={{ width: `${Math.min(95, (scoringPhase + 1) * 25)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  const userMessageCount = messages.filter(m => m.role === "user" && m.content !== "Hi, I'm ready to start my assessment.").length;
  const canEndConversation = userMessageCount >= 3;

  if (voiceMode === "full-duplex") {
    return (
      <div className="h-dvh-safe flex flex-col bg-background">
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0 bg-background">
          <Wordmark className="text-lg" />
          {canEndConversation ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEndConfirm(true)}
              className="text-muted-foreground min-h-[44px] min-w-[44px]"
              data-testid="button-end-conversation"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              End Conversation
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLeaveConfirm(true)}
              className="text-muted-foreground min-h-[44px] min-w-[44px]"
              data-testid="button-leave"
            >
              Leave
            </Button>
          )}
        </header>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            {voiceConnecting && (
              <div className="text-center" data-testid="voice-connecting">
                <div className="voice-waveform mx-auto mb-6">
                  <div className="voice-bar" /><div className="voice-bar" /><div className="voice-bar" />
                  <div className="voice-bar" /><div className="voice-bar" />
                </div>
                <p className="font-heading text-lg font-semibold mb-2">
                  {connectSeconds < 5
                    ? "Connecting to Lex..."
                    : connectSeconds < 15
                    ? "Still connecting..."
                    : "Taking longer than expected..."}
                </p>
                {connectSeconds >= 15 && (
                  <div className="flex flex-col gap-3 mt-4">
                    <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => { disconnectVoice(); resetReconnectAttempts(); connectVoice(); }} data-testid="button-try-again">
                      <RefreshCw className="w-4 h-4 mr-1" /> Try Again
                    </Button>
                    <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => switchToMode("voice-to-text")} data-testid="button-fallback-vtt">
                      Switch to Voice-to-Text
                    </Button>
                    <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => switchToMode("text-only")} data-testid="button-fallback-text">
                      Continue in Text
                    </Button>
                  </div>
                )}
              </div>
            )}

            {voiceError && (
              <div className="text-center max-w-md" data-testid="voice-error">
                <AlertCircle className="w-12 h-12 text-et-orange mx-auto mb-4" />
                <p className="font-heading text-lg font-semibold mb-2">Having trouble with the voice connection</p>
                <p className="text-sm text-muted-foreground mb-6">We've saved your progress.</p>
                <div className="flex flex-col gap-3">
                  <Button className="min-h-[44px]" onClick={() => { resetReconnectAttempts(); connectVoice(); }} data-testid="button-retry-voice">
                    <RefreshCw className="w-4 h-4 mr-1" /> Try Again
                  </Button>
                  <Button variant="outline" className="min-h-[44px]" onClick={() => switchToMode("voice-to-text")} data-testid="button-switch-vtt">
                    <Mic className="w-4 h-4 mr-1" /> Switch to Voice-to-Text
                  </Button>
                  <Button variant="ghost" className="min-h-[44px]" onClick={() => switchToMode("text-only")} data-testid="button-switch-text">
                    <MessageSquare className="w-4 h-4 mr-1" /> Continue in Text
                  </Button>
                </div>
              </div>
            )}

            {voiceConnected && (
              <div className="text-center" data-testid="voice-active">
                <div className={`voice-waveform mx-auto mb-4 ${isSpeaking ? "voice-speaking" : isListening ? "voice-listening" : ""}`}>
                  <div className="voice-bar" /><div className="voice-bar" /><div className="voice-bar" />
                  <div className="voice-bar" /><div className="voice-bar" /><div className="voice-bar" />
                  <div className="voice-bar" />
                </div>
                <p className="font-heading text-sm text-muted-foreground mb-1">
                  {isSpeaking ? "Lex is speaking..." : isListening ? "Listening..." : "Connected"}
                </p>
                <div className="flex items-center gap-4 justify-center mt-6">
                  <Button
                    variant={isMuted ? "destructive" : "outline"}
                    size="icon"
                    className="rounded-full w-12 h-12"
                    onClick={() => setIsMuted(!isMuted)}
                    aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                    data-testid="button-mute"
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full w-12 h-12 border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => canEndConversation ? setShowEndConfirm(true) : setShowLeaveConfirm(true)}
                    aria-label={canEndConversation ? "End conversation" : "Leave conversation"}
                    data-testid="button-end-voice"
                  >
                    <Phone className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {showTranscript ? (
            <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-border/50 overflow-y-auto p-4 max-h-[40vh] lg:max-h-none" style={{ WebkitOverflowScrolling: "touch" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-heading text-xs uppercase tracking-widest text-muted-foreground">Transcript</p>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setShowTranscript(false)}
                >
                  Hide
                </button>
              </div>
              <div className="space-y-3">
                {messages
                  .filter(m => !(m.role === "user" && m.content === "Hi, I'm ready to start my assessment."))
                  .map((msg, i) => (
                  <div key={i} className={`text-sm ${msg.role === "user" ? "text-right" : "text-left"}`}>
                    <span className={`inline-block rounded-xl px-3 py-2 ${
                      msg.role === "user" ? "bg-et-pink/10 text-foreground" : "bg-accent/50"
                    }`}>
                      {cleanTranscriptText(msg)}
                    </span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          ) : (
            <div className="absolute bottom-20 right-4 lg:static lg:flex lg:items-start lg:border-l lg:border-border/50 lg:p-2">
              <button
                className="text-xs text-muted-foreground hover:text-foreground bg-card border border-border/50 rounded-lg px-3 py-2 shadow-sm"
                onClick={() => setShowTranscript(true)}
                data-testid="button-show-transcript"
              >
                <MessageSquare className="w-3 h-3 inline mr-1" />
                Show transcript
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border/50 px-4 py-2 text-center shrink-0">
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline min-h-[44px] px-4 inline-flex items-center"
            onClick={() => switchToMode("voice-to-text")}
            data-testid="link-trouble-voice"
          >
            Having trouble with live voice?
          </button>
        </div>

        <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">End your conversation?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Once we end, we'll build your results. You won't be able to add more to this conversation.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setShowEndConfirm(false)}>
                Keep talking
              </Button>
              <Button className="flex-1 min-h-[44px]" onClick={() => { setShowEndConfirm(false); handleEndConversation(); }}>
                End & see results
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">Leave the conversation?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Your progress has been saved. You can come back and continue later, but we need at least 3 responses for accurate results.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setShowLeaveConfirm(false)}>
                Stay
              </Button>
              <Button className="flex-1 min-h-[44px]" onClick={() => { setShowLeaveConfirm(false); disconnectVoice(); navigate("/assessment/warmup"); }}>
                Leave
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (voiceMode === "voice-to-text") {
    return (
      <div className="h-dvh-safe flex flex-col bg-background">
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0 bg-background">
          <Wordmark className="text-lg" />
          {canEndConversation ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEndConfirm(true)}
              className="text-muted-foreground min-h-[44px] min-w-[44px]"
              data-testid="button-end-conversation"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              End Conversation
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLeaveConfirm(true)}
              className="text-muted-foreground min-h-[44px] min-w-[44px]"
              data-testid="button-leave"
            >
              Leave
            </Button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="max-w-2xl mx-auto space-y-6">
            {messages
              .filter(m => !(m.role === "user" && m.content === "Hi, I'm ready to start my assessment."))
              .map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-up`}
                data-testid={`message-${msg.role}-${i}`}
              >
                <div
                  className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-3.5 ${
                    msg.role === "user"
                      ? "bg-et-pink text-white rounded-br-md"
                      : "bg-card border border-border rounded-bl-md"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{cleanTranscriptText(msg)}</p>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start animate-fade-up">
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot-1" />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot-2" />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot-3" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-border/50 p-4 shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-3">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Speak or type your message..."
                className="rounded-xl resize-none min-h-[48px] max-h-[40vh] overflow-y-auto"
                rows={1}
                disabled={isTyping}
                aria-label="Message to Lex"
                data-testid="input-message"
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() || isTyping}
                className="rounded-xl shrink-0 min-h-[44px] min-w-[44px]"
                data-testid="button-send"
              >
                {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <div className="text-center mt-2">
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline min-h-[44px] px-4 inline-flex items-center"
                onClick={() => setShowFallbackConfirm(true)}
                data-testid="link-no-audio"
              >
                My device doesn't support audio
              </button>
            </div>
          </div>
        </div>

        <Dialog open={showFallbackConfirm} onOpenChange={setShowFallbackConfirm}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">Switch to text-only?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Voice mode gives you the best experience, but text works fine too. Choose whichever you prefer.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setShowFallbackConfirm(false)}>
                Stay in Voice Mode
              </Button>
              <Button className="flex-1 min-h-[44px]" onClick={() => { setShowFallbackConfirm(false); switchToMode("text-only"); }}>
                Continue in Text
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">End your conversation?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Once we end, we'll build your results. You won't be able to add more to this conversation.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setShowEndConfirm(false)}>
                Keep talking
              </Button>
              <Button className="flex-1 min-h-[44px]" onClick={() => { setShowEndConfirm(false); handleEndConversation(); }}>
                End & see results
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">Leave the conversation?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Your progress has been saved. You can come back and continue later, but we need at least 3 responses for accurate results.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setShowLeaveConfirm(false)}>
                Stay
              </Button>
              <Button className="flex-1 min-h-[44px]" onClick={() => { setShowLeaveConfirm(false); disconnectVoice(); navigate("/assessment/warmup"); }}>
                Leave
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="h-dvh-safe flex flex-col bg-background">
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0 bg-background">
        <Wordmark className="text-lg" />
        {canEndConversation ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEndConfirm(true)}
            className="text-muted-foreground min-h-[44px] min-w-[44px]"
            data-testid="button-end-conversation"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            End Conversation
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLeaveConfirm(true)}
            className="text-muted-foreground min-h-[44px] min-w-[44px]"
            data-testid="button-leave"
          >
            Leave
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="max-w-2xl mx-auto space-y-6">
          {messages
            .filter(m => !(m.role === "user" && m.content === "Hi, I'm ready to start my assessment."))
            .map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-up`}
              data-testid={`message-${msg.role}-${i}`}
            >
              <div
                className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-3.5 ${
                  msg.role === "user"
                    ? "bg-et-pink text-white rounded-br-md"
                    : "bg-card border border-border rounded-bl-md"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{cleanTranscriptText(msg)}</p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start animate-fade-up">
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-5 py-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot-1" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot-2" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot-3" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-border/50 p-4 shrink-0">
        <div className="max-w-2xl mx-auto flex items-end gap-3">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="rounded-xl resize-none min-h-[48px] max-h-[40vh] overflow-y-auto"
            rows={1}
            disabled={isTyping}
            aria-label="Message to Lex"
            data-testid="input-message"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isTyping}
            className="rounded-xl shrink-0 min-h-[44px] min-w-[44px]"
            data-testid="button-send"
          >
            {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

        <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">End your conversation?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Once we end, we'll build your results. You won't be able to add more to this conversation.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setShowEndConfirm(false)}>
                Keep talking
              </Button>
              <Button className="flex-1 min-h-[44px]" onClick={() => { setShowEndConfirm(false); handleEndConversation(); }}>
                End & see results
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">Leave the conversation?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Your progress has been saved. You can come back and continue later, but we need at least 3 responses for accurate results.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setShowLeaveConfirm(false)}>
                Stay
              </Button>
              <Button className="flex-1 min-h-[44px]" onClick={() => { setShowLeaveConfirm(false); disconnectVoice(); navigate("/assessment/warmup"); }}>
                Leave
              </Button>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}
