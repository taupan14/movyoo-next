"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/hooks/use-locale";
import { getBackdropUrl } from "@/lib/tmdb";
import { MovieCard, MovieRow } from "@/components/movie-card";
import { SectionHeader } from "@/components/section-header";
import {
  Play,
  TrendingUp,
  Star,
  Zap,
  Brain,
  Swords,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Heart,
} from "lucide-react";
import Link from "next/link";

interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  genre_ids?: number[];
  popularity?: number;
  overview?: string;
  overview_id?: string;
  overview_alt?: string;
}

interface HomeData {
  trending: Movie[];
  nowPlaying: Movie[];
  upcoming: Movie[];
  popular: Movie[];
  indonesianMovies: Movie[];
  netflixTrending: Movie[];
  disneyTrending: Movie[];
}

const EMPTY_HOME_DATA: HomeData = {
  trending: [],
  nowPlaying: [],
  upcoming: [],
  popular: [],
  indonesianMovies: [],
  netflixTrending: [],
  disneyTrending: [],
};

// ─── Skeleton Components ──────────────────────────────────────────────────────
function HeroSkeleton() {
  return (
    <section className="relative h-[70vh] lg:h-[80vh] -mt-14 lg:mt-0 overflow-hidden bg-card/50 animate-pulse">
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="relative h-full flex items-end pb-12 lg:pb-16 px-4 lg:px-8">
        <div className="max-w-2xl w-full space-y-3">
          <div className="h-4 w-24 rounded-md bg-white/10" />
          <div className="h-10 w-3/4 rounded-lg bg-white/10" />
          <div className="h-4 w-full rounded-md bg-white/10" />
          <div className="h-4 w-2/3 rounded-md bg-white/10" />
          <div className="flex gap-3 mt-6">
            <div className="h-12 w-36 rounded-xl bg-white/10" />
            <div className="h-12 w-28 rounded-xl bg-white/10" />
          </div>
        </div>
      </div>
    </section>
  );
}

