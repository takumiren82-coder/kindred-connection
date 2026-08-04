import { Link } from "@tanstack/react-router";
import { Images, MessageCircle, Clapperboard, CircleDashed, MonitorPlay } from "lucide-react";
import { useUnreadCount } from "@/hooks/useUnreadCount";

export function BottomNav({
  active,
}: {
  active: "gallery" | "chats" | "reels" | "status" | "watch";
}) {
  const unread = useUnreadCount();
  const items = [
    { key: "gallery", label: "Gallery", to: "/hub/gallery", Icon: Images },
    { key: "status", label: "Status", to: "/hub/status", Icon: CircleDashed },
    { key: "chats", label: "Chat", to: "/hub", Icon: MessageCircle },
    { key: "watch", label: "Watch", to: "/hub/watch", Icon: MonitorPlay },
    { key: "reels", label: "Reels", to: "/hub/reels", Icon: Clapperboard },
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/5 bg-[#08080a]/95 px-2 pb-3 pt-2.5 backdrop-blur-xl">
      {items.map(({ key, label, to, Icon }) => {
        const isActive = active === key;
        const showBadge = key === "chats" && unread > 0;
        return (
          <Link
            key={key}
            to={to}
            className={`flex flex-1 flex-col items-center gap-1 transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <span className="relative">
              <Icon
                className="h-[22px] w-[22px]"
                strokeWidth={isActive ? 2.2 : 1.7}
                style={isActive ? { filter: "drop-shadow(0 0 10px var(--gold))" } : undefined}
              />
              {showBadge && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-white shadow-[0_0_6px_var(--primary)]">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <span className={`text-[10.5px] tracking-tight ${isActive ? "font-semibold" : "font-medium"}`}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
