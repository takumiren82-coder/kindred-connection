// Watch Together — shared types + local helpers.
// Room state lives entirely on the Supabase realtime channel (broadcast +
// presence), so no schema change is required.

export interface WatchVideo {
  id: string;
  title: string;
  channel: string;
  duration?: string;
  views?: string;
  thumb: string;
}

export interface RoomSettings {
  name: string;
  privacy: "public" | "private";
  maxMembers: number;
  voiceChat: boolean;
  textChat: boolean;
  hostOnlyPlay: boolean;
}

export interface RecentRoom {
  code: string;
  name: string;
  video?: WatchVideo;
  at: number;
  host: boolean;
  settings: RoomSettings;
}

export interface WatchMember {
  id: string;
  name: string;
  host: boolean;
  mic: boolean;
  hand: boolean;
  avatar?: string;
}

export interface WatchChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
  reaction?: string;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  name: "Movie Night 🍿",
  privacy: "private",
  maxMembers: 12,
  voiceChat: true,
  textChat: true,
  hostOnlyPlay: true,
};

const RECENT_KEY = "ember_watch_recent";
const HOST_KEY = (code: string) => `ember_watch_host_${code}`;

export function genRoomCode(name: string): string {
  const base = (name.replace(/[^a-zA-Z]/g, "").slice(0, 6) || "ROOM").toUpperCase();
  return `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function readRecent(): RecentRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as RecentRoom[]) : [];
  } catch {
    return [];
  }
}

export function saveRecent(room: RecentRoom) {
  if (typeof window === "undefined") return;
  const list = readRecent().filter((r) => r.code !== room.code);
  list.unshift(room);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* quota */
  }
}

export function getRecent(code: string): RecentRoom | undefined {
  return readRecent().find((r) => r.code === code);
}

export function markHost(code: string) {
  if (typeof window !== "undefined") localStorage.setItem(HOST_KEY(code), "1");
}
export function isHostLocal(code: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(HOST_KEY(code)) === "1";
}

/** Extract a YouTube video id from a full URL, short URL or bare id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/(?:embed|shorts|live)\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}