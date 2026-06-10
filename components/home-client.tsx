"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/hooks/use-locale";
import { useAuth } from "@/hooks/use-auth";
import { getBackdropUrl } from "@/lib/tmdb";
import { MovieCard, MovieRow } from "@/components/movie-card";
import { SeriesRow } from "@/components/series-card";
import { SectionHeaderHome } from "@/components/section-header";
import { cn } from "@/lib/utils";
import {
  Play,
  TrendingUp,
  Star,
  Zap,
  Brain,
  Swords,
  Flame,
  BookmarkPlus,
  BookmarkCheck,
  Loader2,
} from "lucide-react";
import Link from "next/link";

import { startLoader } from "@/components/page-loader";
import type { HomeData } from "@/types/home";
import { EMPTY_HOME_DATA } from "@/types/constants";
import { useWatchlistStatus } from "@/hooks/use-watchlist-status";
import {
  HeroSkeleton,
  RowSkeleton,
  TrendingRowSkeleton,
  CastRowSkeleton,
  QuickActionsSkeleton,
} from "./skeletons";
import { TrendingMovieRow, TrendingSeriesRow } from "./home/trending-card";
import { PopularCastSection } from "./home/popular-cast-section";
import { AuthBanner } from "./auth/auth-banner";
import { FilmFestivalSection } from "./home/festival-section";
import { HiddenGemsSection } from "./hidden-gems-section";
import { AICuratorSection, type PosterMap } from "./ai-curator-section";

// ─── Main HomeClient Component ────────────────────────────────────────────────

