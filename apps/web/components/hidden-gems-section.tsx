"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Star,
  Gem,
  Sparkles,
  RefreshCw,
  Heart,
  Info,
  Play,
} from "lucide-react";
import { getPosterUrl } from "@/lib/tmdb";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HiddenGem {
  id: number;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  media_type: "movie" | "tv";
  gem_score: number;
  // Opsional — isi dari API kalau sudah tersedia, dipakai untuk chip genre & platform.
  genre_names?: string[];
  platforms?: string[];
}

interface HiddenGemsResponse {
  movies: HiddenGem[];
  series: HiddenGem[];
  topGenreId: number | null;
  personalized: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useLikedGems() {
  const [liked, setLiked] = useState<Set<string>>(new Set());

  const toggleLike = useCallback((key: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    // TODO: sambungkan ke endpoint favorit user, mis. POST /api/gems/like { key }
  }, []);

  return { liked, toggleLike };
}

function gemHref(gem: HiddenGem) {
  return gem.media_type === "movie"
    ? `/movie/${gem.tmdb_id}`
    : `/tv-series/${gem.tmdb_id}`;
}

function gemYear(gem: HiddenGem) {
  return (gem.release_date ?? gem.first_air_date ?? "").slice(0, 4);
}

// ─── Spotlight (kartu highlight besar) ────────────────────────────────────────

function SpotlightCard({
  gem,
  locale,
  liked,
  onToggleLike,
}: {
  gem: HiddenGem;
  locale: string;
  liked: boolean;
  onToggleLike: () => void;
}) {
  const year = gemYear(gem);

  return (
    <div
      key={`${gem.media_type}-${gem.id}`}
      className="relative rounded-2xl overflow-hidden bg-white/5 min-h-[420px] lg:min-h-[480px] animate-fade-in"
    >
      {gem.poster_path ? (
        <img
          src={getPosterUrl(gem.backdrop_path ?? gem.poster_path, "w780")}
          alt={gem.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5">
          <Gem className="w-10 h-10 text-white/20" />
        </div>
      )}

      {/* Scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />

      {/* Badge gem */}
      <div className="absolute top-4 left-4">
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/90 backdrop-blur-sm text-white text-[11px] font-semibold">
          <Gem className="w-3 h-3" />
          {locale === "id" ? "Gem Pilihan" : "Featured Gem"}
        </span>
      </div>

      {/* Like button */}
      <button
        onClick={onToggleLike}
        aria-label={locale === "id" ? "Suka" : "Like"}
        className={cn(
          "absolute top-4 right-4 flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-sm transition-colors",
          liked
            ? "bg-rose-500/90 text-white"
            : "bg-black/40 text-white/80 hover:bg-black/60",
        )}
      >
        <Heart className={cn("w-4 h-4", liked && "fill-white")} />
      </button>

      {/* Info panel */}
      <div className="absolute inset-x-0 bottom-0 p-5 lg:p-7 max-w-xl flex flex-col gap-2.5">
        <h3 className="text-xl lg:text-2xl font-semibold text-white leading-tight line-clamp-2">
          {gem.title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/70">
          <span className="flex items-center gap-1 text-yellow-400 font-medium">
            <Star className="w-3.5 h-3.5 fill-yellow-400" />
            {gem.vote_average.toFixed(1)}
          </span>
          {year && <span>{year}</span>}
          <span>
            {gem.genre_names && gem.genre_names.length > 0
              ? gem.genre_names.slice(0, 3).join(" · ")
              : locale === "id"
                ? "Genre belum tersedia"
                : "Genre unavailable"}
          </span>
        </div>

        <p className="text-[13px] lg:text-sm text-white/70 leading-relaxed line-clamp-2 lg:line-clamp-3">
          {gem.overview ||
            (locale === "id"
              ? "Sinopsis belum tersedia untuk judul ini."
              : "No synopsis available for this title yet.")}
        </p>

        <div className="flex flex-wrap gap-1.5 mt-1">
          {gem.platforms && gem.platforms.length > 0 ? (
            gem.platforms.slice(0, 4).map((p) => (
              <span
                key={p}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/80"
              >
                {p}
              </span>
            ))
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 italic">
              {locale === "id"
                ? "Platform belum tersedia"
                : "Platform unavailable"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Link
            href={gemHref(gem)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            {locale === "id" ? "Detail" : "Details"}
          </Link>
          <Link
            href={gemHref(gem)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 border border-white/15 text-white text-[12px] font-medium hover:bg-white/15 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            {locale === "id" ? "Sinopsis" : "Synopsis"}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Thumbnail Rail ────────────────────────────────────────────────────────────

function ThumbnailRail({
  items,
  activeIndex,
  onSelect,
}: {
  items: HiddenGem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pt-3 ps-2 pb-2">
      {items.map((gem, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={`${gem.media_type}-${gem.id}`}
            onClick={() => onSelect(index)}
            className={cn(
              "relative flex-shrink-0 w-[52px] h-[76px] lg:w-[60px] lg:h-[88px] rounded-lg overflow-hidden transition-all duration-200",
              isActive
                ? "ring-1 ring-emerald-400 ring-offset-1 ring-offset-background"
                : "opacity-60 hover:opacity-90",
            )}
          >
            {gem.poster_path ? (
              <img
                src={getPosterUrl(gem.poster_path, "w185")}
                alt={gem.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/10">
                <Gem className="w-4 h-4 text-white/30" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200",
        active
          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5",
      )}
    >
      {children}
    </button>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function HiddenGemsSkeleton() {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between px-4 lg:px-6 mb-3">
        <div className="h-5 w-44 rounded-md bg-white/10 animate-pulse" />
        <div className="h-4 w-24 rounded-md bg-white/10 animate-pulse" />
      </div>
      <div className="px-4 lg:px-6">
        <div className="rounded-2xl bg-white/10 animate-pulse min-h-[320px]" />
        <div className="flex gap-2 mt-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-[52px] h-[76px] rounded-lg bg-white/10 animate-pulse"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

interface HiddenGemsSectionProps {
  onGemsLoaded?: (movies: HiddenGem[], series: HiddenGem[]) => void;
  locale: string;
}

export function HiddenGemsSection({
  locale,
  onGemsLoaded,
}: HiddenGemsSectionProps) {
  const { user, session } = useAuth();
  const [data, setData] = useState<HiddenGemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"movies" | "series">("movies");
  const [activeIndex, setActiveIndex] = useState(0);
  const { liked, toggleLike } = useLikedGems();

  const fetchGems = useCallback(async () => {
    setLoading(true);
    try {
      const lang = locale === "id" ? "id" : "en";
      const headers: Record<string, string> = {};

      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/hidden-gems?lang=${lang}`, { headers });
      if (!res.ok) throw new Error("fetch failed");
      const json: HiddenGemsResponse = await res.json();
      setData(json);
      onGemsLoaded?.(json.movies, json.series);
    } catch (e) {
      console.error("[HiddenGemsSection]", e);
    } finally {
      setLoading(false);
    }
  }, [locale, session?.access_token]);

  useEffect(() => {
    fetchGems();
  }, [fetchGems]);

  // Reset item aktif setiap kali tab movies/series diganti
  const handleTabChange = (tab: "movies" | "series") => {
    setActiveTab(tab);
    setActiveIndex(0);
  };

  if (loading) return <HiddenGemsSkeleton />;
  if (!data) return null;

  const items = activeTab === "movies" ? data.movies : data.series;
  if (!data.movies.length && !data.series.length) return null;

  const activeGem = items[activeIndex] ?? items[0];

  const sectionTitle =
    locale === "id" ? "Hidden Gem Minggu Ini" : "This Week's Hidden Gems";

  return (
    <section className="mb-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-6 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-lg font-semibold text-foreground">
            {sectionTitle}
          </span>
          <span className="hidden lg:flex items-center gap-1 text-[12px] text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            {locale === "id" ? "Update tiap minggu" : "Updated weekly"}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 lg:px-6 mb-3">
        <TabBtn
          active={activeTab === "movies"}
          onClick={() => handleTabChange("movies")}
        >
          {locale === "id" ? "Film" : "Movies"}
          {data.movies.length > 0 && (
            <span className="ml-1 text-[9px] opacity-60">
              {data.movies.length}
            </span>
          )}
        </TabBtn>
        <TabBtn
          active={activeTab === "series"}
          onClick={() => handleTabChange("series")}
        >
          {locale === "id" ? "TV Series" : "TV Series"}
          {data.series.length > 0 && (
            <span className="ml-1 text-[9px] opacity-60">
              {data.series.length}
            </span>
          )}
        </TabBtn>
      </div>

      {items.length > 0 ? (
        <div className="px-4 lg:px-6">
          {activeGem && (
            <SpotlightCard
              gem={activeGem}
              locale={locale}
              liked={liked.has(`${activeGem.media_type}-${activeGem.id}`)}
              onToggleLike={() =>
                toggleLike(`${activeGem.media_type}-${activeGem.id}`)
              }
            />
          )}
          <ThumbnailRail
            items={items}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground px-4 lg:px-6 py-4">
          {locale === "id"
            ? "Belum ada hidden gem untuk kategori ini."
            : "No hidden gems found for this category."}
        </p>
      )}

      {!user && (
        <p className="px-4 lg:px-6 mt-2 text-[11px] text-muted-foreground">
          💡{" "}
          {locale === "id"
            ? "Login untuk mendapatkan rekomendasi sesuai genre favoritmu."
            : "Log in to get picks based on your favorite genres."}
        </p>
      )}
    </section>
  );
}
