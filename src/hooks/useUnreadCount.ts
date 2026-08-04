import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isDp } from "@/lib/dp";
import { isDeleted, isStatusLike } from "@/lib/msg-meta";
import { buildSeenSet, isSeenMark } from "@/lib/seen";
import { ROOM_KEY, UID_KEY } from "@/lib/identity";

// Matches the private join-marker sentinel used in hub.index.tsx.
const JOIN_MARK = "\u0001JOIN\u0001";

interface Row {
  id: string;
  sender: string;
  content: string;
}

/**
 * Live unread count for the current room + device identity.
 * Counts only messages FROM the partner that I have not acknowledged with a
 * "seen" receipt yet. Sentinel rows (join / DP / seen / status / deleted)
 * never count.
 */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const room = localStorage.getItem(ROOM_KEY);
    const myId = localStorage.getItem(UID_KEY);
    if (!room || !myId) return;

    let live = true;

    const refresh = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender, content")
        .eq("room_code", room);
      if (!live || error || !data) return;
      const rows = data as Row[];
      const seen = buildSeenSet(rows, myId);
      const c = rows.reduce((acc, m) => {
        if (m.sender === myId) return acc;
        const content = m.content ?? "";
        if (
          content.startsWith(JOIN_MARK) ||
          isSeenMark(content) ||
          isDp(content) ||
          isDeleted(content) ||
          isStatusLike(content)
        ) {
          return acc;
        }
        return seen.has(m.id) ? acc : acc + 1;
      }, 0);
      setCount(c);
    };

    refresh();

    const ch = supabase
      .channel(`unread:${room}:${myId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `room_code=eq.${room}` },
        () => refresh(),
      )
      .subscribe();

    return () => {
      live = false;
      supabase.removeChannel(ch);
    };
  }, []);

  return count;
}
