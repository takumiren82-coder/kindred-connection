import { useState } from "react";
import { Mic, Play } from "lucide-react";
import { MediaPayload, bumpViews, remainingViews } from "@/lib/media-msg";
import { CrystalWave, PALETTE_COUNT } from "./CrystalWave";
import { MediaViewer } from "./MediaViewer";

interface Props {
  messageId: string;
  media: MediaPayload;
  mine: boolean;
}

export function MediaBubble({ messageId, media, mine }: Props) {
  const [openViewer, setOpenViewer] = useState(false);
  const [, tick] = useState(0);

  const isLimited = media.maxViews > 0;
  const remaining = isLimited ? remainingViews(messageId, media.maxViews) : Infinity;
  const consumed = isLimited && remaining === 0;
  const hue = media.hue ?? Math.abs(hashCode(messageId)) % PALETTE_COUNT;

  // ---- Audio (voice note): always playable inline (no view limit) ----
  if (media.kind === "audio") {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${mine ? "bg-white/20" : "bg-primary/25"}`}
        >
          <Mic className="h-4 w-4" />
        </div>
        <audio src={media.url} controls className="h-8 max-w-[180px]" />
      </div>
    );
  }

  // ---- Unlimited views → normal thumbnail ----
  if (!isLimited) {
    return (
      <>
        <button onClick={() => setOpenViewer(true)} className="block overflow-hidden rounded-lg">
          {media.kind === "video" ? (
            <div className="relative">
              <video src={media.url} className="max-h-64 max-w-[220px] rounded-lg" muted playsInline />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                  <Play className="h-5 w-5 fill-white text-white" />
                </span>
              </span>
            </div>
          ) : (
            <img src={media.url} alt="" className="max-h-64 max-w-[220px] rounded-lg object-cover" />
          )}
        </button>
        {openViewer && (
          <MediaViewer media={media} remaining={Infinity} onClose={() => setOpenViewer(false)} />
        )}
      </>
    );
  }

  // ---- Limited views: Crystal Wave, or "Opened" if consumed ----
  if (consumed) {
    return (
      <div className="flex items-center gap-1.5 opacity-70">
        <span className="h-3.5 w-3.5 rounded-full border border-current" />
        <span className="text-[12px] italic">Opened</span>
      </div>
    );
  }

  const handleOpen = () => {
    // Sender viewing their own limited-view media should NOT consume the recipient's counter.
    // We only decrement when the receiver opens it.
    if (!mine) bumpViews(messageId);
    setOpenViewer(true);
  };
  const handleClose = () => {
    setOpenViewer(false);
    tick((n) => n + 1); // re-render to show "Opened" after last view
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex flex-col items-start gap-1 rounded-lg py-1"
        aria-label="Open locked media"
      >
        <CrystalWave hue={hue} playIcon={media.kind === "video"} />
        <span className="text-[10px] font-medium tracking-wide opacity-80">
          {media.kind === "video" ? "Video" : "Photo"} • {isLimited && !mine ? `${remaining} view${remaining === 1 ? "" : "s"}` : `${media.maxViews} view${media.maxViews === 1 ? "" : "s"}`}
        </span>
      </button>
      {openViewer && (
        <MediaViewer
          media={media}
          remaining={mine ? media.maxViews : Math.max(0, remaining - 1)}
          onClose={handleClose}
        />
      )}
    </>
  );
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}