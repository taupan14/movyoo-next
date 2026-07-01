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
  Clapperboard,
  Flame,
  Bookmark,
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

import NativeBannerAd from "@/components/ads/NativeBannerAd";
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
    // console.log("[HomeClient] Hero movies:", heroMovies);
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
      href: "/articles",
      icon: Clapperboard,
      label: t("nav_articles"),
      color: "from-rose-500 to-red-600",
    },
    {
      href: "/swipe",
      icon: Zap,
      label: "Swipe",
      color: "from-amber-500 to-orange-600",
    },
    {
      href: "/mood",
      icon: Brain,
      label: t("nav_mood"),
      color: "from-emerald-500 to-teal-600",
    },
    {
      href: "/quiz",
      icon: Flame,
      label: "Trivia",
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
        <section className="relative -mt-14 lg:mt-0 overflow-hidden h-[56vw] min-h-[320px] max-h-[520px] lg:h-[72vh] lg:max-h-[680px]">
          {/* Backdrop layers */}
          {heroMovies.map((movie, idx) => (
            <div
              key={movie.id}
              className="absolute inset-0 transition-opacity duration-700"
              style={{ opacity: idx === heroIndex && !isTransitioning ? 1 : 0 }}
            >
              <img
                src={getBackdropUrl(movie.backdrop_path ?? movie.poster_path)}
                alt=""
                className="w-full h-full object-cover object-center"
              />
            </div>
          ))}

          {/* Dark base + editorial grid overlay */}
          <div className="absolute inset-0 bg-[#0a0c14]/70 pointer-events-none" />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Gradient fades: bottom strong, right fade for poster bleed */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent pointer-events-none lg:via-background/20" />

          {/* Content */}
          <div className="relative h-full flex items-end">
            <div
              className={cn(
                "w-full max-w-xl px-4 pb-10 lg:px-10 lg:pb-14 transition-all duration-500",
                isTransitioning
                  ? "opacity-0 translate-y-3"
                  : "opacity-100 translate-y-0",
              )}
            >
              {/* Counter + trending badge */}
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/20 text-primary text-xs font-medium">
                  <TrendingUp className="w-3 h-3" />#{heroIndex + 1}{" "}
                  {t("trending")}
                </span>
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] font-semibold tracking-widest text-white/30">
                  {String(heroIndex + 1).padStart(2, "0")} /{" "}
                  {String(heroMovies.length).padStart(2, "0")}
                </span>
                {/* <span className="text-[10px] font-semibold tracking-wider text-yellow-300 bg-yellow-300/10 border border-yellow-300/25 px-2 py-0.5 rounded">
                  TRENDING
                </span> */}
              </div>

              {/* Title */}
              <h1 className="text-2xl lg:text-4xl font-bold text-white leading-tight mb-2">
                {heroMovie.title}
              </h1>

              {/* Pills: genre, duration, rating */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {heroMovie.vote_average > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/50">
                    <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                    {heroMovie.vote_average.toFixed(1)}
                  </span>
                )}
                {heroMovie.release_date && (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/50">
                    {new Date(heroMovie.release_date).getFullYear()}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {heroMovie.genres?.slice(0, 2).map((genre: string) => (
                    <span
                      key={genre}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/50"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>

              {/* Synopsis */}
              <p className="text-[11.5px] lg:text-sm text-white/45 leading-relaxed line-clamp-2 mb-5 max-w-md">
                {getSynopsis(heroMovie) ||
                  (locale === "id"
                    ? "Klik untuk melihat detail film ini."
                    : "Click to see movie details.")}
              </p>

              {/* CTAs */}
              <div className="flex items-center gap-2">
                <Link
                  href={`/movie/${heroMovie.tmdb_id}`}
                  onClick={startLoader}
                  className="flex items-center gap-2 px-4 py-2 lg:px-5 lg:py-2.5 rounded-lg bg-white text-[#0a0c14] text-xs lg:text-sm font-semibold hover:bg-white/90 transition-opacity whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-[#0a0c14]" />
                  {t("where_to_watch")}
                </Link>
                <button
                  onClick={handleBookmark}
                  disabled={watchlistLoading}
                  aria-label={
                    heroInWatchlist && user ? t("bookmarked") : t("bookmark")
                  }
                  className={cn(
                    "w-9 h-9 lg:w-10 lg:h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/[0.07] text-white/70 transition-all hover:bg-white/10",
                    heroInWatchlist &&
                      user &&
                      "border-primary/50 text-primary bg-primary/10",
                    watchlistLoading && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {watchlistLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : heroInWatchlist && user ? (
                    <BookmarkCheck className="w-4 h-4 fill-primary" />
                  ) : (
                    <Bookmark className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Dot indicators */}
              {heroMovies.length > 1 && (
                <div className="flex items-center gap-1.5 mt-4">
                  {heroMovies.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => goToSlide(idx)}
                      className={cn(
                        "rounded-full transition-all duration-300",
                        idx === heroIndex
                          ? "w-5 h-1 bg-white"
                          : "w-1 h-1 bg-white/25 hover:bg-white/40",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Auth banner */}
          {!user && !authLoading && (
            <AuthBanner
              onSignIn={() => openAuthModal("signin")}
              onSignUp={() => openAuthModal("signup")}
            />
          )}

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary/[0.08]">
            <div
              key={heroIndex}
              className="h-full bg-primary/25 animate-[progress_6s_linear_forwards]"
              style={{ width: "100%" }}
            />
          </div>
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

        <NativeBannerAd className="px-4" />

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
