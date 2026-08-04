import { useEffect } from "react";
import lockKey from "@/assets/lock-key.png";

export function PrivateHubTransition({ onComplete }: { onComplete?: () => void }) {
  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 900);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <div className="animate-fade-in fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6 text-center">
      <img
        src={lockKey}
        alt="Private Hub emblem"
        width={1024}
        height={1024}
        className="animate-unlock mb-6 h-48 w-48 object-contain drop-shadow-[0_0_36px_rgba(214,58,249,0.5)]"
      />
      <h2 className="font-heading text-4xl font-extrabold tracking-[0.18em] text-gold">PRIVATE HUB</h2>
      <p className="mt-4 text-sm tracking-wide text-muted-foreground">
        Your Space. Your People. Your <span className="text-gold">Privacy.</span>
      </p>
      <p className="mt-10 text-xs tracking-wide text-muted-foreground">Preparing your private space...</p>
      <div className="mt-3 h-1.5 w-56 max-w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="animate-loading-bar h-full rounded-full"
          style={{ backgroundImage: "var(--gradient-primary)" }}
        />
      </div>
    </div>
  );
}