"use client";

// components/reward-client.tsx

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Gift,
  X,
  ChevronLeft,
  ChevronRight,
  Share2,
  ShoppingBag,
  Flame,
  Sparkles,
  Star,
  Package,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Info,
  Filter,
} from "lucide-react";
import type { Reward, RewardDetail, RewardCategory } from "@/types/reward";
import {
  HYPE_LEVELS,
  CATEGORY_CONFIG,
  getHypeLevel,
  formatHypeScore,
} from "@/types/reward";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPoints(n: number) {
  return n.toLocaleString("id-ID") + " pts";
}

function discountPercent(original: number, discounted: number) {
  return Math.round(((original - discounted) / original) * 100);
}

// ─── Hype Rating Badge ────────────────────────────────────────────────────────

function HypeBadge({
  score,
  reviewCount,
  size = "sm",
}: {
  score: number | null;
  reviewCount: number;
  size?: "sm" | "md" | "lg";
}) {
  const hype = getHypeLevel(score);
  const sizeClass = {
    sm: "text-xs gap-1",
    md: "text-sm gap-1.5",
    lg: "text-base gap-2",
  }[size];

  if (reviewCount === 0) {
    return (
      <span
        className={cn("flex items-center text-muted-foreground", sizeClass)}
      >
        <span className="text-base">🌱</span>
        <span>Belum ada review</span>
      </span>
    );
  }

  return (
    <span className={cn("flex items-center font-medium", sizeClass)}>
      <span className={size === "lg" ? "text-2xl" : "text-base"}>
        {hype.emoji}
      </span>
      <span style={{ color: hype.color }}>{hype.label}</span>
      <span className="text-muted-foreground font-normal">
        {formatHypeScore(score)} ({reviewCount})
      </span>
    </span>
  );
}

// ─── Hype Rating Bar (full breakdown) ────────────────────────────────────────

function HypeRatingBreakdown({
  score,
  reviewCount,
}: {
  score: number | null;
  reviewCount: number;
}) {
  const hype = getHypeLevel(score);

  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
      {/* Big emoji */}
      <span className="text-5xl">{hype.emoji}</span>
      <div className="text-center">
        <p className="text-xl font-bold" style={{ color: hype.color }}>
          {hype.label}
        </p>
        <p className="text-3xl font-black text-foreground mt-0.5">
          {formatHypeScore(score)}
          <span className="text-base text-muted-foreground font-normal">
            /5
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          dari {reviewCount} reviewer
        </p>
      </div>

      {/* Mini scale */}
      <div className="flex gap-2 mt-1">
        {HYPE_LEVELS.map((l) => (
          <div
            key={l.level}
            className={cn(
              "flex flex-col items-center gap-0.5 transition-all",
              hype.level === l.level ? "scale-125" : "opacity-40",
            )}
          >
            <span className="text-base">{l.emoji}</span>
            <span className="text-[9px] text-muted-foreground">{l.level}</span>
          </div>
        ))}
      </div>

      {/* Rating formula note */}
      <p className="text-[10px] text-muted-foreground text-center leading-relaxed mt-1 max-w-[200px]">
        Hype Score = rata-rata rating × bobot popularitas (log scale)
      </p>
    </div>
  );
}

// ─── Category Filter Tabs ─────────────────────────────────────────────────────

const CATEGORIES: {
  value: "all" | RewardCategory;
  label: string;
  emoji: string;
}[] = [
  { value: "all", label: "Semua", emoji: "🎁" },
  { value: "merchandise", label: "Merchandise", emoji: "👕" },
  { value: "digital", label: "Digital", emoji: "✨" },
  { value: "voucher", label: "Voucher", emoji: "🎟️" },
  { value: "experience", label: "Experience", emoji: "🎬" },
  { value: "collectible", label: "Collectible", emoji: "🏆" },
];

function CategoryTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 border",
            active === cat.value
              ? "bg-primary/20 text-white border-primary/40"
              : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-foreground",
          )}
        >
          <span>{cat.emoji}</span>
          <span>{cat.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Stock Badge ──────────────────────────────────────────────────────────────

function StockBadge({ stock, status }: { stock: number; status: string }) {
  if (status === "coming_soon")
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
        Segera
      </span>
    );
  if (status === "out_of_stock" || stock === 0)
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
        Habis
      </span>
    );
  if (stock <= 10)
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
        Sisa {stock}
      </span>
    );
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      Stok {stock}
    </span>
  );
}

// ─── Image Slider ─────────────────────────────────────────────────────────────

