import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Phone, Video, Plus, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Avatar } from "./hub.index";

export const Route = createFileRoute("/hub/chat/$id")({
  component: PrivateChat,
});

interface Message {
  id: string;
  room_code: string;
  sender_id: string;
  content: string;
  created_at: string;
}

function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function PrivateChat() {
  const { id } = useParams({ from: "/hub/chat/$id" });
  const name = id.toUpperCase();
  const [room, setRoom] = useState<string | null>(null);
  const [myId] = useState(() => {
    const k = "nealth_uid";
    let v = localStorage.getItem(k);
    if (!v) {
      v = genId();
      localStorage.setItem(k, v);
    }
    return v;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`nealth_room_${id}`);
    if (saved) setRoom(saved);
  }, [id]);

  useEffect(() => {
    if (!room) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("room_code", room)
        .order("created_at", { ascending: true });
      if (active && data) setMessages(data as Message[]);
    })();

    const channel = supabase
      .channel(`room:${room}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_code=eq.${room}` },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as Message;
            if (prev.some((p) => p.id === m.id)) return prev;
            return [...prev, m];
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [room]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createRoom = () => {
    const code = genCode();
    localStorage.setItem(`nealth_room_${id}`, code);
    setRoom(code);
  };
  const joinRoom = () => {
    if (joinCode.trim().length < 4) return;
    localStorage.setItem(`nealth_room_${id}`, joinCode.trim());
    setRoom(joinCode.trim());
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !room) return;
    setText("");
    const optimistic: Message = {
      id: genId(),
      room_code: room,
      sender_id: myId,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, optimistic]);
    await supabase.from("messages").insert({ room_code: room, sender_id: myId, content });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <Link to="/hub" className="text-gold" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar name={name} url={null} size={38} />
        <span className="flex-1 font-heading text-base font-semibold tracking-wide text-gold">{name}</span>
        <button className="text-gold" aria-label="Call"><Phone className="h-5 w-5" /></button>
        <button className="text-gold" aria-label="Video"><Video className="h-5 w-5" /></button>
      </header>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4 pb-24">
        {messages.map((m) => {
          const mine = m.sender_id === myId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "rounded-br-sm bg-gold text-primary-foreground"
                    : "rounded-bl-sm border border-border bg-card text-foreground"
                }`}
              >
                <p>{m.content}</p>
                <span className={`mt-1 block text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="fixed inset-x-0 bottom-0 flex items-center gap-2 border-t border-border bg-background/95 px-3 py-3 backdrop-blur">
        <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold text-gold">
          <Plus className="h-4 w-4" />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type..."
          className="flex-1 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground outline-none focus:border-gold"
        />
        <button onClick={send} className="gold-btn flex h-9 items-center gap-1 rounded-full px-4 text-xs">
          SEND <Send className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* First-time room overlay */}
      {!room && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-6 backdrop-blur">
          <div className="ornate-card w-full max-w-sm px-6 py-8 text-center">
            <h3 className="font-heading text-lg font-bold tracking-widest text-gold">PRIVATE ROOM</h3>
            <p className="mt-2 text-xs text-muted-foreground">Create a room or join your partner's code.</p>
            <button onClick={createRoom} className="gold-btn mt-6 w-full rounded-md py-3 text-sm">
              CREATE ROOM
            </button>
            <div className="my-4 text-xs text-muted-foreground">— or —</div>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter 6-digit code"
              inputMode="numeric"
              className="w-full rounded-md border border-border bg-card px-4 py-2 text-center text-sm tracking-widest text-foreground outline-none focus:border-gold"
            />
            <button onClick={joinRoom} className="gold-btn mt-3 w-full rounded-md py-3 text-sm">
              JOIN WITH CODE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}