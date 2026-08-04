import { Link } from "@tanstack/react-router";
import { Home, BookOpen, Compass, User, Sparkles } from "lucide-react";

export function PublicNav({ active }: { active: "home" | "library" | "discover" | "profile" }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#c9a84c]/20 bg-[#0a0a0f]/95 backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-md items-end justify-between px-6 pb-3 pt-2">
        <NavItem to="/" Icon={Home} label="Home" active={active === "home"} />
        <NavItem to="/library" Icon={BookOpen} label="Library" active={active === "library"} />
        <Link
          to="/library"
          aria-label="Explore"
          className="relative -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#e6c76a] to-[#8a6b1f] shadow-[0_0_20px_rgba(201,168,76,0.6)]"
        >
          <Sparkles className="h-6 w-6 text-[#1a1408]" strokeWidth={2.4} />
        </Link>
        <NavItem to="/library" Icon={Compass} label="Discover" active={active === "discover"} />
        <NavItem to="/profile" Icon={User} label="Profile" active={active === "profile"} />
      </div>
    </nav>
  );
}

function NavItem({
  to,
  Icon,
  label,
  active,
}: {
  to: string;
  Icon: typeof Home;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex w-14 flex-col items-center gap-1 text-[10px] font-medium tracking-wide transition-colors ${
        active ? "text-[#c9a84c]" : "text-neutral-500"
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
      <span>{label}</span>
    </Link>
  );
}