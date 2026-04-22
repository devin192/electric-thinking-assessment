// Shared AudioContext and MediaStream singletons.
// Created during warmup page to ensure browser has already granted microphone
// permission and audio is initialized before the assessment page loads.
// This prevents the "click to allow microphone" interruption during the assessment.

let sharedAudioContext: AudioContext | null = null;
let sharedMediaStream: MediaStream | null = null;

export function setSharedAudioContext(ctx: AudioContext) {
  sharedAudioContext = ctx;
}

export function getSharedAudioContext(): AudioContext | null {
  // MOBILE FIX: Check if the AudioContext was closed or is in an unusable state.
  // This can happen if iOS reclaims audio resources while the user is on the
  // warmup page (e.g., incoming phone call, switching apps).
  // iOS Safari uses "interrupted" state when audio is preempted (phone calls,
  // Siri, other audio apps). Treat it as unusable so caller creates a fresh context.
  if (sharedAudioContext) {
    const state = sharedAudioContext.state as AudioContextState | "interrupted";
    if (state === "closed" || state === "interrupted") {
      sharedAudioContext = null;
      return null;
    }
  }
  return sharedAudioContext;
}

export function setSharedMediaStream(stream: MediaStream) {
  sharedMediaStream = stream;
}

export function getSharedMediaStream(): MediaStream | null {
  // MOBILE FIX: Verify the stream is still active. MediaStream tracks can
  // end if the user revokes mic permission or if iOS reclaims the resource.
  if (sharedMediaStream) {
    const tracks = sharedMediaStream.getAudioTracks();
    if (tracks.length === 0 || tracks.every(t => t.readyState === "ended")) {
      sharedMediaStream = null;
      return null;
    }
  }
  return sharedMediaStream;
}

export function clearSharedAudio() {
  sharedAudioContext = null;
  sharedMediaStream = null;
}
