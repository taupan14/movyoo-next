"use client";
// app/explore/page.tsx
// Semua data dari /api/movies/* (Supabase) — tidak ada request langsung ke TMDB

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-locale";
import { MovieCard } from "@/components/movie-card";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, ChevronDown, Clapperboard } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  popularity?: number;
  overview?: string;
}

interface Platform {
  id: number;
  slug: string;
  name: string;
  logo_path: string | null;
}

interface Genre {
  id: number;
  tmdb_genre_id: number;
  name: string;
  slug: string;
}

type SortKey =
  | "release_date"
  | "popular"
  | "top_rated"
  | "now_playing"
  | "coming_soon";

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; labelId: string; labelEn: string }[] = [
  { key: "release_date", labelId: "Terbaru", labelEn: "Latest" },
  { key: "popular", labelId: "Populer", labelEn: "Popular" },
  { key: "top_rated", labelId: "Rating Terbaik", labelEn: "Top Rated" },
  { key: "now_playing", labelId: "Sedang Tayang", labelEn: "Now Playing" },
  { key: "coming_soon", labelId: "Segera Hadir", labelEn: "Coming Soon" },
];

// Platform yang membutuhkan redirect ke halaman /cinema
const CINEMA_SLUGS = ["bioskop"];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[2/3] rounded-xl bg-white/10 animate-pulse"
        />
      ))}
    </div>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────