function ImageSlider({
  images,
  name,
}: {
  images: { url: string; alt: string | null }[];
  name: string;
}) {
  const [current, setCurrent] = useState(0);
  const total = images.length;

  if (!total) {
    return (
      <div className="aspect-square bg-white/5 rounded-2xl flex items-center justify-center">
        <Package className="w-12 h-12 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Main image area */}
      <div
        className="relative aspect-square rounded-2xl bg-black/20"
        style={{ overflow: "hidden" }}
      >
        {/* Track — semua foto berjajar horizontal, digeser via translateX */}
        <div
          className="flex h-full transition-transform duration-300 ease-in-out"
          style={{
            width: `${total * 100}%`,
            transform: `translateX(-${(current * 100) / total}%)`,
          }}
        >
          {images.map((img, i) => (
            <div
              key={i}
              className="h-full flex-shrink-0"
              style={{ width: `${100 / total}%` }}
            >
              <img
                src={img.url}
                alt={img.alt ?? name}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* Arrows — selalu visible di mobile, hover di desktop */}
        {total > 1 && (
          <>
            <button
              onClick={() => setCurrent((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              className={cn(
                "absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full",
                "bg-black/60 backdrop-blur-sm flex items-center justify-center",
                "transition-all duration-200 border border-white/10",
                current === 0
                  ? "opacity-30 cursor-not-allowed"
                  : "opacity-100 hover:bg-black/80 active:scale-95",
              )}
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={() => setCurrent((p) => Math.min(total - 1, p + 1))}
              disabled={current === total - 1}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full",
                "bg-black/60 backdrop-blur-sm flex items-center justify-center",
                "transition-all duration-200 border border-white/10",
                current === total - 1
                  ? "opacity-30 cursor-not-allowed"
                  : "opacity-100 hover:bg-black/80 active:scale-95",
              )}
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </>
        )}

        {/* Counter badge pojok kanan atas */}
        {total > 1 && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-medium border border-white/10">
            {current + 1}/{total}
          </div>
        )}
      </div>

      {/* Thumbnail strip — klik untuk jump ke foto */}
      {total > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={cn(
                "flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all duration-200",
                i === current
                  ? "border-primary opacity-100 scale-105"
                  : "border-transparent opacity-50 hover:opacity-80",
              )}
            >
              <img
                src={img.url}
                alt={img.alt ?? `Foto ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reward Card ──────────────────────────────────────────────────────────────

function RewardCard({
  reward,
  onDetail,
  onRedeem,
}: {
  reward: Reward;
  onDetail: (r: Reward) => void;
  onRedeem: (r: Reward) => void;
}) {
  const catConfig = CATEGORY_CONFIG[reward.category];
  const isUnavailable =
    reward.status === "out_of_stock" ||
    reward.stock === 0 ||
    reward.status === "coming_soon";
  const thumbnail = reward.images[0]?.url;
  const hasDiscount = !!reward.points_discount;

  return (
    <div
      className="group relative bg-card border border-border rounded-2xl overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 cursor-pointer"
      onClick={() => onDetail(reward)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square overflow-hidden bg-white/5">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={reward.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-muted-foreground/30" />
          </div>
        )}

        {/* Category pill */}
        <span
          className={cn(
            "absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full border font-medium",
            catConfig.color,
          )}
        >
          {catConfig.emoji} &nbsp;{catConfig.label}
        </span>

        {/* Discount badge */}
        {hasDiscount && (
          <span className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-bold">
            -{discountPercent(reward.points_price, reward.points_discount!)}%
          </span>
        )}

        {/* Featured star */}
        {/* {reward.is_featured && !hasDiscount && (
          <span className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full bg-primary/80 text-white font-medium">
            ⭐ Featured
          </span>
        )} */}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {/* Name */}
        <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">
          {reward.name}
        </h3>

        {/* Hype */}
        <HypeBadge
          score={reward.hype_score}
          reviewCount={reward.review_count}
        />

        {/* Stock */}
        <div className="flex items-center justify-between">
          <StockBadge stock={reward.stock} status={reward.status} />
          <span className="text-xs text-muted-foreground">
            {reward.total_redeemed.toLocaleString("id-ID")}× ditukar
          </span>
        </div>

        {/* Price + actions */}
        <div className="pt-1 border-t border-border">
          {/* Pricing */}
          <div className="mb-2">
            {hasDiscount ? (
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-base font-bold text-primary">
                  {formatPoints(reward.points_discount!)}
                </span>
                <span className="text-xs text-muted-foreground line-through">
                  {formatPoints(reward.points_price)}
                </span>
              </div>
            ) : (
              <span className="text-base font-bold text-primary">
                {formatPoints(reward.points_price)}
              </span>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRedeem(reward);
              }}
              disabled={isUnavailable}
              className={cn(
                "flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200",
                isUnavailable
                  ? "bg-white/5 text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95",
              )}
            >
              {reward.status === "coming_soon" ? "Segera" : "Tukar"}
            </button>
            {/* Detail icon button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDetail(reward);
              }}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/10"
              title="Lihat detail"
            >
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Testimoni Item ───────────────────────────────────────────────────────────

function TestimoniItem({ review }: { review: RewardDetail["reviews"][0] }) {
  const hype = HYPE_LEVELS[review.rating_level - 1];
  const name =
    review.profiles?.display_name ??
    review.profiles?.username ??
    "Pengguna Movyoo";
  const initial = name[0].toUpperCase();

  return (
    <div className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
      {/* Avatar */}
      {review.profiles?.avatar_url ? (
        <img
          src={review.profiles.avatar_url}
          alt={name}
          className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-white/10"
        />
      ) : (
        <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initial}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{name}</span>
          {review.is_verified && (
            <span className="text-xs text-emerald-400 flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" /> Verified
            </span>
          )}
        </div>
        <span
          className="text-xs flex items-center gap-1 mt-0.5"
          style={{ color: hype.color }}
        >
          {hype.emoji} {hype.label}
        </span>
        {review.comment && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {review.comment}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function RewardModal({
  slug,
  onClose,
  onRedeem,
}: {
  slug: string;
  onClose: () => void;
  onRedeem: (r: RewardDetail) => void;
}) {
  const [detail, setDetail] = useState<RewardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/rewards/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        setDetail(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const isUnavailable =
    !detail ||
    detail.status === "out_of_stock" ||
    detail.stock === 0 ||
    detail.status === "coming_soon";

  function handleShare() {
    if (!detail) return;
    if (navigator.share) {
      navigator.share({
        title: detail.name,
        text: `Tukar poinmu dengan ${detail.name} di Movyoo!`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Modal container — mobile: full bottom sheet, desktop: wide 2-panel */}
      <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-4xl max-h-[92vh] flex flex-col">
        {/* ── Header (sticky, baris tunggal) ── */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-border rounded-t-3xl">
          <h2 className="font-bold text-base truncate pr-4">
            {loading ? "Memuat..." : detail?.name}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        {loading ? (
          /* Skeleton */
          <div className="flex-1 p-5 sm:grid sm:grid-cols-2 sm:gap-6 overflow-hidden">
            <div className="space-y-3">
              <div className="aspect-square bg-white/5 rounded-2xl animate-pulse" />
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-14 h-14 bg-white/5 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            </div>
            <div className="hidden sm:flex flex-col gap-3 pt-1">
              <div className="h-5 bg-white/5 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-white/5 rounded animate-pulse w-1/2" />
              <div className="h-20 bg-white/5 rounded-xl animate-pulse mt-2" />
              <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
            </div>
          </div>
        ) : !detail ? (
          <div className="flex-1 p-8 text-center text-muted-foreground">
            <AlertCircle className="w-10 h-10 mx-auto mb-2" />
            <p>Gagal memuat detail reward</p>
          </div>
        ) : (
          /* ── 2-panel layout ── */
          <div className="flex-1 flex flex-col sm:flex-row min-h-0">
            {/* ── Panel Kiri: foto + meta + pricing + stok ── */}
            <div className="sm:w-[45%] flex-shrink-0 overflow-y-auto scrollbar-hide p-5 sm:border-r sm:border-border space-y-4">
              {/* Image slider */}
              <ImageSlider images={detail.images} name={detail.name} />

              {/* Category + nama + brand */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full border font-medium",
                      CATEGORY_CONFIG[detail.category].color,
                    )}
                  >
                    {CATEGORY_CONFIG[detail.category].emoji}{" "}
                    {CATEGORY_CONFIG[detail.category].label}
                  </span>
                  <StockBadge stock={detail.stock} status={detail.status} />
                </div>
                <h3 className="text-base font-bold leading-snug">
                  {detail.name}
                </h3>
                <div className="flex items-center justify-between">
                  {detail.brand && (
                    <p className="text-xs text-muted-foreground">
                      by {detail.brand}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground ml-auto">
                    {detail.total_redeemed.toLocaleString("id-ID")}× ditukar
                  </p>
                </div>
              </div>

              {/* Pricing */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                {detail.points_discount ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Harga diskon
                      </span>
                      <p className="text-xl font-black text-primary">
                        {formatPoints(detail.points_discount)}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Harga normal
                      </span>
                      <p className="text-sm text-muted-foreground line-through">
                        {formatPoints(detail.points_price)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-lg ml-auto">
                      Hemat{" "}
                      {discountPercent(
                        detail.points_price,
                        detail.points_discount,
                      )}
                      %
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs text-muted-foreground">
                      Harga tukar
                    </span>
                    <p className="text-xl font-black text-primary">
                      {formatPoints(detail.points_price)}
                    </p>
                  </div>
                )}
              </div>

              {/* Testimoni — di panel kiri, hanya mobile yang ikut scroll sini */}
              {detail.reviews.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Testimoni ({detail.reviews.length})
                  </h4>
                  <div className="space-y-2">
                    {detail.reviews.map((r) => (
                      <TestimoniItem key={r.id} review={r} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Panel Kanan: deskripsi + hype rating + action buttons ── */}
            <div className="sm:flex-1 flex flex-col min-h-0">
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-5">
                {/* Deskripsi */}
                <div>
                  <h4 className="text-sm font-semibold mb-1.5">Deskripsi</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {detail.description}
                  </p>
                </div>

                {/* Tags */}
                {detail.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Hype Rating */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Hype Rating</h4>
                  <HypeRatingBreakdown
                    score={detail.hype_score}
                    reviewCount={detail.review_count}
                  />
                </div>
              </div>

              {/* ── Action buttons (sticky di bawah panel kanan) ── */}
              <div className="flex-shrink-0 p-4 border-t border-border flex gap-2">
                <button
                  onClick={() => onRedeem(detail)}
                  disabled={isUnavailable}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2",
                    isUnavailable
                      ? "bg-white/5 text-muted-foreground cursor-not-allowed"
                      : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95",
                  )}
                >
                  <Gift className="w-4 h-4" />
                  {detail.status === "coming_soon"
                    ? "Segera Hadir"
                    : isUnavailable
                      ? "Stok Habis"
                      : "Tukar Sekarang"}
                </button>
                <button
                  onClick={handleShare}
                  className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors flex-shrink-0"
                  title="Share"
                >
                  <Share2 className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Redeem Confirmation Modal ────────────────────────────────────────────────

function RedeemConfirmModal({
  reward,
  onConfirm,
  onCancel,
  loading,
  result,
}: {
  reward: Pick<Reward, "name" | "points_price" | "points_discount" | "images">;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  result: { success: boolean; message: string } | null;
}) {
  const finalPoints = reward.points_discount ?? reward.points_price;

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 space-y-4">
        {result ? (
          <div className="text-center space-y-3 py-2">
            {result.success ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="font-bold text-lg">Berhasil! 🎉</h3>
                <p className="text-sm text-muted-foreground">
                  {result.message}
                </p>
                <button
                  onClick={onCancel}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm mt-2"
                >
                  Oke, Keren!
                </button>
              </>
            ) : (
              <>
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
                <h3 className="font-bold text-lg">Gagal Redeem</h3>
                <p className="text-sm text-muted-foreground">
                  {result.message}
                </p>
                <button
                  onClick={onCancel}
                  className="w-full py-2.5 rounded-xl bg-white/10 text-foreground font-semibold text-sm mt-2"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Thumbnail */}
            {reward.images[0] && (
              <img
                src={reward.images[0].url}
                alt={reward.name}
                className="w-20 h-20 rounded-xl object-cover mx-auto"
              />
            )}
            <div className="text-center">
              <h3 className="font-bold text-base">{reward.name}</h3>
              <p className="text-2xl font-black text-primary mt-1">
                {formatPoints(finalPoints)}
              </p>
              {reward.points_discount && (
                <p className="text-xs text-muted-foreground line-through">
                  {formatPoints(reward.points_price)}
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Kamu yakin ingin menukar poinmu dengan reward ini?
            </p>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Gift className="w-4 h-4" />
                )}
                {loading ? "Memproses..." : "Tukar!"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export function RewardClient() {
  const { user, openAuthModal } = useAuth();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [redeemTarget, setRedeemTarget] = useState<
    Reward | RewardDetail | null
  >(null);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [userPoints, setUserPoints] = useState<number | null>(null);

  // Fetch poin user dari user_progression
  const fetchUserPoints = useCallback(async () => {
    if (!user) return;
    const res = await fetch("/api/rewards/points");
    if (res.ok) {
      const data = await res.json();
      setUserPoints(data.points ?? 0);
    }
  }, [user]);

  useEffect(() => {
    fetchUserPoints();
  }, [fetchUserPoints]);

  // Fetch rewards
  const fetchRewards = useCallback(async (cat: string) => {
    setLoading(true);
    const url = cat === "all" ? "/api/rewards" : `/api/rewards?category=${cat}`;
    const res = await fetch(url);
    const data = await res.json();
    setRewards(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRewards(category);
  }, [category, fetchRewards]);

  function handleCategoryChange(cat: string) {
    setCategory(cat);
  }

  function handleDetailOpen(r: Reward) {
    setDetailSlug(r.slug);
  }

  function handleRedeem(r: Reward | RewardDetail) {
    if (!user) {
      openAuthModal("signin");
      return;
    }
    setDetailSlug(null); // tutup modal detail jika terbuka
    setRedeemResult(null);
    setRedeemTarget(r);
  }

  async function confirmRedeem() {
    if (!redeemTarget) return;
    setRedeemLoading(true);
    try {
      const res = await fetch("/api/rewards/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward_id: redeemTarget.id }),
      });
      const data = await res.json();
      setRedeemResult({
        success: res.ok,
        message: data.message ?? data.error ?? "Terjadi kesalahan",
      });
      // Refresh list + poin setelah redeem berhasil
      if (res.ok) {
        fetchRewards(category);
        if (data.remaining_points !== undefined) {
          setUserPoints(data.remaining_points);
        } else {
          fetchUserPoints();
        }
      }
    } catch {
      setRedeemResult({
        success: false,
        message: "Koneksi bermasalah. Coba lagi.",
      });
    } finally {
      setRedeemLoading(false);
    }
  }

  // Group by category untuk tampilan "all"
  const grouped =
    category === "all"
      ? Object.entries(
          rewards.reduce<Record<string, Reward[]>>((acc, r) => {
            if (!acc[r.category]) acc[r.category] = [];
            acc[r.category].push(r);
            return acc;
          }, {}),
        )
      : null;

  return (
    <div className="min-h-screen">
      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="px-4 pt-6 pb-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Gift className="w-5 h-5 text-primary" />
                <span className="text-xs font-medium text-primary uppercase tracking-wider">
                  Reward Store
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground">
                Tukar Poinmu
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Dapatkan hadiah keren dari poin yang kamu kumpulkan 🎁
              </p>
            </div>
            {user && (
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-muted-foreground">Poinmu</p>
                {userPoints === null ? (
                  <div className="h-6 w-20 bg-white/5 rounded animate-pulse mt-1" />
                ) : (
                  <p className="text-lg font-black text-primary">
                    {userPoints.toLocaleString("id-ID")}
                    <span className="text-xs font-medium ml-1">pts</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="px-4 sm:px-6 mb-4">
        <CategoryTabs active={category} onChange={handleCategoryChange} />
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 pb-8">
        {loading ? (
          /* Skeleton grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-2xl overflow-hidden animate-pulse"
              >
                <div className="aspect-square bg-white/5" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-white/5 rounded w-3/4" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                  <div className="h-8 bg-white/5 rounded mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : rewards.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Belum ada reward di kategori ini</p>
          </div>
        ) : category !== "all" || !grouped ? (
          /* Single category grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {rewards.map((r) => (
              <RewardCard
                key={r.id}
                reward={r}
                onDetail={handleDetailOpen}
                onRedeem={handleRedeem}
              />
            ))}
          </div>
        ) : (
          /* Grouped by category */
          <div className="space-y-8">
            {grouped.map(([cat, items]) => {
              const config = CATEGORY_CONFIG[cat as RewardCategory];
              return (
                <section key={cat}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">{config.emoji}</span>
                    <h2 className="font-bold text-base">{config.label}</h2>
                    <span className="text-xs text-muted-foreground">
                      ({items.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {items.map((r) => (
                      <RewardCard
                        key={r.id}
                        reward={r}
                        onDetail={handleDetailOpen}
                        onRedeem={handleRedeem}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailSlug && (
        <RewardModal
          slug={detailSlug}
          onClose={() => setDetailSlug(null)}
          onRedeem={handleRedeem}
        />
      )}

      {/* Redeem Confirm Modal */}
      {redeemTarget && (
        <RedeemConfirmModal
          reward={redeemTarget}
          onConfirm={confirmRedeem}
          onCancel={() => {
            setRedeemTarget(null);
            setRedeemResult(null);
          }}
          loading={redeemLoading}
          result={redeemResult}
        />
      )}
    </div>
  );
}
