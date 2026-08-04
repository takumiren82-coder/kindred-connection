import { useEffect, useRef, useState } from "react";
import { X, Camera, RotateCcw, Check } from "lucide-react";
import { FILTERS, filterById } from "@/lib/filters";

interface Props {
  onClose: () => void;
  onCapture: (dataUrl: string, filterId: string) => void;
  mode?: "photo"; // video capture in-app is heavy; use gallery for videos
}

export function CameraCapture({ onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [filterId, setFilterId] = useState("none");
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [snap, setSnap] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (e) {
        setErr((e as Error).message || "Camera unavailable");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  const capture = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 720;
    c.height = v.videoHeight || 1280;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Bake filter into the captured image. Never mirror the capture — even
    // when using the front camera, we save a natural (un-mirrored) photo
    // so it matches what a professional camera app would output.
    ctx.filter = filterById(filterId).css;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setSnap(c.toDataURL("image/jpeg", 0.85));
  };

  const confirm = () => {
    if (snap) onCapture(snap, filterId);
  };

  const activeFilterCss = filterById(filterId).css;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} aria-label="Close" className="text-white">
          <X className="h-6 w-6" />
        </button>
        <span className="font-heading text-xs tracking-widest text-gold">CAMERA</span>
        <button onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} aria-label="Flip camera" className="text-white">
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {err ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {err}. Use Gallery instead.
          </div>
        ) : snap ? (
          <img src={snap} alt="preview" className="h-full w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{
              filter: activeFilterCss,
              // Mirror preview only for the front (selfie) camera so the
              // user's view feels natural. Back camera stays un-mirrored so
              // right/left correctly reflect the environment.
              transform: facing === "user" ? "scaleX(-1)" : "none",
            }}
          />
        )}
      </div>

      {!snap && !err && (
        <div className="shrink-0 overflow-x-auto">
          <div className="flex gap-2 px-3 py-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterId(f.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide transition-all ${
                  filterId === f.id
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-center gap-6 py-4">
        {snap ? (
          <>
            <button onClick={() => setSnap(null)} className="rounded-full border border-white/40 px-5 py-2 text-xs text-white">Retake</button>
            <button onClick={confirm} className="gold-btn flex items-center gap-1.5 rounded-full px-6 py-2.5 text-xs">
              <Check className="h-4 w-4" /> USE PHOTO
            </button>
          </>
        ) : (
          <button
            onClick={capture}
            disabled={!!err}
            aria-label="Capture"
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/10 backdrop-blur transition-transform active:scale-90 disabled:opacity-40"
          >
            <Camera className="h-7 w-7 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}