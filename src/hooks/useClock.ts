import { useEffect, useState } from "react";

export function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const date = now
    ? now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    : "";
  const time = now
    ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";
  return { date, time };
}