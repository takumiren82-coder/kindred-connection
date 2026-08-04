// Shared local identity helpers (no auth — device id + shared room code).
// Keys must match the ones used in src/routes/hub.index.tsx.
export const ROOM_KEY = "nealth_room_code";
export const NAME_KEY = "nealth_name";
export const UID_KEY = "nealth_uid";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function getMyId(): string {
  if (typeof window === "undefined") return "";
  let v = localStorage.getItem(UID_KEY);
  if (!v) {
    v = genId();
    localStorage.setItem(UID_KEY, v);
  }
  return v;
}

export function getMyName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function getRoom(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ROOM_KEY) ?? "";
}
