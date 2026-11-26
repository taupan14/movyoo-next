"use client";

// app/achievements/page.tsx

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Trophy,
  Lock,
  ChevronLeft,
  CheckCircle2,
  Zap,
  Ticket,
  Star,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import type { AchievementWithProgress } from "@/types/progression";
import type { AchievementCategory } from "@/types/progression";

// ─── Category config ───────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<
  AchievementCategory | "all",
  { label: string; emoji: string }
> = {
  all: { label: "Semua", emoji: "🎬" },
  genre: { label: "Genre", emoji: "🎭" },
  director: { label: "Sutradara", emoji: "🎥" },
  activity: { label: "Aktivitas", emoji: "⚡" },
  collection: { label: "Koleksi", emoji: "📦" },
  social: { label: "Sosial", emoji: "👥" },
  secret: { label: "Rahasia", emoji: "🔮" },
};

// ─── Thin progress ring SVG ────────────────────────────────────────────────────
function ProgressRing({
  percent,
  size = 64,
  stroke = 3,
  unlocked,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  unlocked: boolean;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90">
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={stroke}
      />
      {/* Fill */}
      {percent > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={unlocked ? "hsl(var(--primary))" : "rgba(255,255,255,0.25)"}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      )}
    </svg>
  );
}

// ─── Single achievement card ───────────────────────────────────────────────────
function AchievementCard({
  ach,
  index,
}: {
  ach: AchievementWithProgress;
  index: number;
}) {
  const isUnlocked = ach.is_unlocked;
  const isSecret = ach.is_secret && !isUnlocked;
  const percent = Math.min(
    100,
    Math.round((ach.progress / (ach.target || 1)) * 100),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className={cn(
        "relative rounded-2xl border p-4 flex items-start gap-4 transition-colors",
        isUnlocked
          ? "bg-white/[0.04] border-primary/20 hover:border-primary/35"
          : "bg-white/[0.02] border-white/8 hover:border-white/14",
      )}
    >
      {/* Unlocked glow */}
      {isUnlocked && (
        <div className="absolute inset-0 rounded-2xl bg-primary/5 pointer-events-none" />
      )}

      {/* Icon area */}
      <div className="relative shrink-0 w-16 h-16">
        <ProgressRing
          percent={percent}
          size={64}
          stroke={3}
          unlocked={isUnlocked}
        />
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full text-2xl leading-none",
            !isUnlocked && "grayscale opacity-40",
          )}
        >
          {isSecret ? "🔮" : (ach.icon ?? "🏆")}
        </div>
        {isUnlocked && (
          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3
              className={cn(
                "font-semibold text-sm leading-snug",
                isUnlocked ? "text-foreground" : "text-foreground/70",
              )}
            >
              {ach.display_name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {ach.display_description}
            </p>
          </div>

          {/* Reward pills */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            {ach.xp_reward > 0 && (
              <span
                className={cn(
                  "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                  isUnlocked
                    ? "bg-primary/20 text-primary"
                    : "bg-white/5 text-muted-foreground",
                )}
              >
                <Zap className="w-2.5 h-2.5" />
                {ach.xp_reward} XP
              </span>
            )}
            {ach.pts_reward > 0 && (
              <span
                className={cn(
                  "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                  isUnlocked
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-white/5 text-muted-foreground",
                )}
              >
                <Star className="w-2.5 h-2.5" />
                {ach.pts_reward} pts
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                isUnlocked ? "gradient-primary" : "bg-white/25",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {ach.progress.toLocaleString()} / {ach.target.toLocaleString()}
            </span>
            <span
              className={cn(
                "text-[10px] font-medium tabular-nums",
                isUnlocked ? "text-primary" : "text-muted-foreground",
              )}
            >
              {isUnlocked ? "Selesai ✓" : `${percent}%`}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────
function SummaryBar({ total, unlocked }: { total: number; unlocked: number }) {
  const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;
  const SEGMENTS = 24;
  const filled = Math.round((percent / 100) * SEGMENTS);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Progress Keseluruhan</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {unlocked} / {total} achievement
        </span>
      </div>

      {/* Filmstrip-style bar — konsisten dengan profile page */}
      <div className="relative h-6 rounded-sm overflow-hidden bg-white/5 border border-white/8">
        <div
          className="absolute inset-y-0 left-0 gradient-primary transition-all duration-700 ease-out rounded-sm"
          style={{ width: `${percent}%` }}
        />
        <div className="absolute inset-0 flex">
          {Array.from({ length: SEGMENTS - 1 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-black/10" />
          ))}
          <div className="flex-1" />
        </div>
        <div className="absolute inset-y-0 left-3 flex items-center">
          <span className="text-[11px] font-medium text-white/90 tabular-nums">
            {unlocked} unlocked
          </span>
        </div>
        <div className="absolute inset-y-0 right-3 flex items-center">
          <span className="text-[11px] font-medium text-white/50 tabular-nums">
            {percent}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function AchievementSkeleton() {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 flex items-start gap-4 animate-pulse">
      <div className="w-16 h-16 rounded-full bg-white/8 shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3.5 w-2/5 rounded bg-white/8" />
        <div className="h-2.5 w-3/4 rounded bg-white/5" />
        <div className="h-1.5 w-full rounded-full bg-white/8 mt-4" />
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AchievementsPage() {
  const router = useRouter();
  const { user, loading, openAuthModal } = useAuth();

  const [achievements, setAchievements] = useState<AchievementWithProgress[]>(
    [],
  );
  const [fetching, setFetching] = useState(true);
  const [activeCategory, setActiveCategory] = useState<
    AchievementCategory | "all"
  >("all");
  const [showUnlockedOnly, setShowUnlockedOnly] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      openAuthModal("signin");
      router.replace("/");
    }
  }, [loading, user, router, openAuthModal]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    fetch("/api/achievements")
      .then((r) => r.json())
      .then((d) => setAchievements(d.achievements ?? []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user]);

  // Stats
  const totalCount = achievements.length;
  const unlockedCount = useMemo(
    () => achievements.filter((a) => a.is_unlocked).length,
    [achievements],
  );

  // Available categories (hanya tampilkan yang ada datanya)
  const availableCategories = useMemo(() => {
    const cats = new Set(achievements.map((a) => a.category));
    return ["all", ...Array.from(cats)] as (AchievementCategory | "all")[];
  }, [achievements]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = achievements;
    if (activeCategory !== "all") {
      list = list.filter((a) => a.category === activeCategory);
    }
    if (showUnlockedOnly) {
      list = list.filter((a) => a.is_unlocked);
    }
    // Sort: unlocked dulu, lalu by progress percent desc
    return [...list].sort((a, b) => {
      if (a.is_unlocked !== b.is_unlocked) return a.is_unlocked ? -1 : 1;
      const pA = a.progress / (a.target || 1);
      const pB = b.progress / (b.target || 1);
      return pB - pA;
    });
  }, [achievements, activeCategory, showUnlockedOnly]);

  if (loading || (!user && !loading)) return null;

  return (
    <div className="min-h-screen pb-24 lg:pb-8">
      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-5">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Link
            href="/profile"
            className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">Achievement</h1>
            <p className="text-xs text-muted-foreground">
              {fetching
                ? "Memuat..."
                : `${unlockedCount} dari ${totalCount} terbuka`}
            </p>
          </div>
        </div>

        {/* ── Summary bar ────────────────────────────────────────────────── */}
        {!fetching && totalCount > 0 && (
          <SummaryBar total={totalCount} unlocked={unlockedCount} />
        )}

        {/* ── Category filter ─────────────────────────────────────────────── */}
        {!fetching && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {availableCategories.map((cat) => {
              const cfg = CATEGORY_CONFIG[cat];
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap border transition-all shrink-0",
                    isActive
                      ? "gradient-primary text-white border-transparent"
                      : "bg-white/[0.03] border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
                  )}
                >
                  <span>{cfg.emoji}</span>
                  {cfg.label}
                </button>
              );
            })}

            {/* Divider */}
            <div className="w-px bg-white/10 shrink-0 self-stretch mx-1" />

            {/* Unlocked filter */}
            <button
              onClick={() => setShowUnlockedOnly((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap border transition-all shrink-0",
                showUnlockedOnly
                  ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                  : "bg-white/[0.03] border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              <CheckCircle2 className="w-3 h-3" />
              Terbuka saja
            </button>
          </div>
        )}

        {/* ── List ───────────────────────────────────────────────────────── */}
        {fetching ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <AchievementSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-3xl">
              {showUnlockedOnly ? "🏆" : "🔮"}
            </div>
            <p className="text-sm text-muted-foreground">
              {showUnlockedOnly
                ? "Belum ada achievement yang terbuka di kategori ini."
                : "Tidak ada achievement ditemukan."}
            </p>
            {showUnlockedOnly && (
              <button
                onClick={() => setShowUnlockedOnly(false)}
                className="mt-4 text-xs text-primary hover:underline"
              >
                Tampilkan semua
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {filtered.map((ach, i) => (
                <AchievementCard key={ach.key} ach={ach} index={i} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
