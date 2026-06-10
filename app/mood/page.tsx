"use client";

/**
 * app/(tabs)/mood/page.tsx
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useI18n } from "@/hooks/use-locale";
import { getPosterUrl } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import {
  Laugh,
  Flashlight,
  Droplets,
  TreePalm as Palmtree,
  Brain,
  Weight,
  ArrowLeft,
  RefreshCw,
  CircleAlert as AlertCircle,
  Heart,
  Bookmark,
  Info,
  Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Movie {
  id: number;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string | null;
  overview?: string;
  popularity?: number;
}

type MoodKey = "ketawa" | "tegang" | "nangis" | "santai" | "mikir" | "berat";

interface MoodOption {
  key: MoodKey;
  icon: React.ElementType;
  colors: string;
  bgGlow: string;
  emoji: string;
  genres: string[];
}

// ─── Mood config ──────────────────────────────────────────────────────────────

const moods: MoodOption[] = [
  {
    key: "ketawa",
    icon: Laugh,
    colors: "from-yellow-400 to-amber-500",
    bgGlow: "bg-yellow-500/20",
    emoji: "😂",
    genres: ["Comedy"],
  },
  {
    key: "tegang",
    icon: Flashlight,
    colors: "from-red-500 to-rose-600",
    bgGlow: "bg-red-500/20",
    emoji: "😰",
    genres: ["Thriller", "Horror", "Action"],
  },
  {
    key: "nangis",
    icon: Droplets,
    colors: "from-blue-400 to-indigo-500",
    bgGlow: "bg-blue-500/20",
    emoji: "😢",
    genres: ["Drama", "Romance"],
  },
  {
    key: "santai",
    icon: Palmtree,
    colors: "from-green-400 to-emerald-500",
    bgGlow: "bg-green-500/20",
    emoji: "😎",
    genres: ["Animation", "Family", "Adventure"],
  },
  {
    key: "mikir",
    icon: Brain,
    colors: "from-cyan-400 to-teal-500",
    bgGlow: "bg-cyan-500/20",
    emoji: "🤔",
    genres: ["Sci-Fi", "Mystery", "Documentary"],
  },
  {
    key: "berat",
    icon: Weight,
    colors: "from-gray-400 to-slate-500",
    bgGlow: "bg-gray-500/20",
    emoji: "🎭",
    genres: ["Drama", "History", "War"],
  },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MovieGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </>
  );
}

// ─── Movie Card ───────────────────────────────────────────────────────────────

interface MovieCardMoodProps {
  movie: Movie;
  isLiked: boolean;
  likedRowId: number | null;
  isBookmarked: boolean;
  bookmarkRowId: number | null;
  onToggleLike: (movie: Movie, likedRowId: number | null) => void;
  onToggleBookmark: (movie: Movie, bookmarkRowId: number | null) => void;
  requireAuth: () => void;
  isLoggedIn: boolean;
  idx: number;
}

function MovieCardMood({
  movie,
  isLiked,
  likedRowId,
  isBookmarked,
  bookmarkRowId,
  onToggleLike,
  onToggleBookmark,
  requireAuth,
  isLoggedIn,
  idx,
}: MovieCardMoodProps) {
  const posterUrl = movie.poster_path
    ? getPosterUrl(movie.poster_path, "w342")
    : null;
  const year = movie.release_date
    ? new Date(movie.release_date).getFullYear()
    : null;
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : null;

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      requireAuth();
      return;
    }
    onToggleLike(movie, likedRowId);
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      requireAuth();
      return;
    }
    onToggleBookmark(movie, bookmarkRowId);
  };

  return (
    <div
      className="group relative animate-slide-up"
      style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "both" }}
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={movie.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            No Image
          </div>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badge */}
        {rating && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5">
            <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            <span className="text-white text-[10px] font-semibold">
              {rating}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={handleLike}
              title={isLiked ? "Hapus dari disukai" : "Suka"}
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95",
                isLiked
                  ? "bg-red-500 text-white shadow-lg shadow-red-500/40"
                  : "bg-white/20 text-white hover:bg-red-500/80",
              )}
            >
              <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
            </button>

            <button
              onClick={handleBookmark}
              title={
                isBookmarked ? "Hapus dari watchlist" : "Tambah ke watchlist"
              }
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95",
                isBookmarked
                  ? "bg-primary text-white shadow-lg shadow-primary/40"
                  : "bg-white/20 text-white hover:bg-primary/80",
              )}
            >
              <Bookmark
                className={cn("w-4 h-4", isBookmarked && "fill-current")}
              />
            </button>
          </div>

          <Link
            href={`/movie/${movie.tmdb_id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-white/20 backdrop-blur-md text-white hover:bg-white/40 transition-all duration-200 active:scale-95 text-xs font-medium"
          >
            <Info className="w-3.5 h-3.5" />
            Detail
          </Link>
        </div>
      </div>

      <div className="mt-2 px-0.5">
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-1 group-hover:text-primary transition-colors">
          {movie.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {year && (
            <span className="text-xs text-muted-foreground">{year}</span>
          )}
          {year && movie.genres?.[0] && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          )}
          {movie.genres?.[0] && (
            <span className="text-xs text-muted-foreground">
              {movie.genres[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MoodPage() {
  const { t, locale, region } = useI18n();
  const { user, openAuthModal } = useAuth();
  const isLoggedIn = !!user;

  const [selectedMood, setSelectedMood] = useState<MoodKey | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * likedMap:    movie.id (DB) → user_liked.id      (row id untuk DELETE)
   * bookmarkMap: movie.id (DB) → user_watchlist.id  (row id untuk DELETE)
   */
  const [likedMap, setLikedMap] = useState<Map<number, number>>(new Map());
  const [bookmarkMap, setBookmarkMap] = useState<Map<number, number>>(
    new Map(),
  );
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const lang = locale === "id" ? "id" : "en";

  // ── Fetch status like & bookmark untuk batch movies ───────────────────────
  const fetchStatuses = useCallback(
    async (movieList: Movie[]) => {
      if (!isLoggedIn || !movieList.length) return;

      // Validasi: pastikan semua id valid sebelum fetch
      const validMovies = movieList.filter(
        (m) => typeof m.id === "number" && m.id > 0,
      );
      if (!validMovies.length) return;

      const movieDbIds = new Set(validMovies.map((m) => m.id));

      try {
        const [likeRes, bmRes] = await Promise.allSettled([
          fetch("/api/liked?media_type=movie"),
          fetch("/api/watchlist?media_type=movie"),
        ]);

        if (likeRes.status === "fulfilled" && likeRes.value.ok) {
          const items: Array<{ id: number; movie_id: number | null }> =
            await likeRes.value.json();
          setLikedMap((prev) => {
            const next = new Map(prev);
            items
              .filter((r) => r.movie_id !== null && movieDbIds.has(r.movie_id!))
              .forEach((r) => next.set(r.movie_id!, r.id));
            return next;
          });
        }

        if (bmRes.status === "fulfilled" && bmRes.value.ok) {
          const items: Array<{ id: number; movie_id: number | null }> =
            await bmRes.value.json();
          setBookmarkMap((prev) => {
            const next = new Map(prev);
            items
              .filter((r) => r.movie_id !== null && movieDbIds.has(r.movie_id!))
              .forEach((r) => next.set(r.movie_id!, r.id));
            return next;
          });
        }
      } catch (err) {
        console.error("[mood] fetchStatuses error:", err);
      }
    },
    [isLoggedIn],
  );

  // ── Simpan mood history (fire-and-forget, tidak blocking) ─────────────────
  const saveMoodHistory = useCallback((mood: MoodKey) => {
    fetch("/api/movies/mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood }),
    }).catch(() => {});
  }, []);

  // ── Load movies dari /api/movies/mood ─────────────────────────────────────
  const loadMovies = useCallback(
    async (mood: MoodKey, pageNum: number, append = false) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams({
          mood,
          lang,
          region: region ?? "ID",
          page: String(pageNum),
          limit: "20",
        });

        const res = await fetch(`/api/movies/mood?${params}`);

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();

        // Guard: pastikan data.movies adalah array yang valid
        const newMovies: Movie[] = (data.movies ?? []).filter(
          (m: any) =>
            m &&
            typeof m.id === "number" &&
            m.id > 0 &&
            typeof m.tmdb_id === "number" &&
            m.tmdb_id > 0,
        );

        setTotalPages(data.totalPages ?? 1);
        setPage(pageNum);

        if (append) {
          setMovies((prev) => {
            fetchStatuses(newMovies);
            return [...prev, ...newMovies];
          });
        } else {
          setMovies(newMovies);
          fetchStatuses(newMovies);
        }
      } catch (err: any) {
        console.error("[mood] loadMovies:", err);
        setError(
          locale === "id"
            ? "Gagal memuat film. Silakan coba lagi."
            : "Failed to load movies. Please try again.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [lang, region, locale, fetchStatuses],
  );

  // ── Mood click ────────────────────────────────────────────────────────────
  const handleMoodClick = useCallback(
    (mood: MoodKey) => {
      setSelectedMood(mood);
      setMovies([]);
      setPage(1);
      setTotalPages(1);
      setLikedMap(new Map());
      setBookmarkMap(new Map());
      setError(null);
      loadMovies(mood, 1, false);
      saveMoodHistory(mood);
    },
    [loadMovies, saveMoodHistory],
  );

  const handleBack = () => {
    setSelectedMood(null);
    setMovies([]);
    setError(null);
    setPage(1);
    setTotalPages(1);
  };

  // ── Infinite scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedMood) return;
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loadingMore &&
          !loading &&
          page < totalPages
        ) {
          loadMovies(selectedMood, page + 1, true);
        }
      },
      { rootMargin: "300px" },
    );

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [selectedMood, loadingMore, loading, page, totalPages, loadMovies]);

  // ── Toggle Like ───────────────────────────────────────────────────────────
  const handleToggleLike = useCallback(
    async (movie: Movie, likedRowId: number | null) => {
      const key = `like-${movie.id}`;
      if (pendingIds.has(key)) return;
      setPendingIds((p) => new Set(p).add(key));

      const wasLiked = likedRowId !== null && likedRowId > 0;

      // Optimistic update
      setLikedMap((prev) => {
        const next = new Map(prev);
        if (wasLiked) next.delete(movie.id);
        else next.set(movie.id, -1); // placeholder
        return next;
      });

      try {
        if (wasLiked) {
          const res = await fetch(`/api/liked?id=${likedRowId}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("delete failed");
          setLikedMap((prev) => {
            const n = new Map(prev);
            n.delete(movie.id);
            return n;
          });
        } else {
          const res = await fetch("/api/liked", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ media_type: "movie", movie_id: movie.id }),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error ?? "insert failed");
          }
          const row = await res.json();
          setLikedMap((prev) => new Map(prev).set(movie.id, row.id));
        }
      } catch (err) {
        console.error("[mood] toggleLike error:", err);
        // Rollback
        setLikedMap((prev) => {
          const n = new Map(prev);
          if (wasLiked) n.set(movie.id, likedRowId!);
          else n.delete(movie.id);
          return n;
        });
      } finally {
        setPendingIds((p) => {
          const n = new Set(p);
          n.delete(key);
          return n;
        });
      }
    },
    [pendingIds],
  );

  // ── Toggle Bookmark ───────────────────────────────────────────────────────
  const handleToggleBookmark = useCallback(
    async (movie: Movie, bookmarkRowId: number | null) => {
      const key = `bm-${movie.id}`;
      if (pendingIds.has(key)) return;
      setPendingIds((p) => new Set(p).add(key));

      const wasBookmarked = bookmarkRowId !== null && bookmarkRowId > 0;

      setBookmarkMap((prev) => {
        const next = new Map(prev);
        if (wasBookmarked) next.delete(movie.id);
        else next.set(movie.id, -1);
        return next;
      });

      try {
        if (wasBookmarked) {
          const res = await fetch(`/api/watchlist?id=${bookmarkRowId}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("delete failed");
          setBookmarkMap((prev) => {
            const n = new Map(prev);
            n.delete(movie.id);
            return n;
          });
        } else {
          const res = await fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              media_type: "movie",
              movie_id: movie.id,
              status: "want_to_watch",
            }),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error ?? "insert failed");
          }
          const row = await res.json();
          setBookmarkMap((prev) => new Map(prev).set(movie.id, row.id));
        }
      } catch (err) {
        console.error("[mood] toggleBookmark error:", err);
        setBookmarkMap((prev) => {
          const n = new Map(prev);
          if (wasBookmarked) n.set(movie.id, bookmarkRowId!);
          else n.delete(movie.id);
          return n;
        });
      } finally {
        setPendingIds((p) => {
          const n = new Set(p);
          n.delete(key);
          return n;
        });
      }
    },
    [pendingIds],
  );

  const requireAuth = useCallback(
    () => openAuthModal("signin"),
    [openAuthModal],
  );

  const selectedMoodData = moods.find((m) => m.key === selectedMood);
  const hasMore = page < totalPages;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="sticky top-0 z-30 glass-strong">
        <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
          {selectedMood && (
            <button
              onClick={handleBack}
              className="flex items-center justify-center w-9 h-9 rounded-xl glass hover:bg-white/10 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">
              {selectedMood
                ? `${selectedMoodData?.emoji} ${t(`mood_${selectedMood}` as `mood_${MoodKey}`)}`
                : t("mood_label")}
            </h1>
          </div>
          {selectedMood && !loading && movies.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-1 shrink-0">
              {movies.length} film
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-0 lg:px-2">
        {!selectedMood ? (
          /* ── Mood Selection ── */
          <div className="animate-fade-in px-4 lg:px-6 pt-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl lg:text-4xl font-bold text-gradient mb-3">
                {t("mood_label")}
              </h2>
              <p className="text-muted-foreground text-sm lg:text-base max-w-md mx-auto">
                {locale === "id"
                  ? "Pilih mood kamu, kami cariin film yang pas!"
                  : "Pick your mood, we'll find the perfect movie!"}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
              {moods.map((mood, idx) => (
                <button
                  key={mood.key}
                  onClick={() => handleMoodClick(mood.key)}
                  className="group relative flex flex-col items-center gap-3 p-6 rounded-2xl glass hover-lift card-shine transition-all duration-300 overflow-hidden animate-slide-up"
                  style={{
                    animationDelay: `${idx * 80}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <div
                    className={cn(
                      "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                      mood.bgGlow,
                    )}
                  />
                  <div
                    className={cn(
                      "relative w-16 h-16 lg:w-20 lg:h-20 rounded-2xl bg-gradient-to-br flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg",
                      mood.colors,
                    )}
                  >
                    <mood.icon className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
                  </div>
                  <span className="relative text-sm lg:text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                    {t(`mood_${mood.key}` as `mood_${MoodKey}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Movie Results ── */
          <div className="pt-4 animate-fade-in">
            {/* Active mood banner + genre badges */}
            <div className="px-4 lg:px-6 mb-6 space-y-3">
              <div
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r text-white font-medium text-sm",
                  selectedMoodData?.colors,
                )}
              >
                <span>{selectedMoodData?.emoji}</span>
                <span>{t(`mood_${selectedMood}` as `mood_${MoodKey}`)}</span>
              </div>
              {selectedMoodData && (
                <div className="flex flex-wrap gap-2">
                  {selectedMoodData.genres.map((genre) => (
                    <span
                      key={genre}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && !loading && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <p className="text-muted-foreground text-sm mb-4 text-center">
                  {error}
                </p>
                <button
                  onClick={() => loadMovies(selectedMood, 1, false)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="w-4 h-4" />
                  {locale === "id" ? "Coba Lagi" : "Try Again"}
                </button>
              </div>
            )}

            {/* Empty */}
            {!loading && !error && movies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="text-5xl mb-4">🎬</div>
                <p className="text-muted-foreground text-sm text-center">
                  {locale === "id"
                    ? "Belum ada film untuk mood ini. Coba mood lain!"
                    : "No movies for this mood yet. Try another mood!"}
                </p>
                <button
                  onClick={handleBack}
                  className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl glass text-foreground font-medium text-sm hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {locale === "id" ? "Pilih Mood Lain" : "Pick Another Mood"}
                </button>
              </div>
            )}

            {/* Grid */}
            {!error && (movies.length > 0 || loading) && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 px-4 lg:px-6">
                {movies.map((movie, idx) => (
                  <MovieCardMood
                    key={movie.id}
                    movie={movie}
                    isLiked={likedMap.has(movie.id)}
                    likedRowId={likedMap.get(movie.id) ?? null}
                    isBookmarked={bookmarkMap.has(movie.id)}
                    bookmarkRowId={bookmarkMap.get(movie.id) ?? null}
                    onToggleLike={handleToggleLike}
                    onToggleBookmark={handleToggleBookmark}
                    requireAuth={requireAuth}
                    isLoggedIn={isLoggedIn}
                    idx={idx % 20}
                  />
                ))}
                {loading && <MovieGridSkeleton count={10} />}
              </div>
            )}

            {/* Load-more skeletons */}
            {loadingMore && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 px-4 lg:px-6 mt-4">
                <MovieGridSkeleton count={5} />
              </div>
            )}

            {/* Sentinel */}
            {hasMore && !loading && !error && (
              <div
                ref={sentinelRef}
                className="h-12 w-full mt-4"
                aria-hidden="true"
              />
            )}

            {/* End of list */}
            {!hasMore && !loading && !loadingMore && movies.length > 0 && (
              <p className="text-center text-muted-foreground text-sm py-10">
                {locale === "id"
                  ? `Semua ${movies.length} film sudah ditampilkan`
                  : `All ${movies.length} movies shown`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
