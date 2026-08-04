import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Link2,
  Loader2,
  MonitorPlay,
  Play,
  Search,
  Send,
  Share2,
  Users,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { searchYouTube, youtubeMeta } from "@/lib/youtube.functions";
import {
  DEFAULT_SETTINGS,
  genRoomCode,
  markHost,
  parseYouTubeId,
  readRecent,
  saveRecent,
  type RecentRoom,
  type RoomSettings,
  type WatchVideo,
} from "@/lib/watch";
import { getMyName } from "@/lib/identity";

export const Route = createFileRoute("/hub/watch")({
  component: WatchTogether,
  head: () => ({
    meta: [
      { title: "Watch Together — EmberChat" },
      {
        name: "description",
        content:
          "Create a private room and watch YouTube videos in perfect sync with friends, with voice and live chat.",
      },
      { property: "og:title", content: "Watch Together — EmberChat" },
      {
        property: "og:description",
        content: "Synced YouTube watch parties with voice and live chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Step = "hub" | "create" | "created" | "invite" | "select" | "ready";

const card = "rounded-2xl border border-primary/20 bg-[#0d0708]/80";
const btnPrimary =
  "w-full rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_0_24px_-6px_var(--primary)] active:scale-[.99] transition";
const btnGhost =
  "w-full rounded-xl border border-primary/40 bg-transparent py-3.5 text-[15px] font-semibold text-primary/90 active:scale-[.99] transition";

function WatchTogether() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("hub");
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [video, setVideo] = useState<WatchVideo | null>(null);
  const [recent, setRecent] = useState<RecentRoom[]>([]);

  useEffect(() => setRecent(readRecent()), []);

  const enterRoom = useCallback(
    (roomCode: string, host: boolean, vid?: WatchVideo | null, s?: RoomSettings) => {
      saveRecent({
        code: roomCode,
        name: s?.name ?? settings.name,
        video: vid ?? undefined,
        at: Date.now(),
        host,
        settings: s ?? settings,
      });
      if (host) markHost(roomCode);
      void navigate({ to: "/hub/watch/$code", params: { code: roomCode } });
    },
    [navigate, settings],
  );

  if (step === "create")
    return <CreateRoom settings={settings} setSettings={setSettings} onBack={() => setStep("hub")} onCreate={() => { setCode(genRoomCode(settings.name)); setStep("created"); }} />;

  if (step === "created")
    return (
      <RoomCreated
        code={code}
        settings={settings}
        onBack={() => setStep("create")}
        onNext={() => setStep("invite")}
      />
    );

  if (step === "invite")
    return <InviteFriends code={code} onBack={() => setStep("created")} onNext={() => setStep("select")} />;

  if (step === "select")
    return (
      <SelectVideo
        onBack={() => setStep("invite")}
        onPicked={(v) => {
          setVideo(v);
          setStep("ready");
        }}
      />
    );

  if (step === "ready")
    return (
      <RoomReady
        code={code}
        settings={settings}
        video={video}
        onBack={() => setStep("select")}
        onStart={() => enterRoom(code, true, video, settings)}
      />
    );

  return (
    <div className="min-h-screen bg-[#050304] pb-24 text-neutral-100">
      <header className="px-5 pt-8">
        <h1 className="font-heading text-2xl font-bold">Watch Together</h1>
        <p className="mt-1 text-[13px] text-neutral-400">
          Watch videos, movies and more together with your friends.
        </p>
      </header>

      <div className="mt-8 flex justify-center">
        <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-primary/40 bg-primary/5 shadow-[0_0_60px_-12px_var(--primary)]">
          <div className="absolute inset-3 rounded-full border border-primary/20" />
          <MonitorPlay className="h-16 w-16 text-primary" strokeWidth={1.4} />
        </div>
      </div>

      <div className="mt-9 space-y-3 px-5">
        <button className={btnPrimary} onClick={() => setStep("create")}>
          Create Room
        </button>
        <button className={btnGhost} onClick={() => setJoinOpen((v) => !v)}>
          Join with Room Code
        </button>
        {joinOpen && (
          <div className={`${card} flex items-center gap-2 p-2`}>
            <input
              autoFocus
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM-1234"
              className="flex-1 bg-transparent px-3 py-2.5 text-[15px] tracking-widest outline-none placeholder:text-neutral-600"
            />
            <button
              disabled={joinCode.trim().length < 4}
              onClick={() => enterRoom(joinCode.trim(), false, null, { ...settings, name: joinCode.trim() })}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Join
            </button>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <section className="mt-8 px-5">
          <h2 className="mb-3 text-[13px] font-semibold text-neutral-400">Your Recent Rooms</h2>
          <div className="space-y-2.5">
            {recent.map((r) => (
              <button
                key={r.code}
                onClick={() => enterRoom(r.code, r.host, r.video, r.settings)}
                className={`${card} flex w-full items-center gap-3 p-3 text-left`}
              >
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-900">
                  {r.video?.thumb && (
                    <img src={r.video.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{r.name}</p>
                  <p className="truncate text-[11.5px] text-neutral-500">
                    {r.code} · {r.video?.title ?? "No video yet"}
                  </p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Play className="h-4 w-4 fill-current" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <BottomNav active="watch" />
    </div>
  );
}

function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/5 bg-[#050304]/95 px-4 py-3.5 backdrop-blur">
      <button onClick={onBack} className="text-neutral-300">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="font-heading text-[17px] font-semibold">{title}</h1>
    </header>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition ${on ? "bg-primary" : "bg-neutral-700"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

function CreateRoom({
  settings,
  setSettings,
  onBack,
  onCreate,
}: {
  settings: RoomSettings;
  setSettings: (s: RoomSettings) => void;
  onBack: () => void;
  onCreate: () => void;
}) {
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) =>
    setSettings({ ...settings, [k]: v });
  return (
    <div className="min-h-screen bg-[#050304] pb-28 text-neutral-100">
      <StepHeader title="Create Room" onBack={onBack} />
      <div className="space-y-6 px-5 pt-5">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-neutral-300">Room Name</p>
          <input
            value={settings.name}
            onChange={(e) => set("name", e.target.value)}
            className={`${card} w-full px-4 py-3 text-[15px] outline-none focus:border-primary/50`}
          />
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-neutral-300">Room Type</p>
          <div className="space-y-2.5">
            {(["public", "private"] as const).map((p) => (
              <button
                key={p}
                onClick={() => set("privacy", p)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                  settings.privacy === p
                    ? "border-primary bg-primary/10"
                    : "border-white/8 bg-[#0d0708]/80"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    settings.privacy === p ? "border-primary bg-primary" : "border-neutral-600"
                  }`}
                >
                  {settings.privacy === p && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold capitalize">{p}</span>
                  <span className="block text-[11.5px] text-neutral-500">
                    {p === "public" ? "Anyone can join" : "Only invited users"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-neutral-300">Max Members</p>
          <div className={`${card} flex items-center justify-between px-4 py-3`}>
            <select
              value={settings.maxMembers}
              onChange={(e) => set("maxMembers", Number(e.target.value))}
              className="w-full appearance-none bg-transparent text-[15px] outline-none"
            >
              {[2, 4, 6, 8, 12, 20].map((n) => (
                <option key={n} value={n} className="bg-[#0d0708]">
                  {n} Members
                </option>
              ))}
            </select>
            <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-neutral-300">Room Settings</p>
          <div className={`${card} divide-y divide-white/5`}>
            {([
              ["voiceChat", "Voice Chat"],
              ["textChat", "Text Chat"],
              ["hostOnlyPlay", "Only Host Can Play"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14.5px]">{label}</span>
                <Toggle on={settings[key]} onChange={(v) => set(key, v)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/5 bg-[#050304]/95 p-4 backdrop-blur">
        <button className={btnPrimary} onClick={onCreate}>
          Create Room
        </button>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className={`${card} flex w-full items-center justify-between px-4 py-3.5 text-left`}
    >
      <span className="min-w-0">
        <span className="block text-[11.5px] text-neutral-500">{label}</span>
        <span className="block truncate text-[14.5px] font-semibold tracking-wide">{value}</span>
      </span>
      {done ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-neutral-400" />}
    </button>
  );
}

function RoomCreated({
  code,
  settings,
  onBack,
  onNext,
}: {
  code: string;
  settings: RoomSettings;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#050304] pb-28 text-neutral-100">
      <StepHeader title="Room Created" onBack={onBack} />
      <div className="flex flex-col items-center px-5 pt-8">
        <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-primary shadow-[0_0_50px_-10px_var(--primary)]">
          <Check className="h-12 w-12 text-primary" strokeWidth={2.4} />
        </div>
        <p className="mt-5 text-[17px] font-semibold">You are the host!</p>
      </div>
      <div className="mt-7 space-y-3 px-5">
        <CopyRow label="Room Code" value={code} />
        <div className={`${card} divide-y divide-white/5`}>
          {[
            ["Room Name", settings.name],
            ["Room Type", settings.privacy === "private" ? "Private" : "Public"],
            ["Max Members", `${settings.maxMembers} Members`],
            ["Voice Chat", settings.voiceChat ? "Enabled" : "Off"],
            ["Text Chat", settings.textChat ? "Enabled" : "Off"],
            ["Only Host Can Play", settings.hostOnlyPlay ? "Enabled" : "Off"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-4 py-3">
              <span className="text-[13.5px] text-neutral-400">{k}</span>
              <span className="text-[13.5px] font-medium">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-white/5 bg-[#050304]/95 p-4 backdrop-blur">
        <button className={btnPrimary} onClick={onNext}>
          Invite Friends
        </button>
      </div>
    </div>
  );
}

function InviteFriends({ code, onBack, onNext }: { code: string; onBack: () => void; onNext: () => void }) {
  const link = typeof window !== "undefined" ? `${window.location.origin}/hub/watch/${code}` : "";
  const share = async () => {
    const text = `Join my EmberChat watch party — room code ${code}\n${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "EmberChat Watch Party", text, url: link });
        return;
      } catch {
        /* cancelled */
      }
    }
    void navigator.clipboard?.writeText(text);
  };
  return (
    <div className="min-h-screen bg-[#050304] pb-28 text-neutral-100">
      <StepHeader title="Invite Friends" onBack={onBack} />
      <div className="space-y-3 px-5 pt-5">
        <CopyRow label="Room Code" value={code} />
        <CopyRow label="Share Link" value={link} />
        <p className="pt-3 text-[13px] font-semibold text-neutral-300">Invite Options</p>
        <div className={`${card} divide-y divide-white/5`}>
          {[
            { label: "Share Link", Icon: Share2, run: share },
            {
              label: "WhatsApp",
              Icon: Send,
              run: () =>
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(`Join my EmberChat watch party — code ${code} ${link}`)}`,
                  "_blank",
                ),
            },
            { label: "Copy Room Code", Icon: Copy, run: () => navigator.clipboard?.writeText(code) },
            { label: "Copy Invite Link", Icon: Link2, run: () => navigator.clipboard?.writeText(link) },
          ].map(({ label, Icon, run }) => (
            <button
              key={label}
              onClick={() => void run()}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <Icon className="h-4.5 w-4.5 text-primary" />
              <span className="flex-1 text-[14.5px]">{label}</span>
              <span className="text-neutral-600">›</span>
            </button>
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-white/5 bg-[#050304]/95 p-4 backdrop-blur">
        <button className={btnPrimary} onClick={onNext}>
          Select Video
        </button>
      </div>
    </div>
  );
}

function SelectVideo({ onBack, onPicked }: { onBack: () => void; onPicked: (v: WatchVideo) => void }) {
  const search = useServerFn(searchYouTube);
  const meta = useServerFn(youtubeMeta);
  const [q, setQ] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<WatchVideo[]>([]);
  const [selected, setSelected] = useState<WatchVideo | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      setErr("");
      const res = await search({ data: { q: query.trim() } });
      setLoading(false);
      if (res.error) setErr(res.error);
      setResults(res.videos);
    },
    [search],
  );

  useEffect(() => {
    void run("trending movies trailer");
  }, [run]);

  const onQ = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(v), 350);
  };

  const useLink = async () => {
    const id = parseYouTubeId(link);
    if (!id) {
      setErr("That doesn't look like a YouTube link.");
      return;
    }
    setLoading(true);
    const r = await meta({ data: { id } });
    setLoading(false);
    setSelected(
      r.video ?? {
        id,
        title: "YouTube video",
        channel: "",
        thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      },
    );
  };

  return (
    <div className="min-h-screen bg-[#050304] pb-28 text-neutral-100">
      <StepHeader title="Select Video" onBack={onBack} />
      <div className="px-5 pt-4">
        <div className={`${card} flex items-center gap-2 px-3.5 py-2.5`}>
          <Search className="h-4 w-4 text-neutral-500" />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Search YouTube"
            className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-neutral-600"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
        {err && <p className="mt-2 text-[12px] text-primary">{err}</p>}

        <p className="mb-2 mt-5 text-[13px] font-semibold text-neutral-300">
          {q ? "Results" : "Recommended for you"}
        </p>
        <div className="space-y-2.5">
          {results.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                selected?.id === v.id ? "border-primary bg-primary/10" : "border-white/8 bg-[#0d0708]/80"
              }`}
            >
              <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-900">
                <img src={v.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                {v.duration && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[9.5px] font-medium">
                    {v.duration}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13.5px] font-medium leading-snug">{v.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                  {v.channel}
                  {v.views ? ` · ${v.views}` : ""}
                </p>
              </div>
            </button>
          ))}
          {!loading && results.length === 0 && (
            <p className="py-6 text-center text-[13px] text-neutral-600">No results yet.</p>
          )}
        </div>

        <p className="mb-2 mt-6 text-[13px] font-semibold text-neutral-300">Enter YouTube Link</p>
        <div className={`${card} flex items-center gap-2 p-2`}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste YouTube link here"
            className="flex-1 bg-transparent px-2 py-2 text-[14px] outline-none placeholder:text-neutral-600"
          />
          <button
            onClick={() => void useLink()}
            className="rounded-lg bg-primary/15 px-3 py-2 text-[13px] font-semibold text-primary"
          >
            Use
          </button>
        </div>

        {selected && (
          <div className="mt-6">
            <p className="mb-2 text-[13px] font-semibold text-neutral-300">Selected Video</p>
            <div className={`${card} flex items-center gap-3 p-2.5`}>
              <img src={selected.thumb} alt="" className="h-14 w-24 rounded-lg object-cover" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[13.5px] font-medium">{selected.title}</p>
                <p className="truncate text-[11px] text-neutral-500">{selected.channel}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/5 bg-[#050304]/95 p-4 backdrop-blur">
        <button
          disabled={!selected}
          className={`${btnPrimary} disabled:opacity-40`}
          onClick={() => selected && onPicked(selected)}
        >
          Add to Queue
        </button>
      </div>
    </div>
  );
}

function RoomReady({
  code,
  settings,
  video,
  onBack,
  onStart,
}: {
  code: string;
  settings: RoomSettings;
  video: WatchVideo | null;
  onBack: () => void;
  onStart: () => void;
}) {
  const name = useMemo(() => getMyName() || "You", []);
  return (
    <div className="min-h-screen bg-[#050304] pb-28 text-neutral-100">
      <StepHeader title="Room Ready" onBack={onBack} />
      <div className="flex flex-col items-center px-5 pt-8">
        <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-primary shadow-[0_0_50px_-10px_var(--primary)]">
          <Users className="h-12 w-12 text-primary" strokeWidth={1.6} />
        </div>
        <p className="mt-5 text-[17px] font-semibold">Your room is ready, {name}!</p>
        <p className="mt-1 text-center text-[12.5px] text-neutral-500">
          Share the link and wait for friends to join.
        </p>
      </div>
      <div className="mt-7 space-y-3 px-5">
        <CopyRow label="Room Code" value={code} />
        <div className={`${card} divide-y divide-white/5`}>
          <div className="px-4 py-3 text-[13px] font-semibold text-neutral-300">Room Settings</div>
          {[
            ["Members", `${settings.maxMembers} Members`],
            ["Privacy", settings.privacy === "private" ? "Private Room" : "Public Room"],
            ["Voice Chat", settings.voiceChat ? "On" : "Off"],
            ["Text Chat", settings.textChat ? "On" : "Off"],
            ["Only Host Can Play", settings.hostOnlyPlay ? "On" : "Off"],
            ["Video", video?.title ?? "Not selected"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="shrink-0 text-[13.5px] text-neutral-400">{k}</span>
              <span className="truncate text-[13.5px] font-medium">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-white/5 bg-[#050304]/95 p-4 backdrop-blur">
        <button className={btnPrimary} onClick={onStart}>
          Start Watch Party
        </button>
      </div>
    </div>
  );
}
