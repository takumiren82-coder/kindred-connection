import { Reply, Copy, Trash2, Users, Pencil } from "lucide-react";

interface Props {
  mine: boolean;
  canCopy: boolean;
  canEdit?: boolean;
  onReply: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onClose: () => void;
}

export function MessageActionSheet({ mine, canCopy, canEdit, onReply, onCopy, onEdit, onDeleteForMe, onDeleteForEveryone, onClose }: Props) {
  const Item = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm transition-colors ${danger ? "text-red-400 hover:bg-red-500/10" : "text-foreground hover:bg-secondary/60"}`}
    >
      <span className={danger ? "text-red-400" : "text-gold"}>{icon}</span>
      <span className="font-medium tracking-wide">{label}</span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ornate-card w-full max-w-sm rounded-t-2xl px-2 pb-5 pt-3 animate-slide-up"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20" />
        <Item icon={<Reply className="h-4 w-4" />} label="Reply" onClick={onReply} />
        {canCopy && <Item icon={<Copy className="h-4 w-4" />} label="Copy" onClick={onCopy} />}
        {mine && canEdit && onEdit && (
          <Item icon={<Pencil className="h-4 w-4" />} label="Edit" onClick={onEdit} />
        )}
        <Item icon={<Trash2 className="h-4 w-4" />} label="Delete for me" onClick={onDeleteForMe} danger />
        {mine && (
          <Item icon={<Users className="h-4 w-4" />} label="Delete for everyone" onClick={onDeleteForEveryone} danger />
        )}
      </div>
    </div>
  );
}