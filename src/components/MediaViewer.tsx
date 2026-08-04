import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Maximize2, Minimize2, ShieldAlert } from "lucide-react";
import { MediaPayload } from "@/lib/media-msg";

// Fullscreen viewer with a premium "opening…" animation before revealing media.
// After the viewer closes, the parent bumps the view count.
// One-view / limited media triggers "secure mode": disables long-press, drag,
// context-menu and blanks the screen if the tab loses focus (best-effort
// screenshot / recording deterrence on the web).

interface Props {
  media: MediaPayload;
  remaining: number; // remaining views AFTER this view (0 for one-view)
  onClose: () => void;
}

export function MediaViewer({ media, remaining, onClose }: Props) {
  const [phase, setPhase] = useState<"opening" | "shown">("opening");
  const [expanded, setExpanded] = useState(false);
  const [obscured, setObscured] = useState(false);
  const secure = media.maxViews > 0 && media.kind !== "audio";
  const closedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setPhase("shown"), 1400);
    return () => clearTimeout(t);
  }, []);

  // Secure mode: block capture affordances + close when tab hidden.
  useEffect(() => {
    if (!secure) return;
    const stop = (e: Event) => e.preventDefault();
    const onVis = () => {
      if (document.hidden || !document.hasFocus()) {
        setObscured(true);
        // Auto-close on backgrounding to prevent screen recording capture
        if (!closedRef.current) {
          closedRef.current = true;
          setTimeout(() => onClose(), 50);
        }
      } else {
        setObscured(false);
      }
    };
    document.addEventListener("contextmenu", stop);
    document.addEventListener("dragstart", stop);
    document.addEventListener("selectstart", stop);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("contextmenu", stop);
      document.removeEventListener("dragstart", stop);
      document.removeEventListener("selectstart", stop);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [secure, onClose]);

  const mediaBoxSize = expanded
    ? "max-h-[92vh] max-w-[100vw]"
    : "max-h-[62vh] max-w-[88vw]";

  const toggle = () => setExpanded((v) => !v);

  const secureStyle: React.CSSProperties = secure
    ? {
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        pointerEvents: obscured ? "none" : "auto",
      }
    : {};

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/98 animate-fade-in"
      style={secureStyle}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} aria-label="Close" className="text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {secure && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-1 text-[10px] font-medium text-red-300 backdrop-blur">
              <ShieldAlert className="h-3 w-3" /> PROTECTED
            </span>
          )}
          {media.kind !== "audio" && (
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white backdrop-blur">
              <Eye className="h-3 w-3" /> {remaining === Infinity ? "∞" : remaining}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        {phase === "opening" ? (
          <OpeningAnim />
        ) : (
          <>
            <button
              onClick={media.kind === "audio" ? undefined : toggle}
              aria-label={expanded ? "Minimize" : "Expand"}
              className="relative flex items-center justify-center outline-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {media.kind === "image" ? (
                <img
                  src={media.url}
                  alt=""
                  draggable={false}
                  onContextMenu={secure ? (e) => e.preventDefault() : undefined}
                  className={`${mediaBoxSize} rounded-lg object-contain animate-fade-in select-none`}
                />
              ) : media.kind === "video" ? (
                <video
                  src={media.url}
                  controls
                  autoPlay
                  playsInline
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate noremoteplayback"
                  onContextMenu={secure ? (e) => e.preventDefault() : undefined}
                  className={`${mediaBoxSize} rounded-lg animate-fade-in`}
                />
              ) : (
                <audio src={media.url} controls autoPlay className="w-72 max-w-full" />
              )}
              {media.kind !== "audio" && (
                <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </span>
              )}
            </button>

            {/* Caption is always BELOW media, never overlapping */}
            {media.caption && (
              <p className="max-w-[88vw] text-center text-sm text-white/90">
                {media.caption}
              </p>
            )}

            {media.kind !== "audio" && (
              <p className="text-center text-[11px] text-white/60">
                {remaining === 0
                  ? "This will disappear after you close it."
                  : `${remaining} view${remaining === 1 ? "" : "s"} remaining.`}
              </p>
            )}
          </>
        )}
      </div>

      {secure && obscured && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black">
          <span className="text-[11px] tracking-[0.35em] text-white/70">CONTENT PROTECTED</span>
        </div>
      )}
    </div>
  );
}

function OpeningAnim() {
  return (
    <div className="flex flex-col items-center gap-6">
      <svg width="220" height="60" viewBox="0 0 220 60" className="crystal-wave-svg">
        <defs>
          <linearGradient id="ov-g" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff2fb0" />
            <stop offset="50%" stopColor="#d63af9" />
            <stop offset="100%" stopColor="#7ad9ff" />
          </linearGradient>
          <filter id="ov-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <path
          d="M4 30 Q 44 4, 84 30 T 164 30 T 216 30"
          fill="none"
          stroke="url(#ov-g)"
          strokeWidth="3"
          strokeLinecap="round"
          className="crystal-wave-path"
          filter="url(#ov-glow)"
        />
      </svg>
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs tracking-[0.35em] text-white/80">OPENING…</span>
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-full bg-gradient-to-r from-[#ff2fb0] via-[#d63af9] to-[#7ad9ff] animate-loading-bar" />
        </div>
        <span className="text-[10px] text-white/50">Please wait</span>
      </div>
    </div>
  );
}