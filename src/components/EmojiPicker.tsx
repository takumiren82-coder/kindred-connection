// Lightweight, dependency-free emoji picker. Curated common set — enough to
// cover typical chat needs without shipping a 300kb emoji library.

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","🥰","😘","😗","😙","😚","🙂","🤗","🤩","🤔","🫡",
  "😎","🥳","😇","🥲","😅","😆","😉","😌","😋","😛","😜","🤪","😝","🤑","🤭","🤫",
  "😴","🥱","😪","😔","😢","😭","😤","😠","😡","🤬","🥺","😳","😱","😨","😰","😥",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💖","💗","💓","💞","💕","💘","💝",
  "🔥","✨","🌟","⭐","💫","💥","💯","👑","💎","🎉","🎊","🎁","🎂","🌹","🌸","🌺",
  "👍","👎","👏","🙌","🙏","💪","🤝","🤞","✌️","🤟","🤘","👌","🫶","🫰","👋","🤙",
  "😺","🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
  "☕","🍕","🍔","🍟","🍩","🍪","🍫","🍰","🍦","🍎","🍓","🍇","🍑","🍉","🥑","🥂",
];

export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  return (
    <div className="border-t border-border/60 bg-background/95 px-2 py-2 backdrop-blur-xl">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold tracking-widest text-gold">EMOJI</span>
        <button onClick={onClose} className="text-[10px] text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto">
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="flex h-8 items-center justify-center rounded-md text-lg transition-transform hover:scale-125 hover:bg-secondary/60"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}