export function HomeClient() {
  const { t, locale, region } = useI18n();

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const { user, loading: authLoading, openAuthModal } = useAuth();

  // ── Toast feedback ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "info" | "error";
  } | null>(null);

  const showToast = useCallback(
    (msg: string, type: "success" | "info" | "error" = "success") => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 2800);
    },
    [],
  );

  // Tampilkan modal sign-in saat pertama kali buka home (hanya jika belum login)
  const modalShown = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    if (modalShown.current) return;
    modalShown.current = true;
    const timer = setTimeout(() => openAuthModal("signin"), 1200);
    return () => clearTimeout(timer);
  }, [authLoading, user, openAuthModal]);

  // ── Data fetching ─────────────────────────────────────────────────────────────
  const [data, setData] = useState<HomeData>(EMPTY_HOME_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setData(EMPTY_HOME_DATA);
      setHeroIndex(0);

      try {
        const lang = locale === "id" ? "id" : "en";
        const params = new URLSearchParams({ lang, region });
        const res = await fetch(`/api/movies/home?${params}`, {
          signal: controller.signal,
          next: { revalidate: 60 },
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json: HomeData = await res.json();
        // console.log("[HomeClient] Fetched data:", json);
        setData(json);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("[HomeClient] fetch error:", e);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [locale, region]);

  const [gemPosterMap, setGemPosterMap] = useState<PosterMap>({});
  const handleGemsLoaded = useCallback(
    (
      movies: Array<{
        tmdb_id: number;
        title: string;
        poster_path: string | null;
      }>,
      series: Array<{
        tmdb_id: number;
        title: string;
        poster_path: string | null;
      }>,
    ) => {
      const map: PosterMap = {};
      for (const m of movies) {
        map[m.tmdb_id] = {
          poster_path: m.poster_path,
          title: m.title,
          media_type: "movie",
        };
      }
      for (const s of series) {
        map[s.tmdb_id] = {
          poster_path: s.poster_path,
          title: s.title,
          media_type: "tv",
        };
      }
      setGemPosterMap(map);
    },
    [],
  );

  // ── Hero slider ───────────────────────────────────────────────────────────────
  const [heroIndex, setHeroIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heroMovies = data.trending.slice(0, 5);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setHeroIndex((prev) => (prev + 1) % heroMovies.length);
        setIsTransitioning(false);
      }, 400);
    }, 6000);
  }, [heroMovies.length]);

  useEffect(() => {
    if (heroMovies.length > 1) startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [heroMovies.length, startTimer]);

  const goToSlide = (index: number) => {
    if (index === heroIndex) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setHeroIndex(index);
      setIsTransitioning(false);
    }, 400);
    startTimer();
  };

  const heroMovie = heroMovies[heroIndex];

  // ── Watchlist (hero) ──────────────────────────────────────────────────────────
  const {
    inWatchlist: heroInWatchlist,
    loading: watchlistLoading,
    toggle: toggleHeroWatchlist,
  } = useWatchlistStatus(user ? heroMovie?.id : undefined);

  const getSynopsis = (movie: HomeData["trending"][number] | undefined) => {
    if (!movie) return "";
    if (locale === "id")
      return movie.overview || movie.overview_alt || movie.overview_id || "";
    return movie.overview || movie.overview_alt || "";
  };

  const handleBookmark = useCallback(async () => {
    if (!user) {
      openAuthModal("signin");
      return;
    }
    if (!heroMovie) return;
    const result = await toggleHeroWatchlist({
      id: heroMovie.id,
      title: heroMovie.title,
      poster_path: heroMovie.poster_path,
      vote_average: heroMovie.vote_average,
      release_date: heroMovie.release_date,
    });
    if (result === "added") showToast("Ditambahkan ke Watchlist ✓", "success");
    else if (result === "removed") showToast("Dihapus dari Watchlist", "info");
    else showToast("Gagal, coba lagi", "error");
  }, [user, heroMovie, toggleHeroWatchlist, openAuthModal, showToast]);

  // ── Quick actions ─────────────────────────────────────────────────────────────
  const quickActions = [
    {
      href: "/mood",
      icon: Brain,
      label: t("nav_mood"),
      color: "from-emerald-500 to-teal-600",
    },
    {
      href: "/swipe",
      icon: Zap,
      label: t("nav_swipe"),
      color: "from-amber-500 to-orange-600",
    },
    {
      href: "/battle",
      icon: Swords,
      label: t("nav_battle"),
      color: "from-rose-500 to-red-600",
    },
    {
      href: "/quiz",
      icon: Flame,
      label: t("nav_quiz"),
      color: "from-sky-500 to-blue-600",
    },
  ];

  const {
    nowPlaying,
    upcoming,
    bestSeller,
    indonesianMovies,
    indonesianPopularMovies,
    onAirSeries,
    popularSeries,
    trendingSeries,
    popularCast,
  } = data;

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen">
        <HeroSkeleton />
        <div className="px-0 lg:px-2 py-6 lg:py-8">
          <QuickActionsSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <TrendingRowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <CastRowSkeleton />
          <RowSkeleton />
          <TrendingRowSkeleton />
          <TrendingRowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* ── Hero Slider ───────────────────────────────────────────────────────── */}
      {heroMovie && (
        <section className="relative h-[70vh] lg:h-[80vh] -mt-14 lg:mt-0 overflow-hidden">
          {heroMovies.map((movie, idx) => (
            <div
              key={movie.id}
              className="absolute inset-0 transition-opacity duration-700"
              style={{ opacity: idx === heroIndex && !isTransitioning ? 1 : 0 }}
            >
              <img
                src={getBackdropUrl(movie.backdrop_path ?? movie.poster_path)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ))}

          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent pointer-events-none" />

          <div className="relative h-full flex items-end pb-12 lg:pb-16 px-4 lg:px-8">
            <div
              className={`max-w-2xl transition-all duration-500 ${
                isTransitioning
                  ? "opacity-0 translate-y-4"
                  : "opacity-100 translate-y-0"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/20 text-primary text-xs font-medium">
                  <TrendingUp className="w-3 h-3" />#{heroIndex + 1}{" "}
                  {t("trending")}
                </span>
                {heroMovie.vote_average > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                    <Star className="w-3 h-3 fill-yellow-400" />
                    {heroMovie.vote_average.toFixed(1)}
                  </span>
                )}
              </div>
              <h1 className="text-3xl lg:text-5xl font-bold text-white mb-3 leading-tight">
                {heroMovie.title}
              </h1>
              <p className="text-white/70 text-sm lg:text-base line-clamp-3 mb-6 max-w-lg">
                {getSynopsis(heroMovie) ||
                  (locale === "id"
                    ? "Klik untuk melihat detail film ini."
                    : "Click to see movie details.")}
              </p>
              <div className="flex items-center gap-3">
                <Link
                  href={`/movie/${heroMovie.tmdb_id}`}
                  onClick={startLoader}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl gradient-primary text-white font-medium hover:opacity-90 transition-opacity"
                >
                  <Play className="w-4 h-4 fill-white" />
                  {t("where_to_watch")}
                </Link>
                <button
                  onClick={handleBookmark}
                  disabled={watchlistLoading}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all",
                    heroInWatchlist && user
                      ? "border border-primary/40 text-primary hover:bg-primary/30"
                      : "glass text-white hover:bg-white/10",
                    watchlistLoading && "opacity-70 cursor-not-allowed",
                  )}
                >
                  {watchlistLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : heroInWatchlist && user ? (
                    <BookmarkCheck className="w-4 h-4 fill-primary" />
                  ) : (
                    <BookmarkPlus className="w-4 h-4" />
                  )}
                  {heroInWatchlist && user ? t("bookmarked") : t("bookmark")}
                </button>
              </div>
            </div>
          </div>

          {/* Auth banner */}
          {!user && !authLoading && (
            <AuthBanner
              onSignIn={() => openAuthModal("signin")}
              onSignUp={() => openAuthModal("signup")}
            />
          )}

          {/* Dot indicators */}
          {heroMovies.length > 1 && (
            <div className="absolute bottom-4 lg:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
              {heroMovies.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goToSlide(idx)}
                  className={`transition-all duration-300 rounded-full ${
                    idx === heroIndex
                      ? "w-8 h-2 bg-primary"
                      : "w-2 h-2 bg-white/40 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="px-0 lg:px-2 py-6 lg:py-8">
        {/* ── Quick Actions ──────────────────────────────────────────────────── */}
        <section className="mb-8 px-4 lg:px-6">
          <div className="grid grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                onClick={startLoader}
                className="flex flex-col items-center gap-2 p-4 rounded-xl glass hover-lift group"
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center group-hover:scale-110 transition-transform`}
                >
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs font-medium text-foreground">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Film Indonesia ─────────────────────────────────────────────────── */}
        {indonesianMovies.length > 0 && (
          <MovieRow
            title={
              locale === "id"
                ? "Film Indonesia Terbaru"
                : "Latest Indonesian Movies"
            }
            path="/explore?tab=movie&sort=release_date&lang_filter=id"
            pathTitle={locale === "id" ? "Lihat semua" : "See all"}
            movies={indonesianMovies}
          />
        )}

        {/* ── Film Indonesia Popular ─────────────────────────────────────────── */}
        {indonesianPopularMovies.length > 0 && (
          <MovieRow
            title={
              locale === "id"
                ? "Film Indonesia Terpopuler"
                : "Popular Indonesian Movies"
            }
            path="/explore?tab=movie&sort=popular&lang_filter=id"
            pathTitle={locale === "id" ? "Lihat semua" : "See all"}
            movies={indonesianPopularMovies}
          />
        )}

        {/* ── Trending Movies ────────────────────────────────────────────────── */}
        <TrendingMovieRow
          title={locale === "id" ? "Film Trending Saat Ini" : "Trending Movies"}
          movies={data.trending}
        />

        {/* ── Film Best Seller ───────────────────────────────────────────────── */}
        <MovieRow
          title={
            locale === "id"
              ? "Film Yang Mungkin Kamu Suka"
              : "Movies You Might Like"
          }
          movies={bestSeller}
        />

        <HiddenGemsSection locale={locale} onGemsLoaded={handleGemsLoaded} />
        {/* <AICuratorSection locale={locale} posterMap={gemPosterMap} /> */}

        {/* ── Sedang Tayang di Bioskop ───────────────────────────────────────── */}
        <MovieRow
          title={t("cinema_now_playing")}
          movies={nowPlaying}
          variant="backdrop"
        />

        {/* ── Segera Tayang ──────────────────────────────────────────────────── */}
        <MovieRow title={t("coming_soon")} movies={upcoming} />

        {/* ── Trending TV Series ─────────────────────────────────────────────── */}
        <TrendingSeriesRow
          title={locale === "id" ? "TV Series Trending" : "Trending TV Series"}
          series={trendingSeries}
        />

        {/* ── TV Series Sedang Tayang ────────────────────────────────────────── */}
        {onAirSeries.length > 0 && (
          <SeriesRow
            title={
              locale === "id"
                ? "TV Series Sedang Tayang"
                : "On the Air TV Series"
            }
            path="/explore?tab=tv&sort=on_the_air&lang=id"
            pathTitle={locale === "id" ? "Lihat semua" : "See all"}
            series={onAirSeries}
          />
        )}

        {/* ── TV Series Populer ──────────────────────────────────────────────── */}
        <SeriesRow
          title={locale === "id" ? "TV Series Terpopuler" : "Popular TV Series"}
          path="/explore?tab=tv&sort=popular&lang=id"
          pathTitle={locale === "id" ? "Lihat semua" : "See all"}
          series={popularSeries}
        />

        {/* ── Pemeran Terpopuler ─────────────────────────────────────────────── */}
        <PopularCastSection cast={popularCast} locale={locale} />

        {/* ── Festival Film ──────────────────────────────────────────────────── */}
        <FilmFestivalSection locale={locale} />
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-lg transition-all",
            toast.type === "success" && "bg-green-500/90 text-white",
            toast.type === "info" && "bg-blue-500/90 text-white",
            toast.type === "error" && "bg-red-500/90 text-white",
          )}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
