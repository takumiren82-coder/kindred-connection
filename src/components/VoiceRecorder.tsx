import { useEffect, useRef, useState } from "react";
import { Mic, Send, X } from "lucide-react";

interface Props {
  onCancel: () => void;
  onSend: (dataUrl: string, durationMs: number) => void;
}

/** Hold-to-record UI shown inline in the composer while recording. */
export function VoiceRecorder({ onCancel, onSend }: Props) {
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [ms, setMs] = useState(0);
  const startedAt = useRef(Date.now());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
        const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        recRef.current = r;
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.start();
        startedAt.current = Date.now();
      } catch (e) {
        setErr((e as Error).message || "Mic unavailable");
      }
    })();
    const t = setInterval(() => setMs(Date.now() - startedAt.current), 100);
    return () => {
      cancelled = true;
      clearInterval(t);
      recRef.current?.state === "recording" && recRef.current.stop();
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const stopAndSend = () => {
    const r = recRef.current;
    if (!r) return onCancel();
    const dur = Date.now() - startedAt.current;
    if (dur < 500) return onCancel();
    r.onstop = async () => {
      const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || "audio/webm" });
      const reader = new FileReader();
      reader.onload = () => onSend(String(reader.result), dur);
      reader.readAsDataURL(blob);
    };
    r.stop();
  };

  const s = Math.floor(ms / 1000);
  const label = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <Mic className="h-4 w-4 text-red-400" />
      <span className="flex-1 text-[12px] font-medium tabular-nums text-red-100">
        {err ? err : `Recording ${label}`}
      </span>
      <button onClick={onCancel} aria-label="Cancel" className="text-white/70 hover:text-white">
        <X className="h-4 w-4" />
      </button>
      <button onClick={stopAndSend} aria-label="Send voice" className="gold-btn flex h-7 w-7 items-center justify-center rounded-full">
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}