// Streaming PCM playback for translated speech, with a free offline fallback.
//
// Primary path: /api/public/tts (Lovable AI, SSE, 24 kHz mono PCM) — playback
// starts on the first chunk, so we never wait for the whole clip.
// Fallback: the browser's built-in speechSynthesis (free, no network) if the
// TTS service is unavailable — the call itself must never break.

let ctx: AudioContext | null = null;
let playhead = 0;

function audioCtx(): AudioContext {
  ctx ??= new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
    sampleRate: 24000,
  });
  return ctx;
}

/** Must be called from a user gesture so playback is allowed. */
export async function unlockAudio() {
  try {
    const ac = audioCtx();
    if (ac.state === "suspended") await ac.resume();
  } catch {
    /* ignore */
  }
}

function speakFallback(text: string, bcp: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang.replace("_", "-").startsWith(bcp.slice(0, 2)));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export interface SpeakEvents {
  onFirstAudio?: () => void;
  onDone?: (usedFallback: boolean) => void;
  onError?: (msg: string) => void;
}

/**
 * Streams `text` as speech. Resolves when the stream has been fully scheduled.
 */
export async function speakTranslated(
  text: string,
  lang: string,
  bcp: string,
  ev: SpeakEvents = {},
): Promise<void> {
  const ac = audioCtx();
  if (ac.state === "suspended") await ac.resume().catch(() => {});

  let first = true;
  let pending = new Uint8Array(0);

  const push = (incoming: Uint8Array) => {
    const bytes = new Uint8Array(pending.length + incoming.length);
    bytes.set(pending);
    bytes.set(incoming, pending.length);
    const usable = bytes.length - (bytes.length % 2);
    pending = bytes.slice(usable);
    if (!usable) return;
    const samples = new Int16Array(bytes.buffer, 0, usable / 2);
    const floats = Float32Array.from(samples, (s) => s / 32768);
    const buf = ac.createBuffer(1, floats.length, 24000);
    buf.copyToChannel(floats, 0);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    if (playhead < ac.currentTime) playhead = ac.currentTime + 0.06;
    src.start(playhead);
    playhead += buf.duration;
    if (first) {
      first = false;
      ev.onFirstAudio?.();
    }
  };

  try {
    const res = await fetch("/api/public/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok || !res.body) throw new Error(`tts ${res.status}`);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let payload: { type?: string; audio?: string };
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }
          if (payload.type !== "speech.audio.delta" || !payload.audio) continue;
          const bin = atob(payload.audio);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          push(bytes);
        }
      }
    }
    if (first) throw new Error("no audio");
    ev.onDone?.(false);
  } catch (e) {
    // Never break the call because translation audio failed.
    const ok = speakFallback(text, bcp);
    ev.onError?.(ok ? "using device voice" : (e as Error).message);
    ev.onDone?.(true);
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  playhead = 0;
}
