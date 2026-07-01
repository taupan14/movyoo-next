"use client";

/**
 * components/articles/movie-list.tsx — UPDATED
 * Mendukung movie + tv series dalam satu list via ArticleMediaItem[]
 * Opsi B: Poster Grid 5 kolom + expand inline
 */

import Link from "next/link";
import { useState } from "react";
import { startLoader } from "@/components/page-loader";
import { cn } from "@/lib/utils";
import { Star, ChevronRight, X, Tv } from "lucide-react";
import type { ArticleDetail, ArticleMediaItem } from "@/lib/articles-db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  // Terima items (gabungan) atau fallback ke movies saja
  items?: ArticleMediaItem[];
  movies?: ArticleDetail["movies"];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";
const posterUrl = (p: string | null) =>
  p ? `${TMDB_POSTER}${p}` : "/placeholder-poster.jpg";
const COLS = 5;

// ─── Rank badge ───────────────────────────────────────────────────────────────

const rankBadge = "bg-black/60 text-white";

// ─── Poster Card ─────────────────────────────────────────────────────────────

function PosterCard({
  item,
  rank,
  isActive,
  onClick,
}: {
  item: ArticleMediaItem;
  rank: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const year = item.media.release_date?.slice(0, 4);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-xl overflow-hidden text-left transition-all duration-200 border bg-card",
        isActive
          ? "border-primary ring-1 ring-primary/40 scale-[1.02]"
          : "border-border hover:border-primary/40 hover:scale-[1.01]",
      )}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] overflow-hidden bg-muted">
        <img
          src={posterUrl(item.media.poster_path)}
          alt={item.media.title}
          className="w-full h-full object-cover transition-transform duration-300"
          loading="lazy"
        />
        {/* Rank */}
        <span
          className={cn(
            "absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
            rankBadge,
          )}
        >
          {rank}
        </span>
        {/* TV badge */}
        {item.media_type === "tv" && (
          <span className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/80 text-white text-[9px] font-semibold">
            <Tv className="w-2.5 h-2.5" />
            TV
          </span>
        )}
        {/* Active arrow */}
        {isActive && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-card border-l border-t border-primary/40 rotate-45 z-10" />
        )}
      </div>

      {/* Title */}
      <div className="p-2">
        <p
          className={cn(
            "text-[11px] font-semibold leading-snug line-clamp-2 transition-colors",
            isActive ? "text-primary" : "text-foreground",
          )}
        >
          {item.media.title}
        </p>
        {year && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{year}</p>
        )}
      </div>
    </button>
  );
}

// ─── Expanded Panel ───────────────────────────────────────────────────────────

function ExpandedPanel({
  item,
  onClose,
}: {
  item: ArticleMediaItem;
  onClose: () => void;
}) {
  const year = item.media.release_date?.slice(0, 4);
  const href =
    item.media_type === "tv"
      ? `/tv-series/${item.media.tmdb_id}`
      : `/movie/${item.media.tmdb_id}`;

  return (
    <div className="rounded-xl border border-primary/30 bg-card animate-fade-in">
      <div className="flex items-start gap-3 p-3">
        {/* Poster kecil */}
        {/* <div className="shrink-0 w-10 h-[60px] rounded-lg overflow-hidden bg-muted">
          <img
            src={posterUrl(item.media.poster_path)}
            alt={item.media.title}
            className="w-full h-full object-cover"
          />
        </div> */}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-xs font-semibold text-foreground leading-snug line-clamp-1">
              {item.media.title}
            </p>
            {item.media_type === "tv" && (
              <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold">
                <Tv className="w-2.5 h-2.5" />
                TV
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {year && <span>{year}</span>}
            {item.media.vote_average > 0 && (
              <span className="flex items-center gap-0.5 text-amber-400">
                <Star className="w-2.5 h-2.5 fill-amber-400" />
                {item.media.vote_average.toFixed(1)}
              </span>
            )}
          </div>
          {(item.note || item.media.overview) && (
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mt-1">
              {item.note ?? item.media.overview}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href={href}
            onClick={() => startLoader()}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="Lihat detail"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            title="Tutup"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function MovieList({ items: itemsProp, movies }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Normalisasi input — terima items langsung atau konversi dari movies
  const items: ArticleMediaItem[] = itemsProp?.length
    ? itemsProp
    : (movies ?? []).map((m) => ({
        id: m.movie_id,
        media_type: "movie" as const,
        sort_order: m.sort_order,
        note: m.note,
        media: m.movie,
      }));

  if (!items.length) return null;

  const totalLabel = items.length === 1 ? "1 judul" : `${items.length} judul`;

  function handleClick(i: number) {
    setActiveIndex((prev) => (prev === i ? null : i));
  }

  function buildRows() {
    const rows: {
      items: { item: ArticleMediaItem; index: number }[];
      showPanel: boolean;
    }[] = [];
    for (let i = 0; i < items.length; i += COLS) {
      const chunk = items
        .slice(i, i + COLS)
        .map((item, j) => ({ item, index: i + j }));
      const rowHasActive =
        activeIndex !== null && activeIndex >= i && activeIndex < i + COLS;
      rows.push({ items: chunk, showPanel: rowHasActive });
    }
    return rows;
  }

  const rows = buildRows();

  return (
    <section>
      {/* <div className="text-base text-sm font-semibold text-foreground text-gradient mb-4">
        Daftar Tontonan ({totalLabel})
      </div> */}

      <div className="flex flex-col gap-2">
        {rows.map((row, ri) => (
          <div key={ri} className="flex flex-col gap-2">
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {row.items.map(({ item, index }) => (
                <PosterCard
                  key={`${item.media_type}-${item.id}`}
                  item={item}
                  rank={index + 1}
                  isActive={activeIndex === index}
                  onClick={() => handleClick(index)}
                />
              ))}
              {row.items.length < COLS &&
                Array.from({ length: COLS - row.items.length }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
            </div>

            {row.showPanel && activeIndex !== null && (
              <ExpandedPanel
                item={items[activeIndex]}
                onClose={() => setActiveIndex(null)}
              />
            )}
          </div>
        ))}
      </div>

      {activeIndex === null && items.length > 1 && (
        <p className="text-[11px] text-muted-foreground/60 text-center mt-3">
          Tap poster untuk lihat detail
        </p>
      )}
    </section>
  );
}
