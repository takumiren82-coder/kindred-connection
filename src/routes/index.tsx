import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, Search, Sparkles, Plus } from "lucide-react";
import { books, type Book } from "@/data/books";
import { PublicNav } from "@/components/PublicNav";
import { PassportSearch } from "@/components/PassportSearch";
import { useAuth, getGreeting, displayName, avatarUrl } from "@/lib/auth";
import { getAllProgress, getBookmarks } from "@/lib/progress";
import { isCoverEnabled } from "@/lib/cover";
import { useAccess } from "@/lib/access-context";
import heroBg from "@/assets/library-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "N-3" },
      { name: "description", content: "Discover, read and collect timeless classics. NEALTH brings the world's great books to your pocket." },
      { property: "og:title", content: "N-3" },
      { property: "og:description", content: "Discover, read and collect timeless classics. NEALTH brings the world's great books to your pocket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const CATEGORIES = [
  { label: "Library", key: "all" },
  { label: "Categories", key: "cats" },
  { label: "Top Reads", key: "top" },
  { label: "New Releases", key: "new" },
  { label: "My List", key: "list" },
];

function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { grantAccess } = useAccess();
  const [bypass, setBypass] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [featIdx, setFeatIdx] = useState(0);
  // Computed after mount only — the server's clock/timezone differs from the
  // device's and would otherwise cause a hydration mismatch.
  const [greeting, setGreeting] = useState("Welcome");
  const featured = books.slice(0, 3);

  useEffect(() => setGreeting(getGreeting()), []);

  // If the user turned the novel cover OFF on this device, skip the public
  // site entirely and open the private hub directly.
  useEffect(() => {
    if (!isCoverEnabled()) {
      setBypass(true);
      grantAccess();
      navigate({ to: "/hub", replace: true });
    }
  }, [grantAccess, navigate]);

  useEffect(() => {
    const t = setInterval(() => setFeatIdx((i) => (i + 1) % featured.length), 6000);
    return () => clearInterval(t);
  }, [featured.length]);

  const uid = user?.id ?? "guest";
  const progress = getAllProgress(uid);
  const continueList = books
    .filter((b) => progress[b.id])
    .sort((a, b) => (progress[b.id].updatedAt || 0) - (progress[a.id].updatedAt || 0))
    .slice(0, 8);
  const bookmarks = getBookmarks(uid);
  const recommended = books.filter((b) => !progress[b.id]).slice(0, 8);
  const feat = featured[featIdx];

  if (bypass) return null;

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] pb-24 font-body text-neutral-100">
      {searchOpen && <PassportSearch onClose={() => setSearchOpen(false)} />}

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 pt-4">
        <button aria-label="Menu" className="text-[#c9a84c]">
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="font-heading text-2xl font-bold tracking-[0.35em] text-[#c9a84c] drop-shadow-[0_0_12px_rgba(201,168,76,0.4)]">
          NEALTH
        </h1>
        <button aria-label="Search" onClick={() => setSearchOpen(true)} className="text-[#c9a84c]">
          <Search className="h-6 w-6" />
        </button>
      </header>

      {/* Greeting */}
      <section className="relative z-10 flex items-start justify-between px-4 pt-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-neutral-50">
            {greeting},{" "}
            <span className="text-[#c9a84c]">{displayName(user)}</span>{" "}
            <Sparkles className="inline h-5 w-5 -translate-y-1 text-[#c9a84c]" />
          </h2>
          <p className="mt-1 text-sm text-neutral-400">Where stories come alive.</p>
        </div>
        <Link to="/profile" className="relative shrink-0" aria-label="Profile">
          <div className="h-11 w-11 overflow-hidden rounded-full ring-2 ring-[#c9a84c]">
            {avatarUrl(user) ? (
              <img src={avatarUrl(user)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#c9a84c]/20 font-heading text-sm text-[#c9a84c]">
                {displayName(user).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </Link>
      </section>

      {/* Featured carousel */}
      <section className="relative z-10 mx-4 mt-5 overflow-hidden rounded-2xl border border-[#c9a84c]/30 bg-[#141420]">
        <div className="relative aspect-[16/10]">
          <img
            key={feat.id}
            src={heroBg}
            alt=""
            className="absolute inset-0 h-full w-full animate-fade-in object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f] via-[#0a0a0f]/70 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-between p-5">
            <span className="inline-flex w-fit rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-neutral-200 ring-1 ring-white/20">
              FEATURED
            </span>
            <div>
              <h3 className="font-heading text-2xl font-bold leading-tight text-neutral-50">
                {feat.title}
              </h3>
              <p className="mt-1 text-sm font-medium text-[#c9a84c]">{feat.author}</p>
              <p className="mt-2 max-w-[70%] text-xs italic text-neutral-300 line-clamp-2">
                "{feat.description}"
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Link
                  to="/reader/$id"
                  params={{ id: feat.id }}
                  className="rounded-lg bg-gradient-to-r from-[#e6c76a] via-[#c9a84c] to-[#8a6b1f] px-4 py-2 font-heading text-xs font-semibold tracking-wider text-[#1a1408] shadow-[0_0_14px_rgba(201,168,76,0.5)]"
                >
                  Read Now
                </Link>
                <button
                  aria-label="Add to list"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#c9a84c]/60 text-[#c9a84c]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {featured.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === featIdx ? "w-4 bg-[#c9a84c]" : "w-1.5 bg-white/30"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Category icons */}
      <section className="relative z-10 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            to="/library"
            className="flex min-w-[68px] flex-col items-center gap-2 rounded-xl border border-[#c9a84c]/25 bg-[#141420] px-2 py-3 text-center"
          >
            <span className="text-lg text-[#c9a84c]">✦</span>
            <span className="text-[10px] font-medium text-neutral-300">{c.label}</span>
          </Link>
        ))}
      </section>

      {/* Continue reading */}
      {continueList.length > 0 && (
        <BookRow title="Continue Reading" list={continueList} progressMap={progress} />
      )}

      {/* Recommended */}
      <BookRow title="Recommended for You" list={recommended} />

      {/* Bookmarks */}
      {bookmarks.length > 0 && (
        <BookRow
          title="My List"
          list={books.filter((b) => bookmarks.includes(b.id))}
        />
      )}

      <PublicNav active="home" />
    </div>
  );
}

