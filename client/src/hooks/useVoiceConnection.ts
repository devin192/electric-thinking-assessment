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

/**
 * AudioWorklet processor that runs on the audio thread (separate from the main JS
 * thread). Replaces ScriptProcessorNode, which is deprecated AND has a documented
 * history of silently not firing on iOS browsers — that's the bug Devin hit on
 * iOS Chrome cellular on April 25 (mic audio never reached ElevenLabs, EL kept
 * closing the connection, agent kept restarting greeting from scratch).
 *
 * Architecture:
 *   mediaStream -> MediaStreamSource -> AudioWorkletNode (this processor) -> port -> main thread -> WebSocket
 *
 * The processor accumulates audio samples until it has a 4096-sample chunk
 * (matching the previous SPN buffer size for behavior parity), then resamples
 * from the AudioContext's native sample rate (typically 48 kHz on iOS) down to
 * 16 kHz (what ElevenLabs Convai expects), converts float32 -> int16, and
 * posts the buffer back to the main thread for WebSocket transmission.
 *
 * State (mute, speaking-for-echo-suppression) is synced from main thread via
 * postMessage — the worklet thread can't read React state directly.
 */
const VOICE_WORKLET_CODE = `
class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferTarget = 4096;
    this.targetSampleRate = 16000;
    this.isMuted = false;
    this.isSpeaking = false;
    this.accumulator = [];
    this.accumulatorLen = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (!d) return;
      if (d.type === 'mute') this.isMuted = !!d.value;
      if (d.type === 'speaking') this.isSpeaking = !!d.value;
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || this.isMuted) return true;
    const samples = input[0];
    // Copy because the input buffer is reused across process() calls
    this.accumulator.push(new Float32Array(samples));
    this.accumulatorLen += samples.length;
    while (this.accumulatorLen >= this.bufferTarget) {
      const out = new Float32Array(this.bufferTarget);
      let pos = 0;
      while (pos < this.bufferTarget) {
        const next = this.accumulator[0];
        const need = this.bufferTarget - pos;
        if (next.length <= need) {
          out.set(next, pos);
          pos += next.length;
          this.accumulator.shift();
        } else {
          out.set(next.subarray(0, need), pos);
          this.accumulator[0] = next.subarray(need);
          pos = this.bufferTarget;
        }
      }
      this.accumulatorLen -= this.bufferTarget;
      // Echo suppression: reduce mic gain while Lex is speaking so the speaker
      // output isn't picked up by the mic and looped back as user speech.
      // (Reverted 2026-04-25 to original 0.08 after EL quota was identified
      // as the actual root cause of the previous "loop" symptom.)
      const gain = this.isSpeaking ? 0.08 : 1.0;
      const ratio = sampleRate / this.targetSampleRate;
      const outputLen = Math.floor(out.length / ratio);
      const pcm16 = new Int16Array(outputLen);
      for (let i = 0; i < outputLen; i++) {
        const idx = Math.floor(i * ratio);
        const s = out[idx] * gain;
        pcm16[i] = Math.max(-32768, Math.min(32767, s * 32768));
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('voice-processor', VoiceProcessor);
`;

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
  // Ensures we only trigger the "voice failed, switching to text" UX once per
  // session, even if multiple code paths (ws.onerror, ws.onclose final cleanup,
  // timeout, orphaned WS) try to trigger it simultaneously.
  const voiceFallbackTriggeredRef = useRef<boolean>(false);
  // Tracks whether disconnectVoice was called explicitly (user ended conversation,
  // switched modes, navigated away). Lets ws.onclose distinguish intentional closes
  // from unexpected drops so we don't show an error UI for user-initiated exits.
  const userInitiatedDisconnectRef = useRef<boolean>(false);
  // AudioWorkletNode used for mic capture (preferred over deprecated ScriptProcessor).
  // Held in a ref so state-sync useEffects (mute, speaking) can postMessage to it.
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  // Pending reconnect setTimeout ID. Tracked so disconnectVoice can cancel it —
  // otherwise a queued setTimeout fires AFTER the user clicks Switch-to-Text,
  // spawning a ghost WebSocket + ghost AudioContext that plays a second Lex on
  // top of the still-finishing original ("doubled Lex" bug Devin hit Apr 25).
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Also forward mute / speaking state to the AudioWorklet (if active) since
  // the worklet thread can't read React state directly. The SPN fallback path
  // continues to read isMutedRef / isSpeakingRef inline.
  useEffect(() => {
    isMutedRef.current = isMuted;
    workletNodeRef.current?.port.postMessage({ type: "mute", value: isMuted });
  }, [isMuted]);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    workletNodeRef.current?.port.postMessage({ type: "speaking", value: isSpeaking });
  }, [isSpeaking]);
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
    // Flag that this close is user-initiated — ws.onclose uses this to skip the
    // "voice disconnected unexpectedly" error UI.
    userInitiatedDisconnectRef.current = true;

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

    // Cancel any pending reconnect setTimeout BEFORE the AC + WS teardown.
    // If we don't cancel and the timer fires after AC.close(), connectVoice
    // creates a new AC + WS that plays a second Lex on top of the still-
    // finishing original audio (Devin's "doubled Lex" bug 2026-04-25).
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Report voice quality metrics before tearing down
    reportVoiceMetrics();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect(); } catch { /* already disconnected */ }
      try { workletNodeRef.current.port.close(); } catch { /* already closed */ }
      workletNodeRef.current = null;
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
    // Cancel any pending reconnect from a prior session before starting fresh.
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // Tear down any stale AudioWorkletNode from a prior session — leaving it
    // connected would mean two processors writing to the same WebSocket buffer
    // path on the next connect.
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect(); } catch { /* already disconnected */ }
      try { workletNodeRef.current.port.close(); } catch { /* already closed */ }
      workletNodeRef.current = null;
    }
    // Reset voice metrics for a fresh session (not reconnects)
    if (!isReconnect) {
      sessionStartTimeRef.current = null;
      timeToFirstAudioRef.current = null;
      reconnectCountRef.current = 0;
      metricsReportedRef.current = false;
      voiceFallbackTriggeredRef.current = false;
      userInitiatedDisconnectRef.current = false;
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
            // Reverted 2026-04-25 after EL quota was identified as actual root
            // cause. These were the proven-working defaults for BraceAbility
            // and Jamie's completed sessions.
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
      // Smoking-gun diagnostic flags. Used by ws.onclose to capture a Sentry event
      // when WS opens but audio never flows — that's exactly the case where iOS
      // mic capture is broken and we need full breadcrumb context to debug.
      let wsOnopenFired = false;
      let captureModeAtSetup: "worklet" | "spn" | "unknown" = "unknown";
      // Diagnostics — tracks whether audio chunks are actually flowing out to EL.
      // If processor.onaudioprocess never fires on iOS (documented ScriptProcessorNode
      // flakiness), EL sees a silent connection and closes with code 1002.
      let firstAudioProcessSeen = false;
      let audioChunkCount = 0;

      ws.onopen = async () => {
        wsOnopenFired = true;
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

        // NOTE: We intentionally do NOT reset reconnectAttemptsRef here.
        // Previously this reset on every ws.onopen, but EL can open the WS
        // successfully and then close it with 1002 within ~4 seconds when
        // our audio chunks never arrive. Resetting on open created an infinite
        // retry loop (Jamie's April 24 case: 10 retries × 4s = 45s of purgatory).
        // Counter is now reset only when we see real conversational activity
        // (agent_response, audio, user transcript) — see ws.onmessage below.

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

        // Helper: encode an Int16 ArrayBuffer of PCM samples and send via WebSocket.
        // Used by both the AudioWorklet path (port.onmessage) and the ScriptProcessor
        // fallback (processor.onaudioprocess) so both paths produce identical wire output.
        const sendAudioChunk = (pcm16Buffer: ArrayBuffer) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (!firstAudioProcessSeen) {
            firstAudioProcessSeen = true;
            try {
              Sentry.addBreadcrumb({
                category: "voice",
                message: "First audio chunk processed",
                level: "info",
                data: {
                  acState: ctx.state,
                  sampleRate: ctx.sampleRate,
                  wsReadyState: ws.readyState,
                },
              });
            } catch { /* breadcrumb */ }
          }
          const bytes = new Uint8Array(pcm16Buffer);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
          }
          ws.send(JSON.stringify({ user_audio_chunk: btoa(binary) }));
          audioChunkCount++;
          if (audioChunkCount === 50 || audioChunkCount === 500 || audioChunkCount === 5000) {
            try {
              Sentry.addBreadcrumb({
                category: "voice",
                message: `Audio chunks sent: ${audioChunkCount}`,
                level: "info",
              });
            } catch { /* breadcrumb */ }
          }
        };

        // Prefer AudioWorkletNode. ScriptProcessorNode is deprecated and has a
        // documented pattern of silently not firing on iOS Chrome (Devin Apr 25
        // case: WS opens, Lex audio plays, user mic never reaches EL → EL closes
        // → reconnect → infinite loop). AWN runs in the audio thread (not main
        // thread) and is the modern API. We keep an SPN fallback for any edge
        // case where AWN fails to initialize.
        let captureMode: "worklet" | "spn";

        const trySetupWorklet = async (): Promise<boolean> => {
          if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") {
            return false;
          }
          // Race guard: AC may have been closed during the addModule await if user
          // disconnected mid-connect. Don't try to construct a node on a dead AC.
          if ((ctx.state as string) === "closed") return false;
          try {
            const blob = new Blob([VOICE_WORKLET_CODE], { type: "application/javascript" });
            const url = URL.createObjectURL(blob);
            try {
              await ctx.audioWorklet.addModule(url);
            } finally {
              URL.revokeObjectURL(url);
            }
            // Recheck after the await — disconnect may have closed AC during it
            if ((ctx.state as string) === "closed") return false;
            const node = new AudioWorkletNode(ctx, "voice-processor");
            workletNodeRef.current = node;

            // Sync initial state — useEffects only fire on subsequent state changes.
            node.port.postMessage({ type: "mute", value: isMutedRef.current });
            node.port.postMessage({ type: "speaking", value: isSpeakingRef.current });

            node.port.onmessage = (event) => {
              const buf = event.data as ArrayBuffer;
              if (buf instanceof ArrayBuffer) sendAudioChunk(buf);
            };
            node.onprocessorerror = () => {
              try {
                Sentry.captureMessage("AudioWorklet processor error", {
                  level: "error",
                  tags: { component: "voice", action: "worklet-error" },
                });
              } catch { /* breadcrumb */ }
            };

            audioRecorder.connect(node);
            // CRITICAL: AudioWorkletNode requires connection to ctx.destination
            // for the browser to render its process() callback. Without this the
            // node is "dangling" — present in memory, receiving input, but never
            // invoked. (April 25 2026 prod incident: shipped without this; mic
            // audio never reached ElevenLabs; agent kept restarting greeting.)
            // The worklet's process() doesn't write to outputs[0], so this sends
            // silence to speakers — no echo, no perceptible side-effect.
            node.connect(ctx.destination);

            return true;
          } catch (err: any) {
            try {
              Sentry.captureMessage("AudioWorklet setup failed, falling back to ScriptProcessor", {
                level: "warning",
                tags: { component: "voice", action: "worklet-fallback" },
                extra: { error: err?.message || String(err) },
              });
            } catch { /* breadcrumb */ }
            return false;
          }
        };

        const setupSpnFallback = (): boolean => {
          // Legacy path: ScriptProcessorNode. Kept for safety in case AWN fails.
          // Has the iOS-silent-fire bug — if we land here on iOS, expect that
          // mic audio may not reach EL reliably.
          // Race guard: same as trySetupWorklet — AC may have been closed by a
          // disconnect that happened during the AWN await before we landed here.
          if ((ctx.state as string) === "closed") return false;
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          audioRecorder.connect(processor);
          processor.connect(ctx.destination); // SPN requires this to fire

          processor.onaudioprocess = (e) => {
            if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
            const inputData = e.inputBuffer.getChannelData(0);
            // Echo suppression while Lex speaks (reverted 2026-04-25 to original).
            const gain = isSpeakingRef.current ? 0.08 : 1.0;
            const outputLength = Math.floor(inputData.length / ratio);
            const pcm16 = new Int16Array(outputLength);
            for (let i = 0; i < outputLength; i++) {
              const srcIndex = Math.floor(i * ratio);
              const sample = inputData[srcIndex] * gain;
              pcm16[i] = Math.max(-32768, Math.min(32767, sample * 32768));
            }
            sendAudioChunk(pcm16.buffer);
          };
          return true;
        };

        // Both paths can throw on a closed-mid-connect AC. Catch at this level so
        // we don't propagate an unhandled rejection out of the async ws.onopen
        // (which has no parent error handler — see Rex finding from Apr 25).
        try {
          const usingWorklet = await trySetupWorklet();
          if (usingWorklet) {
            captureMode = "worklet";
            captureModeAtSetup = "worklet";
          } else if (setupSpnFallback()) {
            captureMode = "spn";
            captureModeAtSetup = "spn";
          } else {
            // Both paths bailed (typically AC closed during connect). Nothing more
            // to do — the disconnect that closed the AC will handle UI cleanup.
            try {
              Sentry.addBreadcrumb({
                category: "voice",
                message: "Audio setup skipped (AC closed mid-connect)",
                level: "warning",
              });
            } catch { /* breadcrumb */ }
            return;
          }
        } catch (audioErr: any) {
          try {
            Sentry.captureException(audioErr, {
              tags: { component: "voice", action: "audio-setup-failed" },
              extra: { acState: ctx.state, isReconnect },
            });
          } catch { /* breadcrumb */ }
          // The ws will close naturally — onclose handles fallback UI
          return;
        }

        // Tag the Sentry scope so future events from this session show which
        // capture path was used. Helps correlate SPN fallback events.
        try {
          Sentry.setTag("voice_capture_mode", captureMode);

          // SMOKING-GUN AUTO-CAPTURE: 5 seconds after WS opens, capture a Sentry
          // event with current audio-flow state. Fires UNCONDITIONALLY regardless
          // of WS readyState — Devin's reconnect cycle was racing the timer and
          // the WS would already be closed before we could capture, leaving us
          // blind. Capturing always gives us the data.
          setTimeout(() => {
            const audioFlowing = firstAudioProcessSeen && audioChunkCount > 0;
            try {
              Sentry.captureMessage(
                audioFlowing
                  ? `Voice 5s check: audio flowing (${audioChunkCount} chunks)`
                  : "Voice 5s check: ZERO audio chunks",
                {
                  level: audioFlowing ? "info" : "warning",
                  tags: {
                    component: "voice",
                    action: "5s-check",
                    voice_capture_mode: captureModeAtSetup,
                    audio_flowing: audioFlowing ? "yes" : "no",
                  },
                  extra: {
                    captureModeAtSetup,
                    firstAudioProcessSeen,
                    audioChunkCount,
                    activityReceived,
                    acState: ctx.state,
                    wsReadyState: ws.readyState,
                    audioConstraints: "default (AEC+NS+AGC on)",
                    hasAudioWorklet: !!ctx.audioWorklet,
                    hasAudioWorkletNode: typeof AudioWorkletNode !== "undefined",
                    userAgent: navigator.userAgent,
                    isReconnect,
                  },
                }
              );
            } catch { /* sentry failure shouldn't break voice */ }
          }, 5000);
          Sentry.addBreadcrumb({
            category: "voice",
            message: `Audio capture mode: ${captureMode}`,
            level: "info",
            data: {
              nativeSampleRate,
              hasAudioWorklet: !!ctx.audioWorklet,
              hasAudioWorkletNode: typeof AudioWorkletNode !== "undefined",
              audioConstraints: "default (AEC+NS+AGC on)",
            },
          });
        } catch { /* breadcrumb */ }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "agent_response" && data.agent_response_event === "agent_response") {
            activityReceived = true;
            // Reset retry counter on real conversational activity.
            // Empty ws.onopen no longer resets it — see note above.
            reconnectAttemptsRef.current = 0;
            setIsSpeaking(true);
          }

          if (data.type === "agent_response" && data.agent_response_event === "agent_response_correction") {
            activityReceived = true;
            reconnectAttemptsRef.current = 0;
            setIsSpeaking(true);
          }

          if (data.type === "audio") {
            activityReceived = true;
            reconnectAttemptsRef.current = 0;
            setIsSpeaking(true);
            // Voice metrics: capture time to first audio chunk
            if (timeToFirstAudioRef.current === null && sessionStartTimeRef.current !== null) {
              timeToFirstAudioRef.current = Date.now() - sessionStartTimeRef.current;
            }
            playAudioChunk(data.audio_event?.audio_base_64 || data.audio);
          }

          if (data.user_transcription_event) {
            // User transcription means mic audio is reaching EL — counts as activity
            // (prevents fast-fallback to text mode on unexpected close), but does NOT
            // reset the retry counter. Reason: if user keeps talking but agent never
            // responds, we'd infinite-loop reconnects with the counter always resetting.
            // Counter resets only on reciprocal agent activity (audio / agent_response).
            activityReceived = true;
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
        // SMOKING-GUN DIAGNOSTIC: when WS opens but audio chunks never flow, fire
        // a Sentry capture event so we get the full breadcrumb history + the
        // voice_capture_mode tag. This is exactly the iOS-mic-broken case.
        // Only fire on first attempt (not retries) and only if user didn't disconnect.
        if (
          wsOnopenFired &&
          !firstAudioProcessSeen &&
          !isReconnect &&
          !userInitiatedDisconnectRef.current
        ) {
          try {
            Sentry.captureMessage("Voice opened but no audio chunks flowed", {
              level: "warning",
              tags: {
                component: "voice",
                action: "no-audio-flow",
                voice_capture_mode: captureModeAtSetup,
              },
              extra: {
                closeCode: event.code,
                closeReason: event.reason || null,
                wasClean: event.wasClean,
                activityReceived,
                audioChunkCount,
                firstAudioProcessSeen,
                captureModeAtSetup,
                wsOnopenFired,
                acState: audioContextRef.current?.state || "no-ac",
                userAgent: navigator.userAgent,
              },
            });
          } catch { /* sentry capture failure shouldn't block close handling */ }
        }
        // DIAGNOSTIC: capture full close context in Sentry (code + reason + whether
        // any activity was received + how many audio chunks were sent). Previously
        // this was only in console.log and got lost.
        try {
          Sentry.addBreadcrumb({
            category: "voice",
            message: `WebSocket closed (code ${event.code})`,
            level: event.code === 1000 || event.code === 1001 ? "info" : "warning",
            data: {
              code: event.code,
              reason: event.reason || null,
              wasClean: event.wasClean,
              activityReceived,
              audioChunkCount,
              firstAudioProcessSeen,
              isReconnect,
            },
          });
        } catch { /* breadcrumb failure must not block cleanup */ }

        if (connectTimerRef.current) { clearInterval(connectTimerRef.current); connectTimerRef.current = null; }
        setVoiceConnected(false);
        voiceConnectedRef.current = false;
        setIsListening(false);
        setIsSpeaking(false);

        const isAbnormalClose = event.code !== 1000 && event.code !== 1001;

        // QUOTA / BILLING DETECTION: ElevenLabs sends close code 1002 with
        // reason="This request exceeds your quota limit." when the EL plan's
        // ConvAI minutes are exhausted. Retrying just burns the user's time
        // and produces a confusing infinite loop (Apr 25 2026: 6 cycles before
        // we figured this out). Bail to text immediately with a clear message.
        const closeReason = event.reason || "";
        const isQuotaExceeded =
          closeReason.toLowerCase().includes("quota") ||
          closeReason.toLowerCase().includes("exceeds");
        if (isQuotaExceeded) {
          try {
            Sentry.captureMessage("ElevenLabs quota exceeded — voice unavailable", {
              level: "error",
              tags: { component: "voice", action: "quota-exceeded" },
              extra: { closeCode: event.code, closeReason, audioChunkCount, firstAudioProcessSeen },
            });
          } catch { /* breadcrumb */ }
          signedUrlRef.current = null;
          connectingLockRef.current = false;
          reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // prevent any retries
          if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          if (!voiceFallbackTriggeredRef.current) {
            voiceFallbackTriggeredRef.current = true;
            setVoiceConnecting(false);
            toastRef.current({
              title: "Voice temporarily unavailable",
              description: "Switching to text mode.",
              action: makeReportAction(`Voice quota exceeded: ${closeReason}`),
            });
            onVoiceFallbackRef.current({ startTextGreeting: false });
          }
          return;
        }

        // Retry budget depends on BOTH activity (did we ever get a real response?)
        // AND close code (protocol reject vs network blip):
        //   - activity received: full budget — it was working, might recover
        //   - no activity + code 1002 (protocol reject from EL): 1 retry only —
        //     retrying the same broken state rarely helps
        //   - no activity + other abnormal (1006 network, 1011 server, etc): 2
        //     retries — often recovers from transient cellular/wifi blips
        const isProtocolReject = event.code === 1002;
        const effectiveMaxRetries = activityReceived
          ? MAX_RECONNECT_ATTEMPTS
          : (isProtocolReject ? 1 : 2);
        if (isAbnormalClose && reconnectAttemptsRef.current < effectiveMaxRetries) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 8000);
          console.log(`WebSocket closed unexpectedly (code ${event.code}). Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${effectiveMaxRetries})`);
          connectingLockRef.current = false; // release lock so reconnect can proceed
          // Track the timer so disconnectVoice can cancel it. Without this,
          // user clicks Switch-to-Text while a reconnect is queued → setTimeout
          // fires after disconnect → ghost WebSocket + ghost AC = doubled Lex.
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
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

        // UX safety net for unexpected closes (WS dropped but user didn't ask to leave).
        // Without this, the assessment UI shows a blank screen after retries exhaust,
        // OR the parent auto-connect effect spawns a fresh agent (which greets again).
        // Two branches:
        //   - No activity ever (silent failure, e.g. iOS audio didn't flow, EL rejected
        //     us with 1002): fall back to text automatically. Voice was never working.
        //   - Activity received (user was mid-conversation): show voiceError so the
        //     error UI appears with Try Again / Switch to Text buttons. Let them choose.
        // Skipped if: user initiated disconnect, or a different code path already
        // triggered fallback (onerror / timeout / catch).
        if (!userInitiatedDisconnectRef.current && !voiceFallbackTriggeredRef.current) {
          voiceFallbackTriggeredRef.current = true;
          setVoiceConnecting(false);
          if (isAbnormalClose && !activityReceived) {
            // Silent failure path
            toastRef.current({
              title: "Voice isn't connecting",
              description: "Starting in text mode instead.",
              action: makeReportAction(`WebSocket closed (code ${event.code})`),
            });
            onVoiceFallbackRef.current({ startTextGreeting: false });
          } else if (isAbnormalClose) {
            // Mid-session disconnect — surface error, let user decide
            setVoiceError("Voice disconnected unexpectedly");
          }
          // Clean close (code 1000/1001) without user-initiated flag is strange but
          // not worth interrupting the user over. Leave UI alone.
        }
      };

      ws.onerror = (_event) => {
        // iOS-backgrounding noise filter: when the user puts the tab in the
        // background or locks the phone, iOS interrupts the AudioContext and
        // tears down the WebSocket. AC state goes "interrupted" and document
        // visibility is "hidden". That's not a fault — it's the user leaving.
        // Skip the Sentry capture for those; still run the fallback flow.
        const acState = (audioContextRef.current?.state as string) || "none";
        const visibility = document.visibilityState;
        const isUserBackgrounded =
          (acState === "interrupted" || acState === "closed") &&
          visibility === "hidden";
        if (!isUserBackgrounded) {
          Sentry.captureException(new Error("WebSocket connection error"), {
            tags: { component: "useVoiceConnection", action: "ws.onerror" },
            extra: {
              wsReadyState: ws.readyState,
              audioContextState: acState,
              connectionType: (navigator as any).connection?.effectiveType || "unknown",
              visibility,
              userAgent: navigator.userAgent,
              isReconnect,
              audioChunkCount,
              firstAudioProcessSeen,
            },
          });
        }
        clearInterval(timer);
        reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // prevent onclose from reconnecting
        signedUrlRef.current = null;
        connectingLockRef.current = false;
        setVoiceConnecting(false);
        setVoiceConnected(false);
        voiceConnectedRef.current = false;
        stream.getTracks().forEach(t => t.stop());
        // Auto-fallback to text mode instead of showing error screen.
        // Flag prevents the onclose-final-path fallback from double-triggering.
        if (!voiceFallbackTriggeredRef.current) {
          voiceFallbackTriggeredRef.current = true;
          toastRef.current({ title: "Voice isn't available right now", description: "Starting in text mode instead.", action: makeReportAction("Voice isn't available right now") });
          onVoiceFallbackRef.current({ startTextGreeting: false });
        }
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
          // Auto-fallback to text mode instead of showing timeout error.
          // Flag prevents the onclose-final-path fallback from double-triggering.
          if (!voiceFallbackTriggeredRef.current) {
            voiceFallbackTriggeredRef.current = true;
            toastRef.current({ title: "Voice connection timed out", description: "Starting in text mode instead.", action: makeReportAction("Voice connection timed out") });
            onVoiceFallbackRef.current({ startTextGreeting: false });
          }
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

      // Note: TS narrowing struggles inside this catch block — using a typed
      // local var sidesteps the issue. AudioContext.close() below also kills
      // the worklet, so this is belt-and-suspenders cleanup.
      const stWorklet = workletNodeRef.current as AudioWorkletNode | null;
      if (stWorklet) {
        try { stWorklet.disconnect(); } catch { /* already disconnected */ }
        try { stWorklet.port.close(); } catch { /* already closed */ }
      }
      workletNodeRef.current = null;
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
        if (!voiceFallbackTriggeredRef.current) {
          voiceFallbackTriggeredRef.current = true;
          toastRef.current({ title: "Voice isn't available right now", description: "Starting in text mode instead.", action: makeReportAction(msg) });
          onVoiceFallbackRef.current({ startTextGreeting: true });
        }
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
