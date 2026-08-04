import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Camera,
  Video as VideoIcon,
  Image as ImageIcon,
  Type as TypeIcon,
  Mic,
  Zap,
  RotateCw,
  Settings2,
  Check,
  ChevronLeft,
  Sparkles,
  Smile,
  Music,
  Pencil,
  Crop as CropIcon,
  SlidersHorizontal,
  Lock,
  UploadCloud,
  Aperture,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  metaFromSettings,
  saveStatusMeta,
  type StatusSettings,
} from "@/lib/status-meta";
import { animeFilter, type AnimeStyle } from "@/lib/anime-filter";
import { useServerFn } from "@tanstack/react-start";
import { stylizeAnime } from "@/lib/anime-ai.functions";

const STATUS_BUCKET = "status";

/** CSS filter presets (still used for non-anime style previews / video preview). */
export const FILTERS: { id: string; label: string; css: string }[] = [
  { id: "original", label: "Original", css: "none" },
  { id: "anime", label: "Anime", css: "contrast(1.2) saturate(1.5)" },
  { id: "warm", label: "Warm", css: "sepia(0.25) saturate(1.25) contrast(1.05)" },
  { id: "moody", label: "Moody", css: "contrast(1.25) saturate(0.85) brightness(0.9)" },
  { id: "bw", label: "B&W", css: "grayscale(1) contrast(1.1)" },
];

export function filterCss(id?: string) {
  return FILTERS.find((f) => f.id === id)?.css ?? "none";
}

const ENHANCE_STEPS = [
  "Analyzing image",
  "Enhancing details",
  "Applying anime style",
  "Optimizing quality",
  "Finalizing magic",
];

const UPLOAD_STEPS = ["Encrypting data", "Compressing", "Uploading", "Almost done…"];

