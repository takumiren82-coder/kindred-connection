import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ArrowLeft } from "lucide-react";
import { books, type Book } from "@/data/books";
import { PublicNav } from "@/components/PublicNav";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library — NEALTH" },
      { name: "description", content: "Browse the NEALTH library — timeless classics across Fiction, Adventure, Mystery and Romance." },
    ],
  }),
  component: LibraryPage,
});

const FILTERS = ["All", "Fiction", "Adventure", "Mystery", "Romance"] as const;
type Filter = (typeof FILTERS)[number];

function LibraryPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const list: Book[] = books.filter((b) => {
    if (filter !== "All" && b.category !== filter) return false;
    if (q.trim() && !`${b.title} ${b.author}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-28 font-body text-neutral-100">
      <header className="flex items-center gap-3 px-4 pt-5">
        <Link to="/" aria-label="Back" className="text-[#c9a84c]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-heading text-xl font-semibold text-neutral-50">Library</h1>
      </header>

      <div className="mx-4 mt-4 flex items-center gap-2 rounded-2xl border border-[#c9a84c]/30 bg-[#141420] px-3 py-2">
        <Search className="h-4 w-4 text-[#c9a84c]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, authors..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
        />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? "border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]"
                : "border-white/10 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 px-4">
        {list.map((b) => (
          <Link
            key={b.id}
            to="/reader/$id"
            params={{ id: b.id }}
            className="overflow-hidden rounded-xl border border-white/5 bg-[#141420]"
          >
            <div className="aspect-[2/3] w-full overflow-hidden">
              <img src={b.cover_url} alt={b.title} loading="lazy" className="h-full w-full object-cover" />
            </div>
            <div className="p-2.5">
              <p className="line-clamp-2 text-sm font-semibold text-neutral-100">{b.title}</p>
              <p className="mt-0.5 text-[11px] italic text-neutral-400">{b.author}</p>
              <p className="mt-1 text-[10px] font-medium tracking-wide text-[#c9a84c]">{b.category}</p>
            </div>
          </Link>
        ))}
        {list.length === 0 && (
          <p className="col-span-2 mt-10 text-center text-sm text-neutral-500">No books match.</p>
        )}
      </div>

      <PublicNav active="library" />
    </div>
  );
}