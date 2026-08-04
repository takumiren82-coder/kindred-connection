import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Download, X, Trash2, ArrowLeft, SlidersHorizontal, Settings, Lock } from "lucide-react";
import { supabase, GALLERY_BUCKET } from "@/lib/supabase";
import { BottomNav } from "@/components/BottomNav";
import { getMyId, getRoom } from "@/lib/identity";

export const Route = createFileRoute("/hub/gallery")({
  component: PrivateGallery,
});

interface GItem {
  name: string;
  url: string;
  path: string;
}

function PrivateGallery() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState("");
  const [myId, setMyId] = useState("");
  const [partner, setPartner] = useState<GItem[]>([]);
  const [mine, setMine] = useState<GItem[]>([]);
  const [active, setActive] = useState<GItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("All");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRoom(getRoom());
    setMyId(getMyId());
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    if (!room) return;
    // Each member uploads under `${room}/${uid}/...`
    const { data: folders, error: ferr } = await supabase.storage
      .from(GALLERY_BUCKET)
      .list(room, { limit: 100 });
    if (ferr) {
      setError(ferr.message);
      return;
    }
    const uidFolders = (folders ?? []).filter((f) => f.id === null).map((f) => f.name);
    const mineItems: GItem[] = [];
    const partnerItems: GItem[] = [];
    for (const uid of uidFolders) {
      const { data: files } = await supabase.storage
        .from(GALLERY_BUCKET)
        .list(`${room}/${uid}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
      for (const f of files ?? []) {
        if (f.id === null) continue;
        const path = `${room}/${uid}/${f.name}`;
        const { data: pub } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(path);
        (uid === myId ? mineItems : partnerItems).push({ name: f.name, url: pub.publicUrl, path });
      }
    }
    setMine(mineItems);
    setPartner(partnerItems);
  }, [room, myId]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (item: GItem) => {
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    setError(null);
    const { error: delErr } = await supabase.storage.from(GALLERY_BUCKET).remove([item.path]);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    if (active?.path === item.path) setActive(null);
    await load();
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !room) return;
    setError(null);
    setUploading(true);
    try {
      const path = `${room}/${myId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from(GALLERY_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!ready) return null;

  if (!room) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center hub-screen-bg px-6 text-center">
        <div className="ornate-card w-full max-w-sm px-6 py-8">
          <h3 className="font-heading text-lg font-bold tracking-widest text-gold">GALLERY</h3>
          <p className="mt-3 text-xs text-muted-foreground">
            Connect with your partner in Chats first. Your shared gallery is private to your room.
          </p>
          <Link to="/hub" className="gold-btn mt-6 inline-block rounded-md px-5 py-2.5 text-sm">
            GO TO CHATS
          </Link>
        </div>
        <BottomNav active="gallery" />
      </div>
    );
  }

  const tabs = ["All", "Photos", "Videos", "Screenshots"];
  const isVideo = (n: string) => /\.(mp4|mov|webm|m4v)$/i.test(n);
  const filterItems = (items: GItem[]) =>
    tab === "Videos" ? items.filter((i) => isVideo(i.name)) : tab === "Screenshots" ? [] : items.filter((i) => tab !== "Photos" || !isVideo(i.name));

  return (
    <div className="hub-screen-bg min-h-screen pb-28">
      <div className="mx-auto max-w-2xl px-4 pt-4">
        {/* Header */}
        <header className="mb-4 flex items-center gap-3">
          <button onClick={() => navigate({ to: "/hub" })} aria-label="Back" className="text-foreground">
            <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-heading text-[19px] font-bold tracking-tight text-foreground">
            Memory Vault
          </h1>
          <SlidersHorizontal className="h-5 w-5 text-foreground/80" strokeWidth={1.8} />
          <Settings className="h-5 w-5 text-foreground/80" strokeWidth={1.8} />
        </header>

        {/* Connected bar */}
        <div className="mb-4 flex items-center overflow-hidden rounded-xl border border-border bg-card">
          <span className="flex-1 px-4 py-2.5 text-center text-[11px] font-semibold tracking-[0.08em] text-foreground">
            CONNECTED (2/5)
          </span>
          <span className="h-6 w-px bg-border" />
          <button
            onClick={() => navigate({ to: "/hub" })}
            className="flex-1 px-4 py-2.5 text-center text-[11px] font-semibold tracking-[0.08em] text-muted-foreground"
          >
            MANAGE
          </button>
        </div>

        {/* Connected people */}
        <div className="mb-4 flex gap-4 overflow-x-auto [scrollbar-width:none]">
          {[
            { label: "You", items: mine },
            { label: "Partner", items: partner },
          ].map((p) => (
            <div key={p.label} className="flex w-[58px] shrink-0 flex-col items-center gap-1.5">
              <span className="ember-ring block">
                {p.items[0] ? (
                  <img
                    src={p.items[0].url}
                    alt={p.label}
                    className="h-[52px] w-[52px] rounded-full border-2 border-background object-cover"
                  />
                ) : (
                  <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-background bg-secondary font-heading text-base font-semibold text-foreground">
                    {p.label.charAt(0)}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">{p.label}</span>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div className="mb-5 flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} data-active={tab === t} className="ember-chip">
              {t}
            </button>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="ember-chip ml-auto flex items-center gap-1 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> {uploading ? "UPLOADING…" : "ADD"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
        </div>
        {error && <p className="mb-3 text-center text-xs text-primary">{error}</p>}

        <Section
          title="Today"
          items={filterItems(mine)}
          onTap={setActive}
          onDelete={onDelete}
          revealed={revealed}
          onReveal={(p) => setRevealed((s) => new Set(s).add(p))}
          empty="No uploads yet — tap ADD."
        />
        <div className="h-6" />
        <Section
          title="Yesterday"
          items={filterItems(partner)}
          onTap={setActive}
          revealed={revealed}
          onReveal={(p) => setRevealed((s) => new Set(s).add(p))}
          empty="Nothing shared yet."
        />
      </div>

      {active && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95 px-4">
          <button onClick={() => setActive(null)} className="absolute right-4 top-4 text-gold" aria-label="Close">
            <X className="h-7 w-7" />
          </button>
          <img src={active.url} alt={active.name} className="max-h-[75vh] max-w-full rounded-lg object-contain" />
          <a
            href={active.url}
            download={active.name}
            target="_blank"
            rel="noreferrer"
            className="gold-btn mt-5 flex items-center gap-2 rounded-md px-5 py-2 text-sm"
          >
            <Download className="h-4 w-4" /> DOWNLOAD
          </a>
        </div>
      )}
      <BottomNav active="gallery" />
    </div>
  );
}

function Section({
  title,
  items,
  onTap,
  onDelete,
  empty,
  revealed,
  onReveal,
}: {
  title?: string;
  items: GItem[];
  onTap: (i: GItem) => void;
  onDelete?: (i: GItem) => void;
  empty?: string;
  revealed: Set<string>;
  onReveal: (path: string) => void;
}) {
  return (
    <div>
      {title && (
        <h2 className="mb-3 font-heading text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
      )}
      {items.length === 0 ? (
        <p className="ember-panel px-4 py-6 text-center text-xs text-muted-foreground">
          {empty ?? "No items yet."}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {items.map((it, idx) => {
            const locked = idx < 4 && !revealed.has(it.path);
            return (
              <div key={it.name} className="relative">
                <button
                  onClick={() => (locked ? onReveal(it.path) : onTap(it))}
                  className={`relative aspect-square w-full overflow-hidden rounded-xl ${
                    locked
                      ? "border border-primary/60 shadow-[0_0_18px_-6px_rgba(255,46,63,0.8)]"
                      : "border border-white/5"
                  }`}
                >
                  <img
                    src={it.url}
                    alt={it.name}
                    loading="lazy"
                    className={`h-full w-full object-cover transition ${locked ? "scale-110 blur-[14px] brightness-[0.55]" : ""}`}
                  />
                  {locked && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Lock className="h-5 w-5 text-primary drop-shadow-[0_0_8px_rgba(255,46,63,0.9)]" />
                    </span>
                  )}
                </button>
                {onDelete && !locked && (
                  <button
                    onClick={() => onDelete(it)}
                    aria-label="Delete"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-primary backdrop-blur"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
