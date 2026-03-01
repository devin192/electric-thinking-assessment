let sharedAudioContext: AudioContext | null = null;
let sharedMediaStream: MediaStream | null = null;

export function setSharedAudioContext(ctx: AudioContext) {
  sharedAudioContext = ctx;
}

export function getSharedAudioContext(): AudioContext | null {
  return sharedAudioContext;
}

export function setSharedMediaStream(stream: MediaStream) {
  sharedMediaStream = stream;
}

export function getSharedMediaStream(): MediaStream | null {
  return sharedMediaStream;
}

export function clearSharedAudio() {
  sharedAudioContext = null;
  sharedMediaStream = null;
}
