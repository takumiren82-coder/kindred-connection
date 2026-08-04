// Local reading progress + bookmarks store (localStorage-backed).
// Keyed by user id (or "guest") + book id.
const PROG_KEY = "nealth_progress_v1";
const BOOKMARK_KEY = "nealth_bookmarks_v1";

export type Progress = { page: number; totalPages: number; updatedAt: number };

function safeRead<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function getAllProgress(uid: string): Record<string, Progress> {
  const all = safeRead<Record<string, Record<string, Progress>>>(PROG_KEY) ?? {};
  return all[uid] ?? {};
}

export function getProgress(uid: string, bookId: string): Progress | null {
  return getAllProgress(uid)[bookId] ?? null;
}

export function setProgress(uid: string, bookId: string, p: Progress) {
  const all = safeRead<Record<string, Record<string, Progress>>>(PROG_KEY) ?? {};
  all[uid] = { ...(all[uid] ?? {}), [bookId]: p };
  safeWrite(PROG_KEY, all);
}

export function getBookmarks(uid: string): string[] {
  const all = safeRead<Record<string, string[]>>(BOOKMARK_KEY) ?? {};
  return all[uid] ?? [];
}

export function toggleBookmark(uid: string, bookId: string): boolean {
  const all = safeRead<Record<string, string[]>>(BOOKMARK_KEY) ?? {};
  const list = new Set(all[uid] ?? []);
  const added = !list.has(bookId);
  if (added) list.add(bookId);
  else list.delete(bookId);
  all[uid] = Array.from(list);
  safeWrite(BOOKMARK_KEY, all);
  return added;
}

export function computeStats(uid: string) {
  const prog = getAllProgress(uid);
  const entries = Object.values(prog);
  const booksRead = entries.filter((p) => p.page >= p.totalPages && p.totalPages > 0).length;
  const pagesRead = entries.reduce((sum, p) => sum + p.page, 0);
  const days = new Set(entries.map((p) => new Date(p.updatedAt).toDateString())).size;
  return { booksRead, pagesRead, streak: days };
}