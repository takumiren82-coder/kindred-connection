import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  X,
  ChevronRight,
  Trash2,
  Send,
  Heart,
  MoreVertical,
  Camera,
  Image as ImageIcon,
  Video as VideoIcon,
  Type as TypeIcon,
  Mic,
  Music,
  Settings2,
  FileText,
  EyeOff,
  Eye,
  ScanEye,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BottomNav } from "@/components/BottomNav";
import { getMyId, getMyName, getRoom } from "@/lib/identity";
import { AvatarPicker } from "@/components/AvatarPicker";
import { DP_MARK, broadcastDp, cacheDp, decodeDp, isDp, readCachedDp, uploadDp } from "@/lib/dp";
import {
  LIKE_MARK,
  encodeStatusLike,
  isStatusLike,
  decodeStatusLike,
  encodeReply,
  type ReplyRef,
} from "@/lib/msg-meta";
import { encodeMedia } from "@/lib/media-msg";
import {
  DEFAULT_SETTINGS,
  consumedOneTime,
  fetchSettings,
  fetchStatusMetas,
  markOneTimeConsumed,
  readCachedSettings,
  saveSettings,
  type StatusMeta,
  type StatusSettings,
} from "@/lib/status-meta";
import { CreateStatus, filterCss } from "@/components/status/CreateStatus";
import { StatusSettingsSheet, type Contact } from "@/components/status/StatusSettings";
import { ViewersLikes, type ViewerRow } from "@/components/status/ViewersLikes";

export const Route = createFileRoute("/hub/status")({
  validateSearch: (s: Record<string, unknown>) => ({
    reelUrl: typeof s.reelUrl === "string" ? s.reelUrl : undefined,
    reelId: typeof s.reelId === "string" ? s.reelId : undefined,
  }),
  component: StatusPage,
});

interface Status {
  id: string;
  room_code: string;
  sender: string;
  sender_name: string;
  media_url: string;
  media_type: "image" | "video";
  created_at: string;
  expires_at: string;
}

interface StatusView {
  id: string;
  status_id: string;
  viewer: string;
  viewer_name: string;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function StatusPage() {
  const navigate = useNavigate();
  const { reelUrl, reelId } = Route.useSearch();
  const [ready, setReady] = useState(false);
  const [myId, setMyId] = useState("");
  const [myName, setMyName] = useState("");
  const [room, setRoom] = useState("");

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [views, setViews] = useState<StatusView[]>([]);
  const [metas, setMetas] = useState<Record<string, StatusMeta>>({});
  const [likes, setLikes] = useState<{ sender: string; statusId: string }[]>([]);
  const [settings, setSettings] = useState<StatusSettings>(DEFAULT_SETTINGS);

  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<"mine" | "partner" | null>(null);
  const [posting, setPosting] = useState(false);
  const [dpOpen, setDpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFlow, setCreateFlow] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [myDp, setMyDp] = useState("");
  const [partnerDp, setPartnerDp] = useState("");

  useEffect(() => {
    setMyId(getMyId());
    setMyName(getMyName());
    setRoom(getRoom());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!room || !myId) return;
    setSettings(readCachedSettings(room, myId));
    fetchSettings(room, myId).then(setSettings);
  }, [room, myId]);

  // Load DPs
  useEffect(() => {
    if (!room || !myId) return;
    setMyDp(readCachedDp(room, myId));
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("sender,content,created_at")
        .eq("room_code", room)
        .like("content", DP_MARK + "%")
        .order("created_at", { ascending: true });
      if (!alive || !data) return;
      let mine = "";
      let theirs = "";
      for (const m of data) {
        if (!isDp(m.content)) continue;
        const url = decodeDp(m.content);
        if (m.sender === myId) mine = url;
        else theirs = url;
      }
      setMyDp(mine);
      cacheDp(room, myId, mine);
      setPartnerDp(theirs);
    })();
    const ch = supabase
      .channel(`dp:${room}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_code=eq.${room}` },
        (payload) => {
          const m = payload.new as { sender: string; content: string };
          if (!m?.content || !isDp(m.content)) return;
          const url = decodeDp(m.content);
          if (m.sender === myId) {
            setMyDp(url);
            cacheDp(room, myId, url);
          } else {
            setPartnerDp(url);
          }
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [room, myId]);

