"use client";

/**
 * components/articles/spice-meter.tsx — FIXED
 * Empty state "Jadilah yang pertama rating!" hanya tampil kalau
 * reviewCount === 0 DAN avgSpice === null.
 * Setelah ada rating → tampil data rating normal.
 */

import { cn } from "@/lib/utils";

export const SPICE_CONFIG = [
  {
    value: 1,
    label: "Santai",
    emoji: "🧊",
    bg: "bg-sky-500/20",
    bar: "bg-sky-500/60",
    ring: "ring-sky-500/50",
    text: "text-sky-400",
  },
  {
    value: 2,
    label: "Lumayan",
    emoji: "😌",
    bg: "bg-green-500/20",
    bar: "bg-green-500/60",
    ring: "ring-green-500/50",
    text: "text-green-400",
  },
  {
    value: 3,
    label: "Seru",
    emoji: "🔥",
    bg: "bg-amber-500/20",
    bar: "bg-amber-500/60",
    ring: "ring-amber-500/50",
    text: "text-amber-400",
  },
  {
    value: 4,
    label: "Intense",
    emoji: "🌶️",
    bg: "bg-orange-500/20",
    bar: "bg-orange-500/60",
    ring: "ring-orange-500/50",
    text: "text-orange-400",
  },
  {
    value: 5,
    label: "Gila Banget",
    emoji: "💥",
    bg: "bg-red-500/20",
    bar: "bg-red-500/60",
    ring: "ring-red-500/50",
    text: "text-red-400",
  },
] as const;

// ─── Display (read-only) ──────────────────────────────────────────────────────

interface DisplayProps {
  avgSpice: number | null;
  reviewCount: number;
  size?: "sm" | "md";
}

export function SpiceMeterDisplay({
  avgSpice,
  reviewCount,
  size = "md",
}: DisplayProps) {
  // Belum ada rating sama sekali
  const noRating = avgSpice == null || reviewCount === 0;

  // ── size="sm" — inline di meta row & card listing ────────────────────────
  if (size === "sm") {
    if (noRating) {
      return (
        <span
          className="flex items-center gap-0.5 text-muted-foreground/40"
          title="Belum ada rating"
        >
          <span className="text-sm leading-none">🤔❓</span>
          {/* <span className="text-[10px]">—</span> */}
        </span>
      );
    }

    const cfg = SPICE_CONFIG[Math.round(avgSpice) - 1];
    return (
      <span
        className={cn("flex items-center gap-1 text-xs font-medium", cfg.text)}
      >
        <span>{cfg.emoji}</span>
        <span>{avgSpice.toFixed(1)}</span>
        <span className="text-muted-foreground font-normal">
          ({reviewCount})
        </span>
      </span>
    );
  }

  // ── size="md" — full display di sidebar ──────────────────────────────────
  if (noRating) {
    // Empty state — hanya tampil kalau belum ada rating
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <div className="relative flex items-center justify-center">
          <span className="text-4xl animate-pulse">🤔</span>
          <span className="absolute -bottom-1 -right-1 text-lg">❓</span>
        </div>
        <p className="text-xs font-medium text-muted-foreground text-center">
          Jadilah yang pertama rating!
        </p>
        <div className="flex gap-1">
          {SPICE_CONFIG.map((c) => (
            <span key={c.value} className="text-base opacity-20">
              {c.emoji}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Ada rating — tampilkan data
  const rounded = Math.round(avgSpice);
  const cfg = SPICE_CONFIG[rounded - 1];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{cfg.emoji}</span>
        <div>
          <p className={cn("text-lg font-bold leading-none", cfg.text)}>
            {avgSpice.toFixed(1)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              / 5
            </span>
          </p>
          <p className={cn("text-sm font-medium mt-0.5", cfg.text)}>
            {cfg.label}
          </p>
        </div>
      </div>

      {/* Progress bars */}
      <div className="flex items-center gap-1.5">
        {SPICE_CONFIG.map((c) => (
          <div
            key={c.value}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-500",
              c.value <= rounded ? cfg.bar : "bg-white/10",
            )}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {reviewCount.toLocaleString("id-ID")} ulasan komunitas
      </p>
    </div>
  );
}

// ─── Input (interactive) ──────────────────────────────────────────────────────

interface InputProps {
  value: number;
  onChange: (v: number) => void;
}

export function SpiceMeterInput({ value, onChange }: InputProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Vibes artikel ini menurut kamu?
      </p>
      <div className="flex gap-2">
        {SPICE_CONFIG.map((cfg) => {
          const active = value === cfg.value;
          return (
            <button
              key={cfg.value}
              type="button"
              onClick={() => onChange(cfg.value)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all duration-200",
                active
                  ? `${cfg.bg} ${cfg.ring} ring-1 border-transparent`
                  : "border-border bg-card hover:border-white/20",
              )}
            >
              <span className="text-xl leading-none">{cfg.emoji}</span>
              <span
                className={cn(
                  "text-[10px] font-medium leading-none",
                  active ? cfg.text : "text-muted-foreground",
                )}
              >
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
