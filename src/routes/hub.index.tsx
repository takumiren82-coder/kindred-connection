import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Send, ArrowLeft, Phone, Video, Copy, Check, X, Smile, Mic, MoreVertical, Camera, Search, Flame } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BottomNav } from "@/components/BottomNav";
import { AttachSheet, type ViewChoice } from "@/components/AttachSheet";
import { EmojiPicker } from "@/components/EmojiPicker";
import { CameraCapture } from "@/components/CameraCapture";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { CallOverlay } from "@/components/CallOverlay";
import { MediaBubble } from "@/components/MediaBubble";
import { decodeMedia, encodeMedia, fileToDataUrl, isMedia, type MediaPayload } from "@/lib/media-msg";
import { broadcastDp, cacheDp, decodeDp, isDp, readCachedDp, uploadDp } from "@/lib/dp";
import {
  DEL_MARK,
  addDeletedForMe,
  encodeReply,
  extractReply,
  getDeletedForMe,
  isDeleted,
  isEdited,
  isStatusLike,
  previewOf,
  stripEdit,
  withEditMark,
  type ReplyRef,
} from "@/lib/msg-meta";
import { MessageActionSheet } from "@/components/MessageActionSheet";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Buffering } from "@/components/Buffering";
import { readMsgCache, writeMsgCache } from "@/lib/msg-cache";
import { buildPartnerSeenSet, buildSeenSet, encodeSeen, isSeenMark } from "@/lib/seen";
import { isCoverEnabled, setCoverEnabled } from "@/lib/cover";

export const Route = createFileRoute("/hub/")({
  validateSearch: (s: Record<string, unknown>): { chat?: "1" } => ({
    chat: s.chat === "1" ? "1" : undefined,
  }),
  component: PrivateHub,
});

interface Message {
  id: string;
  room_code: string;
  sender: string;
  content: string;
  created_at: string;
  read_at?: string | null;
}

const ROOM_KEY = "nealth_room_code";
const NAME_KEY = "nealth_name";
const UID_KEY = "nealth_uid";
const JOINED_KEY = "nealth_joined";
const JOIN_MARK = "\u0001JOIN\u0001"; // hidden presence/name-exchange marker

