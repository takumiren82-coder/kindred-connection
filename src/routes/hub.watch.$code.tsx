import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Hand,
  Heart,
  Info,
  Lock,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  Settings,
  Share2,
  Smile,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { YouTubePlayer, type YtHandle } from "@/components/watch/YouTubePlayer";
import { useVoiceMesh } from "@/hooks/useVoiceMesh";
import { getMyId, getMyName } from "@/lib/identity";
import {
  DEFAULT_SETTINGS,
  fmtTime,
  getRecent,
  isHostLocal,
  saveRecent,
  type RoomSettings,
  type WatchChatMsg,
  type WatchVideo,
} from "@/lib/watch";

export const Route = createFileRoute("/hub/watch/$code")({
  component: WatchRoom,
  head: () => ({
    meta: [
      { title: "Watch Party — EmberChat" },
      { name: "description", content: "Synced YouTube watch party with voice and live chat." },
      { property: "og:title", content: "Watch Party — EmberChat" },
      { property: "og:description", content: "Watch YouTube in perfect sync with friends." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

interface SyncState {
  video: WatchVideo | null;
  time: number;
  playing: boolean;
  at: number;
  host: string;
  settings: RoomSettings;
}

interface Member {
  id: string;
  name: string;
  host: boolean;
  mic: boolean;
  hand: boolean;
}

const DRIFT = 1.1; // seconds of tolerance before we hard-seek

function initials(n: string) {
  return (n || "?").trim().slice(0, 2).toUpperCase();
}

function WatchRoom() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  const myId = useMemo(() => getMyId(), []);
  const myName = useMemo(() => getMyName() || "Guest", []);
  const recent = useMemo(() => getRecent(code), [code]);
  const [isHost, setIsHost] = useState(() => isHostLocal(code));
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const [settings, setSettings] = useState<RoomSettings>(recent?.settings ?? DEFAULT_SETTINGS);
  const [video, setVideo] = useState<WatchVideo | null>(recent?.video ?? null);
  const [members, setMembers] = useState<Member[]>([]);
  const [chat, setChat] = useState<WatchChatMsg[]>([]);
  const [tab, setTab] = useState<"chat" | "members" | "info">("chat");
  const [input, setInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [hand, setHand] = useState(false);
  const [theater, setTheater] = useState(false);
  const [needsTap, setNeedsTap] = useState(true);
  const [invite, setInvite] = useState(false);
  const [hostPanel, setHostPanel] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reactions, setReactions] = useState<{ id: number; emoji: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [typingFrom, setTypingFrom] = useState<string>("");

  const player = useRef<YtHandle>(null);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const readyRef = useRef(false);
  const applyingRef = useRef(false);
  const lastStateRef = useRef<SyncState | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const voice = useVoiceMesh(code, myId, settings.voiceChat);

  const link = typeof window !== "undefined" ? `${window.location.origin}/hub/watch/${code}` : "";

  const send = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      chRef.current?.send({ type: "broadcast", event, payload: { from: myId, ...payload } });
    },
    [myId],
  );

  const broadcastState = useCallback(
    (over?: Partial<SyncState>) => {
      if (!isHostRef.current) return;
      const p = player.current;
      const state: SyncState = {
        video,
        time: p?.getTime() ?? 0,
        playing: p?.isPlaying() ?? false,
        at: Date.now(),
        host: myId,
        settings,
        ...over,
      };
      lastStateRef.current = state;
      send("state", state as unknown as Record<string, unknown>);
    },
    [video, myId, settings, send],
  );

  const applyState = useCallback((s: SyncState) => {
    const p = player.current;
    lastStateRef.current = s;
    setSettings(s.settings ?? DEFAULT_SETTINGS);
    if (s.video) setVideo((v) => (v?.id === s.video?.id ? v : s.video));
    if (!p || !readyRef.current) return;
    const elapsed = s.playing ? Math.max(0, (Date.now() - s.at) / 1000) : 0;
    const target = s.time + elapsed;
    applyingRef.current = true;
    if (s.video && s.video.id !== currentVideoId.current) {
      currentVideoId.current = s.video.id;
      p.load(s.video.id, target);
      if (!s.playing) setTimeout(() => p.pause(), 400);
    } else {
      if (Math.abs(p.getTime() - target) > DRIFT) p.seek(target, true);
      if (s.playing && !p.isPlaying()) p.play();
      if (!s.playing && p.isPlaying()) p.pause();
    }
    setPlaying(s.playing);
    setTimeout(() => (applyingRef.current = false), 600);
  }, []);
  const currentVideoId = useRef<string | null>(recent?.video?.id ?? null);

  // ---- realtime room channel -------------------------------------------
  useEffect(() => {
    if (!code || !myId) return;
    const ch = supabase.channel(`watch:${code}`, {
      config: { broadcast: { self: false }, presence: { key: myId } },
    });
    chRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const list: Member[] = Object.entries(st).map(([id, metas]) => {
        const m = (metas[0] ?? {}) as Partial<Member>;
        return {
          id,
          name: (m.name as string) || "Guest",
          host: !!m.host,
          mic: !!m.mic,
          hand: !!m.hand,
        };
      });
      list.sort((a, b) => Number(b.host) - Number(a.host) || a.name.localeCompare(b.name));
      setMembers(list);
      // If no host is present and I created the room locally, claim host.
      if (!list.some((m) => m.host) && isHostLocal(code)) setIsHost(true);
    })
      .on("broadcast", { event: "state" }, ({ payload }) => {
        const s = payload as unknown as SyncState;
        if (s.host === myId) return;
        if (isHostRef.current) return;
        applyState(s);
      })
      .on("broadcast", { event: "req" }, () => {
        if (isHostRef.current) broadcastState();
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const m = payload as unknown as WatchChatMsg;
        setChat((c) => (c.some((x) => x.id === m.id) ? c : [...c, m].slice(-200)));
      })
      .on("broadcast", { event: "react" }, ({ payload }) => {
        const p = payload as { emoji: string };
        setReactions((r) => [...r, { id: Date.now() + Math.random(), emoji: p.emoji }]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { name: string };
        setTypingFrom(p.name);
        setTimeout(() => setTypingFrom(""), 2200);
      })
      .on("broadcast", { event: "muteall" }, () => {
        if (voice.micOn) void voice.toggleMic();
      });

    void ch.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await ch.track({ name: myName, host: isHostRef.current, mic: false, hand: false });
      if (isHostRef.current) broadcastState();
      else send("req", {});
    });

    return () => {
      supabase.removeChannel(ch);
      chRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, myId]);

  // keep presence metadata fresh
  useEffect(() => {
    void chRef.current?.track({ name: myName, host: isHost, mic: voice.micOn, hand });
  }, [myName, isHost, voice.micOn, hand]);

  // host heartbeat keeps everyone locked to the same second
  useEffect(() => {
    if (!isHost) return;
    const t = setInterval(() => broadcastState(), 1500);
    return () => clearInterval(t);
  }, [isHost, broadcastState]);

  // guests: nudge back into sync using the last known host state
  useEffect(() => {
    if (isHost) return;
    const t = setInterval(() => {
      const s = lastStateRef.current;
      const p = player.current;
      if (!s || !p || !readyRef.current || applyingRef.current || needsTap) return;
      const target = s.time + (s.playing ? (Date.now() - s.at) / 1000 : 0);
      if (Math.abs(p.getTime() - target) > DRIFT) p.seek(target, true);
      if (s.playing && !p.isPlaying()) p.play();
      if (!s.playing && p.isPlaying()) p.pause();
    }, 2000);
    return () => clearInterval(t);
  }, [isHost, needsTap]);

  // progress ticker
  useEffect(() => {
    const t = setInterval(() => {
      const p = player.current;
      if (!p) return;
      setCur(p.getTime());
      setDur(p.getDuration());
    }, 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  // save room in recents whenever the video changes
  useEffect(() => {
    if (!video) return;
    saveRecent({ code, name: settings.name, video, at: Date.now(), host: isHost, settings });
  }, [video, code, settings, isHost]);

  // clean up floating reactions
  useEffect(() => {
    if (reactions.length === 0) return;
    const t = setTimeout(() => setReactions((r) => r.slice(1)), 1800);
    return () => clearTimeout(t);
  }, [reactions]);

  const canControl = isHost || !settings.hostOnlyPlay;

  const togglePlay = () => {
    const p = player.current;
    if (!p || !canControl) return;
    if (p.isPlaying()) {
      p.pause();
      setPlaying(false);
      broadcastState({ playing: false, time: p.getTime(), at: Date.now() });
    } else {
      p.play();
      setPlaying(true);
      broadcastState({ playing: true, time: p.getTime(), at: Date.now() });
    }
  };

  const skip = (delta: number) => {
    const p = player.current;
    if (!p || !canControl) return;
    const t = Math.max(0, p.getTime() + delta);
    p.seek(t, true);
    setCur(t);
    broadcastState({ time: t, at: Date.now(), playing: p.isPlaying() });
  };

  const scrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = player.current;
    if (!p || !canControl) return;
    const t = Number(e.target.value);
    p.seek(t, true);
    setCur(t);
    broadcastState({ time: t, at: Date.now(), playing: p.isPlaying() });
  };

  const sendChat = () => {
    const text = input.trim();
    if (!text) return;
    const msg: WatchChatMsg = {
      id: `${myId}-${Date.now()}`,
      from: myId,
      name: myName,
      text,
      at: Date.now(),
    };
    setChat((c) => [...c, msg].slice(-200));
    send("chat", msg as unknown as Record<string, unknown>);
    setInput("");
  };

  const react = (emoji: string) => {
    setReactions((r) => [...r, { id: Date.now() + Math.random(), emoji }]);
    send("react", { emoji });
  };

  const startWatching = () => {
    setNeedsTap(false);
    const p = player.current;
    const s = lastStateRef.current;
    p?.unMute();
    if (s) applyState(s);
    else if (isHost && video) {
      p?.load(video.id, 0);
      p?.play();
      setPlaying(true);
      broadcastState({ playing: true, time: 0, at: Date.now() });
    }
  };

  const leave = () => {
    setLeaving(true);
    setTimeout(() => void navigate({ to: "/hub/watch" }), 1400);
  };

  const onPlayerReady = () => {
    readyRef.current = true;
    const s = lastStateRef.current;
    if (s) applyState(s);
    else send("req", {});
  };

  const onPlayerState = (state: number) => {
    if (applyingRef.current) return;
    if (isHostRef.current) {
      if (state === 1) {
        setPlaying(true);
        broadcastState({ playing: true, time: player.current?.getTime() ?? 0, at: Date.now() });
      } else if (state === 2) {
        setPlaying(false);
        broadcastState({ playing: false, time: player.current?.getTime() ?? 0, at: Date.now() });
      }
    } else if (settings.hostOnlyPlay) {
      // Guests can't change playback — snap straight back to host state.
      const s = lastStateRef.current;
      if (s) applyState(s);
    }
  };

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(memberQuery.toLowerCase()),
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#050304] text-neutral-100">
      {/* header */}
      {!theater && (
        <header className="flex items-center gap-3 px-4 pb-2 pt-4">
          <button onClick={leave} className="text-neutral-300">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-[15.5px] font-semibold">{settings.name} 🍿</p>
            <p className="text-[11.5px] text-neutral-500">{members.length || 1} members</p>
          </div>
          <button onClick={() => setTheater(true)} className="text-neutral-300">
            <Maximize2 className="h-[18px] w-[18px]" />
          </button>
          <button onClick={() => setHostPanel(true)} className="text-neutral-300">
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </header>
      )}

      {/* player */}
      <div className={`relative bg-black ${theater ? "flex-1" : ""}`}>
        <div className={`relative w-full ${theater ? "h-full" : "aspect-video"}`}>
          {video ? (
            <YouTubePlayer
              ref={player}
              videoId={video.id}
              onReady={onPlayerReady}
              onStateChange={onPlayerState}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-neutral-500">
              <MonitorPlay className="h-10 w-10" />
              <p className="text-[13px]">Waiting for the host to pick a video…</p>
            </div>
          )}

          {/* transparent shield: taps go to our own controls, not YouTube's */}
          <div className="absolute inset-0" onClick={togglePlay} />

          {/* floating reactions */}
          <div className="pointer-events-none absolute bottom-14 right-4 flex flex-col-reverse gap-1">
            {reactions.slice(-6).map((r) => (
              <span key={r.id} className="animate-bounce text-2xl">
                {r.emoji}
              </span>
            ))}
          </div>

          {/* center controls */}
          {video && !needsTap && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-8">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skip(-10);
                }}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white disabled:opacity-30"
                disabled={!canControl}
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-30"
                disabled={!canControl}
              >
                {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 fill-current" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skip(10);
                }}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white disabled:opacity-30"
                disabled={!canControl}
              >
                <RotateCw className="h-5 w-5" />
              </button>
            </div>
          )}

          {theater && (
            <button
              onClick={() => setTheater(false)}
              className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white"
            >
              <Minimize2 className="h-4.5 w-4.5" />
            </button>
          )}

          {/* tap-to-start (browsers block autoplay with sound) */}
          {needsTap && (
            <button
              onClick={startWatching}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary shadow-[0_0_40px_-8px_var(--primary)]">
                <Play className="h-7 w-7 fill-primary text-primary" />
              </span>
              <span className="text-[14px] font-semibold">Tap to join the watch party</span>
              <span className="text-[11.5px] text-neutral-400">You'll be synced to everyone else</span>
            </button>
          )}
        </div>

        {/* progress */}
        <div className="flex items-center gap-2 bg-black px-3 pb-2 pt-1">
          <span className="w-11 text-right text-[10.5px] tabular-nums text-neutral-400">{fmtTime(cur)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(dur, 1)}
            value={Math.min(cur, dur || 1)}
            onChange={scrub}
            disabled={!canControl}
            className="h-1 flex-1 appearance-none rounded-full bg-neutral-700 accent-[var(--primary)]"
            style={{
              background: `linear-gradient(to right, var(--primary) ${(cur / (dur || 1)) * 100}%, #2a2a2a 0%)`,
            }}
          />
          <span className="w-11 text-[10.5px] tabular-nums text-neutral-400">{fmtTime(dur)}</span>
        </div>
      </div>

      {!theater && (
        <>
          {/* control row */}
          <div className="mx-4 mt-3 grid grid-cols-5 gap-2 rounded-2xl border border-primary/20 bg-[#0d0708]/80 p-2.5">
            <CtrlBtn
              active={voice.micOn}
              disabled={!settings.voiceChat}
              Icon={voice.micOn ? Mic : MicOff}
              label={voice.micOn ? "Mic On" : "Mic Off"}
              onClick={() => void voice.toggleMic()}
            />
            <CtrlBtn
              active={voice.speakerOn}
              Icon={voice.speakerOn ? Volume2 : VolumeX}
              label="Speaker"
              onClick={voice.toggleSpeaker}
            />
            <CtrlBtn Icon={MonitorPlay} label="Screen" onClick={() => setTheater(true)} />
            <CtrlBtn Icon={Heart} label="React" onClick={() => react("❤️")} />
            <CtrlBtn danger Icon={X} label="Leave" onClick={leave} />
          </div>

          {/* tabs */}
          <div className="mt-3 flex border-b border-white/6 px-2">
            {(["chat", "members", "info"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 pb-2.5 pt-2 text-[13.5px] font-semibold capitalize transition ${
                  tab === t
                    ? "border-b-2 border-primary text-primary"
                    : "border-b-2 border-transparent text-neutral-500"
                }`}
              >
                {t}
                {t === "members" && (
                  <span className="ml-1.5 rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-neutral-300">
                    {members.length || 1}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "chat" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
                {chat.length === 0 && (
                  <p className="py-6 text-center text-[12.5px] text-neutral-600">
                    Say something while you watch…
                  </p>
                )}
                {chat.map((m) => (
                  <div key={m.id} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-white/6 bg-[#0d0708]/80 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12.5px] font-semibold text-primary/90">
                          {m.from === myId ? "You" : m.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-neutral-600">
                          {new Date(m.at).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="break-words text-[13.5px] leading-snug">{m.text}</p>
                    </div>
                  </div>
                ))}
                {typingFrom && (
                  <p className="pl-11 text-[11px] text-neutral-500">{typingFrom} is typing…</p>
                )}
                <div ref={chatEnd} />
              </div>

              {settings.textChat && (
                <div className="flex items-center gap-2 border-t border-white/6 px-3 py-2.5">
                  <div className="flex flex-1 items-center gap-2 rounded-full border border-white/8 bg-[#0d0708] px-3.5 py-2">
                    <input
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        if (typingTimer.current) clearTimeout(typingTimer.current);
                        typingTimer.current = setTimeout(() => send("typing", { name: myName }), 300);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && sendChat()}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-neutral-600"
                    />
                    <button onClick={() => react("🔥")} className="text-neutral-500">
                      <Smile className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                  <button
                    onClick={sendChat}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-[0_0_18px_-4px_var(--primary)]"
                  >
                    <Send className="h-[18px] w-[18px]" />
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "members" && (
            <div className="flex-1 space-y-2 px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#0d0708] px-3 py-2">
                <Search className="h-4 w-4 text-neutral-500" />
                <input
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Search members"
                  className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-neutral-600"
                />
              </div>
              {filteredMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-white/6 bg-[#0d0708]/80 px-3 py-2.5"
                >
                  <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-[11.5px] font-bold text-primary">
                    {initials(m.name)}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0d0708] ${
                        voice.speaking[m.id] ? "bg-primary" : "bg-emerald-500"
                      }`}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium">
                        {m.id === myId ? `${m.name} (You)` : m.name}
                      </span>
                      {m.host && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9.5px] font-bold text-primary">
                          Host
                        </span>
                      )}
                    </span>
                    {voice.speaking[m.id] && (
                      <span className="text-[10.5px] text-primary">speaking…</span>
                    )}
                  </span>
                  {m.hand && <Hand className="h-4 w-4 text-primary" />}
                  {m.host && <Crown className="h-4 w-4 text-amber-400" />}
                  {m.mic ? (
                    <Mic className="h-4 w-4 text-neutral-300" />
                  ) : (
                    <MicOff className="h-4 w-4 text-neutral-600" />
                  )}
                </div>
              ))}
              <button
                onClick={() => setInvite(true)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 py-3 text-[14.5px] font-semibold text-primary"
              >
                <UserPlus className="h-4.5 w-4.5" /> Invite Members
              </button>
              <button
                onClick={() => setHand((h) => !h)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-[14px] text-neutral-300"
              >
                <Hand className="h-4 w-4" /> {hand ? "Lower hand" : "Raise hand"}
              </button>
            </div>
          )}

          {tab === "info" && (
            <div className="flex-1 space-y-3 px-4 py-3">
              <div className="rounded-2xl border border-white/6 bg-[#0d0708]/80 p-4">
                <p className="text-[14.5px] font-semibold">About Room</p>
                <p className="mt-1 text-[12.5px] text-neutral-500">
                  {video ? video.title : "Just chill and enjoy together."}
                </p>
              </div>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-white/6 bg-[#0d0708]/80 px-4 py-3.5"
              >
                <span className="text-left">
                  <span className="block text-[11.5px] text-neutral-500">Room Code</span>
                  <span className="block text-[14.5px] font-semibold tracking-wide">{code}</span>
                </span>
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-neutral-400" />}
              </button>
              <button
                onClick={() => void navigator.clipboard?.writeText(link)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/6 bg-[#0d0708]/80 px-4 py-3.5"
              >
                <span className="min-w-0 text-left">
                  <span className="block text-[11.5px] text-neutral-500">Invite Link</span>
                  <span className="block truncate text-[13px]">{link}</span>
                </span>
                <Copy className="h-4 w-4 shrink-0 text-neutral-400" />
              </button>
              <div className="flex items-center justify-between rounded-2xl border border-white/6 bg-[#0d0708]/80 px-4 py-3.5">
                <span>
                  <span className="block text-[11.5px] text-neutral-500">Privacy</span>
                  <span className="block text-[14px] capitalize">{settings.privacy}</span>
                </span>
                <Lock className="h-4 w-4 text-neutral-400" />
              </div>
              <div className="rounded-2xl border border-white/6 bg-[#0d0708]/80">
                <div className="px-4 pb-1 pt-3.5">
                  <p className="text-[14.5px] font-semibold">Host Controls</p>
                  <p className="text-[11.5px] text-neutral-500">
                    Only hosts can change playback and room settings.
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                  <span className="text-[13.5px] text-neutral-300">Playback Control</span>
                  <span className="text-[13px] font-semibold text-primary">
                    {settings.hostOnlyPlay ? "Host Only" : "Everyone"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                  <span className="text-[13.5px] text-neutral-300">Chat Permission</span>
                  <span className="text-[13px] font-semibold">Everyone</span>
                </div>
              </div>
              <div className="flex items-center gap-2 pb-6 text-[11.5px] text-neutral-600">
                <Info className="h-3.5 w-3.5" /> Everyone stays in perfect sync automatically.
              </div>
            </div>
          )}
        </>
      )}

      {/* invite sheet */}
      {invite && (
        <Sheet title="Invite to Room" onClose={() => setInvite(false)}>
          {[
            { label: "Copy Invite Link", run: () => navigator.clipboard?.writeText(link), Icon: Copy },
            {
              label: "Share Link",
              Icon: Share2,
              run: async () => {
                if (navigator.share) {
                  try {
                    await navigator.share({ title: "EmberChat Watch Party", url: link });
                  } catch {
                    /* cancelled */
                  }
                } else navigator.clipboard?.writeText(link);
              },
            },
            { label: `Room Code · ${code}`, Icon: Users, run: () => navigator.clipboard?.writeText(code) },
          ].map(({ label, Icon, run }) => (
            <button
              key={label}
              onClick={() => void run()}
              className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3.5 text-left last:border-0"
            >
              <Icon className="h-4.5 w-4.5 text-primary" />
              <span className="flex-1 text-[14.5px]">{label}</span>
              <span className="text-neutral-600">›</span>
            </button>
          ))}
        </Sheet>
      )}

      {/* host controls */}
      {hostPanel && (
        <Sheet title={isHost ? "Host Controls" : "Room Controls"} onClose={() => setHostPanel(false)}>
          {[
            {
              label: playing ? "Pause Playback" : "Resume Playback",
              Icon: playing ? Pause : Play,
              run: togglePlay,
              hostOnly: true,
            },
            { label: "Seek Forward 10s", Icon: RotateCw, run: () => skip(10), hostOnly: true },
            { label: "Seek Backward 10s", Icon: RotateCcw, run: () => skip(-10), hostOnly: true },
            {
              label: "Mute All Members",
              Icon: MicOff,
              run: () => send("muteall", {}),
              hostOnly: true,
            },
            {
              label: settings.hostOnlyPlay ? "Allow Everyone to Play" : "Restrict Playback to Host",
              Icon: Lock,
              run: () => {
                const next = { ...settings, hostOnlyPlay: !settings.hostOnlyPlay };
                setSettings(next);
                broadcastState({ settings: next });
              },
              hostOnly: true,
            },
            { label: "Invite Members", Icon: UserPlus, run: () => setInvite(true), hostOnly: false },
          ]
            .filter((i) => !i.hostOnly || isHost)
            .map(({ label, Icon, run }) => (
              <button
                key={label}
                onClick={() => {
                  run();
                  setHostPanel(false);
                }}
                className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3.5 text-left last:border-0"
              >
                <Icon className="h-4.5 w-4.5 text-primary" />
                <span className="flex-1 text-[14.5px]">{label}</span>
              </button>
            ))}
          {!isHost && (
            <p className="px-4 py-4 text-[12.5px] text-neutral-500">
              The host controls playback for everyone in this room.
            </p>
          )}
        </Sheet>
      )}

      {/* leaving overlay */}
      {leaving && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#050304]/95 backdrop-blur">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary shadow-[0_0_45px_-10px_var(--primary)]">
            <X className="h-10 w-10 text-primary" />
          </div>
          <p className="text-[15px] font-semibold">Leaving Watch Room…</p>
          <div className="space-y-1.5 text-[12.5px] text-neutral-400">
            {["Saving chat…", "Disconnecting voice…", "Syncing playback…", "See you soon!"].map((s) => (
              <p key={s} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary" /> {s}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CtrlBtn({
  Icon,
  label,
  onClick,
  active,
  danger,
  disabled,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-xl py-2 transition disabled:opacity-35 ${
        active ? "bg-primary/15" : ""
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full border ${
          danger
            ? "border-primary/50 text-primary"
            : active
              ? "border-primary bg-primary text-white"
              : "border-white/12 text-neutral-300"
        }`}
      >
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className={`text-[10.5px] ${danger ? "text-primary" : "text-neutral-400"}`}>{label}</span>
    </button>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl border-t border-primary/25 bg-[#0b0607] pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="font-heading text-[15.5px] font-semibold">{title}</p>
          <button onClick={onClose} className="text-neutral-400">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="border-t border-white/5">{children}</div>
      </div>
    </div>
  );
}
