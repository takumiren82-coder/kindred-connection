import { useRef, useState } from "react";
import { X, Trash2, Image as ImageIcon, Camera } from "lucide-react";

interface Props {
  currentUrl?: string | null;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
  onDelete?: () => Promise<void>;
}

// Simple profile-picture picker: gallery -> center-square crop -> preview.
// Not a full free-form cropper; the auto center crop matches how most
// messaging apps present a round DP so the result always fits the circle.
export function AvatarPicker({ currentUrl, onClose, onSave, onDelete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    setZoom(1);
    setSrc(URL.createObjectURL(f));
  };

  // Render the visible (zoomed, centre-square) crop to a 512px JPEG.
  const renderCrop = () =>
    new Promise<Blob>((resolve, reject) => {
      if (!src) return reject(new Error("Pick a photo first"));
      const img = new Image();
      img.onload = () => {
        const base = Math.min(img.naturalWidth, img.naturalHeight);
        const size = base / zoom;
        const sx = (img.naturalWidth - size) / 2;
        const sy = (img.naturalHeight - size) / 2;
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 512;
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("Crop failed"));
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 512, 512);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Crop failed"))), "image/jpeg", 0.9);
      };
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = src;
    });

  const confirm = async () => {
    if (!src) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await renderCrop();
      const file = new File([blob], `dp-${Date.now()}.jpg`, { type: "image/jpeg" });
      await onSave(file);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!onDelete) return;
    setBusy(true);
    setErr(null);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-primary/40 bg-[#0c0c0f] p-5 text-center shadow-[0_0_50px_-16px_rgba(255,46,63,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-heading text-[13px] font-semibold tracking-[0.2em] text-primary">
            CHANGE PHOTO
          </span>
          <button onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Crop stage with rule-of-thirds grid, like the reference design */}
        <div className="relative mx-auto mb-4 aspect-square w-full overflow-hidden rounded-2xl border border-primary/50 bg-black">
          {src || currentUrl ? (
            <img
              src={src ?? currentUrl!}
              alt="Crop preview"
              style={{ transform: `scale(${zoom})` }}
              className="h-full w-full object-cover transition-transform"
            />
          ) : (
            <span className="flex h-full items-center justify-center px-6 text-[12px] text-muted-foreground">
              Choose a photo to crop
            </span>
          )}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="border border-white/15" />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-primary/70" />
        </div>

        {src && (
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="mb-4 w-full accent-[hsl(var(--primary))]"
          />
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        <input ref={camRef} type="file" accept="image/*" capture="user" hidden onChange={handleFile} />

        <div className="mb-4 grid grid-cols-3 gap-2">
          <PickTile icon={<Camera className="h-5 w-5" />} label="Camera" onClick={() => camRef.current?.click()} />
          <PickTile icon={<ImageIcon className="h-5 w-5" />} label="Gallery" onClick={() => fileRef.current?.click()} />
          <PickTile
            icon={<Trash2 className="h-5 w-5" />}
            label="Remove"
            disabled={!currentUrl || !onDelete}
            onClick={del}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm text-foreground disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={busy || !src}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-[0_10px_26px_-12px_rgba(255,46,63,0.9)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        {err && <p className="mt-3 text-[11px] text-rose-400">{err}</p>}
      </div>
    </div>
  );
}

function PickTile({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-primary/35 bg-[#141417] py-3 text-[11px] text-foreground transition-colors hover:border-primary/70 disabled:opacity-40"
    >
      <span className="text-primary">{icon}</span>
      {label}
    </button>
  );
}