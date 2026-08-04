// Novel-website "cover" toggle.
// ON (default) => the public NEALTH novel site is the entry screen and the
// private chat hub stays hidden behind the passport gate.
// OFF => opening the app lands straight in the chat hub.
// Stored per-device in localStorage; unset means ON so existing users are
// never surprised by a change after an update.
export const COVER_KEY = "ember_cover_enabled";

export function isCoverEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(COVER_KEY) !== "0";
}

export function setCoverEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COVER_KEY, on ? "1" : "0");
}
