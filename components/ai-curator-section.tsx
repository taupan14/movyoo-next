"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Brain, Sparkles, Film, Tv, UserCheck, Globe } from "lucide-react";
import { getPosterUrl } from "@/lib/tmdb";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CuratorCollection {
  title: string;
  title_en: string;
  theme: string;
  ids: number[];
}

interface AICuratorResponse {
  collections: CuratorCollection[];
  week_key: string;
  generated_at: string;
  from_cache: boolean;
  personalized: boolean; // true = per-user (gems + watchlist)
}

interface PosterEntry {
  poster_path: string | null;
  title: string;
  media_type: "movie" | "tv";
}

export type PosterMap = Record<number, PosterEntry>;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CuratorSkeleton() {
  return (
    <section className="mb-8 px-4 lg:px-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-4 rounded bg-white/10 animate-pulse" />
        <div className="h-5 w-52 rounded-md bg-white/10 animate-pulse" />
      </div>
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl glass p-4 space-y-3">
            <div className="h-4 w-40 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-64 rounded bg-white/10 animate-pulse" />
            <div className="flex gap-2 mt-2">
              {[1, 2, 3, 4].map((j) => (
                <div
                  key={j}
                  className="w-[70px] aspect-[2/3] rounded-lg bg-white/10 animate-pulse flex-shrink-0"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── PersonalisedBadge ────────────────────────────────────────────────────────

function PersonalizedBadge({
  personalized,
  locale,
}: {
  personalized: boolean;
  locale: string;
}) {
  if (personalized) {
    return (
      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25 font-medium">
        <UserCheck className="w-2.5 h-2.5" />
        {locale === "id" ? "Untukmu" : "For You"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10 font-medium">
      <Globe className="w-2.5 h-2.5" />
      {locale === "id" ? "Global" : "Global"}
    </span>
  );
}

// ─── Collection Card ──────────────────────────────────────────────────────────

function CollectionCard({
  collection,
  posterMap,
  locale,
}: {
  collection: CuratorCollection;
  posterMap: PosterMap;
  locale: string;
}) {
  const title = locale === "id" ? collection.title : collection.title_en;
  const visibleIds = collection.ids.slice(0, 6);
  const overflow = collection.ids.length - 6;

  return (
    <div className="rounded-2xl glass border border-white/8 overflow-hidden hover:border-white/15 transition-colors duration-300">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Brain className="w-3 h-3 text-violet-400 flex-shrink-0" />
            <span className="text-[9px] font-semibold text-violet-400 uppercase tracking-wider">
              AI Curated
            </span>
          </div>
          <h3 className="text-sm font-bold text-foreground leading-tight line-clamp-1">
            {title}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {collection.theme}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-1 whitespace-nowrap">
          {collection.ids.length} {locale === "id" ? "judul" : "titles"}
        </span>
      </div>

      {/* Poster strip */}
      <div className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-hide">
        {visibleIds.map((tmdbId) => {
          const info = posterMap[tmdbId];
          if (!info) return null;
          const href =
            info.media_type === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

          return (
            <Link
              key={tmdbId}
              href={href}
              className="flex-shrink-0 w-[70px] group"
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-white/5 hover-lift">
                {info.poster_path ? (
                  <img
                    src={getPosterUrl(info.poster_path, "w185")}
                    alt={info.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {info.media_type === "movie" ? (
                      <Film className="w-4 h-4 text-white/20" />
                    ) : (
                      <Tv className="w-4 h-4 text-white/20" />
                    )}
                  </div>
                )}
              </div>
            </Link>
          );
        })}

        {overflow > 0 && (
          <div className="flex-shrink-0 w-[70px] aspect-[2/3] rounded-lg bg-white/5 flex items-center justify-center text-[10px] text-muted-foreground font-medium">
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Type Tab ─────────────────────────────────────────────────────────────────

function TypeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
        active
          ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5",
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

interface AICuratorSectionProps {
  locale: string;
  /**
   * posterMap berisi entri untuk semua tmdb_id yang mungkin muncul di koleksi:
   * hidden gems (dari HiddenGemsSection) + watchlist user (sudah ada di server).
   * HomeClient membangunnya setelah hidden gems diload, lalu meneruskannya ke sini.
   */
  posterMap: PosterMap;
}

export function AICuratorSection({ locale, posterMap }: AICuratorSectionProps) {
  const { session } = useAuth();
  const lang = locale === "id" ? "id" : "en";

  const [movieData, setMovieData] = useState<AICuratorResponse | null>(null);
  const [tvData, setTvData] = useState<AICuratorResponse | null>(null);
  const [loadingMovie, setLoadingMovie] = useState(true);
  const [loadingTv, setLoadingTv] = useState(true);
  const [activeType, setActiveType] = useState<"movie" | "tv">("movie");

  const fetchCurator = useCallback(
    async (type: "movie" | "tv") => {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      try {
        const res = await fetch(`/api/ai-curator?type=${type}&lang=${lang}`, {
          headers,
        });
        const body = await res.json();
        if (!res.ok) {
          // Log detail error dari server untuk diagnosis
          console.error(
            `[AICuratorSection] HTTP ${res.status} (type=${type}):`,
            body,
          );
          return null;
        }
        return body as AICuratorResponse;
      } catch (e) {
        console.error(`[AICuratorSection] fetch ${type}:`, e);
        return null;
      }
    },
    [lang, session?.access_token],
  );

  useEffect(() => {
    fetchCurator("movie").then((d) => {
      setMovieData(d);
      setLoadingMovie(false);
    });
    fetchCurator("tv").then((d) => {
      setTvData(d);
      setLoadingTv(false);
    });
  }, [fetchCurator]);

  if (loadingMovie || loadingTv) return <CuratorSkeleton />;

  const activeData = activeType === "movie" ? movieData : tvData;
  const activeCollections = activeData?.collections ?? [];

  // Sembunyikan section jika benar-benar tidak ada konten sama sekali
  if (!movieData?.collections.length && !tvData?.collections.length)
    return null;

  const sectionTitle =
    locale === "id" ? "Koleksi Pilihan AI" : "AI Curated Collections";

  return (
    <section className="mb-8 animate-slide-up">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 lg:px-6 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Brain className="w-4 h-4 text-violet-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">
            {sectionTitle}
          </span>
          <span className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground">
            <Sparkles className="w-2.5 h-2.5" />
            {locale === "id" ? "Diperbarui tiap minggu" : "Refreshed weekly"}
          </span>
        </div>

        {/* Badge personalisasi — berdasarkan tab yang aktif */}
        {activeData && (
          <PersonalizedBadge
            personalized={activeData.personalized}
            locale={locale}
          />
        )}
      </div>

      {/* ── Type Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-2 px-4 lg:px-6 mb-4">
        <TypeTab
          active={activeType === "movie"}
          onClick={() => setActiveType("movie")}
          icon={Film}
          label={locale === "id" ? "Film" : "Movies"}
        />
        <TypeTab
          active={activeType === "tv"}
          onClick={() => setActiveType("tv")}
          icon={Tv}
          label="TV Series"
        />
        {/* Personalization indicator per tab */}
        {movieData?.personalized && activeType === "movie" && (
          <span className="ml-auto self-center text-[10px] text-violet-400/70 hidden lg:block">
            {locale === "id"
              ? "Termasuk film dari watchlistmu"
              : "Includes films from your watchlist"}
          </span>
        )}
        {tvData?.personalized && activeType === "tv" && (
          <span className="ml-auto self-center text-[10px] text-violet-400/70 hidden lg:block">
            {locale === "id"
              ? "Termasuk series dari watchlistmu"
              : "Includes series from your watchlist"}
          </span>
        )}
      </div>

      {/* ── Collections ─────────────────────────────────────────────────────── */}
      {activeCollections.length > 0 ? (
        <div className="space-y-3 px-4 lg:px-6">
          {activeCollections.map((col, idx) => (
            <CollectionCard
              key={`${activeType}-${idx}-${activeData?.week_key}`}
              collection={col}
              posterMap={posterMap}
              locale={locale}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground px-4 lg:px-6 py-4">
          {locale === "id"
            ? "Koleksi sedang disiapkan, coba lagi sebentar."
            : "Collections are being prepared, check back shortly."}
        </p>
      )}
    </section>
  );
}
