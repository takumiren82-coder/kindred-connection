// In-memory + localStorage cache of a room's messages so leaving the chat
// (Status / Gallery / Reels) and coming back paints instantly instead of
// showing an empty list for a few seconds while the query re-runs.

const mem = new Map<string, unknown[]>();
const key = (room: string) => `ember_msgs_${room}`;
const MAX = 400;

export function readMsgCache<T>(room: string): T[] {
  const m = mem.get(room);
  if (m) return m as T[];
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(room));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    mem.set(room, parsed);
    return parsed as T[];
  } catch {
    return [];
  }
}

export function writeMsgCache<T>(room: string, rows: T[]) {
  const trimmed = rows.slice(-MAX);
  mem.set(room, trimmed as unknown[]);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(room), JSON.stringify(trimmed));
  } catch {
    /* quota — memory cache still works */
  }
}
