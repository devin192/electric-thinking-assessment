// ⚠️ CRITICAL PATH — Voice connection logic
// Changes here have caused production regressions 3+ times (stale closures,
// duplicate agents, stuck connections). Before modifying:
// 1. Run: npx vitest run tests/critical-paths.test.ts
// 2. Check all useCallback/useEffect dependency arrays
// 3. Verify reconnect reuses signedUrlRef (not requesting new URL)
// 4. Test on mobile Safari (iOS WebKit has different WebSocket behavior)

import { useState, useRef, useEffect, useCallback } from "react";
import { createElement } from "react";
import * as Sentry from "@sentry/react";
import { apiRequest } from "@/lib/queryClient";
import { getSharedAudioContext, getSharedMediaStream, clearSharedAudio } from "@/lib/audio-context";
import { ToastAction } from "@/components/ui/toast";
import type { Assessment } from "@shared/schema";
import type { ToastActionElement } from "@/components/ui/toast";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseVoiceConnectionParams {
  assessmentId: number | null;
  activeAssessment: Assessment | null | undefined;
  user: { name?: string | null; roleTitle?: string | null; aiPlatform?: string | null } | null;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive"; action?: ToastActionElement }) => void;
  onTranscriptUpdate: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onVoiceFallback: (opts: { startTextGreeting?: boolean }) => void;
}

interface UseVoiceConnectionReturn {
  voiceConnecting: boolean;
  voiceConnected: boolean;
  voiceError: string | null;
  connectSeconds: number;
  isMuted: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  connectVoice: (isReconnect?: boolean) => Promise<void>;
  disconnectVoice: () => void;
  resetReconnectAttempts: () => void;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
}

const MAX_RECONNECT_ATTEMPTS = 3;