function ExploreContent() {
  const { locale } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── State ──
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedGenreId, setSelectedGenreId] = useState<number | null>(null);
  const [selectedSort, setSelectedSort] = useState<SortKey>("release_date");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Abort controller untuk cancel request saat filter berubah
  const abortRef = useRef<AbortController | null>(null);

  // ── Init: load platforms & genres dari DB ──────────────────────────────────
  useEffect(() => {
    async function init() {
      const [platRes, genreRes] = await Promise.allSettled([
        fetch("/api/movies/platforms").then((r) => r.json()),
        fetch("/api/movies/genres").then((r) => r.json()),
      ]);
      if (platRes.status === "fulfilled") setPlatforms(platRes.value ?? []);
      if (genreRes.status === "fulfilled") setGenres(genreRes.value ?? []);
    }
    init();
  }, []);

  // ── Sync platform dari URL param ───────────────────────────────────────────
  useEffect(() => {
    const p = searchParams.get("platform");
    if (p) setSelectedPlatform(p.toLowerCase());
  }, [searchParams]);

  // ── Redirect bioskop ke /cinema ────────────────────────────────────────────
  useEffect(() => {
    if (CINEMA_SLUGS.includes(selectedPlatform)) {
      router.push("/cinema");
    }
  }, [selectedPlatform, router]);

  // ── Fetch movies ───────────────────────────────────────────────────────────
  const fetchMovies = useCallback(
    async (currentPage: number, isLoadMore: boolean) => {
      if (CINEMA_SLUGS.includes(selectedPlatform)) return;

      // Cancel request sebelumnya
      if (!isLoadMore) {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
      }

      isLoadMore ? setLoadingMore(true) : setLoading(true);

      try {
        const params = new URLSearchParams({
          lang: locale === "id" ? "id" : "en",
          platform: selectedPlatform,
          sort: selectedSort,
          page: String(currentPage),
          limit: "20",
        });
        if (selectedGenreId !== null) {
          params.set("genre_id", String(selectedGenreId));
        }

        const res = await fetch(`/api/movies/explore?${params}`, {
          signal: isLoadMore ? undefined : abortRef.current?.signal,
        });

        if (!res.ok) throw new Error(`API ${res.status}`);

        const json = await res.json();
        const newMovies: Movie[] = json.movies ?? [];

        setMovies((prev) => {
          if (!isLoadMore) return newMovies;
          const existing = new Set(prev.map((m) => m.id));
          return [...prev, ...newMovies.filter((m) => !existing.has(m.id))];
        });
        setTotalPages(json.totalPages ?? 1);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.error("[Explore] fetch error:", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedPlatform, selectedSort, selectedGenreId, locale],
  );

  // Reset & fetch saat filter berubah
  useEffect(() => {
    setPage(1);
    setMovies([]);
    fetchMovies(1, false);
  }, [fetchMovies]);

  const handleLoadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    fetchMovies(next, true);
  }, [page, fetchMovies]);

  // ── Labels ─────────────────────────────────────────────────────────────────
  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.key === selectedSort)?.[
      locale === "id" ? "labelId" : "labelEn"
    ] ?? "";

  const allPlatformLabel = locale === "id" ? "Semua Platform" : "All Platforms";
  const allGenreLabel = locale === "id" ? "Semua Genre" : "All Genres";

  return (
    <div className="min-h-screen pt-6 pb-24">
      {/* Header */}
      <div className="px-4 lg:px-6 mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
          {locale === "id" ? "Jelajahi" : "Explore"}
        </h1>
      </div>

      {/* ── Platform Tabs ── */}
      <div className="px-4 lg:px-6 mb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {/* "Semua Platform" */}
          <button
            onClick={() => setSelectedPlatform("all")}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              selectedPlatform === "all"
                ? "gradient-primary text-white shadow-lg shadow-primary/20"
                : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
            )}
          >
            {allPlatformLabel}
          </button>

          {/* Platform dari DB */}
          {platforms.map((p) => (
            <button
              key={p.slug}
              onClick={() => setSelectedPlatform(p.slug)}
              className={cn(
                "flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                selectedPlatform === p.slug
                  ? "gradient-primary text-white shadow-lg shadow-primary/20"
                  : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Genre Chips ── */}
      {genres.length > 0 && (
        <div className="px-4 lg:px-6 mb-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            <button
              onClick={() => setSelectedGenreId(null)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                selectedGenreId === null
                  ? "gradient-primary text-white"
                  : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
              )}
            >
              {allGenreLabel}
            </button>
            {genres.map((g) => (
              <button
                key={g.tmdb_genre_id}
                onClick={() =>
                  setSelectedGenreId(
                    g.tmdb_genre_id === selectedGenreId
                      ? null
                      : g.tmdb_genre_id,
                  )
                }
                className={cn(
                  "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                  g.tmdb_genre_id === selectedGenreId
                    ? "gradient-primary text-white"
                    : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
                )}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Sort ── */}
      <div className="px-4 lg:px-6 mb-5">
        <div className="relative inline-block">
          <button
            onClick={() => setSortMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg glass text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span>{currentSortLabel}</span>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform duration-200",
                sortMenuOpen && "rotate-180",
              )}
            />
          </button>

          {sortMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setSortMenuOpen(false)}
              />
              <div className="absolute top-full left-0 mt-2 z-20 min-w-[200px] rounded-xl glass-strong py-1 animate-fade-in">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setSelectedSort(opt.key);
                      setSortMenuOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm transition-colors",
                      selectedSort === opt.key
                        ? "text-primary bg-primary/10 font-medium"
                        : "text-foreground hover:bg-white/5",
                    )}
                  >
                    {locale === "id" ? opt.labelId : opt.labelEn}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Movie Grid ── */}
      <div className="px-4 lg:px-6">
        {loading ? (
          <GridSkeleton />
        ) : movies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="w-20 h-20 rounded-2xl glass-strong flex items-center justify-center mb-4">
              <Clapperboard className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {locale === "id" ? "Tidak ada hasil" : "No results"}
            </h3>
            <p className="text-muted-foreground text-sm text-center max-w-xs">
              {locale === "id"
                ? "Coba ubah filter atau pilih platform lain"
                : "Try changing your filters or selecting another platform"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in">
              {movies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>

            {page < totalPages && (
              <div className="flex justify-center mt-8 mb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className={cn(
                    "flex items-center gap-2 px-8 py-3 rounded-xl font-medium text-sm transition-all",
                    loadingMore
                      ? "glass text-muted-foreground cursor-wait"
                      : "gradient-primary text-white hover:opacity-90 shadow-lg shadow-primary/20",
                  )}
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      {locale === "id" ? "Memuat..." : "Loading..."}
                    </>
                  ) : locale === "id" ? (
                    "Lihat Lebih Banyak"
                  ) : (
                    "Load More"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pt-6 pb-24">
          <div className="px-4 lg:px-6 mb-6">
            <div className="h-8 w-32 rounded-lg bg-white/10 animate-pulse" />
          </div>
          <div className="px-4 lg:px-6">
            <GridSkeleton />
          </div>
        </div>
      }
    >
      <ExploreContent />
    </Suspense>
  );
}
