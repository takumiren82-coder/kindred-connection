import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccess } from "@/lib/access-context";

export function PanicButton() {
  const navigate = useNavigate();
  const { revokeAccess } = useAccess();
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragging = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0, px: 0, py: 0 });

  useEffect(() => {
    setPos({ x: window.innerWidth - 90, y: window.innerHeight - 170 });
  }, []);

  useEffect(() => {
    const move = (clientX: number, clientY: number) => {
      if (!dragging.current) return;
      const dx = clientX - start.current.x;
      const dy = clientY - start.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
      const nx = Math.min(window.innerWidth - 78, Math.max(8, start.current.px + dx));
      const ny = Math.min(window.innerHeight - 78, Math.max(8, start.current.py + dy));
      setPos({ x: nx, y: ny });
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY);
    const onUp = () => {
      if (dragging.current && !moved.current) {
        revokeAccess();
        navigate({ to: "/" });
      }
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [navigate, revokeAccess]);

  const onDown = (clientX: number, clientY: number) => {
    dragging.current = true;
    moved.current = false;
    start.current = { x: clientX, y: clientY, px: pos.x, py: pos.y };
  };

  return (
    <button
      aria-label="Panic alert"
      onMouseDown={(e) => onDown(e.clientX, e.clientY)}
      onTouchStart={(e) => onDown(e.touches[0].clientX, e.touches[0].clientY)}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 flex h-14 w-14 touch-none select-none flex-col items-center justify-center rounded-full text-center shadow-[0_8px_24px_-6px_rgba(255,46,63,0.7)]"
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: "linear-gradient(135deg, #ff2e3f 0%, #d31220 100%)" }}
      />
      <span className="relative z-10 font-heading text-[8.5px] font-extrabold leading-tight tracking-wide text-white">
        PANIC
        <br />
        ALERT
      </span>
    </button>
  );
}