export function useVoiceConnection({
  assessmentId,
  activeAssessment,
  user,
  toast,
  onTranscriptUpdate,
  onVoiceFallback,
}: UseVoiceConnectionParams): UseVoiceConnectionReturn {
  // ── State ──────────────────────────────────────────────────────────
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [connectSeconds, setConnectSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const connectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const signedUrlRef = useRef<string | null>(null);
  const connectingLockRef = useRef<boolean>(false);
  const nextPlayTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const voiceConnectedRef = useRef<boolean>(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const reconnectAttemptsRef = useRef<number>(0);

  // Voice quality metrics
  const sessionStartTimeRef = useRef<number | null>(null);
  const timeToFirstAudioRef = useRef<number | null>(null);
  const reconnectCountRef = useRef<number>(0);
  const metricsReportedRef = useRef<boolean>(false);

  // Keep refs for values that callbacks read without re-creation
  const assessmentIdRef = useRef(assessmentId);
  const activeAssessmentRef = useRef(activeAssessment);
  const userRef = useRef(user);
  const toastRef = useRef(toast);
  const onTranscriptUpdateRef = useRef(onTranscriptUpdate);
  const onVoiceFallbackRef = useRef(onVoiceFallback);

  // ── Sync refs to latest values ─────────────────────────────────────
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { assessmentIdRef.current = assessmentId; }, [assessmentId]);
  useEffect(() => { activeAssessmentRef.current = activeAssessment; }, [activeAssessment]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { onTranscriptUpdateRef.current = onTranscriptUpdate; }, [onTranscriptUpdate]);
  useEffect(() => { onVoiceFallbackRef.current = onVoiceFallback; }, [onVoiceFallback]);

  // ── Audio helpers ──────────────────────────────────────────────────
  const playAudioChunk = useCallback((base64Audio: string) => {
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
  }, []);

  const flushAudioQueue = useCallback(() => {
    nextPlayTimeRef.current = 0;
  }, []);

  // ── Transcript save ────────────────────────────────────────────────
  const saveTranscript = useCallback(async () => {
    const currentMessages = messagesRef.current;
    const id = assessmentIdRef.current;
    if (!id || currentMessages.length === 0) return;
    try {
      await apiRequest("POST", `/api/assessment/${id}/message`, {
        message: "__TRANSCRIPT_SAVE__",
        transcript: JSON.stringify(currentMessages),
      });
    } catch (err) { console.warn("Transcript save error:", err); }
  }, []);

  // ── Voice quality metrics report ───────────────────────────────────
  const reportVoiceMetrics = useCallback(async () => {
    const id = assessmentIdRef.current;
    if (!id || metricsReportedRef.current) return;
    metricsReportedRef.current = true;

    const payload: Record<string, number> = {};
    if (timeToFirstAudioRef.current !== null) {
      payload.timeToFirstAudio = timeToFirstAudioRef.current;
    }
    payload.reconnectCount = reconnectCountRef.current;
    if (sessionStartTimeRef.current !== null) {
      payload.totalSessionDuration = Date.now() - sessionStartTimeRef.current;
    }

    try {
      await apiRequest("POST", `/api/assessment/${id}/voice-metrics`, payload);
    } catch (err) { console.warn("Voice metrics report error:", err); }
  }, []);

  // ── Disconnect ─────────────────────────────────────────────────────
  const disconnectVoice = useCallback(() => {
    // DIAGNOSTIC: record who called disconnect and what state we were in.
    // Helps diagnose "AudioContext null on ws.onopen" — we need to know if
    // disconnect fires between connectVoice assigning the AC and ws.onopen firing.
    try {
      Sentry.addBreadcrumb({
        category: "voice",
        message: "disconnectVoice called",
        level: "info",
        data: {
          wsReadyState: wsRef.current?.readyState ?? "no-ws",
          acState: audioContextRef.current?.state ?? "no-ac",
          voiceConnected: voiceConnectedRef.current,
        },
      });
    } catch { /* breadcrumb failure must not block cleanup */ }

    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;

    // Report voice quality metrics before tearing down
    reportVoiceMetrics();

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
      try {
        Sentry.addBreadcrumb({
          category: "voice",
          message: "AudioContext cleared (disconnectVoice)",
          level: "info",
        });
      } catch { /* breadcrumb failure */ }
    }
    if (connectTimerRef.current) {
      clearInterval(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    flushAudioQueue();
    setVoiceConnecting(false);
    setVoiceConnected(false);
    voiceConnectedRef.current = false;
    setIsListening(false);
    setIsSpeaking(false);
  }, [flushAudioQueue, reportVoiceMetrics]);

  // ── Issue reporting helper ────────────────────────────────────────
  const reportVoiceIssue = useCallback((errorMessage: string) => {
    const conn = (navigator as any).connection;
    fetch("/api/report-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: errorMessage,
        assessmentId: assessmentIdRef.current,
        browser: navigator.userAgent,
        timestamp: new Date().toISOString(),
        connectionType: conn?.effectiveType || conn?.type || null,
      }),
    }).catch(() => { /* silent */ });
  }, []);

  const makeReportAction = useCallback(
    (errorMessage: string) =>
      createElement(ToastAction, {
        altText: "Report issue",
        onClick: () => reportVoiceIssue(errorMessage),
      }, "Report issue") as unknown as ToastActionElement,
    [reportVoiceIssue]
  );

  // ── Connect ────────────────────────────────────────────────────────
  // Uses refs for all values read inside WebSocket callbacks to avoid
  // stale closures. The useCallback has no deps that change — all
  // mutable state is accessed via refs.
  const connectVoice = useCallback(async (isReconnect = false) => {
    const currentAssessmentId = assessmentIdRef.current;
    if (!currentAssessmentId) return;

    // Prevent concurrent connectVoice calls (stale closure + reconnect race)
    if (connectingLockRef.current) return;
    connectingLockRef.current = true;

    // Close any existing WebSocket before creating a new one.
    // Without this, reconnects leave the old socket open — both sockets
    // then receive audio from ElevenLabs and play simultaneously,
    // causing the "multiple Lex voices" bug.
    if (wsRef.current) {
      const stale = wsRef.current;
      wsRef.current = null;
      stale.onclose = null; // suppress reconnect logic on the old socket
      stale.onerror = null;
      if (stale.readyState === WebSocket.OPEN || stale.readyState === WebSocket.CONNECTING) {
        stale.close();
      }
    }
    // Reset voice metrics for a fresh session (not reconnects)
    if (!isReconnect) {
      sessionStartTimeRef.current = null;
      timeToFirstAudioRef.current = null;
      reconnectCountRef.current = 0;
      metricsReportedRef.current = false;
    }

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
        try {
          Sentry.addBreadcrumb({
            category: "voice",
            message: "AudioContext assigned from warmup singleton",
            level: "info",
            data: { acState: preCtx.state, isReconnect },
          });
        } catch { /* breadcrumb */ }
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
        try {
          Sentry.addBreadcrumb({
            category: "voice",
            message: "AudioContext created fresh (no warmup singleton)",
            level: "info",
            data: { acState: audioContextRef.current?.state, isReconnect },
          });
        } catch { /* breadcrumb */ }
      }

      const stream = mediaStreamRef.current!;

      if (audioContextRef.current!.state === "suspended") {
        await audioContextRef.current!.resume();
      }

      // MOBILE/RACE FIX: capture the AudioContext and stream in closure variables.
      // If something (React cleanup, mode switch, etc) nulls audioContextRef.current
      // between here and ws.onopen, we can still use these captured references —
      // provided they haven't been closed or stopped.
      const capturedCtx = audioContextRef.current!;
      const capturedStream = mediaStreamRef.current!;

      // On reconnect, reuse the same signed URL to avoid spawning a new agent instance
      // (each new signed URL = new ElevenLabs conversation = repeated opening message)
      let signedUrl = isReconnect ? signedUrlRef.current : null;
      if (!signedUrl) {
        const tokenRes = await apiRequest("GET", "/api/assessment/voice-token");
        const tokenData = await tokenRes.json();
        if (!tokenData.signedUrl) {
          throw new Error(tokenData.message || "Could not get voice connection");
        }
        signedUrl = tokenData.signedUrl;
        signedUrlRef.current = signedUrl;
      }

      // MOBILE DIAGNOSTIC: Validate URL scheme + log breadcrumb before opening socket.
      // iOS Safari rejects non-wss:// WebSockets; this catches bad tokens early
      // and gives Sentry context for the next failure.
      const signedUrlStr = signedUrl!;
      if (!signedUrlStr.startsWith("wss://")) {
        Sentry.captureMessage("Voice signed URL missing wss:// scheme", {
          level: "warning",
          extra: { protocol: signedUrlStr.split(":")[0] },
        });
        throw new Error("Invalid voice URL scheme");
      }
      try {
        Sentry.addBreadcrumb({
          category: "voice",
          message: "Opening voice WebSocket",
          level: "info",
          data: {
            host: new URL(signedUrlStr).host,
            isReconnect,
            connectionType: (navigator as any).connection?.effectiveType || "unknown",
            visibility: document.visibilityState,
            audioContextState: audioContextRef.current?.state || "none",
          },
        });
      } catch { /* breadcrumb failure shouldn't block connect */ }

      const ws = new WebSocket(signedUrlStr);
      wsRef.current = ws;

      let activityReceived = false;

      ws.onopen = () => {
        clearInterval(timer);
        connectTimerRef.current = null;
        setVoiceConnecting(false);
        setVoiceConnected(true);
        voiceConnectedRef.current = true;
        setIsListening(true);

        // Voice metrics: track session start and reconnects
        if (sessionStartTimeRef.current === null) {
          sessionStartTimeRef.current = Date.now();
        }
        if (isReconnect) {
          reconnectCountRef.current += 1;
        }

        reconnectAttemptsRef.current = 0;

        // Send survey context to ElevenLabs agent as dynamic variables
        const currentAssessment = activeAssessmentRef.current;
        if (currentAssessment?.surveyResponsesJson) {
          try {
            const surveyData = currentAssessment.surveyResponsesJson as Record<string, number>;
            const currentUser = userRef.current;
            const userName = currentUser?.name || "";
            const roleTitle = currentUser?.roleTitle || "";
            const aiPlatform = currentUser?.aiPlatform || "";
            const surveyLevel = (currentAssessment as any).surveyLevel ?? 0;
            const levelNames = ["Accelerator", "Thought Partner", "Team Builder", "Systems Designer"];

            // Build readable survey summary
            const strong = Object.entries(surveyData).filter(([, v]) => v === 2).map(([k]) => k);
            const sometimes = Object.entries(surveyData).filter(([, v]) => v === 1).map(([k]) => k);
            const never = Object.entries(surveyData).filter(([, v]) => v === 0).map(([k]) => k);

            const surveySummary = [
              `Approximate level: ${levelNames[surveyLevel]} (Level ${surveyLevel + 1} of 4)`,
              strong.length > 0 ? `Regularly does: ${strong.join(", ")}` : "",
              sometimes.length > 0 ? `Sometimes does: ${sometimes.join(", ")}` : "",
              never.length > 0 ? `Not yet doing: ${never.join(", ")}` : "",
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
            toastRef.current({ title: "Voice connected but not responding", description: "Starting in text mode instead." });
            onVoiceFallbackRef.current({ startTextGreeting: false });
          }
        }, 15000);
        ws.addEventListener("close", () => clearTimeout(activityTimeout));

        // Try the ref first, fall back to captured closure ref if the race nulled it.
        // If the captured ctx is still valid (not closed), restore it to the ref and use it.
        let ctx = audioContextRef.current;
        if (!ctx && capturedCtx && capturedCtx.state !== "closed") {
          // Race recovery: the ref got nulled but our closure-captured ctx is still alive.
          audioContextRef.current = capturedCtx;
          ctx = capturedCtx;
          try {
            Sentry.addBreadcrumb({
              category: "voice",
              message: "AudioContext null on ws.onopen — recovered from closure capture",
              level: "warning",
              data: { capturedState: capturedCtx.state },
            });
            Sentry.captureMessage("AudioContext recovered via closure capture (race detected)", {
              level: "warning",
              tags: { component: "voice", action: "race-recovery" },
            });
          } catch { /* breadcrumb */ }
        }
        // Same for stream: recover from closure if ref was nulled, but only if tracks are still live.
        if (!mediaStreamRef.current && capturedStream) {
          const liveTracks = capturedStream.getAudioTracks().filter(t => t.readyState === "live");
          if (liveTracks.length > 0) {
            mediaStreamRef.current = capturedStream;
          }
        }
        if (!ctx) {
          // AudioContext truly gone (closed or never existed). Fall back to text.
          console.warn("AudioContext is null on ws.onopen — falling back to text");
          Sentry.captureException(new Error("AudioContext null on ws.onopen"), { tags: { component: "voice" } });
          ws.close();
          onVoiceFallbackRef.current({ startTextGreeting: true });
          return;
        }
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

          // Echo suppression: reduce mic gain while Lex is speaking.
          // This prevents the speaker output from being picked up by the mic
          // and misinterpreted as user speech, which causes echo/interruption loops.
          const gain = isSpeakingRef.current ? 0.08 : 1.0;

          const outputLength = Math.floor(inputData.length / ratio);
          const pcm16 = new Int16Array(outputLength);
          for (let i = 0; i < outputLength; i++) {
            const srcIndex = Math.floor(i * ratio);
            const sample = inputData[srcIndex] * gain;
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
            // Voice metrics: capture time to first audio chunk
            if (timeToFirstAudioRef.current === null && sessionStartTimeRef.current !== null) {
              timeToFirstAudioRef.current = Date.now() - sessionStartTimeRef.current;
            }
            playAudioChunk(data.audio_event?.audio_base_64 || data.audio);
          }

          if (data.user_transcription_event) {
            const text = data.user_transcription_event.user_transcript;
            const isFinal = data.user_transcription_event.is_final;
            if (text && text.trim()) {
              onTranscriptUpdateRef.current(prev => {
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
            // ElevenLabs sends agent_response events as TTS streams — the same
            // opening text can arrive multiple times. Use replace-or-append pattern
            // (same as correction handler) to avoid duplicate transcript entries.
            onTranscriptUpdateRef.current(prev => {
              const lastIdx = prev.length - 1;
              if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
                return [...prev.slice(0, lastIdx), { role: "assistant", content: text }];
              }
              return [...prev, { role: "assistant", content: text }];
            });
          }

          if (data.agent_response_event?.agent_response_correction) {
            const text = data.agent_response_event.agent_response_correction;
            onTranscriptUpdateRef.current(prev => {
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
        if (connectTimerRef.current) { clearInterval(connectTimerRef.current); connectTimerRef.current = null; }
        setVoiceConnected(false);
        voiceConnectedRef.current = false;
        setIsListening(false);
        setIsSpeaking(false);

        const isAbnormalClose = event.code !== 1000 && event.code !== 1001;
        if (isAbnormalClose && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 8000);
          console.log(`WebSocket closed unexpectedly (code ${event.code}). Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          connectingLockRef.current = false; // release lock so reconnect can proceed
          setTimeout(() => {
            connectVoice(true); // isReconnect=true: reuse signed URL, don't spawn new agent
          }, delay);
          return;
        }

        // Connection fully done — clear the signed URL so next fresh connect gets a new one
        signedUrlRef.current = null;
        connectingLockRef.current = false;
        reportVoiceMetrics();
        saveTranscript();
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
      };

      ws.onerror = (_event) => {
        Sentry.captureException(new Error("WebSocket connection error"), {
          tags: { component: "useVoiceConnection", action: "ws.onerror" },
          extra: {
            wsReadyState: ws.readyState,
            audioContextState: audioContextRef.current?.state || "none",
            connectionType: (navigator as any).connection?.effectiveType || "unknown",
            visibility: document.visibilityState,
            userAgent: navigator.userAgent,
            isReconnect,
          },
        });
        clearInterval(timer);
        reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // prevent onclose from reconnecting
        signedUrlRef.current = null;
        connectingLockRef.current = false;
        setVoiceConnecting(false);
        setVoiceConnected(false);
        voiceConnectedRef.current = false;
        stream.getTracks().forEach(t => t.stop());
        // Auto-fallback to text mode instead of showing error screen
        toastRef.current({ title: "Voice isn't available right now", description: "Starting in text mode instead.", action: makeReportAction("Voice isn't available right now") });
        onVoiceFallbackRef.current({ startTextGreeting: false });
      };

      const timeout = setTimeout(() => {
        if (!voiceConnectedRef.current && ws.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // prevent onclose from reconnecting
          signedUrlRef.current = null;
          connectingLockRef.current = false;
          if (connectTimerRef.current) { clearInterval(connectTimerRef.current); connectTimerRef.current = null; }
          ws.close();
          setVoiceConnecting(false);
          stream.getTracks().forEach(t => t.stop());
          // Auto-fallback to text mode instead of showing timeout error
          toastRef.current({ title: "Voice connection timed out", description: "Starting in text mode instead.", action: makeReportAction("Voice connection timed out") });
          onVoiceFallbackRef.current({ startTextGreeting: false });
        }
      }, 20000);

      ws.addEventListener("open", () => clearTimeout(timeout));

    } catch (err: any) {
      Sentry.captureException(err, { tags: { component: "useVoiceConnection", action: "connectVoice" } });
      clearInterval(timer);
      connectTimerRef.current = null;
      signedUrlRef.current = null;
      connectingLockRef.current = false;
      setVoiceConnecting(false);

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
        try {
          Sentry.addBreadcrumb({
            category: "voice",
            message: "AudioContext cleared (connectVoice catch block)",
            level: "warning",
            data: { errorMessage: err?.message },
          });
        } catch { /* breadcrumb */ }
      }

      const msg = err.message || "Failed to connect voice";
      const isVoiceUnavailable = msg.includes("not configured") || msg.includes("agent ID") || msg.includes("temporarily unavailable") || msg.includes("500:");
      if (isVoiceUnavailable) {
        toastRef.current({ title: "Voice isn't available right now", description: "Starting in text mode instead.", action: makeReportAction(msg) });
        onVoiceFallbackRef.current({ startTextGreeting: true });
      } else {
        setVoiceError(msg);
      }
    }
  }, [playAudioChunk, flushAudioQueue, saveTranscript, reportVoiceMetrics, makeReportAction]);
  // connectVoice references itself in ws.onclose for reconnect. This is safe
  // because the recursive call goes through the ref-based lock and setTimeout,
  // not through a stale captured closure — the function identity is stable since
  // its deps (playAudioChunk, flushAudioQueue, saveTranscript, reportVoiceMetrics) are all stable
  // useCallbacks with empty dep arrays.

  // ── Auto-connect effect ────────────────────────────────────────────
  // Intentionally depends on connectVoice which is stable (no changing deps).
  useEffect(() => {
    // No-op — auto-connect is handled by the parent component
  }, []);

  // ── Cleanup on unmount / assessmentId change ───────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (voiceConnectedRef.current && assessmentIdRef.current && messagesRef.current.length > 0) {
        const payload = JSON.stringify({
          message: "__TRANSCRIPT_SAVE__",
          transcript: JSON.stringify(messagesRef.current),
        });
        navigator.sendBeacon(`/api/assessment/${assessmentIdRef.current}/message`, new Blob([payload], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      disconnectVoice();
    };
  }, [disconnectVoice]);

  const resetReconnectAttempts = useCallback(() => {
    reconnectAttemptsRef.current = 0;
  }, []);

  return {
    voiceConnecting,
    voiceConnected,
    voiceError,
    connectSeconds,
    isMuted,
    isSpeaking,
    isListening,
    setIsMuted,
    connectVoice,
    disconnectVoice,
    resetReconnectAttempts,
    messagesRef,
  };
}
