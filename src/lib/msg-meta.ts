// Metadata sentinels stored inline in the existing `messages.content` text
// column so reply-refs and "delete for everyone" work over the shared
// Supabase realtime channel without any schema change.

import { MEDIA_MARK, decodeMedia } from "./media-msg";

export const DEL_MARK = "\u0004DEL\u0004"; // whole content == this → deleted for everyone
export const REPLY_MARK = "\u0003REPLY\u0003";
export const REPLY_END = "\u0003END\u0003";
// Trailing sentinel appended to the body of an edited message so both peers
// can render "(Edited)" without any schema change.
export const EDIT_MARK = "\u0006EDITED\u0006";
// Whole content sentinel for status-like pings. Filtered out of chat.
// Format: LIKE_MARK + statusId
export const LIKE_MARK = "\u0007LIKE\u0007";

export interface ReplyRef {
  id: string;
  preview: string;
  authorId: string; // sender uid of the message being replied to
  authorName: string;
}

export function encodeReply(ref: ReplyRef, body: string): string {
  return REPLY_MARK + JSON.stringify(ref) + REPLY_END + body;
}

export function extractReply(content: string): { reply: ReplyRef | null; body: string } {
  if (typeof content !== "string" || !content.startsWith(REPLY_MARK)) {
    return { reply: null, body: content };
  }
  const end = content.indexOf(REPLY_END, REPLY_MARK.length);
  if (end === -1) return { reply: null, body: content };
  try {
    const reply = JSON.parse(content.slice(REPLY_MARK.length, end)) as ReplyRef;
    return { reply, body: content.slice(end + REPLY_END.length) };
  } catch {
    return { reply: null, body: content };
  }
}

export function isDeleted(content: string): boolean {
  const { body } = extractReply(content);
  return body === DEL_MARK;
}

export function isEdited(content: string): boolean {
  const { body } = extractReply(content);
  return typeof body === "string" && body.endsWith(EDIT_MARK) && body !== DEL_MARK;
}

export function stripEdit(body: string): string {
  return body.endsWith(EDIT_MARK) ? body.slice(0, -EDIT_MARK.length) : body;
}

export function withEditMark(body: string): string {
  return body.endsWith(EDIT_MARK) ? body : body + EDIT_MARK;
}

export function isStatusLike(content: string): boolean {
  return typeof content === "string" && content.startsWith(LIKE_MARK);
}

export function decodeStatusLike(content: string): string {
  return content.startsWith(LIKE_MARK) ? content.slice(LIKE_MARK.length) : "";
}

export function encodeStatusLike(statusId: string): string {
  return LIKE_MARK + statusId;
}

/** Short preview used in reply chips, inbox last-message row, etc. */
export function previewOf(content: string): string {
  const { body: raw } = extractReply(content);
  const body = typeof raw === "string" ? stripEdit(raw) : raw;
  if (body === DEL_MARK) return "🔥 This ember has faded";
  if (typeof body === "string" && body.startsWith(MEDIA_MARK)) {
    const p = decodeMedia(body);
    if (!p) return "Media";
    if (p.kind === "audio") return "🎤 Voice note";
    if (p.kind === "video") return p.maxViews > 0 ? "🎬 Video • one-view" : "🎬 Video";
    return p.maxViews > 0 ? "📷 Photo • one-view" : "📷 Photo";
  }
  return body || "";
}

// ---- "Delete for me" (local-only) --------------------------------------
const DEL_ME_KEY = (room: string) => `nealth_delme_${room}`;

export function getDeletedForMe(room: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(DEL_ME_KEY(room)) || "[]"));
  } catch {
    return new Set();
  }
}

export function addDeletedForMe(room: string, id: string) {
  const s = getDeletedForMe(room);
  s.add(id);
  localStorage.setItem(DEL_ME_KEY(room), JSON.stringify([...s]));
}