function BookRow({
  title,
  list,
  progressMap,
}: {
  title: string;
  list: Book[];
  progressMap?: Record<string, { page: number; totalPages: number }>;
}) {
  return (
    <section className="relative z-10 mt-6 pl-4">
      <div className="mb-3 flex items-center justify-between pr-4">
        <h3 className="font-heading text-lg font-semibold text-neutral-50">{title}</h3>
        <Link to="/library" className="text-xs font-medium text-[#c9a84c]">
          View all →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 pr-4">
        {list.map((b) => {
          const p = progressMap?.[b.id];
          const pct = p && p.totalPages ? Math.min(100, Math.round((p.page / p.totalPages) * 100)) : null;
          return (
            <Link
              key={b.id}
              to="/reader/$id"
              params={{ id: b.id }}
              className="w-32 shrink-0 overflow-hidden rounded-xl border border-white/5 bg-[#141420]"
            >
              <div className="relative aspect-[2/3] w-full">
                <img src={b.cover_url} alt={b.title} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="p-2">
                <p className="line-clamp-2 min-h-[2rem] text-xs font-semibold text-neutral-100">{b.title}</p>
                {pct !== null ? (
                  <>
                    <p className="mt-1 text-[10px] text-neutral-400">Page {p!.page}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-[#c9a84c]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-medium text-[#c9a84c]">{pct}%</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-[10px] italic text-neutral-500">{b.author}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
