import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Heart, Volume2, VolumeX, Play, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/hub/reels")({
  component: ReelsFeed,
});

interface Reel {
  id: string;
  url: string;
}

// Fisher–Yates shuffle — fresh random order every mount, no resume logic.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ReelsFeed() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const shareToStatus = (reel: Reel) =>
    navigate({ to: "/hub/status", search: { reelUrl: reel.url, reelId: reel.id } });

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await supabase.from("reels").select("id,url");
      if (!live) return;
      if (error) console.error("Reels load failed:", error.message);
      const valid = ((data ?? []) as Reel[]).filter((r) => !!r.url);
      setReels(shuffle(valid));
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  // Track which reel is centered.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [reels]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="animate-pulse text-sm tracking-widest text-gold/70">LOADING REELS…</p>
        <BottomNav active="reels" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center">
        <p className="font-heading text-lg tracking-widest text-gold">NO REELS YET</p>
        <p className="mt-2 max-w-xs text-xs text-muted-foreground">
          Add rows to the <span className="text-gold">reels</span> table with a direct MP4 link in the{" "}
          <span className="text-gold">url</span> column.
        </p>
        <BottomNav active="reels" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      <div
        ref={containerRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll"
        style={{ scrollbarWidth: "none" }}
      >
        {reels.map((reel, i) => (
          <ReelItem
            key={reel.id}
            reel={reel}
            index={i}
            isActive={i === active}
            shouldMount={Math.abs(i - active) <= 1}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            liked={!!liked[reel.id]}
            onToggleLike={() => setLiked((p) => ({ ...p, [reel.id]: !p[reel.id] }))}
            onShare={() => shareToStatus(reel)}
          />
        ))}
      </div>
      <BottomNav active="reels" />
    </div>
  );
}

function ReelItem({
  reel,
  index,
  isActive,
  shouldMount,
  muted,
  onToggleMute,
  liked,
  onToggleLike,
  onShare,
}: {
  reel: Reel;
  index: number;
  isActive: boolean;
  shouldMount: boolean;
  muted: boolean;
  onToggleMute: () => void;
  liked: boolean;
  onToggleLike: () => void;
  onShare: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const isVideo = reel.url.includes("res.cloudinary.com") || reel.url.endsWith(".mp4");

  // Only the active reel plays; every other reel is paused and rewound to 0
  // so nothing keeps playing in the background and each reel starts fresh.
  useEffect(() => {
    const v = videoRef.current;
    if (!isVideo || !v) return;
    if (isActive) {
      v.currentTime = 0;
      v.muted = muted;
      v.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      v.pause();
      v.currentTime = 0;
      v.muted = true;
    }
  }, [isActive, isVideo]);

  // Keep the audible state of the active reel in sync with the mute toggle.
  useEffect(() => {
    const v = videoRef.current;
    if (isVideo && v && isActive) v.muted = muted;
  }, [muted, isActive, isVideo]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  return (
    <section
      data-index={index}
      className="relative flex h-full w-full snap-start items-center justify-center"
    >
      {shouldMount ? (
        <>
          <video
            ref={videoRef}
            controls={false}
            playsInline
            loop
            muted={!isActive || muted}
            preload="metadata"
            className="h-full w-full object-cover"
            src={reel.url}
            onClick={togglePlay}
          >
            Your browser does not support the video tag.
          </video>

          {paused && (
            <button
              onClick={togglePlay}
              aria-label="Play"
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                <Play className="h-9 w-9 fill-white text-white" />
              </span>
            </button>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

          <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5">
            <button
              onClick={onToggleLike}
              aria-label="Like"
              className="flex flex-col items-center text-white"
            >
              <Heart
                className={`h-8 w-8 transition ${liked ? "fill-rose-500 text-rose-500" : "text-white"}`}
              />
            </button>
            <button
              onClick={onShare}
              aria-label="Share to Status"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
            >
              <Send className="h-5 w-5" />
            </button>
            <button
              onClick={onToggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>
        </>
      ) : (
        <div className="h-full w-full bg-black" />
      )}
    </section>
  );
}
