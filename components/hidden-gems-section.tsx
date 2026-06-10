"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Star, Eye, Gem, Sparkles, RefreshCw } from "lucide-react";
import { getPosterUrl } from "@/lib/tmdb";
import { SectionHeaderHome } from "@/components/section-header";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HiddenGem {
  id: number;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  media_type: "movie" | "tv";
  gem_score: number;
}

interface HiddenGemsResponse {
  movies: HiddenGem[];
  series: HiddenGem[];
  topGenreId: number | null;
  personalized: boolean;
}

// ─── Gem Card ─────────────────────────────────────────────────────────────────

function GemCard({ gem }: { gem: HiddenGem }) {
  const href =
    gem.media_type === "movie"
      ? `/movie/${gem.tmdb_id}`
      : `/tv-series/${gem.tmdb_id}`;

  const year = (gem.release_date ?? gem.first_air_date ?? "").slice(0, 4);

  return (
    <Link href={href} className="flex-shrink-0 w-[130px] lg:w-[150px] group">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 hover-lift card-shine">
        {gem.poster_path ? (
          <img
            src={getPosterUrl(gem.poster_path, "w300")}
            alt={gem.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gem className="w-8 h-8 text-white/20" />
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Hidden gem badge */}
        <div className="absolute top-2 left-2">
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/80 backdrop-blur-sm text-white text-[9px] font-semibold">
            <Gem className="w-2.5 h-2.5" />
            Gem
          </span>
        </div>

        {/* Rating badge */}
        <div className="absolute top-2 right-2">
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-yellow-400 text-[9px] font-bold">
            <Star className="w-2.5 h-2.5 fill-yellow-400" />
            {gem.vote_average.toFixed(1)}
          </span>
        </div>

        {/* Popularity indicator (inversed — low = hidden gem) */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white/60 text-[8px]">
            <Eye className="w-2 h-2" />
            {gem.popularity.toFixed(0)}
          </span>
        </div>
      </div>

      {/* Title + year */}
      <p className="mt-1.5 text-xs font-medium text-foreground line-clamp-2 leading-tight group-hover:text-emerald-400 transition-colors">
        {gem.title}
      </p>
      {year && <p className="text-[10px] text-muted-foreground">{year}</p>}
    </Link>
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
      <div className="flex gap-3 overflow-hidden px-4 lg:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-[130px] lg:w-[150px] flex-shrink-0 aspect-[2/3] rounded-xl bg-white/10 animate-pulse"
          />
        ))}
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

  const fetchGems = useCallback(async () => {
    setLoading(true);
    try {
      const lang = locale === "id" ? "id" : "en";
      const headers: Record<string, string> = {};

      // Kirim JWT jika sudah login untuk personalisasi
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/hidden-gems?lang=${lang}`, { headers });
      if (!res.ok) throw new Error("fetch failed");
      const json: HiddenGemsResponse = await res.json();
      setData(json);
      // Kirim data poster ke parent (HomeClient) untuk AICuratorSection
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

  if (loading) return <HiddenGemsSkeleton />;
  if (!data) return null;

  const items = activeTab === "movies" ? data.movies : data.series;
  if (!data.movies.length && !data.series.length) return null;

  const sectionTitle =
    locale === "id" ? "Hidden Gem Minggu Ini" : "This Week's Hidden Gems";

  // const personalizedBadge = data.personalized
  //   ? locale === "id"
  //     ? "Dipersonalisasi untukmu"
  //     : "Personalized for you"
  //   : locale === "id"
  //     ? "Pilihan global"
  //     : "Global picks";

  return (
    <section className="mb-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-6 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-lg font-semibold text-foreground">
            {sectionTitle}
          </span>
          {/* Weekly refresh indicator */}
          <span className="hidden lg:flex items-center gap-1 text-[12px] text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            {locale === "id" ? "Update tiap minggu" : "Updated weekly"}
          </span>
        </div>

        {/* Personalized badge */}
        {/* <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full border font-medium",
            data.personalized
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-white/5 text-muted-foreground border-white/10",
          )}
        >
          {personalizedBadge}
        </span> */}
      </div>

      {/* Tabs: Movies | Series */}
      <div className="flex gap-2 px-4 lg:px-6 mb-3">
        <TabBtn
          active={activeTab === "movies"}
          onClick={() => setActiveTab("movies")}
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
          onClick={() => setActiveTab("series")}
        >
          {locale === "id" ? "TV Series" : "TV Series"}
          {data.series.length > 0 && (
            <span className="ml-1 text-[9px] opacity-60">
              {data.series.length}
            </span>
          )}
        </TabBtn>
      </div>

      {/* Cards */}
      {items.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-2">
          {items.map((gem) => (
            <GemCard key={`${gem.media_type}-${gem.id}`} gem={gem} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground px-4 lg:px-6 py-4">
          {locale === "id"
            ? "Belum ada hidden gem untuk kategori ini."
            : "No hidden gems found for this category."}
        </p>
      )}

      {/* Login prompt untuk personalisasi */}
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
