// Encode media / voice-note payloads inside the existing `messages.content` text
// column, so we don't need any schema changes on the shared Supabase project.
//
// Sentinel prefix keeps it distinguishable from normal chat text and from the
// JOIN_MARK used elsewhere.

export const MEDIA_MARK = "\u0002MEDIA\u0002";

export type MediaKind = "image" | "video" | "audio";

export interface MediaPayload {
  kind: MediaKind;
  // data URL (base64). Kept inline so no storage bucket / RLS is required.
  url: string;
  // 1, 3, 5 = limited-view crystal wave. 0 = unlimited (renders as thumbnail).
  // Ignored for voice notes.
  maxViews: number;
  // Optional caption
  caption?: string;
  // Optional filter id applied on capture (visual only, baked into image if canvas used)
  filter?: string;
  // For audio: duration ms
  duration?: number;
  // Random hue seed → crystal wave color palette
  hue?: number;
}

export function encodeMedia(p: MediaPayload): string {
  return MEDIA_MARK + JSON.stringify(p);
}

export function isMedia(content: string): boolean {
  return typeof content === "string" && content.startsWith(MEDIA_MARK);
}

export function decodeMedia(content: string): MediaPayload | null {
  if (!isMedia(content)) return null;
  try {
    return JSON.parse(content.slice(MEDIA_MARK.length)) as MediaPayload;
  } catch {
    return null;
  }
}

// Per-viewer view-count tracking. Persisted in localStorage so refresh keeps
// state, and scoped by messageId so each message is independent.
const VIEW_KEY = (id: string) => `nealth_mv_${id}`;

export function getViewsUsed(messageId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(VIEW_KEY(messageId));
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export function bumpViews(messageId: string): number {
  const next = getViewsUsed(messageId) + 1;
  localStorage.setItem(VIEW_KEY(messageId), String(next));
  return next;
}

export function remainingViews(messageId: string, maxViews: number): number {
  if (maxViews <= 0) return Infinity;
  return Math.max(0, maxViews - getViewsUsed(messageId));
}

// Read a File as data URL (base64) so we can inline in the message.
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}