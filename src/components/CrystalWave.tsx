import { useMemo } from "react";

// Premium palette per hue seed. All colors are pre-picked so they never look muddy.
const PALETTES: Array<{ a: string; b: string; c: string; name: string }> = [
  { a: "#ff2fb0", b: "#ff6bd6", c: "#ffb0e6", name: "pink" },
  { a: "#3ab5ff", b: "#7ad9ff", c: "#b8f0ff", name: "blue" },
  { a: "#f7c948", b: "#ffe082", c: "#fff2b2", name: "gold" },
  { a: "#8b5cf6", b: "#d63af9", c: "#ff6bd6", name: "rainbow" },
  { a: "#00ffa3", b: "#5cffd6", c: "#b8ffe8", name: "neon" },
];

export function pickPalette(hue = Math.floor(Math.random() * PALETTES.length)) {
  return PALETTES[Math.abs(hue) % PALETTES.length];
}

interface Props {
  hue?: number;
  playIcon?: boolean; // video
  size?: "sm" | "md";
  className?: string;
}

/** Animated glowing wave line used in place of a thumbnail for view-limited media. */
export function CrystalWave({ hue = 0, playIcon = false, size = "md", className = "" }: Props) {
  const p = useMemo(() => pickPalette(hue), [hue]);
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const h = size === "sm" ? 28 : 42;
  const w = size === "sm" ? 140 : 200;

  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      {playIcon && (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ background: `linear-gradient(135deg, ${p.a}, ${p.b})`, boxShadow: `0 0 12px ${p.a}80` }}
          aria-hidden
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="#fff"><path d="M2 1l7 4-7 4z" /></svg>
        </span>
      )}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="crystal-wave-svg" aria-label="Locked media">
        <defs>
          <linearGradient id={`g-${uid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={p.a} />
            <stop offset="50%" stopColor={p.b} />
            <stop offset="100%" stopColor={p.c} />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={`M4 ${h / 2} Q ${w * 0.2} 2, ${w * 0.4} ${h / 2} T ${w * 0.8} ${h / 2} T ${w - 4} ${h / 2}`}
          fill="none"
          stroke={`url(#g-${uid})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          filter={`url(#glow-${uid})`}
          className="crystal-wave-path"
        />
        {/* sparkle diamonds */}
        {[0.15, 0.5, 0.85].map((t, i) => (
          <g key={i} className="crystal-sparkle" style={{ animationDelay: `${i * 0.35}s` }}>
            <circle cx={w * t} cy={h / 2} r="2.4" fill={p.b} opacity="0.9" />
            <circle cx={w * t} cy={h / 2} r="4.8" fill={p.a} opacity="0.25" />
          </g>
        ))}
      </svg>
    </div>
  );
}

export const PALETTE_COUNT = PALETTES.length;