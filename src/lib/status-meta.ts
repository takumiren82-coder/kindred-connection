// Status captions, per-status privacy and the global Status Settings are stored
// as sentinel rows in the existing `messages` table, so no schema change is
// needed on the shared Supabase project. Realtime already streams that table.

import { supabase } from "./supabase";

export const SMETA_MARK = "\u000BSMETA\u000B"; // per-status meta (caption, privacy)
export const SSET_MARK = "\u000BSSET\u000B"; // per-user global status settings

export interface StatusMeta {
  sid: string;
  caption?: string;
  filter?: string;
  /** viewer ids that may only see this status once */
  oneTime?: string[];
  /** viewer ids that must not see this status at all */
  hiddenFrom?: string[];
  /** viewer ids that must not see the caption */
  captionHiddenFrom?: string[];
  /** ISO time before which the status stays hidden (scheduled post) */
  scheduledAt?: string;
  blockScreenshots?: boolean;
  hideViewCount?: boolean;
  hideReactionCount?: boolean;
}

export interface StatusSettings {
  whoCanView: "everyone" | "contacts" | "except" | "only" | "custom";
  hiddenFrom: string[];
  allowFor: string[];
  oneTimeFor: string[];
  captionHiddenFrom: string[];
  captionShowTo: string[];
  shareNewContacts: boolean;
  shareChatPeople: boolean;
  allowForward: boolean;
  blockScreenshots: boolean;
  hideViewCount: boolean;
  hideReactionCount: boolean;
  hideReplyCount: boolean;
  showTypingWhenReplying: boolean;
  readReceipts: boolean;
  autoDeleteHours: number;
}

export const DEFAULT_SETTINGS: StatusSettings = {
  whoCanView: "contacts",
  hiddenFrom: [],
  allowFor: [],
  oneTimeFor: [],
  captionHiddenFrom: [],
  captionShowTo: [],
  shareNewContacts: true,
  shareChatPeople: true,
  allowForward: true,
  blockScreenshots: false,
  hideViewCount: false,
  hideReactionCount: false,
  hideReplyCount: false,
  showTypingWhenReplying: true,
  readReceipts: true,
  autoDeleteHours: 24,
};

export function isStatusMeta(c: string) {
  return typeof c === "string" && c.startsWith(SMETA_MARK);
}
export function isStatusSettings(c: string) {
  return typeof c === "string" && c.startsWith(SSET_MARK);
}
export function encodeStatusMeta(m: StatusMeta) {
  return SMETA_MARK + JSON.stringify(m);
}
export function decodeStatusMeta(c: string): StatusMeta | null {
  try {
    return JSON.parse(c.slice(SMETA_MARK.length)) as StatusMeta;
  } catch {
    return null;
  }
}
export function decodeStatusSettings(c: string): StatusSettings | null {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(c.slice(SSET_MARK.length)) as StatusSettings) };
  } catch {
    return null;
  }
}

export async function saveStatusMeta(room: string, sender: string, meta: StatusMeta) {
  await supabase.from("messages").insert({
    room_code: room,
    sender,
    content: encodeStatusMeta(meta),
  });
}

export async function fetchStatusMetas(room: string): Promise<Record<string, StatusMeta>> {
  const { data } = await supabase
    .from("messages")
    .select("content,created_at")
    .eq("room_code", room)
    .like("content", SMETA_MARK + "%")
    .order("created_at", { ascending: true });
  const out: Record<string, StatusMeta> = {};
  for (const row of (data ?? []) as { content: string }[]) {
    const m = decodeStatusMeta(row.content);
    if (m?.sid) out[m.sid] = { ...out[m.sid], ...m };
  }
  return out;
}

const SET_KEY = (room: string, uid: string) => `nealth_status_settings_${room}_${uid}`;

export function readCachedSettings(room: string, uid: string): StatusSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SET_KEY(room, uid));
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(room: string, uid: string, s: StatusSettings) {
  try {
    localStorage.setItem(SET_KEY(room, uid), JSON.stringify(s));
  } catch {
    /* ignore */
  }
  await supabase.from("messages").insert({
    room_code: room,
    sender: uid,
    content: SSET_MARK + JSON.stringify(s),
  });
}

export async function fetchSettings(room: string, uid: string): Promise<StatusSettings> {
  const { data } = await supabase
    .from("messages")
    .select("sender,content,created_at")
    .eq("room_code", room)
    .eq("sender", uid)
    .like("content", SSET_MARK + "%")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { content: string } | undefined;
  if (!row) return readCachedSettings(room, uid);
  const s = decodeStatusSettings(row.content);
  if (s) {
    try {
      localStorage.setItem(SET_KEY(room, uid), JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }
  return s ?? DEFAULT_SETTINGS;
}

/** Build per-status privacy from the author's global settings. */
export function metaFromSettings(sid: string, s: StatusSettings, extra: Partial<StatusMeta>): StatusMeta {
  const hiddenFrom =
    s.whoCanView === "only" || s.whoCanView === "custom" ? [] : [...s.hiddenFrom];
  return {
    sid,
    hiddenFrom,
    oneTime: [...s.oneTimeFor],
    captionHiddenFrom: [...s.captionHiddenFrom],
    blockScreenshots: s.blockScreenshots,
    hideViewCount: s.hideViewCount,
    hideReactionCount: s.hideReactionCount,
    ...extra,
  };
}

/** Local record of one-time views already consumed by this device. */
const OT_KEY = (uid: string) => `nealth_status_onetime_${uid}`;

export function consumedOneTime(uid: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(OT_KEY(uid)) || "[]"));
  } catch {
    return new Set();
  }
}

export function markOneTimeConsumed(uid: string, sid: string) {
  const s = consumedOneTime(uid);
  s.add(sid);
  try {
    localStorage.setItem(OT_KEY(uid), JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}