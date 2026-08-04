import { useEffect, useState } from "react";

/**
 * WhatsApp/Instagram-style connectivity pill. Shows only when something is
 * genuinely slow (or the device is offline) and disappears the moment the
 * network recovers.
 */
export function Buffering({ active, label }: { active: boolean; label?: string }) {
  const [offline, setOffline] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Small delay so a fast load never flashes the pill; hides instantly.
  useEffect(() => {
    const on = active || offline;
    if (!on) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 250);
    return () => clearTimeout(t);
  }, [active, offline]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[95] flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-black/80 px-3.5 py-1.5 text-[12px] text-foreground shadow-[0_8px_24px_-12px_rgba(255,46,63,0.8)] backdrop-blur">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        {offline ? "Waiting for network…" : label ?? "Loading…"}
      </div>
    </div>
  );
}