function RowSkeleton() {
  return (
    <section className="mb-8">
      <div className="h-5 w-40 rounded-md bg-white/10 mx-4 lg:mx-6 mb-3 animate-pulse" />
      <div className="flex gap-3 overflow-hidden px-4 lg:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-[140px] lg:w-[160px] flex-shrink-0 aspect-[2/3] rounded-xl bg-white/10 animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export function HomeClient() {
  const { t, locale, region } = useI18n();
  const [data, setData] = useState<HomeData>(EMPTY_HOME_DATA);
  const [loading, setLoading] = useState(true);

  // Hero slider state
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

  const prevSlide = () =>
    goToSlide((heroIndex - 1 + heroMovies.length) % heroMovies.length);
  const nextSlide = () => goToSlide((heroIndex + 1) % heroMovies.length);

  // ─── DATA FETCHING ────────────────────────────────────────────────────────
  // FIX 1: AbortController mencegah race condition saat bahasa diganti cepat.
  // FIX 2: setData hanya dipanggil jika request ini belum di-abort (locale masih sama).
  // FIX 3: Loading skeleton ditampilkan di atas konten (bukan di bawah), sehingga
  //         film lama tidak "hilang" lalu muncul lagi — langsung ke skeleton → data baru.
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      // Reset data agar skeleton muncul saat ganti bahasa
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

        // console.log("[HomeClient] fetched data:", json);
        setData(json);
      } catch (e) {
        // Abaikan error jika disebabkan oleh abort (ganti bahasa)
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("[HomeClient] fetch error:", e);
      } finally {
        // Hanya set loading=false jika request ini tidak di-abort
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();

    // Cleanup: batalkan request sebelumnya saat locale/region berubah
    return () => controller.abort();
  }, [locale, region]);
  // ─────────────────────────────────────────────────────────────────────────

  const heroMovie = heroMovies[heroIndex];

  const getSynopsis = (movie: Movie | undefined): string => {
    if (!movie) return "";
    if (locale === "id") {
      return movie.overview || movie.overview_alt || movie.overview_id || "";
    }
    return movie.overview || movie.overview_alt || "";
  };

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
      href: "/coming-soon",
      icon: CalendarClock,
      label: t("nav_coming_soon"),
      color: "from-sky-500 to-blue-600",
    },
  ];

  const {
    nowPlaying,
    upcoming,
    popular,
    indonesianMovies,
    netflixTrending,
    disneyTrending,
  } = data;

  // ─── FIX 3: Tampilkan skeleton saat loading, bukan spinner di bawah ───────
  if (loading) {
    return (
      <div className="min-h-screen">
        <HeroSkeleton />
        <div className="px-0 lg:px-2 py-6 lg:py-8">
          {/* Quick Actions skeleton */}
          <section className="mb-8 px-4 lg:px-6">
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl glass animate-pulse"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/10" />
                  <div className="h-3 w-14 rounded bg-white/10" />
                </div>
              ))}
            </div>
          </section>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* Hero Slider */}
      {heroMovie && (
        <section className="relative h-[70vh] lg:h-[80vh] -mt-14 lg:mt-0 overflow-hidden">
          {/* Background images - all preloaded */}
          {heroMovies.map((movie, idx) => (
            <div
              key={movie.id}
              className="absolute inset-0 transition-opacity duration-700"
              style={{ opacity: idx === heroIndex && !isTransitioning ? 1 : 0 }}
            >
              <img
                src={getBackdropUrl(movie.backdrop_path)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ))}

          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent pointer-events-none" />

          {/* Content */}
          <div className="relative h-full flex items-end pb-12 lg:pb-16 px-4 lg:px-8">
            <div
              className={`max-w-2xl transition-all duration-500 ${isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}
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
                  className="flex items-center gap-2 px-6 py-3 rounded-xl gradient-primary text-white font-medium hover:opacity-90 transition-opacity"
                >
                  <Play className="w-4 h-4 fill-white" />
                  {t("where_to_watch")}
                </Link>
                <Link
                  href={`#`}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl glass text-white font-medium hover:bg-white/10 transition-colors"
                >
                  <Heart className="w-4 h-4 fill-white" />
                  {t("bookmark")}
                </Link>
              </div>
            </div>
          </div>

          {/* Slider Controls */}
          {heroMovies.length > 1 && (
            <>
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
            </>
          )}
        </section>
      )}

      <div className="px-0 lg:px-2 py-6 lg:py-8">
        {/* Quick Actions */}
        <section className="mb-8 px-4 lg:px-6">
          <div className="grid grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
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

        {indonesianMovies.length > 0 && (
          <MovieRow
            title={locale === "id" ? "Film Indonesia" : "Indonesian Movies"}
            movies={indonesianMovies}
          />
        )}

        <MovieRow title={t("trending")} movies={data.trending} />

        <MovieRow
          title={t("cinema_now_playing")}
          movies={nowPlaying}
          variant="backdrop"
        />

        {netflixTrending.length > 0 && (
          <section className="mb-8">
            <SectionHeader
              title={t("trending_netflix")}
              href="/explore?platform=netflix"
            />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-2">
              {netflixTrending.map((movie) => (
                <div
                  key={movie.id}
                  className="w-[140px] lg:w-[160px] flex-shrink-0"
                >
                  <MovieCard movie={movie} />
                </div>
              ))}
            </div>
          </section>
        )}

        {disneyTrending.length > 0 && (
          <section className="mb-8">
            <SectionHeader
              title={t("trending_disney")}
              href="/explore?platform=disney+"
            />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-2">
              {disneyTrending.map((movie) => (
                <div
                  key={movie.id}
                  className="w-[140px] lg:w-[160px] flex-shrink-0"
                >
                  <MovieCard movie={movie} />
                </div>
              ))}
            </div>
          </section>
        )}

        <MovieRow title={t("popular")} movies={popular} />

        <MovieRow
          title={t("coming_soon")}
          movies={upcoming}
          variant="backdrop"
        />
      </div>
    </div>
  );
}
