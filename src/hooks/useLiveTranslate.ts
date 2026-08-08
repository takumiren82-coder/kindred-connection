import { useCallback, useEffect, useRef, useState } from "react";
import { LANGS, type LangCode, translateSegment } from "@/lib/translate.functions";

// Streaming speech capture for the live call translator.
//
// Uses the browser's built-in SpeechRecognition (free, no API cost, streams
// interim results). We emit partial segments as soon as the interim transcript
// stabilises, so translation starts mid-sentence instead of waiting for the
// speaker to finish a paragraph.

type SR = typeof window extends { SpeechRecognition: infer T } ? T : unknown;

interface SRResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SREventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SRResultLike };
}
interface SRLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function createRecognition(): SRLike | null {
  const w = window as unknown as { SpeechRecognition?: new () => SRLike; webkitSpeechRecognition?: new () => SRLike };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export const speechSupported = () =>
  typeof window !== "undefined" &&
  !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

export interface TranslateTiming {
  heard: number;
  translated: number;
}

interface Opts {
  enabled: boolean;
  myLang: LangCode;
  peerLang: LangCode;
  /** Called with the translated text ready to be sent to the peer. */
  onSegment: (translated: string, original: string, timing: TranslateTiming) => void;
  onStatus?: (s: string) => void;
}

export function useLiveTranslate({ enabled, myLang, peerLang, onSegment, onStatus }: Opts) {
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const recRef = useRef<SRLike | null>(null);
  const emittedRef = useRef("");
  const stableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef({ onSegment, onStatus });
  cbRef.current = { onSegment, onStatus };
  const langRef = useRef({ myLang, peerLang });
  langRef.current = { myLang, peerLang };
  const stoppedRef = useRef(true);

  const push = useCallback(async (chunk: string) => {
    const text = chunk.trim();
    if (text.length < 2) return;
    const heard = Date.now();
    cbRef.current.onStatus?.("translating…");
    try {
      const res = await translateSegment({
        data: { text, from: langRef.current.myLang, to: langRef.current.peerLang },
      });
      if (res.error || !res.text) {
        cbRef.current.onStatus?.(res.error ?? "translation failed");
        return;
      }
      cbRef.current.onSegment(res.text, text, { heard, translated: Date.now() });
      cbRef.current.onStatus?.("speaking…");
    } catch {
      cbRef.current.onStatus?.("translation unavailable");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const rec = createRecognition();
    if (!rec) {
      cbRef.current.onStatus?.("speech recognition not supported in this browser");
      return;
    }
    recRef.current = rec;
    stoppedRef.current = false;
    rec.lang = LANGS[langRef.current.myLang].bcp;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) {
        const rest = final.slice(emittedRef.current.length);
        emittedRef.current = "";
        setLastHeard(final);
        if (stableTimer.current) clearTimeout(stableTimer.current);
        void push(rest || final);
        return;
      }
      if (!interim) return;
      setLastHeard(interim);
      // Emit the stable head of a long interim so long sentences don't block.
      if (stableTimer.current) clearTimeout(stableTimer.current);
      const pendingLen = interim.length - emittedRef.current.length;
      if (pendingLen >= 12) {
        stableTimer.current = setTimeout(() => {
          const chunk = interim.slice(emittedRef.current.length);
          emittedRef.current = interim;
          void push(chunk);
        }, 700);
      }
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        cbRef.current.onStatus?.("microphone blocked for translation");
        stoppedRef.current = true;
      }
    };
    rec.onend = () => {
      setListening(false);
      if (stoppedRef.current) return;
      // Chrome ends the session periodically — restart to stay continuous.
      try {
        rec.start();
        setListening(true);
      } catch {
        /* already starting */
      }
    };

    try {
      rec.start();
      setListening(true);
      cbRef.current.onStatus?.("listening");
    } catch {
      /* ignore */
    }

    return () => {
      stoppedRef.current = true;
      if (stableTimer.current) clearTimeout(stableTimer.current);
      emittedRef.current = "";
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
      setListening(false);
    };
  }, [enabled, myLang, push]);

  return { listening, lastHeard };
}

export type { SR };
