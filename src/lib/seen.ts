// Read-receipt ("seen") support without any DB schema change.
//
// The shared `messages` table has no read_at column, so a reader announces
// what it has seen by inserting a hidden sentinel row whose content is:
//   SEEN_MARK + JSON.stringify(["<messageId>", ...])
// Both peers parse these rows to build the seen-set. Sentinel rows are
// filtered out of the visible chat, previews and unread counts.

export const SEEN_MARK = "\u0005SEEN\u0005";

export function encodeSeen(ids: string[]): string {
  return SEEN_MARK + JSON.stringify(ids);
}

export function isSeenMark(content: unknown): boolean {
  return typeof content === "string" && content.startsWith(SEEN_MARK);
}

export function decodeSeen(content: string): string[] {
  if (!isSeenMark(content)) return [];
  try {
    const parsed = JSON.parse(content.slice(SEEN_MARK.length));
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

interface SeenRow {
  sender: string;
  content: string;
}

/**
 * Build the set of message ids that a given reader has acknowledged.
 * `readerId` = whose acknowledgements we care about ("who saw it").
 */
export function buildSeenSet(rows: SeenRow[], readerId: string): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (!isSeenMark(r.content)) continue;
    if (readerId && r.sender !== readerId) continue;
    for (const id of decodeSeen(r.content)) s.add(id);
  }
  return s;
}

/** Set of ids acknowledged by anyone other than `myId` (i.e. my partner). */
export function buildPartnerSeenSet(rows: SeenRow[], myId: string): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (!isSeenMark(r.content)) continue;
    if (r.sender === myId) continue;
    for (const id of decodeSeen(r.content)) s.add(id);
  }
  return s;
}