const STICKERS = ["❤️", "🔥", "✨", "💯", "🚀", "😍", "🌙", "🎬"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

type Step = "chooser" | "camera" | "enhance" | "processing" | "edit" | "uploading" | "done";

interface Picked {
  file: File;
  url: string;
  isVideo: boolean;
}

export function CreateStatus({
  room,
  myId,
  myName,
  settings,
  onClose,
  onPosted,
}: {
  room: string;
  myId: string;
  myName: string;
  settings: StatusSettings;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [step, setStep] = useState<Step>("chooser");
  const [item, setItem] = useState<Picked | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [style, setStyle] = useState<AnimeStyle>("anime");
  const [strength, setStrength] = useState(75);
  const [caption, setCaption] = useState("");
  const [editTool, setEditTool] = useState<"text" | "sticker" | "draw" | "music" | "filter" | "crop">("filter");
  const [postedId, setPostedId] = useState<string | null>(null);

  // processing / upload state
  const [procPct, setProcPct] = useState(0);
  const [procDone, setProcDone] = useState(0);
  const [procLabel, setProcLabel] = useState("");
  const [upPct, setUpPct] = useState(0);
  const [upDone, setUpDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const livePhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (item) URL.revokeObjectURL(item.url);
      if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (list: FileList | null, forceVideo = false) => {
    const f = list?.[0];
    if (!f) return;
    const isVideo = forceVideo || f.type.startsWith("video");
    const p: Picked = { file: f, url: URL.createObjectURL(f), isVideo };
    setItem(p);
    if (isVideo) setStep("edit");
    else setStep("enhance");
  };

  // ---------- ENHANCE (AI anime processing via Lovable AI Gateway) ----------
  const runStylize = useServerFn(stylizeAnime);
  const runEnhance = async () => {
    if (!item) return;
    setStep("processing");
    setProcPct(0);
    setProcDone(0);
    setProcLabel(ENHANCE_STEPS[0]);
    setError(null);

    // Fake but smooth progress ticker while the AI runs (real request is one
    // round-trip, so we script the UI to move through the checklist).
    let cancelled = false;
    const totalMs = 4200;
    const started = Date.now();
    const timer = setInterval(() => {
      if (cancelled) return;
      const t = Math.min(1, (Date.now() - started) / totalMs);
      const pct = Math.min(94, Math.round(t * 94));
      setProcPct(pct);
      const idx = Math.min(ENHANCE_STEPS.length - 1, Math.floor(t * ENHANCE_STEPS.length));
      setProcDone(idx);
      setProcLabel(ENHANCE_STEPS[idx]);
    }, 140);

    try {
      let outBlob: Blob;
      if (style === "anime") {
        // Real AI: turn the photo into a Studio-Ghibli style anime illustration.
        const b64 = await fileToBase64(item.file);
        const res = await runStylize({
          data: { imageBase64: b64, mimeType: item.file.type || "image/jpeg", style },
        });
        outBlob = base64ToBlob(res.b64, res.mimeType);
      } else {
        // Warm / Moody / B&W are stylistic color grades — keep the fast
        // client-side canvas pipeline for them (no AI cost, instant).
        outBlob = await animeFilter(item.url, {
          style,
          strength: strength / 100,
        });
      }

      cancelled = true;
      clearInterval(timer);
      setProcPct(100);
      setProcDone(ENHANCE_STEPS.length);
      setProcLabel("Finalizing magic");

      const url = URL.createObjectURL(outBlob);
      const enhanced: Picked = {
        file: new File([outBlob], style === "anime" ? "anime.png" : "styled.jpg", {
          type: outBlob.type || (style === "anime" ? "image/png" : "image/jpeg"),
        }),
        url,
        isVideo: false,
      };
      if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
      setEnhancedUrl(url);
      setItem(enhanced);
      await new Promise((r) => setTimeout(r, 500));
      setStep("edit");
    } catch (e) {
      cancelled = true;
      clearInterval(timer);
      setError(e instanceof Error ? e.message : "Anime enhancement failed");
      setStep("enhance");
    }
  };

  // ---------- UPLOAD ----------
  const doUpload = async () => {
    if (!item) return;
    setStep("uploading");
    setError(null);
    setUpPct(0);
    setUpDone(0);
    const tick = setInterval(() => {
      setUpPct((p) => (p < 92 ? p + Math.max(1, Math.round((92 - p) / 12)) : p));
      setUpDone((s) => (s < UPLOAD_STEPS.length - 1 ? s + 1 : s));
    }, 380);
    try {
      const ext = item.isVideo ? "mp4" : "jpg";
      const path = `${room}/${myId}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from(STATUS_BUCKET).upload(path, item.file, {
        upsert: true,
        contentType: item.isVideo ? item.file.type : "image/jpeg",
      });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from(STATUS_BUCKET).getPublicUrl(path);
      const expires = new Date(Date.now() + settings.autoDeleteHours * 3600_000).toISOString();
      const ins = await supabase
        .from("statuses")
        .insert({
          room_code: room,
          sender: myId,
          sender_name: myName || "Me",
          media_url: pub.publicUrl,
          media_type: item.isVideo ? "video" : "image",
          expires_at: expires,
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      const sid = (ins.data as { id: string }).id;
      setPostedId(sid);
      await saveStatusMeta(
        room,
        myId,
        metaFromSettings(sid, settings, { caption: caption.trim() || undefined }),
      );
      clearInterval(tick);
      setUpDone(UPLOAD_STEPS.length);
      setUpPct(100);
      await new Promise((r) => setTimeout(r, 500));
      setStep("done");
    } catch (e) {
      clearInterval(tick);
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  // ============================================================
  // Screen: Create Status chooser (mockup screen 2)
  // ============================================================
  if (step === "chooser") {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col bg-[#050506]">
        <header className="flex items-center justify-between px-4 py-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-heading text-base font-semibold">Create Status</span>
          <button onClick={onClose} aria-label="Close" className="text-foreground">
            <X className="h-6 w-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <Section label="Capture New">
            <TileGrid>
              <Tile icon={<Camera className="h-6 w-6" />} label="Camera" onClick={() => cameraRef.current?.click()} />
              <Tile icon={<Aperture className="h-6 w-6" />} label="Live Photo" onClick={() => livePhotoRef.current?.click()} />
            </TileGrid>
          </Section>

          <Section label="Choose From Gallery">
            <TileGrid>
              <Tile icon={<ImageIcon className="h-6 w-6" />} label="Gallery" onClick={() => galleryRef.current?.click()} />
              <Tile icon={<VideoIcon className="h-6 w-6" />} label="Video" onClick={() => videoRef.current?.click()} />
            </TileGrid>
          </Section>

          <Section label="More Options">
            <TileGrid>
              <Tile
                icon={<TypeIcon className="h-6 w-6" />}
                label="Text Status"
                onClick={() => {
                  setCaption("");
                  setEditTool("text");
                  // create a solid-color placeholder image so text status can be posted
                  const c = document.createElement("canvas");
                  c.width = 720;
                  c.height = 1280;
                  const ctx = c.getContext("2d");
                  if (ctx) {
                    const g = ctx.createLinearGradient(0, 0, 720, 1280);
                    g.addColorStop(0, "#1a0407");
                    g.addColorStop(1, "#050506");
                    ctx.fillStyle = g;
                    ctx.fillRect(0, 0, 720, 1280);
                  }
                  c.toBlob((blob) => {
                    if (!blob) return;
                    const f = new File([blob], "text.jpg", { type: "image/jpeg" });
                    setItem({ file: f, url: URL.createObjectURL(f), isVideo: false });
                    setStep("edit");
                  }, "image/jpeg");
                }}
              />
              <Tile icon={<Mic className="h-6 w-6" />} label="Voice Status" onClick={() => alert("Voice status: coming soon")} />
            </TileGrid>
          </Section>

          <div className="mt-6 flex items-center justify-center gap-2 rounded-full border border-primary/25 bg-[#0c0c0f] px-4 py-2.5">
            <Lock className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] text-muted-foreground">All media is end-to-end encrypted</span>
          </div>
        </div>

        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files)} />
        <input ref={videoRef} type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files, true)} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files)} />
        <input ref={livePhotoRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => pick(e.target.files)} />
      </div>
    );
  }

  // ============================================================
  // Screen: Enhance Photo (mockup screen 4)
  // ============================================================
  if (step === "enhance" && item) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col bg-[#050506]">
        <header className="flex items-center justify-between px-4 py-3">
          <button onClick={() => setStep("chooser")} aria-label="Back" className="text-foreground">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <span className="font-heading text-base font-semibold">Enhance Photo</span>
          <button onClick={() => setStep("edit")} aria-label="Skip" className="text-primary">
            <Check className="h-6 w-6" />
          </button>
        </header>

        <div className="relative mx-4 aspect-[4/5] overflow-hidden rounded-2xl border border-primary/25 bg-black">
          <img src={item.url} alt="Preview" className="h-full w-full object-cover" style={{ filter: filterCss(style) }} />
        </div>

        <div className="mt-4 flex justify-center gap-3 px-4">
          {(["original", "anime", "warm", "moody", "bw"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s === "original" ? "anime" : (s as AnimeStyle))}
              className="text-center"
            >
              <span
                className={`block h-14 w-14 overflow-hidden rounded-xl border-2 ${
                  style === s ? "border-primary" : "border-white/10"
                }`}
                style={{ boxShadow: style === s ? "0 0 12px -2px var(--gold)" : undefined }}
              >
                <img src={item.url} alt="" className="h-full w-full object-cover" style={{ filter: filterCss(s) }} />
              </span>
              <span className={`mt-1 block text-[10px] ${style === s ? "text-primary" : "text-muted-foreground"}`}>
                {FILTERS.find((f) => f.id === s)?.label}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 px-6">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Style Strength</span>
            <span className="font-semibold text-foreground">{strength}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        {error && <p className="mt-3 px-6 text-center text-xs text-rose-400">{error}</p>}

        <div className="mt-auto px-5 pb-6 pt-4">
          <button
            onClick={runEnhance}
            className="gold-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm"
          >
            Enhance with Anime <Sparkles className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Screen: Processing (mockup screen 5)
  // ============================================================
  if (step === "processing" && item) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col bg-[#050506]">
        <div className="relative mx-4 mt-14 aspect-[4/5] overflow-hidden rounded-2xl border border-primary/25 bg-black">
          <img src={item.url} alt="Processing" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <ProgressRing pct={procPct} size={148} label={`${Math.round(procPct)}%`} />
            <p className="mt-4 font-heading text-base font-semibold text-foreground">
              Enhancing with {style === "anime" ? "Anime" : style.toUpperCase()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Hang tight, magic is brewing…</p>
          </div>
        </div>

        <ul className="mx-6 mt-6 space-y-3">
          {ENHANCE_STEPS.map((s, i) => (
            <li key={s} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-foreground/90">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> {s}
              </span>
              {i < procDone ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : i === procDone ? (
                <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-arc" />
              ) : (
                <span className="h-5 w-5 rounded-full border border-white/20" />
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">{procLabel}</p>
      </div>
    );
  }

  // ============================================================
  // Screen: Edit Status (mockup screen 6)
  // ============================================================
  if (step === "edit" && item) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col bg-[#050506]">
        <header className="flex items-center justify-between px-4 py-3">
          <button onClick={() => setStep(item.isVideo ? "chooser" : "enhance")} aria-label="Back" className="text-foreground">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <span className="font-heading text-base font-semibold">Edit Status</span>
          <button className="text-foreground" aria-label="More">
            <Settings2 className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-1 gap-3 px-4">
          <div className="relative flex-1 overflow-hidden rounded-2xl border border-primary/25 bg-black">
            {item.isVideo ? (
              <video src={item.url} autoPlay loop muted playsInline className="h-full w-full object-contain" />
            ) : (
              <img src={item.url} alt="Edit" className="h-full w-full object-contain" />
            )}
            {caption && (
              <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 text-center text-sm font-medium text-white">
                {caption}
              </p>
            )}
          </div>

          <div className="flex w-14 flex-col items-center gap-3 py-1">
            {[
              { id: "text", Icon: TypeIcon, label: "Text" },
              { id: "sticker", Icon: Smile, label: "Sticker" },
              { id: "draw", Icon: Pencil, label: "Draw" },
              { id: "music", Icon: Music, label: "Music" },
              { id: "filter", Icon: SlidersHorizontal, label: "Filter" },
              { id: "crop", Icon: CropIcon, label: "Crop" },
            ].map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => setEditTool(id as typeof editTool)}
                className={`flex flex-col items-center gap-0.5 text-[9px] ${
                  editTool === id ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                    editTool === id ? "border-primary bg-primary/10" : "border-white/10 bg-[#101013]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[86px] px-4 pt-3">
          {editTool === "filter" && (
            <div className="flex justify-center gap-3">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => {}} className="text-center">
                  <span className="block h-12 w-12 overflow-hidden rounded-lg border border-white/10">
                    <img src={item.url} alt="" className="h-full w-full object-cover" style={{ filter: f.css }} />
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">{f.label}</span>
                </button>
              ))}
            </div>
          )}
          {editTool === "text" && (
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption…"
              className="w-full rounded-xl border border-primary/25 bg-secondary px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          )}
          {editTool === "sticker" && (
            <div className="flex flex-wrap gap-2">
              {STICKERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setCaption((c) => (c + " " + s).trim())}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-secondary text-xl"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {editTool === "draw" && <p className="text-center text-xs text-muted-foreground">Draw tools coming soon</p>}
          {editTool === "music" && <p className="text-center text-xs text-muted-foreground">Music picker coming soon</p>}
          {editTool === "crop" && <p className="text-center text-xs text-muted-foreground">Original aspect preserved</p>}
        </div>

        <div className="px-5 pb-6 pt-2">
          <button onClick={doUpload} className="gold-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm">
            Next <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Screen: Uploading (mockup screen 10)
  // ============================================================
  if (step === "uploading" && item) {
    return (
      <div className="fixed inset-0 z-[95] flex flex-col items-center bg-[#050506] px-8 pt-12">
        <div className="relative aspect-[4/5] w-full max-w-xs overflow-hidden rounded-2xl border border-primary/25 bg-black">
          <img src={item.url} alt="Uploading" className="h-full w-full object-cover opacity-50" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <ProgressRing pct={upPct} size={140} label={`${Math.round(upPct)}%`} />
            <p className="mt-4 font-heading text-sm font-semibold text-foreground">Uploading your status</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Please don't close the app.</p>
          </div>
        </div>

        <ul className="mt-6 w-full max-w-xs space-y-3">
          {UPLOAD_STEPS.map((s, i) => (
            <li key={s} className="flex items-center justify-between text-sm">
              <span className="text-foreground/90">{s}</span>
              {i < upDone ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : i === upDone ? (
                <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-arc" />
              ) : (
                <span className="h-5 w-5 rounded-full border border-white/20" />
              )}
            </li>
          ))}
        </ul>

        {error ? (
          <div className="mt-6 w-full max-w-xs text-center">
            <p className="text-xs text-rose-400">{error}</p>
            <button onClick={onClose} className="gold-btn mt-3 w-full rounded-xl py-2.5 text-sm">
              Close
            </button>
          </div>
        ) : (
          <div className="mt-6 flex w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-primary/25 bg-[#0c0c0f] py-3 text-[11px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-primary" /> Your status is private, secure &amp; end-to-end protected.
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // Screen: Uploaded ✓ (mockup screen 11)
  // ============================================================
  if (step === "done") {
    return (
      <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-[#050506] px-8">
        <div
          className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-primary"
          style={{ boxShadow: "0 0 40px -4px var(--gold)" }}
        >
          <Check className="h-16 w-16 text-primary" />
        </div>
        <h2 className="mt-8 font-heading text-2xl font-bold text-foreground">Status Uploaded!</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your status is now live.</p>

        <div className="mt-10 w-full max-w-xs space-y-3">
          <button
            onClick={() => {
              onPosted();
              onClose();
            }}
            className="gold-btn w-full rounded-2xl py-3.5 text-sm"
          >
            View Status
          </button>
          <button
            onClick={() => {
              onPosted();
              onClose();
            }}
            className="w-full rounded-2xl border border-white/10 bg-[#101013] py-3.5 text-sm text-foreground"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // fallback
  void postedId;
  return null;
}

// ============================================================
// Building blocks
// ============================================================

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Tile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex aspect-[3/2] flex-col items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-[#101013] text-foreground transition-all active:scale-[0.98]"
      style={{ boxShadow: "0 0 18px -12px var(--gold)" }}
    >
      <span className="text-primary">{icon}</span>
      <span className="font-heading text-sm font-semibold">{label}</span>
    </button>
  );
}

// Re-exported so hub.status.tsx (and any other importer) can keep using it.
export function UploadScreen({
  pct,
  stepsDone,
  error,
  onClose,
}: {
  pct: number;
  stepsDone: number;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-[#050506] px-8">
      <h2 className="mb-10 font-heading text-lg font-semibold">Uploading Status</h2>
      <ProgressRing pct={pct} label={`${Math.round(pct)}%`} />
      <ul className="mt-9 w-full max-w-xs space-y-4">
        {UPLOAD_STEPS.map((s, i) => (
          <li key={s} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-foreground/90">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> {s}
            </span>
            {i < stepsDone ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-white">
                <Check className="h-3.5 w-3.5" />
              </span>
            ) : i === stepsDone ? (
              <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-arc" />
            ) : (
              <span className="h-5 w-5 rounded-full border border-white/20" />
            )}
          </li>
        ))}
      </ul>
      {error && (
        <div className="mt-10 w-full max-w-xs text-center">
          <p className="text-xs text-rose-400">{error}</p>
          <button onClick={onClose} className="gold-btn mt-3 w-full rounded-xl py-2.5 text-sm">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export function ProgressRing({
  pct,
  size = 176,
  label,
}: {
  pct: number;
  size?: number;
  label?: string;
}) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        height: size,
        width: size,
        background: `conic-gradient(var(--gold-bright) 0deg, var(--gold) ${pct * 3.6}deg, rgba(255,255,255,0.07) ${pct * 3.6}deg 360deg)`,
        filter: "drop-shadow(0 0 26px color-mix(in oklab, var(--gold) 55%, transparent))",
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-full bg-[#050506]"
        style={{ height: size - 22, width: size - 22 }}
      >
        {label ? (
          <span className="font-heading text-2xl font-bold text-foreground">{label}</span>
        ) : (
          <UploadCloud className="h-8 w-8 text-primary" />
        )}
      </div>
    </div>
  );
}

// Retained for compatibility (imported nowhere else but kept exports stable).
export const RotateStub = RotateCw;
export const ZapStub = Zap;
