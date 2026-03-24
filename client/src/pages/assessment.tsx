import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wordmark } from "@/components/wordmark";
import { AssessmentValidation } from "@/components/assessment-validation";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getSharedAudioContext, getSharedMediaStream, clearSharedAudio } from "@/lib/audio-context";
import {
  Send, Loader2, CheckCircle2, Mic, MicOff, Volume2,
  AlertCircle, RefreshCw, MessageSquare, Phone
} from "lucide-react";
import type { Assessment, Level, Skill, UserSkillStatus } from "@shared/schema";

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
type PostScoringPhase = "none" | "results";

export default function AssessmentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoringPhase, setScoringPhase] = useState(0);
  const [scoringFailed, setScoringFailed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Post-scoring state
  const [postScoringPhase, setPostScoringPhase] = useState<PostScoringPhase>("none");
  const [scoredAssessment, setScoredAssessment] = useState<Assessment | null>(null);
  const [confirming, setConfirming] = useState(false);

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
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showTranscript, setShowTranscript] = useState(requestedMode !== "voice");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const connectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const voiceConnectedRef = useRef<boolean>(false);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 3;

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const { data: activeAssessment } = useQuery<Assessment | null>({
    queryKey: ["/api/assessment/active"],
    enabled: !!user,
  });

  // Queries for post-scoring phase
  const { data: levels } = useQuery<Level[]>({ queryKey: ["/api/levels"] });
  const { data: allSkills } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const { data: userSkills } = useQuery<UserSkillStatus[]>({
    queryKey: ["/api/user/skills"],
    enabled: !!user && postScoringPhase !== "none",
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
    if (!activeAssessment && user && assessmentId === null) {
      // If the user already has a completed assessment, redirect to results
      // instead of starting a new one (they likely refreshed during sliders/validation)
      if (latestCompleted && latestCompleted.status === "completed") {
        navigate("/results");
        return;
      }
      // Only start a new assessment if there's truly no completed one either
      if (latestCompleted === null) {
        startAssessment();
      }
    }
  }, [activeAssessment, user, latestCompleted]);

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
        audioContextRef.current = new AudioCtx();
        audioContextRef.current.resume();
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

      let activityReceived = false;

      ws.onopen = () => {
        clearInterval(timer);
        connectTimerRef.current = null;
        setVoiceConnecting(false);
        setVoiceConnected(true);
        voiceConnectedRef.current = true;
        setIsListening(true);
        reconnectAttemptsRef.current = 0;

        // Send survey context to ElevenLabs agent as dynamic variables
        if (activeAssessment?.surveyResponsesJson) {
          try {
            const surveyData = activeAssessment.surveyResponsesJson as Record<string, number>;
            const userName = user?.name || "";
            const roleTitle = user?.roleTitle || "";
            const aiPlatform = user?.aiPlatform || "";
            const surveyLevel = (activeAssessment as any).surveyLevel ?? 0;
            const levelNames = ["Accelerator", "Thought Partner", "Specialized Teammates", "Agentic Workflow"];

            // Build readable survey summary
            const strong = Object.entries(surveyData).filter(([, v]) => v === 2).map(([k]) => k);
            const sometimes = Object.entries(surveyData).filter(([, v]) => v === 1).map(([k]) => k);
            const never = Object.entries(surveyData).filter(([, v]) => v === 0).map(([k]) => k);

            const surveySummary = [
              `Approximate level: ${levelNames[surveyLevel]} (Level ${surveyLevel + 1} of 4)`,
              strong.length > 0 ? `Always does: ${strong.join(", ")}` : "",
              sometimes.length > 0 ? `Sometimes does: ${sometimes.join(", ")}` : "",
              never.length > 0 ? `Never does: ${never.join(", ")}` : "",
            ].filter(Boolean).join(". ");

            ws.send(JSON.stringify({
              type: "conversation_initiation_client_data",
              dynamic_variables: {
                user_name: userName,
                role_title: roleTitle,
                ai_platform: aiPlatform,
                survey_level: String(surveyLevel + 1),
                survey_level_name: levelNames[surveyLevel] || "Accelerator",
                survey_summary: surveySummary,
              },
            }));
          } catch (e) {
            console.warn("Failed to send survey context to voice agent:", e);
          }
        }

        // If no agent response within 15s of connecting, auto-fallback to text
        const activityTimeout = setTimeout(() => {
          if (!activityReceived && voiceConnectedRef.current) {
            console.warn("No voice activity after 15s, falling back to text");
            ws.close();
            toast({ title: "Voice connected but not responding", description: "Starting in text mode instead." });
            setVoiceMode("text-only");
            setShowTranscript(true);
          }
        }, 15000);
        ws.addEventListener("close", () => clearTimeout(activityTimeout));

        const ctx = audioContextRef.current!;
        const nativeSampleRate = ctx.sampleRate;
        const targetSampleRate = 16000;
        const ratio = nativeSampleRate / targetSampleRate;

        const audioRecorder = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        audioRecorder.connect(processor);
        processor.connect(ctx.destination);

        processor.onaudioprocess = (e) => {
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
            activityReceived = true;
            setIsSpeaking(true);
          }

          if (data.type === "agent_response" && data.agent_response_event === "agent_response_correction") {
            activityReceived = true;
            setIsSpeaking(true);
          }

          if (data.type === "audio") {
            activityReceived = true;
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

          if (data.agent_response_event?.agent_response_correction) {
            const text = data.agent_response_event.agent_response_correction;
            setMessages(prev => {
              const lastIdx = prev.length - 1;
              if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
                return [...prev.slice(0, lastIdx), { role: "assistant", content: text }];
              }
              return [...prev, { role: "assistant", content: text }];
            });
          }

          if (data.type === "interruption") {
            flushAudioQueue();
            setIsSpeaking(false);
          }

          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", event_id: data.ping_event?.event_id }));
          }
        } catch (err) { console.warn("WebSocket message error:", err); }
      };

      ws.onclose = (event) => {
        setVoiceConnected(false);
        voiceConnectedRef.current = false;
        setIsListening(false);
        setIsSpeaking(false);

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
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
      };

      ws.onerror = () => {
        clearInterval(timer);
        reconnectAttemptsRef.current = maxReconnectAttempts; // prevent onclose from reconnecting
        setVoiceConnecting(false);
        setVoiceConnected(false);
        voiceConnectedRef.current = false;
        stream.getTracks().forEach(t => t.stop());
        // Auto-fallback to text mode instead of showing error screen
        toast({ title: "Voice isn't available right now", description: "Starting in text mode instead." });
        setVoiceMode("text-only");
        setShowTranscript(true);
      };

      const timeout = setTimeout(() => {
        if (!voiceConnectedRef.current && ws.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = maxReconnectAttempts; // prevent onclose from reconnecting
          ws.close();
          setVoiceConnecting(false);
          stream.getTracks().forEach(t => t.stop());
          // Auto-fallback to text mode instead of showing timeout error
          toast({ title: "Voice connection timed out", description: "Starting in text mode instead." });
          setVoiceMode("text-only");
          setShowTranscript(true);
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
      const isVoiceUnavailable = msg.includes("not configured") || msg.includes("agent ID") || msg.includes("temporarily unavailable") || msg.includes("500:");
      if (isVoiceUnavailable) {
        toast({ title: "Voice isn't available right now", description: "Starting in text mode instead." });
        setVoiceMode("text-only");
        if (assessmentId) {
          setIsTyping(true);
          try {
            const msgRes = await apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
              message: "Hi, I'm ready to start my assessment.",
            });
            const msgData = await msgRes.json();
            setMessages(prev => prev.length === 0 ? msgData.messages : prev);
          } catch (err) { console.warn("Initial message error:", err); }
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
    } catch (err) { console.warn("Audio playback error:", err); }
  };

  const flushAudioQueue = () => {
    nextPlayTimeRef.current = 0;
  };

  const saveTranscript = async () => {
    const currentMessages = messagesRef.current;
    if (!assessmentId || currentMessages.length === 0) return;
    try {
      await apiRequest("POST", `/api/assessment/${assessmentId}/message`, {
        message: "__TRANSCRIPT_SAVE__",
        transcript: JSON.stringify(currentMessages),
      });
    } catch (err) { console.warn("Transcript save error:", err); }
  };

  const disconnectVoice = () => {
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
    voiceConnectedRef.current = false;
    setIsListening(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => { disconnectVoice(); };
  }, []);

  const switchToMode = async (mode: VoiceMode) => {
    disconnectVoice();
    setVoiceMode(mode);
    setVoiceError(null);
    setVoiceConnecting(false);

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
    if (isScoring) return;
    setScoringFailed(false);
    if (!assessmentId) {
      console.error("handleEndConversation: no assessmentId");
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
    setIsScoring(true);
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
      if (latestData && latestData.status === "completed") {
        return latestData;
      }
      throw new Error("Assessment not yet scored");
    };

    try {
      const scored = await completeScoring(assessmentId);
      phaseTimers.forEach(clearTimeout);
      setScoredAssessment(scored);
      setIsScoring(false);
      navigate("/results");
    } catch {
      // First attempt failed. Wait a moment and retry once — the server may
      // still be processing (Claude scoring takes 30-60s).
      try {
        await new Promise(r => setTimeout(r, 5000));
        const retryRes = await apiRequest("GET", "/api/assessment/latest");
        const retryData = await retryRes.json();
        if (retryData && retryData.status === "completed") {
          phaseTimers.forEach(clearTimeout);
          setScoredAssessment(retryData);
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

  const handleConfirm = async (adjustedScores: Record<number, number>) => {
    if (!assessmentId) return;
    setConfirming(true);
    try {
      // POST to confirm endpoint with adjusted scores
      await apiRequest("POST", `/api/assessment/${assessmentId}/confirm`, {
        adjustedScores,
      });
    } catch {
      // Confirm endpoint may fail; user still sees AI-scored results
    }
    setConfirming(false);
    navigate("/results");
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

  // === POST-SCORING: Combined results + sliders screen ===
  if (postScoringPhase === "results" && scoredAssessment && levels && allSkills) {
    const scoresJson = (scoredAssessment.scoresJson || {}) as Record<string, { status: string; explanation: string }>;
    const assessmentLevel = scoredAssessment.assessmentLevel ?? 0;
    const levelInfo = levels.find(l => l.sortOrder === assessmentLevel);
    const firstMove = (scoredAssessment.firstMoveJson || {}) as { skillName?: string; suggestion?: string };

    let brightSpots: string[] = [];
    try {
      const raw = (scoredAssessment as any)?.brightSpotsText;
      if (raw) {
        const parsed = JSON.parse(raw);
        brightSpots = Array.isArray(parsed) ? parsed : [raw];
      }
    } catch {
      const raw = (scoredAssessment as any)?.brightSpotsText;
      if (raw) brightSpots = [raw];
    }

    // Detect foundational gaps: skills from levels below that are red/yellow
    const foundationalGaps: string[] = [];
    if (assessmentLevel >= 2 && allSkills && levels) {
      for (const skill of allSkills) {
        const lvl = levels.find(l => l.id === skill.levelId);
        if (!lvl || lvl.sortOrder >= assessmentLevel) continue;
        const userStatus = userSkills?.find(us => us.skillId === skill.id);
        const status = userStatus?.status || scoresJson[skill.name]?.status || "red";
        if (status === "red" || status === "yellow") {
          foundationalGaps.push(skill.name);
        }
      }
    }

    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 px-6 py-3 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-md">
          <Wordmark className="text-lg" />
        </header>
        <div className="max-w-xl mx-auto px-6 py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key="results"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <AssessmentValidation
                assessmentLevel={assessmentLevel}
                levelInfo={levelInfo}
                brightSpots={brightSpots}
                firstMove={firstMove}
                foundationalGaps={foundationalGaps.length > 0 ? foundationalGaps.slice(0, 4) : undefined}
                onConfirm={handleConfirm}
                confirming={confirming}
                skills={allSkills}
                levels={levels}
                userSkills={userSkills || []}
                scoresJson={scoresJson}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  if (scoringFailed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Wordmark className="text-xl mb-8 block" />
          <AlertCircle className="w-12 h-12 text-et-orange mx-auto mb-4" />
          <p className="font-heading text-xl font-semibold mb-3">
            Scoring is taking longer than expected
          </p>
          <p className="text-muted-foreground text-sm mb-6">
            Your conversation has been saved. Let's try getting your results again.
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
              Go to Dashboard
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
      <div className="h-dvh-safe flex flex-col bg-background">
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0 bg-background">
          <Wordmark className="text-lg" />
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
                    onClick={() => setShowEndConfirm(true)}
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
      </div>
    );
  }

  if (voiceMode === "voice-to-text") {
    return (
      <div className="h-dvh-safe flex flex-col bg-background">
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0 bg-background">
          <Wordmark className="text-lg" />
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
                className="rounded-xl resize-none min-h-[48px] max-h-[40vh] overflow-y-auto"
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
      </div>
    );
  }

  return (
    <div className="h-dvh-safe flex flex-col bg-background">
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-4 shrink-0 bg-background">
        <Wordmark className="text-lg" />
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
            className="rounded-xl resize-none min-h-[48px] max-h-[40vh] overflow-y-auto"
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
    </div>
  );
}
