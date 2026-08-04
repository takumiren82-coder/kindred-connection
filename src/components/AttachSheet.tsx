import { useRef, useState } from "react";
import { X, Image as ImageIcon, Video as VideoIcon, Camera as CameraIcon, Eye } from "lucide-react";

export type ViewChoice = 1 | 3 | 5 | 0; // 0 = unlimited

interface Props {
  onClose: () => void;
  onPickFile: (file: File, viewChoice: ViewChoice) => void;
  onOpenCamera: (viewChoice: ViewChoice) => void;
}

const CHOICES: { label: string; value: ViewChoice }[] = [
  { label: "1 View", value: 1 },
  { label: "3 Views", value: 3 },
  { label: "5 Views", value: 5 },
  { label: "Unlimited", value: 0 },
];

export function AttachSheet({ onClose, onPickFile, onOpenCamera }: Props) {
  const [choice, setChoice] = useState<ViewChoice>(1);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPickFile(f, choice);
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl border-t border-gold/30 bg-background/95 px-4 pb-6 pt-3 backdrop-blur-xl animate-slide-down"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/40" />
        <div className="mb-3 flex items-center justify-between">
          <span className="font-heading text-sm font-semibold tracking-widest text-gold">SEND MEDIA</span>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground">
            <Eye className="h-3 w-3" /> VIEW LIMIT
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {CHOICES.map((c) => (
              <button
                key={c.value}
                onClick={() => setChoice(c.value)}
                className={`rounded-lg border px-2 py-2 text-[11px] font-semibold tracking-wide transition-all ${
                  choice === c.value
                    ? "border-gold bg-gold/15 text-gold shadow-[0_0_16px_-4px_rgba(214,58,249,0.6)]"
                    : "border-border/60 text-muted-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            {choice === 0
              ? "Media stays viewable and shows a normal thumbnail."
              : "Media appears as a Crystal Wave — end-to-end secret and disappears after the allowed views."}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SheetTile icon={<CameraIcon className="h-6 w-6" />} label="Camera" onClick={() => onOpenCamera(choice)} />
          <SheetTile icon={<ImageIcon className="h-6 w-6" />} label="Photo" onClick={() => imageInputRef.current?.click()} />
          <SheetTile icon={<VideoIcon className="h-6 w-6" />} label="Video" onClick={() => videoInputRef.current?.click()} />
        </div>

        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleFile} />
        <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleFile} />
      </div>
    </div>
  );
}

function SheetTile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 py-3 text-gold transition-all hover:border-gold/60 hover:bg-secondary/40 active:scale-95"
    >
      {icon}
      <span className="text-[11px] font-semibold tracking-wide text-foreground">{label}</span>
    </button>
  );
}