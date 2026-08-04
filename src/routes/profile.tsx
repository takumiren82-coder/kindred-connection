import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogOut, Bookmark, BookOpen, Flame, FileText } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { useAuth, displayName, avatarUrl } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { computeStats, getBookmarks } from "@/lib/progress";
import { books } from "@/data/books";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — NEALTH" },
      { name: "description", content: "Your NEALTH reading profile, stats and bookmarks." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.id ?? "guest";
  const stats = computeStats(uid);
  const bookmarks = getBookmarks(uid);
  const bookmarked = books.filter((b) => bookmarks.includes(b.id));

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-28 font-body text-neutral-100">
      <header className="flex items-center gap-3 px-4 pt-5">
        <Link to="/" aria-label="Back" className="text-[#c9a84c]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-heading text-xl font-semibold">Profile</h1>
      </header>

      <section className="mx-4 mt-5 flex items-center gap-4 rounded-2xl border border-[#c9a84c]/25 bg-[#141420] p-4">
        <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-[#c9a84c]">
          {avatarUrl(user) ? (
            <img src={avatarUrl(user)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#c9a84c]/20 font-heading text-xl text-[#c9a84c]">
              {displayName(user).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg font-semibold">{displayName(user)}</p>
          <p className="truncate text-xs text-neutral-400">{user?.email ?? "Guest reader"}</p>
        </div>
        {user ? (
          <button
            onClick={logout}
            aria-label="Log out"
            className="rounded-full border border-[#c9a84c]/40 p-2 text-[#c9a84c]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : (
          <Link
            to="/auth"
            className="rounded-lg bg-gradient-to-r from-[#e6c76a] to-[#8a6b1f] px-3 py-1.5 text-xs font-semibold text-[#1a1408]"
          >
            Sign in
          </Link>
        )}
      </section>

      <section className="mx-4 mt-4 grid grid-cols-3 gap-3">
        <Stat Icon={BookOpen} label="Books" value={stats.booksRead} />
        <Stat Icon={FileText} label="Pages" value={stats.pagesRead} />
        <Stat Icon={Flame} label="Days" value={stats.streak} />
      </section>

      <section className="mx-4 mt-6">
        <div className="mb-2 flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-[#c9a84c]" />
          <h2 className="font-heading text-base font-semibold">My List</h2>
        </div>
        {bookmarked.length === 0 ? (
          <p className="text-sm text-neutral-500">You haven't bookmarked any books yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {bookmarked.map((b) => (
              <Link
                key={b.id}
                to="/reader/$id"
                params={{ id: b.id }}
                className="overflow-hidden rounded-lg border border-white/5 bg-[#141420]"
              >
                <img src={b.cover_url} alt={b.title} loading="lazy" className="aspect-[2/3] w-full object-cover" />
                <p className="line-clamp-2 px-1.5 py-1 text-[11px] font-medium">{b.title}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <PublicNav active="profile" />
    </div>
  );
}

function Stat({ Icon, label, value }: { Icon: typeof BookOpen; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#c9a84c]/20 bg-[#141420] p-3 text-center">
      <Icon className="mx-auto h-5 w-5 text-[#c9a84c]" />
      <p className="mt-1 font-heading text-xl font-bold text-neutral-50">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
    </div>
  );
}