  const saveDp = async (file: File) => {
    if (!room) return;
    const url = await uploadDp(room, myId, file);
    setMyDp(url);
    cacheDp(room, myId, url);
    await broadcastDp(room, myId, url);
  };
  const removeDp = async () => {
    if (!room) return;
    setMyDp("");
    cacheDp(room, myId, "");
    await broadcastDp(room, myId, "");
  };

  const load = useCallback(async () => {
    if (!room) return;
    const nowIso = new Date().toISOString();
    const { data: st } = await supabase
      .from("statuses")
      .select("*")
      .eq("room_code", room)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: true });
    const list = (st ?? []) as Status[];
    setStatuses(list);
    setMetas(await fetchStatusMetas(room));
    if (list.length) {
      const { data: vw } = await supabase
        .from("status_views")
        .select("*")
        .in(
          "status_id",
          list.map((s) => s.id),
        );
      setViews((vw ?? []) as StatusView[]);
    } else {
      setViews([]);
    }
  }, [room]);

  useEffect(() => {
    load();
  }, [load]);

  // likes
  const loadLikes = useCallback(async () => {
    if (!room) return;
    const { data } = await supabase
      .from("messages")
      .select("sender,content")
      .eq("room_code", room)
      .like("content", LIKE_MARK + "%");
    setLikes(
      ((data ?? []) as { sender: string; content: string }[])
        .filter((m) => isStatusLike(m.content))
        .map((m) => ({ sender: m.sender, statusId: decodeStatusLike(m.content) })),
    );
  }, [room]);

  useEffect(() => {
    loadLikes();
  }, [loadLikes]);

  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`status:${room}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "statuses" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "status_views" }, load)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `room_code=eq.${room}` },
        loadLikes,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, load, loadLikes]);

  const mine = useMemo(() => statuses.filter((s) => s.sender === myId), [statuses, myId]);

  const consumed = useMemo(() => (myId ? consumedOneTime(myId) : new Set<string>()), [myId, viewer]);

  const partner = useMemo(() => {
    const now = Date.now();
    return statuses.filter((s) => {
      if (s.sender === myId) return false;
      const m = metas[s.id];
      if (m?.hiddenFrom?.includes(myId)) return false;
      if (m?.scheduledAt && new Date(m.scheduledAt).getTime() > now) return false;
      return true;
    });
  }, [statuses, myId, metas]);

  const partnerName = partner[0]?.sender_name ?? statuses.find((s) => s.sender !== myId)?.sender_name ?? "Partner";
  const partnerId = statuses.find((s) => s.sender !== myId)?.sender ?? "";

  const contacts: Contact[] = useMemo(
    () => (partnerId ? [{ id: partnerId, name: partnerName, dp: partnerDp || undefined }] : []),
    [partnerId, partnerName, partnerDp],
  );

  const updateSettings = (s: StatusSettings) => {
    setSettings(s);
    if (room && myId) saveSettings(room, myId, s);
  };

  const deleteStatus = async (s: Status) => {
    await supabase.from("statuses").delete().eq("id", s.id);
    await load();
  };

  const clearShare = () =>
    navigate({ to: "/hub/status", search: { reelUrl: undefined, reelId: undefined }, replace: true });

  const postReelToStatus = async () => {
    if (!reelUrl || !room) return;
    setError(null);
    setPosting(true);
    try {
      const ins = await supabase.from("statuses").insert({
        room_code: room,
        sender: myId,
        sender_name: myName || "Me",
        media_url: reelUrl,
        media_type: "video",
        expires_at: new Date(Date.now() + settings.autoDeleteHours * 3600_000).toISOString(),
      });
      if (ins.error) throw ins.error;
      await load();
      clearShare();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post reel");
    } finally {
      setPosting(false);
    }
  };

  const recordView = useCallback(
    async (status: Status) => {
      if (status.sender === myId) return;
      const already = views.some((v) => v.status_id === status.id && v.viewer === myId);
      if (!already) {
        await supabase
          .from("status_views")
          .upsert(
            { status_id: status.id, viewer: myId, viewer_name: myName || "Partner" },
            { onConflict: "status_id,viewer" },
          );
      }
      if (metas[status.id]?.oneTime?.includes(myId)) markOneTimeConsumed(myId, status.id);
    },
    [myId, myName, views, metas],
  );

  if (!ready) return null;

  if (!myName || !room) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center hub-screen-bg px-6 text-center">
        <div className="ornate-card w-full max-w-sm px-6 py-8">
          <h3 className="font-heading text-lg font-bold tracking-widest text-gold">STATUS</h3>
          <p className="mt-3 text-xs text-muted-foreground">
            Connect with your partner in Chats first. Status is shared privately within your room.
          </p>
          <Link to="/hub" className="gold-btn mt-6 inline-block rounded-md px-5 py-2.5 text-sm">
            GO TO CHATS
          </Link>
        </div>
        <BottomNav active="status" />
      </div>
    );
  }

  return (
    <div className="hub-screen-bg min-h-screen pb-28">
      <div className="mx-auto max-w-2xl px-4 pt-5">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-primary">Status</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDpOpen(true)}
              aria-label="Profile picture"
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-secondary text-primary"
              style={{ boxShadow: "0 0 14px -4px var(--gold)" }}
            >
              {myDp ? <img src={myDp} alt="Your profile" className="h-full w-full object-cover" /> : <Plus className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="More options"
              className="flex h-10 w-9 items-center justify-center rounded-full text-foreground"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* My status */}
        <button
          onClick={() => (mine.length ? setViewer("mine") : setCreateOpen(true))}
          className="ember-panel flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            <Ring active={mine.length > 0}>
              {mine.length ? (
                <Thumb status={mine[mine.length - 1]} meta={metas[mine[mine.length - 1].id]} />
              ) : myDp ? (
                <img src={myDp} alt="Your profile" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-secondary font-heading text-primary">
                  {(myName || "M").charAt(0).toUpperCase()}
                </span>
              )}
            </Ring>
          </span>
          <span className="flex-1">
            <span className="block font-heading text-sm font-semibold text-foreground">My Status</span>
            <span className="block text-xs text-muted-foreground">
              {mine.length ? `${mine.length} update${mine.length > 1 ? "s" : ""} · tap to view` : "Tap to add status"}
            </span>
          </span>
        </button>

        <button
          onClick={() => setCreateOpen(true)}
          className="gold-btn mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs tracking-wide"
        >
          <Plus className="h-4 w-4" /> ADD PHOTO / VIDEO
        </button>
        {error && <p className="mt-2 text-center text-xs text-rose-400">{error}</p>}

        <h2 className="mb-3 mt-7 text-xs font-medium tracking-wide text-muted-foreground">Recent Updates</h2>

        {partner.length ? (
          <button
            onClick={() => setViewer("partner")}
            className="ember-panel flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <Ring active>
              {partnerDp ? (
                <img src={partnerDp} alt="" className="h-full w-full object-cover" />
              ) : (
                <Thumb status={partner[partner.length - 1]} meta={metas[partner[partner.length - 1].id]} />
              )}
            </Ring>
            <span className="flex-1">
              <span className="block font-heading text-sm font-semibold text-foreground">{partnerName}</span>
              <span className="block text-xs text-muted-foreground">
                {timeAgo(partner[partner.length - 1].created_at)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-primary" />
          </button>
        ) : partnerDp ? (
          <div className="ember-panel flex w-full items-center gap-3 px-4 py-3 text-left">
            <Ring active={false}>
              <img src={partnerDp} alt="Partner profile" className="h-full w-full object-cover" />
            </Ring>
            <span className="flex-1">
              <span className="block font-heading text-sm font-semibold text-foreground">{partnerName}</span>
              <span className="block text-xs text-muted-foreground">No status yet</span>
            </span>
          </div>
        ) : (
          <p className="ember-panel px-4 py-6 text-center text-xs text-muted-foreground">
            No status from your partner yet.
          </p>
        )}
      </div>

      {viewer === "partner" && partner.length > 0 && (
        <StoryViewer
          statuses={partner}
          views={views}
          metas={metas}
          likes={likes}
          consumed={consumed}
          mode="partner"
          room={room}
          myId={myId}
          myName={myName}
          authorName={partnerName}
          authorDp={partnerDp}
          settings={settings}
          onNavigateToChat={() => navigate({ to: "/hub", search: { chat: "1" } })}
          onClose={() => {
            setViewer(null);
            load();
          }}
          onView={recordView}
          onLikesChanged={loadLikes}
        />
      )}
      {viewer === "mine" && mine.length > 0 && (
        <StoryViewer
          statuses={mine}
          views={views}
          metas={metas}
          likes={likes}
          consumed={new Set()}
          mode="mine"
          room={room}
          myId={myId}
          myName={myName}
          authorName={myName || "Me"}
          authorDp={myDp}
          settings={settings}
          onNavigateToChat={() => navigate({ to: "/hub", search: { chat: "1" } })}
          onClose={() => setViewer(null)}
          onDelete={deleteStatus}
          onLikesChanged={loadLikes}
        />
      )}

      {reelUrl && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-heading text-sm tracking-widest text-primary">SHARE TO STATUS</span>
            <button onClick={clearShare} aria-label="Cancel" className="text-white">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <video
              key={reelId ?? reelUrl}
              src={reelUrl}
              autoPlay
              playsInline
              loop
              muted
              controls={false}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
          <div className="px-5 pb-8 pt-4">
            {error && <p className="mb-3 text-center text-xs text-rose-400">{error}</p>}
            <button
              onClick={postReelToStatus}
              disabled={posting}
              className="gold-btn flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> {posting ? "POSTING…" : "POST TO MY STATUS"}
            </button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-[91] bg-black/60" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute right-3 top-16 w-52 overflow-hidden rounded-xl border border-primary/25 bg-[#0c0c0f] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                setSettingsOpen(true);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-foreground"
            >
              <Settings2 className="h-4 w-4 text-primary" /> Status Settings
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setCreateOpen(true);
              }}
              className="flex w-full items-center gap-3 border-t border-white/6 px-4 py-3 text-left text-sm text-foreground"
            >
              <Plus className="h-4 w-4 text-primary" /> Create Status
            </button>
          </div>
        </div>
      )}

      {createOpen && (
        <CreateStatusMenu
          onClose={() => setCreateOpen(false)}
          onPick={() => {
            setCreateOpen(false);
            setCreateFlow(true);
          }}
          onSettings={() => {
            setCreateOpen(false);
            setSettingsOpen(true);
          }}
        />
      )}

      {createFlow && (
        <CreateStatus
          room={room}
          myId={myId}
          myName={myName}
          settings={settings}
          onClose={() => setCreateFlow(false)}
          onPosted={load}
        />
      )}

      {settingsOpen && (
        <StatusSettingsSheet
          settings={settings}
          contacts={contacts}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <BottomNav active="status" />
      {dpOpen && (
        <AvatarPicker
          currentUrl={myDp || null}
          onClose={() => setDpOpen(false)}
          onSave={saveDp}
          onDelete={myDp ? removeDp : undefined}
        />
      )}
    </div>
  );
}

function CreateStatusMenu({
  onClose,
  onPick,
  onSettings,
}: {
  onClose: () => void;
  onPick: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[91] flex flex-col bg-[#050506]">
      <header className="flex items-center justify-between px-4 py-4">
        <button onClick={onClose} aria-label="Close" className="text-foreground">
          <X className="h-5 w-5" />
        </button>
        <span className="font-heading text-base font-semibold">Create Status</span>
        <Camera className="h-5 w-5 text-foreground" />
      </header>

      <div className="grid grid-cols-3 gap-3 px-4">
        {[
          { label: "Camera", Icon: Camera },
          { label: "Gallery", Icon: ImageIcon },
          { label: "Video", Icon: VideoIcon },
        ].map(({ label, Icon }) => (
          <button
            key={label}
            onClick={onPick}
            className="flex flex-col items-center gap-2 rounded-2xl border border-primary/25 bg-[#0c0c0f] py-5 text-xs text-foreground"
          >
            <Icon className="h-6 w-6 text-primary" />
            {label}
          </button>
        ))}
      </div>

      <p className="px-4 pb-2 pt-6 text-xs text-muted-foreground">Quick Actions</p>
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0c0c0f] mx-4">
        {[
          { label: "Create Text Status", Icon: TypeIcon },
          { label: "Voice Status", Icon: Mic },
          { label: "Extract Audio (From Video)", Icon: Music },
        ].map(({ label, Icon }) => (
          <button
            key={label}
            onClick={onPick}
            className="flex w-full items-center gap-3 border-b border-white/6 px-4 py-3.5 text-left text-sm text-foreground last:border-b-0"
          >
            <Icon className="h-4 w-4 text-primary" /> {label}
          </button>
        ))}
      </div>

      <p className="px-4 pb-2 pt-6 text-xs text-muted-foreground">More Options</p>
      <div className="mx-4 space-y-2">
        <button
          onClick={onSettings}
          className="flex w-full items-center gap-3 rounded-xl border border-primary/50 bg-[#0c0c0f] px-4 py-3.5 text-left text-sm text-foreground"
        >
          <Settings2 className="h-4 w-4 text-primary" /> Status Settings
        </button>
        <div className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-[#0c0c0f] px-4 py-3.5 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 text-primary" /> Drafts
        </div>
      </div>

      <div className="mt-auto px-4 pb-8">
        <button onClick={onClose} className="w-full rounded-xl border border-white/10 bg-secondary py-3 text-sm text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Ring({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className={`flex h-14 w-14 items-center justify-center rounded-full p-[2px] ${active ? "ember-ring" : "ember-ring ember-ring-seen"}`}>
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-secondary">
        {children}
      </span>
    </span>
  );
}

function Thumb({ status, meta }: { status: Status; meta?: StatusMeta }) {
  const style = { filter: filterCss(meta?.filter) };
  if (status.media_type === "video") {
    return <video src={status.media_url} muted style={style} className="h-full w-full object-cover" preload="metadata" />;
  }
  return <img src={status.media_url} alt="status" style={style} className="h-full w-full object-cover" />;
}

function StoryViewer({
  statuses,
  views,
  metas,
  likes,
  consumed,
  mode,
  room,
  myId,
  myName,
  authorName,
  authorDp,
  settings,
  onNavigateToChat,
  onClose,
  onView,
  onDelete,
  onLikesChanged,
}: {
  statuses: Status[];
  views: StatusView[];
  metas: Record<string, StatusMeta>;
  likes: { sender: string; statusId: string }[];
  consumed: Set<string>;
  mode: "mine" | "partner";
  room: string;
  myId: string;
  myName: string;
  authorName: string;
  authorDp: string;
  settings: StatusSettings;
  onNavigateToChat: () => void;
  onClose: () => void;
  onView?: (s: Status) => void;
  onDelete?: (s: Status) => void;
  onLikesChanged: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [reply, setReply] = useState("");
  const [sheet, setSheet] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localLikes, setLocalLikes] = useState(likes);
  const current = statuses[idx];
  const meta = current ? metas[current.id] : undefined;
  const blocked = !!current && mode === "partner" && !!meta?.oneTime?.includes(myId) && consumed.has(current.id);

  useEffect(() => setLocalLikes(likes), [likes]);

  const next = useCallback(() => {
    setIdx((i) => {
      if (i + 1 >= statuses.length) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [statuses.length, onClose]);
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (mode === "partner" && current && onView && !blocked) onView(current);
  }, [current, mode, onView, blocked]);

  // segment progress + auto advance
  useEffect(() => {
    if (!current || blocked) return;
    setProgress(0);
    if (current.media_type === "video") return;
    const start = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / 5000);
      setProgress(p);
      if (p >= 1) {
        clearInterval(iv);
        next();
      }
    }, 60);
    return () => clearInterval(iv);
  }, [current, next, blocked]);

  if (!current) return null;

  const likesForCurrent = localLikes.filter((l) => l.statusId === current.id);
  const iLiked = likesForCurrent.some((l) => l.sender === myId);
  const seenBy = views.filter((v) => v.status_id === current.id);

  const captionHidden = !!meta?.captionHiddenFrom?.includes(myId);
  const caption = mode === "mine" ? meta?.caption : captionHidden ? undefined : meta?.caption;

  const toggleLike = async () => {
    if (!room) return;
    if (iLiked) {
      setLocalLikes((p) => p.filter((l) => !(l.sender === myId && l.statusId === current.id)));
      await supabase
        .from("messages")
        .delete()
        .eq("room_code", room)
        .eq("sender", myId)
        .eq("content", encodeStatusLike(current.id));
    } else {
      setLocalLikes((p) => [...p, { sender: myId, statusId: current.id }]);
      await supabase.from("messages").insert({
        room_code: room,
        sender: myId,
        content: encodeStatusLike(current.id),
      });
    }
    onLikesChanged();
  };

  const statusRef = (): ReplyRef => ({
    id: `status:${current.id}`,
    preview: encodeMedia({ kind: current.media_type, url: current.media_url, maxViews: 0 }),
    authorId: current.sender,
    authorName: current.sender_name || authorName,
  });

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !room) return;
    setReply("");
    await supabase.from("messages").insert({
      room_code: room,
      sender: myId,
      content: encodeReply(statusRef(), text),
    });
  };

  const openInChat = () => {
    try {
      sessionStorage.setItem(
        "nealth_pending_reply",
        JSON.stringify({
          id: `status:${current.id}`,
          room_code: room,
          sender: current.sender,
          content: encodeMedia({ kind: current.media_type, url: current.media_url, maxViews: 0 }),
          created_at: current.created_at,
        }),
      );
    } catch {
      /* ignore */
    }
    onClose();
    onNavigateToChat();
  };

  if (showViewers) {
    const rows: ViewerRow[] = seenBy
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((v) => ({
        id: v.id,
        name: v.viewer_name || "Partner",
        dp: v.viewer === myId ? undefined : authorDp || undefined,
        when: timeAgo(v.created_at),
        liked: localLikes.some((l) => l.statusId === current.id && l.sender === v.viewer),
      }));
    return (
      <ViewersLikes
        rows={rows}
        hideViewCount={settings.hideViewCount}
        hideReactionCount={settings.hideReactionCount}
        onBack={() => setShowViewers(false)}
      />
    );
  }

  if (blocked) {
    return (
      <div className="fixed inset-0 z-[93] flex flex-col bg-[#050506]">
        <header className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-primary/50 bg-secondary text-sm text-primary">
            {authorDp ? <img src={authorDp} alt="" className="h-full w-full object-cover" /> : authorName.charAt(0).toUpperCase()}
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-foreground">{authorName}</span>
            <span className="block text-[11px] text-muted-foreground">{timeAgo(current.created_at)}</span>
          </span>
          <button onClick={onClose} aria-label="Close" className="text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <ScanEye className="h-8 w-8 text-muted-foreground" />
          </span>
          <p className="mt-6 text-sm text-foreground">This status is no longer available</p>
          <p className="mt-1 text-xs text-muted-foreground">It was set to be viewed only once.</p>
        </div>
      </div>
    );
  }

  const noScreenshot = !!meta?.blockScreenshots;

  return (
    <div
      className="fixed inset-0 z-[93] flex flex-col bg-black"
      onContextMenu={noScreenshot ? (e) => e.preventDefault() : undefined}
      style={noScreenshot ? { userSelect: "none" } : undefined}
    >
      {/* segment bars */}
      <div className="flex gap-1 px-3 pt-3">
        {statuses.map((_, i) => (
          <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%" }}
            />
          </span>
        ))}
      </div>

      <header className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-secondary text-sm text-primary">
          {authorDp ? <img src={authorDp} alt="" className="h-full w-full object-cover" /> : authorName.charAt(0).toUpperCase()}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-white">{authorName}</span>
          <span className="block text-[11px] text-white/60">{timeAgo(current.created_at)}</span>
        </span>
        <button onClick={() => setSheet(true)} aria-label="More" className="text-white">
          <MoreVertical className="h-5 w-5" />
        </button>
        <button onClick={onClose} aria-label="Close" className="text-white">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {current.media_type === "video" ? (
          <video
            key={current.id}
            src={current.media_url}
            autoPlay
            playsInline
            controls={false}
            onEnded={next}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            style={{ filter: filterCss(meta?.filter) }}
            className="h-full w-full object-contain"
          />
        ) : (
          <img
            src={current.media_url}
            alt="status"
            draggable={false}
            style={{ filter: filterCss(meta?.filter) }}
            className="h-full w-full object-contain"
          />
        )}

        <button onClick={prev} aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" />
        <button onClick={next} aria-label="Next" className="absolute inset-y-0 right-0 w-1/3" />

        {caption && (
          <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-6 pt-12 text-center text-sm text-white">
            {caption}
          </p>
        )}
      </div>

      {/* bottom bar */}
      <div className="flex items-center gap-3 px-4 pb-6 pt-3">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2.5 backdrop-blur">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder={mode === "mine" ? "Reply…" : "Reply privately…"}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/50"
          />
          {reply.trim() && (
            <button onClick={sendReply} aria-label="Send reply" className="text-primary">
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={toggleLike}
          aria-label={iLiked ? "Unlike" : "Like"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Heart className={`h-5 w-5 ${iLiked ? "fill-white text-white" : "text-white"}`} />
        </button>
      </div>

      {sheet && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/60" onClick={() => setSheet(false)}>
          <div
            className="w-full rounded-t-2xl border-t border-primary/25 bg-[#0c0c0f] pb-8 pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/20" />
            {mode === "mine" && (
              <button
                onClick={() => {
                  setSheet(false);
                  setShowViewers(true);
                }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-foreground"
              >
                <Eye className="h-4 w-4 text-primary" /> Viewers &amp; Likes
              </button>
            )}
            <button
              onClick={() => {
                setSheet(false);
                openInChat();
              }}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-foreground"
            >
              <Send className="h-4 w-4 text-primary" /> Reply in chat
            </button>
            {mode === "mine" && onDelete && (
              <button
                onClick={() => {
                  setSheet(false);
                  onDelete(current);
                  onClose();
                }}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-rose-400"
              >
                <Trash2 className="h-4 w-4" /> Delete status
              </button>
            )}
            {mode === "partner" && meta?.oneTime?.includes(myId) && (
              <p className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground">
                <EyeOff className="h-4 w-4 text-primary" /> You can view this status only once.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