function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// Display any timestamp in Indian Standard Time as "HH:mm" (e.g. 05:59).
function formatIST(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Human "last seen" elapsed label based on IST-accurate wall clock (uses UTC
// deltas, which are timezone-independent, so this is correct in any locale).
function formatElapsed(fromMs: number, nowMs: number) {
  const diff = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (diff < 10) return "Active now";
  if (diff < 60) return `Active ${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Active ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `Active ${days}d ago`;
}

function PrivateHub() {
  const navigate = useNavigate();
  const { chat } = Route.useSearch();
  const openChat = chat === "1";

  const [myId] = useState(() => {
    let v = localStorage.getItem(UID_KEY);
    if (!v) {
      v = genId();
      localStorage.setItem(UID_KEY, v);
    }
    return v;
  });
  const [name, setName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // NOTE: composer input text lives inside <ChatComposer /> for typing perf;
  // parent only holds edit/reply state.
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const restored = useRef(false);
  const announced = useRef<string | null>(null);
  const [savedPartner, setSavedPartner] = useState<string>("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  // Presence-derived: is the partner currently subscribed to the room channel?
  const [, setPartnerSubscribed] = useState(false);
  // Media / emoji / camera / voice / call UI state
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState<{ views: ViewChoice } | null>(null);
  const [recording, setRecording] = useState(false);
  const [call, setCall] = useState<
    | { mode: "outgoing"; peerName: string; video: boolean }
    | { mode: "incoming"; peerName: string; offer: RTCSessionDescriptionInit; video: boolean }
    | null
  >(null);
  const [myDp, setMyDp] = useState<string>("");
  const [partnerDp, setPartnerDp] = useState<string>("");
  const [dpOpen, setDpOpen] = useState(false);
  // Partner name learned live from the presence channel (works even when the
  // hidden join marker row never arrived).
  const [presenceName, setPresenceName] = useState<string>("");
  // Swipe-to-reply + reply preview state
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [deletedForMe, setDeletedForMe] = useState<Set<string>>(new Set());
  // Live "last seen" ticker + last partner activity timestamp (ms).
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [partnerLastActive, setPartnerLastActive] = useState<number>(0);
  // Inbox (chat list) UI state — filter bar + search field.
  const [inboxFilter, setInboxFilter] = useState("All");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [fabOpen, setFabOpen] = useState(false);
  const [coverOn, setCoverOn] = useState(true);
  // True only while the first (uncached) transcript fetch is in flight.
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  // Always-fresh copy of my own name for the presence payload, so the
  // realtime channel doesn't need to resubscribe when the name loads.
  const nameRef = useRef<string>("");

  // Pending reply-ref stashed by the Status page's "Comment" button. Load it
  // once when the chat room is opened so tapping Comment on a status opens
  // the chat with the status already quoted in the composer.
  useEffect(() => {
    if (!openChat) return;
    try {
      const raw = sessionStorage.getItem("nealth_pending_reply");
      if (!raw) return;
      sessionStorage.removeItem("nealth_pending_reply");
      const parsed = JSON.parse(raw) as Message;
      if (parsed && parsed.id && parsed.content) {
        setReplyTo(parsed);
        setTimeout(() => composerRef.current?.focus(), 0);
      }
    } catch { /* ignore */ }
  }, [openChat]);

  // Navigate helpers for the inbox <-> chat room transition (search-param
  // driven so tapping the Chat tab always returns to the inbox without
  // remounting the component or resetting any chat state).
  const openRoom = () => navigate({ to: "/hub", search: { chat: "1" } });
  const backToInbox = () => navigate({ to: "/hub", search: {} });

  // Read the per-device novel-cover preference once on mount.
  useEffect(() => {
    setCoverOn(isCoverEnabled());
  }, []);

  // Tick every second so the "Active Xs ago" label stays live without refresh.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // restore name + room (room only restored if a name exists)
  useEffect(() => {
    const savedName = localStorage.getItem(NAME_KEY);
    if (savedName) setName(savedName);
    if (savedName) nameRef.current = savedName;
    const savedRoom = localStorage.getItem(ROOM_KEY);
    if (savedRoom) {
      setRoom(savedRoom);
      if (localStorage.getItem(JOINED_KEY) === "1") setJoined(true);
    }
  }, []);

  // Load "delete for me" set whenever the room changes.
  useEffect(() => {
    if (!room) { setDeletedForMe(new Set()); return; }
    setDeletedForMe(getDeletedForMe(room));
  }, [room]);

  // load + subscribe to messages
  useEffect(() => {
    if (!room) return;
    let live = true;
    // Paint the cached transcript immediately (no blank list on re-entry).
    const cached = readMsgCache<Message>(room);
    if (cached.length) {
      setMessages(cached);
      setLoadingMsgs(false);
    } else {
      setLoadingMsgs(true);
    }
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("room_code", room)
        .order("created_at", { ascending: true });
      if (!live) return;
      if (data) {
        setMessages(data as Message[]);
        writeMsgCache(room, data as Message[]);
      }
      setLoadingMsgs(false);
    })();

    const channel = supabase
      .channel(`room:${room}`, { config: { presence: { key: myId } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `room_code=eq.${room}` },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as Message;
            if (!m || !m.id) return prev;
            if (m.sender !== myId) setPartnerLastActive(Date.now());
            const i = prev.findIndex((p) => p.id === m.id);
            if (i === -1) return [...prev, m];
            const copy = [...prev];
            copy[i] = m;
            return copy;
          });
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        // Ignore my own typing echoes; only react to the partner.
        if (payload?.payload?.sender === myId) return;
        setPartnerTyping(true);
        setPartnerLastActive(Date.now());
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setPartnerTyping(false), 3000);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown>;
        const others = Object.keys(state).filter((k) => k !== myId);
        setPartnerSubscribed(others.length > 0);
        // Pick up the partner's display name straight from presence.
        for (const k of others) {
          const entries = (state as Record<string, Array<{ name?: string }>>)[k] ?? [];
          const n = entries.find((e) => e?.name)?.name?.trim();
          if (n) {
            setPresenceName(n);
            break;
          }
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user: myId, name: nameRef.current, at: Date.now() });
        }
      });

    channelRef.current = channel;

    return () => {
      live = false;
      channelRef.current = null;
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      setPartnerTyping(false);
      setPartnerSubscribed(false);
      supabase.removeChannel(channel);
    };
  }, [room, myId]);

  // Keep the local cache warm on every realtime change.
  useEffect(() => {
    if (room && messages.length) writeMsgCache(room, messages);
  }, [room, messages]);

  // announce presence + name once per room
  useEffect(() => {
    if (!room || !name) return;
    nameRef.current = name;
    // Re-publish my name on the presence channel so the partner sees it live.
    channelRef.current?.track({ user: myId, name, at: Date.now() });
    if (announced.current === room) return;
    announced.current = room;
    supabase
      .from("messages")
      .insert({ room_code: room, sender: myId, content: JOIN_MARK + name });
  }, [room, name, myId]);

  // Reset scroll-restore flag whenever we leave the chat room so re-entry
  // restores the saved position instead of jumping.
  useEffect(() => {
    if (!openChat) restored.current = false;
  }, [openChat]);

  // Restore scroll position when entering the chat room; otherwise jump to
  // newest. New incoming messages scroll smoothly to the bottom.
  useEffect(() => {
    if (!openChat) return;
    if (!scrollRef.current || messages.length === 0) return;
    if (!restored.current) {
      restored.current = true;
      const saved = room ? sessionStorage.getItem(`nealth_scroll_${room}`) : null;
      if (saved !== null) {
        scrollRef.current.scrollTop = Number(saved);
      } else {
        endRef.current?.scrollIntoView({ behavior: "auto" });
      }
    } else {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, room, openChat]);

  const handleScroll = () => {
    if (scrollRef.current && room) {
      sessionStorage.setItem(`nealth_scroll_${room}`, String(scrollRef.current.scrollTop));
    }
  };

  // ---- Seen receipts -----------------------------------------------------
  // `mySeen`  = ids I have acknowledged (drives my unread badge)
  // `theirSeen` = ids the partner acknowledged (drives blue line on my msgs)
  const mySeen = useMemo(() => buildSeenSet(messages, myId), [messages, myId]);
  const theirSeen = useMemo(() => buildPartnerSeenSet(messages, myId), [messages, myId]);

  const isRealMsg = useCallback(
    (m: Message) =>
      !m.content.startsWith(JOIN_MARK) &&
      !isSeenMark(m.content) &&
      !isDp(m.content) &&
      !isStatusLike(m.content) &&
      !isDeleted(m.content) &&
      !deletedForMe.has(m.id),
    [deletedForMe],
  );

  // Acknowledge partner messages while I'm actively viewing the chat room.
  const ackInFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!room || !openChat) return;
    const pending = messages
      .filter((m) => m.sender !== myId && isRealMsg(m) && !mySeen.has(m.id) && !ackInFlight.current.has(m.id))
      .map((m) => m.id);
    if (pending.length === 0) return;
    pending.forEach((id) => ackInFlight.current.add(id));
    supabase
      .from("messages")
      .insert({ room_code: room, sender: myId, content: encodeSeen(pending) })
      .then(({ error }) => {
        if (error) {
          pending.forEach((id) => ackInFlight.current.delete(id));
          console.error("Seen receipt failed:", error.message);
        }
      });
  }, [messages, room, myId, openChat, mySeen, isRealMsg]);

  // derive partner presence + name from join markers / any partner message
  const { partnerPresent, partnerName, visibleMessages } = useMemo(() => {
    let present = false;
    let pName = "";
    const visible: Message[] = [];
    for (const m of messages) {
      const isJoin = m.content.startsWith(JOIN_MARK);
      const dpMsg = isDp(m.content);
      const likeMsg = isStatusLike(m.content);
      const seenMsg = isSeenMark(m.content);
      if (m.sender !== myId) {
        present = true;
        if (isJoin) {
          const n = m.content.slice(JOIN_MARK.length).trim();
          if (n) pName = n;
        }
      }
      if (!isJoin && !dpMsg && !likeMsg && !seenMsg && !deletedForMe.has(m.id)) visible.push(m);
    }
    return { partnerPresent: present, partnerName: pName, visibleMessages: visible };
  }, [messages, myId, deletedForMe]);

  // Persist the partner's real name per-room so it shows immediately on
  // return (tab switch / remount) instead of falling back to "Partner".
  useEffect(() => {
    if (room) setSavedPartner(localStorage.getItem(`nealth_partner_${room}`) ?? "");
  }, [room]);
  useEffect(() => {
    const n = partnerName || presenceName;
    if (room && n) {
      localStorage.setItem(`nealth_partner_${room}`, n);
      setSavedPartner(n);
    }
  }, [room, partnerName, presenceName]);
  const displayName = partnerName || presenceName || savedPartner || "Partner";

  // Restore cached DPs immediately so avatars show on reload before
  // realtime messages sync.
  useEffect(() => {
    if (!room) return;
    setMyDp(readCachedDp(room, myId));
  }, [room, myId]);

  // Derive the latest DP for me and the partner from messages. An empty
  // URL means "removed" so we clear cache too.
  useEffect(() => {
    if (!room) return;
    let mine = "";
    let theirs = "";
    let mineFound = false;
    let theirsFound = false;
    for (const m of messages) {
      if (!isDp(m.content)) continue;
      const url = decodeDp(m.content);
      if (m.sender === myId) {
        mine = url;
        mineFound = true;
      } else {
        theirs = url;
        theirsFound = true;
      }
    }
    if (mineFound) {
      setMyDp(mine);
      cacheDp(room, myId, mine);
    }
    if (theirsFound) setPartnerDp(theirs);
    else setPartnerDp("");
  }, [messages, room, myId]);

  // Seed "last active" from the most recent partner message so the header shows
  // a sensible elapsed time immediately (before any live typing/message event).
  useEffect(() => {
    let latest = 0;
    for (const m of messages) {
      if (m.sender !== myId) latest = Math.max(latest, new Date(m.created_at).getTime());
    }
    if (latest) setPartnerLastActive((prev) => Math.max(prev, latest));
  }, [messages, myId]);

  const saveName = () => {
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem(NAME_KEY, n);
    setName(n);
  };
  const createRoom = () => {
    const code = genCode();
    localStorage.setItem(ROOM_KEY, code);
    localStorage.removeItem(JOINED_KEY);
    setJoined(false);
    setRoom(code);
  };
  const joinRoom = () => {
    if (joinCode.trim().length < 4) return;
    const code = joinCode.trim();
    localStorage.setItem(ROOM_KEY, code);
    localStorage.setItem(JOINED_KEY, "1");
    setJoined(true);
    setRoom(code);
  };
  const leaveRoom = () => {
    localStorage.removeItem(ROOM_KEY);
    localStorage.removeItem(JOINED_KEY);
    setJoined(false);
    announced.current = null;
    setRoom(null);
    setMessages([]);
    setJoinCode("");
    backToInbox();
  };
  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || !room) return;
    // Edit path: update the message in-place instead of inserting a new one.
    if (editing) {
      const target = editing;
      setEditing(null);
      const { reply: oldReply } = extractReply(target.content);
      const nextBody = withEditMark(content);
      const wire = oldReply
        ? encodeReply(oldReply, nextBody)
        : nextBody;
      setMessages((prev) => prev.map((p) => (p.id === target.id ? { ...p, content: wire } : p)));
      const { error } = await supabase.from("messages").update({ content: wire }).eq("id", target.id);
      if (error) console.error("Edit failed:", error.message);
      return;
    }
    const reply = replyTo;
    setReplyTo(null);
    // stop broadcasting typing once a message is sent
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { sender: myId, typing: false },
    });
    const wire = reply
      ? encodeReply(
          {
            id: reply.id,
            preview: previewOf(reply.content).slice(0, 140),
            authorId: reply.sender,
            authorName: reply.sender === myId ? name ?? "You" : displayName,
          },
          content,
        )
      : content;
    // Insert and use the real DB row so realtime can't duplicate it.
    const { data, error } = await supabase
      .from("messages")
      .insert({ room_code: room, sender: myId, content: wire })
      .select()
      .single();
    if (error) {
      console.error("Message send failed:", error.message);
      return;
    }
    if (data) {
      setMessages((prev) => {
        const m = data as Message;
        if (prev.some((p) => p.id === m.id)) return prev;
        return [...prev, m];
      });
    }
  };

  // Persist a media payload as a normal message using the MEDIA_MARK sentinel.
  const sendMediaPayload = async (payload: MediaPayload) => {
    if (!room) return;
    const raw = encodeMedia(payload);
    const reply = replyTo;
    setReplyTo(null);
    const content = reply
      ? encodeReply(
          {
            id: reply.id,
            preview: previewOf(reply.content).slice(0, 140),
            authorId: reply.sender,
            authorName: reply.sender === myId ? name ?? "You" : displayName,
          },
          raw,
        )
      : raw;
    const { data, error } = await supabase
      .from("messages")
      .insert({ room_code: room, sender: myId, content })
      .select()
      .single();
    if (error) {
      console.error("Media send failed:", error.message);
      return;
    }
    if (data) {
      setMessages((prev) => (prev.some((p) => p.id === (data as Message).id) ? prev : [...prev, data as Message]));
    }
  };

  const handlePickFile = async (file: File, views: ViewChoice) => {
    setAttachOpen(false);
    const kind: MediaPayload["kind"] = file.type.startsWith("video") ? "video" : "image";
    const url = await fileToDataUrl(file);
    await sendMediaPayload({
      kind,
      url,
      maxViews: views,
      hue: Math.floor(Math.random() * 5),
    });
  };
  const handleCameraShot = async (dataUrl: string, filterId: string) => {
    const views = cameraOpen?.views ?? 1;
    setCameraOpen(null);
    await sendMediaPayload({
      kind: "image",
      url: dataUrl,
      maxViews: views,
      filter: filterId,
      hue: Math.floor(Math.random() * 5),
    });
  };
  const handleVoiceSend = async (dataUrl: string, duration: number) => {
    setRecording(false);
    await sendMediaPayload({ kind: "audio", url: dataUrl, maxViews: 0, duration });
  };

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

  const insertEmoji = (e: string) => composerRef.current?.appendText(e);

  // ---- Incoming call listener (subscribes per room) ----
  useEffect(() => {
    if (!room) return;
    const ch = supabase
      .channel(`call:${room}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "offer" }, ({ payload }) => {
        if (payload.from === myId) return;
        if (call) return;
        setCall({
          mode: "incoming",
          peerName: payload.peerName || displayName,
          offer: payload.offer,
          video: !!payload.video,
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, myId, call]);

  // Broadcast a lightweight "typing" event to the partner (throttled).
  // Stable across renders so the memoized composer doesn't re-render on
  // every parent state change.
  const handleTyping = useCallback(() => {
    if (!room || !channelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 1200) return;
    lastTypingSent.current = now;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { sender: myId, typing: true },
    });
  }, [room, myId]);

  // ---- Swipe-to-reply gesture (received bubbles only) ----
  const startReply = (m: Message) => {
    setReplyTo(m);
    // focus the composer right after the reply bar renders
    setTimeout(() => composerRef.current?.focus(), 0);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (id: string, e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    }
    // only treat as horizontal swipe-right when mostly horizontal
    if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
      setSwipeId(id);
      setSwipeX(Math.min(dx, 64));
    }
  };
  const onTouchEnd = (m: Message) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (swipeId === m.id && swipeX > 40) startReply(m);
    setSwipeId(null);
    setSwipeX(0);
  };

  const armLongPress = (m: Message, e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => setActionMsg(m), 480);
  };

  const deleteForMe = (m: Message) => {
    if (!room) return;
    addDeletedForMe(room, m.id);
    setDeletedForMe((prev) => new Set(prev).add(m.id));
  };
  const deleteForEveryone = async (m: Message) => {
    if (!room || m.sender !== myId) return;
    // Optimistic
    setMessages((prev) => prev.map((p) => (p.id === m.id ? { ...p, content: DEL_MARK } : p)));
    const { error } = await supabase
      .from("messages")
      .update({ content: DEL_MARK })
      .eq("id", m.id);
    if (error) console.error("Delete-for-everyone failed:", error.message);
  };

  const beginEdit = (m: Message) => {
    const { body } = extractReply(m.content);
    if (typeof body !== "string" || body === DEL_MARK || isMedia(body)) return;
    setEditing(m);
    setReplyTo(null);
    composerRef.current?.setText(stripEdit(body));
    setTimeout(() => composerRef.current?.focus(), 0);
  };

  // ---- Step 1: ask for name ----
  if (!name) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col items-center justify-center hub-screen-bg px-6">
        <div className="ornate-card w-full max-w-sm px-5 py-7 text-center">
          <h3 className="font-heading text-base font-bold tracking-widest text-gold">WHAT'S YOUR NAME?</h3>
          <p className="mt-2 text-[11px] text-muted-foreground">Saved on this device only.</p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            placeholder="Enter your name"
            className="mt-5 w-full rounded-md border border-border bg-card px-3 py-2 text-center text-sm text-foreground outline-none focus:border-gold"
          />
          <button onClick={saveName} className="gold-btn mt-3 w-full rounded-md py-2.5 text-sm">
            CONTINUE
          </button>
        </div>
        <BottomNav active="chats" />
      </div>
    );
  }

  // ---- Step 2: create / join room ----
  if (!room) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col items-center justify-center hub-screen-bg px-6">
        <div className="ornate-card w-full max-w-sm px-5 py-7 text-center">
          <h3 className="font-heading text-base font-bold tracking-widest text-gold">PRIVATE ROOM</h3>
          <p className="mt-2 text-[11px] text-muted-foreground">Welcome, {name}.</p>
          <button onClick={createRoom} className="gold-btn mt-5 w-full rounded-md py-2.5 text-sm">
            CREATE ROOM
          </button>
          <div className="my-3 text-[11px] text-muted-foreground">— or —</div>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter 6-digit code"
            inputMode="numeric"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-center text-sm tracking-widest text-foreground outline-none focus:border-gold"
          />
          <button onClick={joinRoom} className="gold-btn mt-2.5 w-full rounded-md py-2.5 text-sm">
            JOIN ROOM
          </button>
        </div>
        <BottomNav active="chats" />
      </div>
    );
  }

  // ---- Step 3: waiting for partner (show code) ----
  if (!partnerPresent && !joined) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col items-center justify-center hub-screen-bg px-6">
        <div className="ornate-card w-full max-w-sm px-5 py-8 text-center">
          <h3 className="font-heading text-xs font-semibold tracking-widest text-gold">ROOM CODE</h3>
          <p className="mt-2 text-[11px] text-muted-foreground">Share this with your partner.</p>
          <div className="my-5 font-heading text-4xl font-bold tracking-[0.3em] text-gold">{room}</div>
          <button onClick={copyCode} className="gold-btn mx-auto flex items-center gap-2 rounded-md px-4 py-2 text-sm">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "COPIED" : "COPY"}
          </button>
          <p className="mt-6 animate-pulse text-[11px] tracking-widest text-gold/70">WAITING FOR PARTNER…</p>
          <button onClick={leaveRoom} className="mt-5 text-[11px] text-muted-foreground underline">
            Cancel
          </button>
        </div>
        <BottomNav active="chats" />
      </div>
    );
  }

  const partnerOnline = partnerLastActive > 0 && nowMs - partnerLastActive < 30000;

  // ---- Step 4a: inbox / chat list (default landing for the Chat tab) ----
  if (!openChat) {
    const last = visibleMessages[visibleMessages.length - 1];
    // Only the PARTNER's messages that I have not acknowledged yet.
    const unread = messages.filter(
      (m) => m.sender !== myId && isRealMsg(m) && !mySeen.has(m.id),
    ).length;
    const preview = partnerTyping
      ? "Typing…"
      : last
        ? previewOf(last.content)
        : "Tap to start chatting";
    const filters = ["All", "Unread", "Groups", "Favorites", "Requests"] as const;
    const matchesSearch =
      !searchText.trim() || displayName.toLowerCase().includes(searchText.trim().toLowerCase());
    const matchesFilter =
      inboxFilter === "All" || inboxFilter === "Favorites"
        ? true
        : inboxFilter === "Unread"
          ? unread > 0
          : false;
    const showRow = matchesSearch && matchesFilter;
    return (
      <div className="hub-screen-bg flex h-[100dvh] w-screen flex-col overflow-hidden">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between px-4 pb-3 pt-4">
          <h1 className="font-heading text-[22px] font-extrabold tracking-tight text-primary">
            EmberChat
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate({ to: "/hub/status" })}
              aria-label="Camera"
              className="text-foreground/85"
            >
              <Camera className="h-[21px] w-[21px]" strokeWidth={1.7} />
            </button>
            <button
              onClick={() => setSearchOpen((s) => !s)}
              aria-label="Search"
              className={searchOpen ? "text-primary" : "text-foreground/85"}
            >
              <Search className="h-[21px] w-[21px]" strokeWidth={1.7} />
            </button>
          </div>
        </header>

        {searchOpen && (
          <div className="shrink-0 px-4 pb-2">
            <input
              autoFocus
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-full border border-border bg-card px-4 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* Snap circles */}
        <div className="shrink-0 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          <div className="flex gap-4">
            {[
              { key: "you", label: "You", dp: myDp, nm: name ?? "You", ring: true },
              { key: "partner", label: displayName, dp: partnerDp, nm: displayName, ring: true },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() =>
                  p.key === "you" ? setDpOpen(true) : navigate({ to: "/hub/status" })
                }
                className="flex w-[58px] shrink-0 flex-col items-center gap-1.5"
              >
                <span className={`ember-ring ${p.ring ? "" : "ember-ring-seen"} block`}>
                  {p.dp ? (
                    <img
                      src={p.dp}
                      alt={p.nm}
                      className="h-[52px] w-[52px] rounded-full border-2 border-background object-cover"
                    />
                  ) : (
                    <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-background bg-secondary font-heading text-base font-semibold text-foreground">
                      {p.nm.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                  {p.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="shrink-0 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          <div className="flex gap-2">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setInboxFilter(f)}
                data-active={inboxFilter === f}
                className="ember-chip flex items-center gap-1.5"
              >
                {f}
                {f === "Unread" && unread > 0 && (
                  <span
                    className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      inboxFilter === "Unread" ? "bg-white text-primary" : "bg-primary text-white"
                    }`}
                  >
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-2">
          {showRow ? (
            <button
              onClick={openRoom}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:bg-secondary/60"
            >
              <div className="relative shrink-0">
                {partnerDp ? (
                  <img
                    src={partnerDp}
                    alt={displayName}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary font-heading text-lg font-semibold text-foreground">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                {(partnerOnline || partnerPresent) && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-heading text-[15px] font-semibold text-foreground">
                    {displayName}
                  </span>
                  {last && (
                    <span
                      className={`shrink-0 text-[11px] ${unread > 0 ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {formatIST(last.created_at)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-[13px] ${partnerTyping ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {preview}
                  </span>
                  {unread > 0 && (
                    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ) : (
            <p className="px-4 pt-8 text-center text-[13px] text-muted-foreground">
              No conversations here.
            </p>
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => setFabOpen(true)}
          aria-label="New chat and settings"
          className="fixed bottom-[86px] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_28px_-8px_rgba(255,46,63,0.8)]"
          style={{ background: "linear-gradient(135deg,#ff2e3f 0%,#d31220 100%)" }}
        >
          <Plus className="h-6 w-6" strokeWidth={2.4} />
        </button>

        {fabOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
            onClick={() => setFabOpen(false)}
          >
            <div
              className="w-full rounded-t-3xl border-t border-border/60 bg-card px-5 pb-8 pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
              <button
                onClick={() => {
                  setFabOpen(false);
                  openRoom();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[14px] text-foreground hover:bg-secondary/50"
              >
                <Send className="h-4 w-4 text-gold" />
                Open chat
              </button>

              <button
                onClick={() => {
                  setFabOpen(false);
                  setDpOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[14px] text-foreground hover:bg-secondary/50"
              >
                <Camera className="h-4 w-4 text-gold" />
                Change profile picture
              </button>

              <div className="mt-2 rounded-xl border border-border/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-foreground">Novel cover</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      On: app opens on the NEALTH novel site and this chat stays hidden behind the
                      passport. Off: the app opens straight into chat.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={coverOn}
                    aria-label="Novel cover"
                    onClick={() => {
                      const next = !coverOn;
                      setCoverOn(next);
                      setCoverEnabled(next);
                    }}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      coverOn ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                        coverOn ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="h-16 shrink-0" />
        <BottomNav active="chats" />
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

  // ---- Step 4b: chat room ----
  const lastSeenLabel = partnerTyping
    ? "Typing…"
    : partnerOnline
      ? "Online"
      : partnerLastActive > 0
        ? formatElapsed(partnerLastActive, nowMs)
        : partnerPresent
          ? "Online"
          : "Offline";
  return (
    <div className="hub-chat-bg flex h-[100dvh] w-screen flex-col overflow-hidden">
      <Buffering active={loadingMsgs} label="Syncing messages…" />
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border/60 bg-background/70 px-3 py-1.5 backdrop-blur-xl">
        <button onClick={backToInbox} className="text-gold" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative shrink-0">
          {partnerDp ? (
            <img
              src={partnerDp}
              alt={displayName}
              className="h-9 w-9 rounded-full border-2 border-gold object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-gold bg-secondary font-heading text-sm text-gold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
          {(partnerOnline || partnerPresent) && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-heading text-sm font-semibold tracking-wide text-foreground">
            {displayName}
          </span>
          <span
            className={`text-[10px] ${
              partnerTyping
                ? "text-primary"
                : partnerOnline
                  ? "text-emerald-400"
                  : "text-muted-foreground"
            }`}
          >
            {lastSeenLabel}
          </span>
        </div>
        <button
          onClick={() => setCall({ mode: "outgoing", peerName: displayName, video: false })}
          className="text-gold"
          aria-label="Call"
        >
          <Phone className="h-4 w-4" />
        </button>
        <button
          onClick={() => setCall({ mode: "outgoing", peerName: displayName, video: true })}
          className="text-gold"
          aria-label="Video call"
        >
          <Video className="h-4 w-4" />
        </button>
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="text-gold"
          aria-label="More options"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2.5"
      >
        {visibleMessages.length > 0 && (
          <div className="flex justify-center pb-1.5">
            <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground backdrop-blur">
              Today
            </span>
          </div>
        )}
        {visibleMessages.map((m) => {
          const mine = m.sender === myId;
          const dragging = swipeId === m.id;
          const { reply, body } = extractReply(m.content);
          const deleted = body === DEL_MARK;
          const edited = !deleted && isEdited(m.content);
          const displayBody = edited ? stripEdit(body) : body;
          const mediaPayload = !deleted && isMedia(displayBody) ? decodeMedia(displayBody) : null;
          const seenByPartner = mine && theirSeen.has(m.id);
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
              onTouchStart={(e) => { if (!mine) onTouchStart(e); armLongPress(m, e); }}
              onTouchMove={(e) => { if (!mine) onTouchMove(m.id, e); else if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
              onTouchEnd={() => { if (!mine) onTouchEnd(m); else if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
              onDoubleClick={() => !deleted && startReply(m)}
              onContextMenu={(e) => { e.preventDefault(); if (!deleted) setActionMsg(m); }}
            >
              <div
                className={`max-w-[78%] px-3 py-2 text-[13px] ${
                  mine
                    ? `ember-msg text-white ${seenByPartner ? "ember-msg-seen" : "ember-msg-unseen"}`
                    : "hub-bubble-theirs rounded-2xl rounded-bl-sm text-foreground"
                }`}
                style={
                  dragging
                    ? { transform: `translateX(${swipeX}px)`, transition: "none" }
                    : { transform: "translateX(0)", transition: "transform 0.18s ease" }
                }
              >
                {reply && !deleted && (
                  <div className={`mb-1 rounded-md border-l-2 px-2 py-1 text-[11px] ${mine ? "border-white/70 bg-white/10" : "border-primary bg-primary/10"}`}>
                    <p className={`text-[10px] font-semibold ${mine ? "text-white/90" : "text-primary"}`}>
                      {reply.authorId === myId ? "You" : reply.authorName}
                    </p>
                    <p className={`truncate ${mine ? "text-white/80" : "text-muted-foreground"}`}>{reply.preview}</p>
                  </div>
                )}
                {deleted ? (
                  <p className={`flex items-center gap-1.5 italic ${mine ? "text-white/85" : "text-primary/90"}`}>
                    <Flame className="h-3.5 w-3.5 shrink-0" />
                    This ember has faded
                  </p>
                ) : mediaPayload ? (
                  <MediaBubble messageId={m.id} media={mediaPayload} mine={mine} />
                ) : (
                  <p className="whitespace-pre-wrap break-words">{displayBody}</p>
                )}
                <span
                  className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] font-medium ${
                    mine
                      ? seenByPartner
                        ? "ember-msg-time-seen"
                        : "ember-msg-time-unseen"
                      : "text-muted-foreground"
                  }`}
                >
                  {edited && <span className="italic opacity-70">edited</span>}
                  {formatIST(m.created_at)}
                </span>
                {mine && <span className="ember-msg-line" aria-hidden />}
              </div>
            </div>
          );
        })}
        {partnerTyping && (
          <div className="flex justify-start">
            <div className="hub-bubble-theirs flex items-center gap-1 rounded-2xl rounded-bl-sm px-3 py-2.5">
              <span className="typing-dot" style={{ animationDelay: "0ms" }} />
              <span className="typing-dot" style={{ animationDelay: "180ms" }} />
              <span className="typing-dot" style={{ animationDelay: "360ms" }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background/70 backdrop-blur-xl">
        {replyTo && (
          <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5">
            <span className="h-7 w-1 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-primary">Replying to {displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{previewOf(replyTo.content)}</p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {editing && (
          <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5">
            <span className="h-7 w-1 shrink-0 rounded-full bg-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-amber-300">Editing message</p>
              <p className="truncate text-[11px] text-muted-foreground">{previewOf(editing.content)}</p>
            </div>
            <button
              onClick={() => { setEditing(null); composerRef.current?.setText(""); }}
              aria-label="Cancel edit"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {recording ? (
          <div className="flex items-center gap-2 px-2.5 py-2">
            <VoiceRecorder onCancel={() => setRecording(false)} onSend={handleVoiceSend} />
          </div>
        ) : (
          <ChatComposer
            ref={composerRef}
            emojiOpen={emojiOpen}
            onSend={send}
            onTyping={handleTyping}
            onOpenAttach={() => { setEmojiOpen(false); setAttachOpen(true); }}
            onToggleEmoji={() => setEmojiOpen((v) => !v)}
            onStartRecording={() => setRecording(true)}
          />
        )}
        {emojiOpen && !recording && (
          <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />
        )}
      </div>

      <div className="h-16 shrink-0" />
      <BottomNav active="chats" />

      {attachOpen && (
        <AttachSheet
          onClose={() => setAttachOpen(false)}
          onPickFile={handlePickFile}
          onOpenCamera={(views) => { setAttachOpen(false); setCameraOpen({ views }); }}
        />
      )}
      {cameraOpen && (
        <CameraCapture onClose={() => setCameraOpen(null)} onCapture={handleCameraShot} />
      )}
      {call && room && (
        <CallOverlay
          room={room}
          myId={myId}
          peerName={call.peerName}
          mode={call.mode}
          incomingOffer={call.mode === "incoming" ? call.offer : undefined}
          video={call.video}
          onClose={() => setCall(null)}
        />
      )}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ornate-card w-full max-w-sm px-6 py-7 text-center"
          >
            <h3 className="font-heading text-lg font-bold tracking-widest text-gold">
              LEAVE ROOM?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You're only ending your current session. Your chats, media and
              room data stay safely preserved. Rejoin anytime with the same
              room code to pick up right where you left off.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-md border border-border/70 bg-card/60 py-2.5 font-heading text-xs tracking-widest text-foreground hover:bg-card"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  setShowLeaveConfirm(false);
                  leaveRoom();
                }}
                className="gold-btn flex-1 rounded-md py-2.5 text-xs"
              >
                LEAVE ROOM
              </button>
            </div>
          </div>
        </div>
      )}
      {actionMsg && (() => {
        const { body: rawBody } = extractReply(actionMsg.content);
        const deleted = rawBody === DEL_MARK;
        const body = typeof rawBody === "string" ? stripEdit(rawBody) : rawBody;
        const canCopy = !deleted && !isMedia(body);
        const canEdit = !deleted && !isMedia(body) && actionMsg.sender === myId;
        return (
          <MessageActionSheet
            mine={actionMsg.sender === myId && !deleted}
            canCopy={canCopy}
            canEdit={canEdit}
            onReply={() => !deleted && startReply(actionMsg)}
            onCopy={() => { if (canCopy) navigator.clipboard.writeText(body).catch(() => {}); }}
            onEdit={() => beginEdit(actionMsg)}
            onDeleteForMe={() => deleteForMe(actionMsg)}
            onDeleteForEveryone={() => deleteForEveryone(actionMsg)}
            onClose={() => setActionMsg(null)}
          />
        );
      })()}
    </div>
  );
}

export function Avatar({ name, url, size = 44 }: { name: string; url: string | null; size?: number }) {
  return <AvatarImpl name={name} url={url} size={size} />;
}

function AvatarImpl({ name, url, size = 44 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full border-2 border-gold object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-gold bg-secondary font-heading text-gold"
      style={{ width: size, height: size }}
    >
      {name.charAt(0)}
    </span>
  );
}

// ---------------- Composer (isolated for typing perf) ----------------
// Input text lives locally so parent state (messages, presence, ticks) can
// change without re-rendering the input on every keystroke.

export interface ComposerHandle {
  setText: (t: string) => void;
  appendText: (t: string) => void;
  focus: () => void;
}

interface ChatComposerProps {
  emojiOpen: boolean;
  onSend: (text: string) => void;
  onTyping: () => void;
  onOpenAttach: () => void;
  onToggleEmoji: () => void;
  onStartRecording: () => void;
}

const ChatComposer = memo(
  forwardRef<ComposerHandle, ChatComposerProps>(function ChatComposer(
    { emojiOpen, onSend, onTyping, onOpenAttach, onToggleEmoji, onStartRecording },
    ref,
  ) {
    const [text, setText] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        setText: (t: string) => setText(t),
        appendText: (t: string) => setText((prev) => prev + t),
        focus: () => inputRef.current?.focus(),
      }),
      [],
    );

    const submit = () => {
      const t = text.trim();
      if (!t) {
        onStartRecording();
        return;
      }
      setText("");
      onSend(t);
    };

    const hasText = text.trim().length > 0;

    return (
      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className="flex flex-1 items-center gap-1.5 rounded-full border border-border/60 bg-card/60 py-1.5 pl-1.5 pr-2.5">
          <button
            onClick={onOpenAttach}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gold transition-colors hover:bg-secondary/60"
            aria-label="Add attachment"
          >
            <Plus className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type a message…"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={onToggleEmoji}
            className={`shrink-0 transition-colors ${emojiOpen ? "text-gold" : "text-muted-foreground hover:text-gold"}`}
            aria-label="Emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={submit}
          aria-label={hasText ? "Send" : "Voice message"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white gold-btn"
        >
          {hasText ? <Send className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      </div>
    );
  }),
);