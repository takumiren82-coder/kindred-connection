import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Type,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { getBook } from "@/data/books";
import {
  getBookmarks,
  getProgress,
  setProgress,
  toggleBookmark,
} from "@/lib/progress";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/reader/$id")({
  head: ({ params }) => {
    const b = getBook(params.id);
    return {
      meta: [
        { title: b ? `${b.title} — NEALTH` : "Reader — NEALTH" },
        { name: "description", content: b?.description ?? "Read timeless classics on NEALTH." },
      ],
    };
  },
  component: ReaderPage,
  notFoundComponent: () => <div className="p-8 text-center text-neutral-100">Book not found.</div>,
});

const WORDS_PER_PAGE = 500;
const FONT_SIZES = [14, 16, 18, 20, 22];

function cleanGutenberg(raw: string): string {
  // Strip Project Gutenberg boilerplate top + bottom markers safely.
  // If markers aren't found, fall back to the raw text so the reader
  // never shows an empty page.
  const startRe = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i;
  const endRe = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i;

  const startMatch = raw.match(startRe);
  const endMatch = raw.match(endRe);

  let body = raw;
  if (startMatch && startMatch.index !== undefined) {
    const from = startMatch.index + startMatch[0].length;
    const to =
      endMatch && endMatch.index !== undefined && endMatch.index > from
        ? endMatch.index
        : raw.length;
    body = raw.slice(from, to);
  } else if (endMatch && endMatch.index !== undefined) {
    body = raw.slice(0, endMatch.index);
  }

  const cleaned = body.trim();
  return cleaned.length > 0 ? cleaned : raw.trim();
}

function paginate(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const pages: string[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_PAGE) {
    pages.push(words.slice(i, i + WORDS_PER_PAGE).join(" "));
  }
  return pages;
}

function ReaderPage() {
  const { id } = useParams({ from: "/reader/$id" });
  const book = getBook(id);
  const { user } = useAuth();
  const uid = user?.id ?? "guest";

  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [night, setNight] = useState(true);
  const [fontIdx, setFontIdx] = useState(1);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    if (!book) return;
    setBookmarked(getBookmarks(uid).includes(book.id));
    const saved = getProgress(uid, book.id);
    if (saved) setPageIdx(Math.max(0, saved.page - 1));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/book/${book.gutenberg_id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.text();
        if (cancelled) return;
        const cleaned = cleanGutenberg(raw);
        if (!cleaned) {
          setErr("Empty book content");
        } else {
          setText(cleaned);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book, uid]);

  const pages = useMemo(() => (text ? paginate(text) : []), [text]);
  const totalPages = pages.length;

  useEffect(() => {
    if (!book || totalPages === 0) return;
    setProgress(uid, book.id, {
      page: pageIdx + 1,
      totalPages,
      updatedAt: Date.now(),
    });
  }, [pageIdx, totalPages, book, uid]);

  if (!book) return null;

  const pct = totalPages ? Math.round(((pageIdx + 1) / totalPages) * 100) : 0;
  const bg = night ? "bg-[#0a0a0f]" : "bg-[#f6f0e1]";
  const fg = night ? "text-neutral-100" : "text-neutral-900";
  const subtle = night ? "text-neutral-400" : "text-neutral-600";

  return (
    <div className={`min-h-screen ${bg} ${fg} font-body`}>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#c9a84c]/20 bg-inherit px-4 py-3 backdrop-blur">
        <Link to="/library" aria-label="Back" className="text-[#c9a84c]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-sm font-semibold">{book.title}</p>
          <p className={`truncate text-[11px] ${subtle}`}>{book.author}</p>
        </div>
        <button
          aria-label="Bookmark"
          onClick={() => setBookmarked(toggleBookmark(uid, book.id))}
          className="text-[#c9a84c]"
        >
          {bookmarked ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
        </button>
        <button
          aria-label="Font size"
          onClick={() => setFontIdx((i) => (i + 1) % FONT_SIZES.length)}
          className="text-[#c9a84c]"
        >
          <Type className="h-5 w-5" />
        </button>
        <button
          aria-label="Toggle theme"
          onClick={() => setNight((v) => !v)}
          className="text-[#c9a84c]"
        >
          {night ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </header>

      <div className="h-1 w-full bg-white/5">
        <div className="h-full bg-[#c9a84c] transition-all" style={{ width: `${pct}%` }} />
      </div>

      <main className="mx-auto max-w-2xl px-5 py-6">
        {err && (
          <p className="mt-10 text-center text-sm text-red-400">
            Couldn't load this book right now. Please try again.
          </p>
        )}
        {!text && !err && (
          <div className="mt-16 text-center text-sm opacity-60">Loading pages…</div>
        )}
        {text && (
          <>
            <p className={`text-center text-[11px] tracking-widest ${subtle}`}>
              PAGE {pageIdx + 1} OF {totalPages} · {pct}%
            </p>
            <article
              className="mt-6 whitespace-pre-wrap leading-[1.85] tracking-[0.005em]"
              style={{ fontSize: FONT_SIZES[fontIdx] }}
            >
              {pages[pageIdx]}
            </article>

            <div className="mt-10 flex items-center justify-between">
              <button
                onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
                disabled={pageIdx === 0}
                className="flex items-center gap-1 rounded-lg border border-[#c9a84c]/40 px-4 py-2 text-sm text-[#c9a84c] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                onClick={() => setPageIdx((i) => Math.min(totalPages - 1, i + 1))}
                disabled={pageIdx >= totalPages - 1}
                className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#e6c76a] via-[#c9a84c] to-[#8a6b1f] px-4 py-2 text-sm font-semibold text-[#1a1408] disabled:opacity-30"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}