/// <reference types="youtube" />
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// Thin wrapper around the official YouTube IFrame Player API.
// Exposes an imperative handle so the Watch Together room can drive
// play / pause / seek from the sync channel.

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YtHandle {
  play: () => void;
  pause: () => void;
  seek: (s: number, allowSeekAhead?: boolean) => void;
  getTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  load: (id: string, startAt?: number) => void;
  mute: () => void;
  unMute: () => void;
}

interface Props {
  videoId: string;
  onReady?: () => void;
  /** 1 = playing, 2 = paused, 0 = ended, 3 = buffering */
  onStateChange?: (state: number) => void;
  className?: string;
}

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return apiPromise;
}

export const YouTubePlayer = forwardRef<YtHandle, Props>(function YouTubePlayer(
  { videoId, onReady, onStateChange, className },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const [ready, setReady] = useState(false);
  const cbReady = useRef(onReady);
  const cbState = useRef(onStateChange);
  cbReady.current = onReady;
  cbState.current = onStateChange;

  useEffect(() => {
    let cancelled = false;
    void loadApi().then(() => {
      if (cancelled || !hostRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(hostRef.current, {
        videoId,
        playerVars: {
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          disablekb: 1,
          iv_load_policy: 3,
          fs: 0,
        },
        events: {
          onReady: () => {
            setReady(true);
            cbReady.current?.();
          },
          onStateChange: (e: YT.OnStateChangeEvent) => cbState.current?.(e.data as number),
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
    // player instance is created once; video changes go through load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !videoId) return;
    const p = playerRef.current;
    if (!p) return;
    try {
      const cur = p.getVideoData?.()?.video_id;
      if (cur !== videoId) p.cueVideoById(videoId);
    } catch {
      /* ignore */
    }
  }, [videoId, ready]);

  useImperativeHandle(
    ref,
    (): YtHandle => ({
      play: () => {
        try {
          playerRef.current?.playVideo();
        } catch {
          /* ignore */
        }
      },
      pause: () => {
        try {
          playerRef.current?.pauseVideo();
        } catch {
          /* ignore */
        }
      },
      seek: (s, allow = true) => {
        try {
          playerRef.current?.seekTo(s, allow);
        } catch {
          /* ignore */
        }
      },
      getTime: () => {
        try {
          return playerRef.current?.getCurrentTime() ?? 0;
        } catch {
          return 0;
        }
      },
      getDuration: () => {
        try {
          return playerRef.current?.getDuration() ?? 0;
        } catch {
          return 0;
        }
      },
      isPlaying: () => {
        try {
          return playerRef.current?.getPlayerState() === 1;
        } catch {
          return false;
        }
      },
      load: (id, startAt = 0) => {
        try {
          playerRef.current?.loadVideoById({ videoId: id, startSeconds: startAt });
        } catch {
          /* ignore */
        }
      },
      mute: () => {
        try {
          playerRef.current?.mute();
        } catch {
          /* ignore */
        }
      },
      unMute: () => {
        try {
          playerRef.current?.unMute();
        } catch {
          /* ignore */
        }
      },
    }),
    [],
  );

  return (
    <div className={className}>
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
});
