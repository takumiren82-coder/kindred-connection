// Profile-picture ("DP") helpers. DP state is broadcast to the partner
// as a hidden message with the DP_MARK sentinel so it survives across
// sessions and shows up for both users, WhatsApp-style.
import { supabase } from "@/lib/supabase";

export const DP_MARK = "\u0001DP\u0001";
// Reuse the existing public "status" bucket for DP media.
export const DP_BUCKET = "status";

export const isDp = (content: string) => content.startsWith(DP_MARK);
export const encodeDp = (url: string) => DP_MARK + url;
export const decodeDp = (content: string) => content.slice(DP_MARK.length);

export async function uploadDp(room: string, userId: string, file: File): Promise<string> {
  // Read the file as a data URL first — this always works, even if the
  // storage bucket is missing or blocked by policy, so the DP never fails.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read that image."));
    r.readAsDataURL(file);
  });
  const path = `dp/${room}/${userId}-${Date.now()}.jpg`;
  try {
    const up = await supabase.storage
      .from(DP_BUCKET)
      .upload(path, file, { upsert: true, contentType: "image/jpeg" });
    if (up.error) throw up.error;
    const { data } = supabase.storage.from(DP_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch {
    // fall through to the inline data URL
  }
  return dataUrl;
}

export async function broadcastDp(room: string, userId: string, url: string) {
  await supabase.from("messages").insert({
    room_code: room,
    sender: userId,
    content: encodeDp(url),
  });
}

// Local cache so the DP shows instantly on reload before messages sync.
export const dpCacheKey = (room: string, userId: string) => `nealth_dp_${room}_${userId}`;
export function cacheDp(room: string, userId: string, url: string) {
  if (url) localStorage.setItem(dpCacheKey(room, userId), url);
  else localStorage.removeItem(dpCacheKey(room, userId));
}
export function readCachedDp(room: string, userId: string): string {
  return localStorage.getItem(dpCacheKey(room, userId)) ?? "";
}