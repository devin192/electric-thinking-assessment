import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getSharedAudioContext, getSharedMediaStream, clearSharedAudio } from "@/lib/audio-context";
import {
  Send, Loader2, LogOut, Mic, MicOff, Volume2,
  AlertCircle, RefreshCw, MessageSquare, Phone
} from "lucide-react";
import type { Assessment } from "@shared/schema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Strip stage directions like [excited], [empathetic] from the start of AI messages */
function stripStageDirections(msg: ChatMessage): string {
  if (msg.role === "assistant") {
    return msg.content.replace(/^\[.*?\]\s*/g, "");
  }
  return msg.content;
}

type VoiceMode = "full-duplex" | "voice-to-text" | "text-only";

export default function AssessmentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoringPhase, setScoringPhase] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const urlParams = new URLSearchParams(window.location.search);
  const requestedMode = urlParams.get("mode");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(requestedMode === "voice" ? "full-duplex" : "text-only");
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [connectSeconds, setConnectSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showFallbackConfirm, setShowFallbackConfirm] = useState(false);
  const [showTranscript, setShowTranscript] = useState(requestedMode !== "voice");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const connectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  // MOBILE FIX: Use a ref for isMuted so the ScriptProcessor callback reads
  // the current value instead of capturing a stale closure value.
  const isMutedRef = useRef<boolean>(false);
  // MOBILE FIX: Reconnection state for cellular network resilience.
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 3;

  // Keep the muted ref in sync with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const { data: activeAssessment } = useQuery<Assessment | null>({
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

  useEffect(() => {
    if (!activeAssessment && user && assessmentId === null) {
      startAssessment();
    }
  }, [activeAssessment, user]);

  const startAssessment = async () => {
    try {
      const res = await apiRequest("POST", "/api/assessment/start");
      const data = await res.json();
      setAssessmentId(data.id);

      if (!data.transcript || JSON.parse(data.transcript || "[]").length === 0) {
        if (voiceMode === "text-only") {
          setIsTyping(true);
          const msgRes = await apiRequest("POST", `/api/assessment/${data.id}/message`, {
            message: "Hi, I'm ready to start my assessment.",
          });
          const msgData = await msgRes.json();
          setMessages(msgData.messages);
          setIsTyping(false);
        }
      }
    } catch (err: any) {
      toast({ title: "Error starting conversation", description: err.message, variant: "destructive" });
    }
  };

  const connectVoice = useCallback(async () => {
    if (!assessmentId) return;
    setVoiceConnecting(true);
    setVoiceError(null);
    setConnectSeconds(0);

    const timer = setInterval(() => {
      setConnectSeconds(prev => prev + 1);
    }, 1000);
    connectTimerRef.current = timer;

    try {
      const preCtx = getSharedAudioContext();
      const preStream = getSharedMediaStream();

      if (preCtx && preStream) {
        audioContextRef.current = preCtx;
        mediaStreamRef.current = preStream;
        clearSharedAudio();
      } else {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) throw new Error("AudioContext not supported");
        // MOBILE FIX: Create AudioContext synchronously in the gesture chain.
        // Call resume() immediately (not deferred) for iOS autoplay compliance.
        audioContextRef.current = new AudioCtx();
        audioContextRef.current.resume();
        // MOBILE FIX: Request mic with echo cancellation and noise suppression
        // for better quality on mobile devices with built-in speakers.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        mediaStreamRef.current = stream;
      }

      const stream = mediaStreamRef.current!;

      // MOBILE FIX: Re-check AudioContext state. iOS may suspend it if there
      // was a delay between creation and use (e.g., network request above).
      if (audioContextRef.current!.state === "suspended") {
        await audioContextRef.current!.resume();
      }

      const tokenRes = await apiRequest("GET", "/api/assessment/voice-token");
      const tokenData = await tokenRes.json();

      if (!tokenData.signedUrl) {
        throw new Error(tokenData.message || "Could not get voice connection");
      }

      const ws = new WebSocket(tokenData.signedUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        clearInterval(timer);
        connectTimerRef.current = null;
        setVoiceConnecting(false);
        setVoiceConnected(true);
        setIsListening(true);
        // Reset reconnection counter on successful connect
        reconnectAttemptsRef.current = 0;

        const ctx = audioContextRef.current!;
        const nativeSampleRate = ctx.sampleRate;
        const targetSampleRate = 16000;
        const ratio = nativeSampleRate / targetSampleRate;

        const audioRecorder = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        audioRecorder.connect(processor);
        processor.connect(ctx.destination);

        processor.onaudioprocess = (e) => {
          // MOBILE FIX: Read from ref instead of closure to avoid stale mute state.
          // The original code captured `isMuted` from the useCallback closure,
          // which never updated when the user toggled mute.
          if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);

          const outputLength = Math.floor(inputData.length / ratio);
          const pcm16 = new Int16Array(outputLength);
          for (let i = 0; i < outputLength; i++) {
            const srcIndex = Math.floor(i * ratio);
            const sample = inputData[srcIndex];
            pcm16[i] = Math.max(-32768, Math.min(32767, sample * 32768));
          }

          const bytes = new Uint8Array(pcm16.buffer);
          let base64 = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            base64 += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
          }
          ws.send(JSON.stringify({ user_audio_chunk: btoa(base64) }));
        };
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "agent_response" && data.agent_response_event === "agent_response") {
            setIsSpeaking(true);
          }

          if (data.type === "agent_response" && data.agent_response_event === "agent_response_correction") {
            setIsSpeaking(true);
          }

          if (data.type === "audio") {
            setIsSpeaking(true);
            playAudioChunk(data.audio_event?.audio_base_64 || data.audio);
          }

          if (data.user_transcription_event) {
            const text = data.user_transcription_event.user_transcript;
            const isFinal = data.user_transcription_event.is_final;
            if (text && text.trim()) {
              setMessages(prev => {
                const lastIdx = prev.length - 1;
                const last = prev[lastIdx];
                if (last?.role === "user") {
                  return [...prev.slice(0, lastIdx), { role: "user", content: text }];
                }
                return [...prev, { role: "user", content: text }];
              });
            }
          }

          if (data.agent_response_event?.agent_response) {
            const text = data.agent_response_event.agent_response;
            setMessages(prev => [...prev, { role: "assistant", content: text }]);
          }

          if (data.type === "interruption") {
            flushAudioQueue();
            setIsSpeaking(false);
          }

          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", event_id: data.ping_event?.event_id }));
          }
        } catch {}
      };

      ws.onclose = (event) => {
        setVoiceConnected(false);
        setIsListening(false);
        setIsSpeaking(false);

        // MOBILE FIX: Automatic reconnection with exponential backoff for cellular.
        // Mobile networks drop idle WebSocket connections aggressively. Codes 1000
        // and 1001 are normal closures and should not trigger reconnection.
        const isAbnormalClose = event.code !== 1000 && event.code !== 1001;
        if (isAbnormalClose && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 8000);
          console.log(`WebSocket closed unexpectedly (code ${event.code}). Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          setTimeout(() => {
            connectVoice();
          }, delay);
          return;
        }

        saveTranscript();
        // MOBILE FIX: Clean up mic stream when WebSocket closes.
        // Without this, the mic stays open (red indicator on iOS) after the
        // conversation ends, which is confusing and drains battery.
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
      };

      ws.onerror = () => {
        clearInterval(timer);
        setVoiceConnecting(false);
        setVoiceConnected(false);
        setVoiceError("Voice connection failed. Your progress is saved.");
        stream.getTracks().forEach(t => t.stop());
      };

      const timeout = setTimeout(() => {
        if (!voiceConnected && ws.readyState !== WebSocket.OPEN) {
          ws.close();
          setVoiceConnecting(false);
          setVoiceError("Connection timed out. Try again or use an alternative mode.");
          stream.getTracks().forEach(t => t.stop());
        }
      }, 20000);

      ws.addEventListener("open", () => clearTimeout(timeout));

    } catch (err: any) {
      clearInterval(timer);
      connectTimerRef.current = null;
      setVoiceConnecting(false);

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      const msg = err.message || "Failed to connect voice";
      if (msg.includes("not configured") || msg.includes("agent ID")) {
        toast({ title: "Voice isn't set up yet, continuing in text" });
        setVoiceMode("text-only");
        if (assessmentId) {
          setIsTyping(true);
          try {
            const msgRes = await apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
              message: "Hi, I'm ready to start my assessment.",
            });
            const msgData = await msgRes.json();
            setMessages(prev => prev.length === 0 ? msgData.messages : prev);
          } catch {}
          setIsTyping(false);
        }
      } else {
        setVoiceError(msg);
      }
    }
  }, [assessmentId]);

  useEffect(() => {
    if (voiceMode === "full-duplex" && assessmentId && !voiceConnected && !voiceConnecting && !voiceError) {
      connectVoice();
    }
  }, [voiceMode, assessmentId]);

  const playAudioChunk = (base64Audio: string) => {
    if (!base64Audio || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;

      // MOBILE FIX: Resume AudioContext if iOS suspended it (e.g., phone call
      // interruption, app backgrounding, or control center interaction).
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;

      const buffer = ctx.createBuffer(1, float32.length, 16000);
      buffer.getChannelData(0).set(float32);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextPlayTimeRef.current);
      nextPlayTimeRef.current = startTime + buffer.duration;

      source.onended = () => {
        if (ctx.currentTime >= nextPlayTimeRef.current - 0.05) {
          setIsSpeaking(false);
        }
      };

      setIsSpeaking(true);
      source.start(startTime);
    } catch {}
  };

  const flushAudioQueue = () => {
    nextPlayTimeRef.current = 0;
  };

  const saveTranscript = async () => {
    if (!assessmentId || messages.length === 0) return;
    try {
      await apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
        message: "__TRANSCRIPT_SAVE__",
        transcript: JSON.stringify(messages),
      });
    } catch {}
  };

  const disconnectVoice = () => {
    // Prevent reconnection after intentional disconnect
    reconnectAttemptsRef.current = maxReconnectAttempts;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (connectTimerRef.current) {
      clearInterval(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    flushAudioQueue();
    setVoiceConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => { disconnectVoice(); };
  }, []);

  const switchToMode = (mode: VoiceMode) => {
    disconnectVoice();
    setVoiceMode(mode);
    setVoiceError(null);
    setVoiceConnecting(false);

    if (mode === "text-only" && messages.length === 0 && assessmentId) {
      setIsTyping(true);
      apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
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
      toast({
        title: "Connection issue",
        description: "Your progress has been saved. Try sending again.",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
      textareaRef.current?.focus();
    }
  };

  const handleEndConversation = async () => {
    if (!assessmentId) return;

    if (voiceMode === "full-duplex" && messages.length > 0) {
      try {
        await apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
          message: "__TRANSCRIPT_SAVE__",
          transcript: JSON.stringify(messages),
        });
      } catch {}
    }

    disconnectVoice();
    setIsScoring(true);

    const phases = [
      { delay: 0, phase: 0 },
      { delay: 8000, phase: 1 },
      { delay: 20000, phase: 2 },
      { delay: 40000, phase: 3 },
    ];
    phases.forEach(({ delay, phase }) => {
      setTimeout(() => setScoringPhase(phase), delay);
    });

    try {
      await apiRequest("POST", `/api/assessment/${assessmentId}/complete`);
      setTimeout(() => { navigate("/results"); }, 1500);
    } catch {
      setIsScoring(false);
      toast({
        title: "Scoring in progress",
        description: "Your results are being calculated. We'll notify you when ready.",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

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
          <p className="font-heading text-xl font-semibold mb-3 animate-fade-up" key={scoringPhase}>
            {scoringMessages[scoringPhase]}
          </p>
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

  if (voiceMode === "full-duplex") {
    return (
      <div className="h-screen flex flex-col bg-background">
        {/* MOBILE FIX: min-h-[44px] on all interactive elements for touch targets */}
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0">
          <Wordmark className="text-lg" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEndConversation}
            className="text-muted-foreground min-h-[44px] min-w-[44px]"
            data-testid="button-end-conversation"
          >
            <LogOut className="w-4 h-4 mr-2" />
            End Conversation
          </Button>
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
                    ? "Connecting to your conversation guide..."
                    : connectSeconds < 15
                    ? "Still connecting..."
                    : "Taking longer than expected..."}
                </p>
                {connectSeconds >= 15 && (
                  <div className="flex flex-col gap-3 mt-4">
                    <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => { disconnectVoice(); reconnectAttemptsRef.current = 0; connectVoice(); }} data-testid="button-try-again">
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
                  <Button className="min-h-[44px]" onClick={() => { setVoiceError(null); reconnectAttemptsRef.current = 0; connectVoice(); }} data-testid="button-retry-voice">
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
                  {isSpeaking ? "AI is speaking..." : isListening ? "Listening..." : "Connected"}
                </p>
                {/* MOBILE FIX: gap-4 instead of gap-3 for 8px+ spacing between touch targets */}
                <div className="flex items-center gap-4 justify-center mt-6">
                  <Button
                    variant={isMuted ? "destructive" : "outline"}
                    size="icon"
                    className="rounded-full w-12 h-12"
                    onClick={() => setIsMuted(!isMuted)}
                    data-testid="button-mute"
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full w-12 h-12 border-destructive text-destructive hover:bg-destructive/10"
                    onClick={handleEndConversation}
                    data-testid="button-end-voice"
                  >
                    <Phone className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Transcript panel: collapsed by default in voice mode */}
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
                      {stripStageDirections(msg)}
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
          {/* MOBILE FIX: min-h-[44px] for touch target on text link */}
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline min-h-[44px] px-4 inline-flex items-center"
            onClick={() => switchToMode("voice-to-text")}
            data-testid="link-trouble-voice"
          >
            Having trouble with live voice?
          </button>
        </div>
      </div>
    );
  }

  if (voiceMode === "voice-to-text") {
    return (
      <div className="h-screen flex flex-col bg-background">
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0">
          <Wordmark className="text-lg" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEndConversation}
            className="text-muted-foreground min-h-[44px] min-w-[44px]"
            data-testid="button-end-conversation"
          >
            <LogOut className="w-4 h-4 mr-2" />
            End Conversation
          </Button>
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
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{stripStageDirections(msg)}</p>
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
                className="rounded-xl resize-none min-h-[48px] max-h-[160px]"
                rows={1}
                disabled={isTyping}
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

        {/* MOBILE FIX: max-h-[90vh] overflow-y-auto on dialog for small screen scrollability */}
        <Dialog open={showFallbackConfirm} onOpenChange={setShowFallbackConfirm}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">Switch to text-only?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              We strongly recommend voice for this experience. Voice-to-text builds a critical AI skill. If your device truly doesn't support audio, you can continue in text.
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
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0">
        <Wordmark className="text-lg" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEndConversation}
          className="text-muted-foreground min-h-[44px] min-w-[44px]"
          data-testid="button-end-conversation"
        >
          <LogOut className="w-4 h-4 mr-2" />
          End Conversation
        </Button>
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
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{stripStageDirections(msg)}</p>
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
            className="rounded-xl resize-none min-h-[48px] max-h-[160px]"
            rows={1}
            disabled={isTyping}
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
    </div>
  );
}
