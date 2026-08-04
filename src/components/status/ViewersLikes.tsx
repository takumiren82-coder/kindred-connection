import { useState } from "react";
import { ChevronLeft, Heart } from "lucide-react";

export interface ViewerRow {
  id: string;
  name: string;
  dp?: string;
  when: string;
  liked: boolean;
}

export function ViewersLikes({
  rows,
  hideViewCount,
  hideReactionCount,
  onBack,
}: {
  rows: ViewerRow[];
  hideViewCount?: boolean;
  hideReactionCount?: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"views" | "likes">("views");
  const likes = rows.filter((r) => r.liked);
  const list = tab === "views" ? rows : likes;

  return (
    <div className="fixed inset-0 z-[94] flex flex-col bg-[#050506]">
      <header className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} aria-label="Back" className="text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-heading text-base font-semibold">Viewers &amp; Likes</span>
      </header>

      <div className="flex border-b border-white/8 px-8">
        {(["views", "likes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 pb-2 text-sm capitalize ${
              tab === t ? "border-b-2 border-primary font-semibold text-primary" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <ul className="flex-1 overflow-y-auto px-1 pt-2" style={{ scrollbarWidth: "none" }}>
        {list.length === 0 && (
          <li className="px-5 py-10 text-center text-xs text-muted-foreground">
            {tab === "views" ? "No views yet." : "No likes yet."}
          </li>
        )}
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/40 bg-secondary font-heading text-sm text-primary">
              {r.dp ? <img src={r.dp} alt="" className="h-full w-full object-cover" /> : r.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{r.name}</span>
              <span className="block text-[11px] text-muted-foreground">{r.when}</span>
            </span>
            <Heart className={`h-5 w-5 ${r.liked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-4 border-t border-white/8 px-8 py-6 text-center">
        <div>
          <p className="text-[11px] text-muted-foreground">Total Views</p>
          <p className="font-heading text-2xl font-bold text-foreground">{hideViewCount ? "—" : rows.length}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Total Likes</p>
          <p className="font-heading text-2xl font-bold text-foreground">{hideReactionCount ? "—" : likes.length}</p>
        </div>
      </div>
    </div>
  );
}