"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-locale";
import {
  getPosterUrl,
  getBackdropUrl,
  getLogoUrl,
  getProfileUrl,
} from "@/lib/tmdb"; // hanya URL helpers, tidak ada fetch TMDB
import { MovieCard } from "@/components/movie-card";
import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Star,
  Clock,
  Calendar,
  Heart,
  Bell,
  BellRing,
  ChevronLeft,
  Play,
  Ticket,
  Tv,
  ShoppingCart,
  Zap,
  Eye,
  TrendingUp,
  MessageCircle,
  CircleCheck as CheckCircle2,
  Circle as XCircle,
  Sparkles,
  Gauge,
  Film,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Genre {
  id: number;
  name: string;
}

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

interface DisplayProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  status: "now" | "coming" | "leaving";
  leavingDays?: number;
}

interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface ProviderResult {
  link?: string;
  flatrate?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
}

interface WatchProviders {
  results?: Record<string, ProviderResult>;
}

interface MovieData {
  id: number;
  title: string;
  tagline: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  runtime: number;
  genres: Genre[];
  release_date: string;
  popularity: number;
  budget: number;
  revenue: number;
  credits?: { cast?: CastMember[] };
  "watch/providers"?: WatchProviders;
  similar?: { results?: MovieData[] };
  mood_tags?: string[];
  pace?: "slow" | "medium" | "fast";
  worth_it?: "yes" | "skip" | "fan";
}

interface RecommendationMovie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  genre_ids?: number[];
  popularity?: number;
  overview?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const WATCHLIST_KEY = "movyoo-watchlist";
const REMINDERS_KEY = "movyoo-reminders";

function getStoredList(key: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredList(key: string, ids: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* quota exceeded or private mode */
  }
}

function formatRuntime(mins: number): string {
  if (!mins) return "--";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatReleaseDate(date: string): string {
  if (!date) return "--";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

const INDONESIA_CINEMAS = [
  {
    name: "Cinema XXI",
    cities: [
      "Jakarta",
      "Bandung",
      "Surabaya",
      "Medan",
      "Semarang",
      "Makassar",
      "Yogyakarta",
      "Bali",
      "Malang",
      "Palembang",
      "Tangerang",
      "Bekasi",
      "Bogor",
      "Depok",
    ],
    status: "now" as const,
  },
  {
    name: "CGV",
    cities: [
      "Jakarta",
      "Bandung",
      "Surabaya",
      "Tangerang",
      "Yogyakarta",
      "Bekasi",
      "Cirebon",
      "Karawang",
      "Palembang",
      "Batam",
      "Balikpapan",
      "Makassar",
      "Malang",
    ],
    status: "now" as const,
  },
  {
    name: "Cinépolis",
    cities: [
      "Jakarta",
      "Bandung",
      "Surabaya",
      "Semarang",
      "Medan",
      "Makassar",
      "Palembang",
    ],
    status: "now" as const,
  },
  {
    name: "IMAX",
    cities: ["Jakarta", "Bandung", "Surabaya", "Tangerang"],
    status: "now" as const,
  },
  {
    name: "The Premiere",
    cities: ["Jakarta", "Bandung", "Surabaya"],
    status: "now" as const,
  },
];

function computeScores(movie: MovieData) {
  const popularity = Math.min(Math.round((movie.popularity || 0) / 3), 100);
  const completion = movie.vote_count
    ? Math.min(Math.round((movie.vote_count / 5000) * 100), 100)
    : Math.round(Math.random() * 30 + 40);
  const buzz = Math.min(
    Math.round((movie.vote_average || 0) * 10 + (movie.popularity || 0) / 5),
    100,
  );
  return { popularity, completion, buzz };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale, region } = useI18n();

  const movieId = Number(params.id);

  const [movie, setMovie] = useState<MovieData | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationMovie[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  const [inWatchlist, setInWatchlist] = useState(false);
  const [reminderActive, setReminderActive] = useState(false);

  /* Fetch movie + recommendations --------------------------------- */
  useEffect(() => {
    if (!movieId || Number.isNaN(movieId)) return;

    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const lang = locale === "id" ? "id" : "en";
        const params = new URLSearchParams({ lang, region });

        const res = await fetch(`/api/movies/${movieId}?${params}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const json = await res.json();

        if (cancelled) return;

        if (json.movie) setMovie(json.movie as MovieData);
        if (json.recommendations)
          setRecommendations(json.recommendations as RecommendationMovie[]);
      } catch (err) {
        console.error("Failed to load movie", err);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [movieId, locale, region]);

  /* Sync localstorage state ---------------------------------------- */
  useEffect(() => {
    if (!movieId) return;
    setInWatchlist(getStoredList(WATCHLIST_KEY).includes(movieId));
    setReminderActive(getStoredList(REMINDERS_KEY).includes(movieId));
  }, [movieId]);

  const toggleWatchlist = useCallback(() => {
    const list = getStoredList(WATCHLIST_KEY);
    if (inWatchlist) {
      const next = list.filter((id) => id !== movieId);
      setStoredList(WATCHLIST_KEY, next);
      setInWatchlist(false);
    } else {
      const next = [...list, movieId];
      setStoredList(WATCHLIST_KEY, next);
      setInWatchlist(true);
    }
  }, [inWatchlist, movieId]);

  const toggleReminder = useCallback(() => {
    const list = getStoredList(REMINDERS_KEY);
    if (reminderActive) {
      const next = list.filter((id) => id !== movieId);
      setStoredList(REMINDERS_KEY, next);
      setReminderActive(false);
    } else {
      const next = [...list, movieId];
      setStoredList(REMINDERS_KEY, next);
      setReminderActive(true);
    }
  }, [reminderActive, movieId]);

  /* Derived data */
  const scores = movie
    ? computeScores(movie)
    : { popularity: 0, completion: 0, buzz: 0 };
  // overview sudah dipilih sesuai lang di server (overview / overview_en + fallback)
  const displayOverview = movie?.overview;

  // Deteksi status tayang berdasarkan status TMDB + release_date
  const today = new Date();
  const releaseDate = movie?.release_date ? new Date(movie.release_date) : null;
  const isUpcoming = releaseDate ? releaseDate > today : false;
  const isNowPlaying =
    movie?.status === "Released" && releaseDate
      ? releaseDate <= today &&
        (today.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24) <= 90
      : false;

  /* Watch providers — dari Supabase via API route */
  const countryProviders: ProviderResult | undefined =
    movie?.["watch/providers"]?.results?.[region] ||
    movie?.["watch/providers"]?.results?.["ID"];

  const apiFlatrate = countryProviders?.flatrate || [];

  const displayOTT: DisplayProvider[] = apiFlatrate.map((p) => ({
    ...p,
    provider_name: p.provider_name,
    status: "now" as const,
  }));

  /* ---------------------------------------------------------------- */
  /*  Loading skeleton                                                 */
  /* ---------------------------------------------------------------- */
  if (loading || !movie) {
    return (
      <div className="min-h-screen">
        <Skeleton className="w-full h-[50vh] lg:h-[60vh] rounded-none" />
        <div className="px-4 lg:px-6 -mt-32 relative z-10 space-y-4">
          <div className="flex gap-6">
            <Skeleton className="w-[160px] h-[240px] rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen animate-fade-in">
      {/* ============================================================ */}
      {/*  1. HERO SECTION                                              */}
      {/* ============================================================ */}
      <section className="relative h-[55vh] lg:h-[70vh] -mt-14 lg:mt-0 overflow-hidden">
        {/* Backdrop */}
        <div className="absolute inset-0">
          <img
            src={getBackdropUrl(movie.backdrop_path)}
            alt={movie.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />
        </div>

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-16 lg:top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full glass text-white text-sm font-medium hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {locale === "id" ? "Kembali" : "Back"}
        </button>

        {/* Hero content */}
        <div className="relative h-full flex items-end pb-8 lg:pb-14 px-4 lg:px-8">
          <div className="flex gap-5 lg:gap-8 items-end w-full max-w-5xl animate-slide-up">
            {/* Poster */}
            <div className="hidden sm:block flex-shrink-0 w-[140px] lg:w-[200px] hover-lift">
              <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-black/60 card-shine">
                <div className="aspect-[2/3]">
                  <img
                    src={getPosterUrl(movie.poster_path)}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pb-1">
              {movie.tagline && (
                <p className="text-primary/90 text-sm italic mb-1 line-clamp-1">
                  &ldquo;{movie.tagline}&rdquo;
                </p>
              )}
              <h1 className="text-2xl lg:text-4xl font-bold text-white leading-tight mb-3">
                {movie.title}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {/* Rating */}
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-semibold">
                  <Star className="w-4 h-4 fill-yellow-400" />
                  {movie.vote_average.toFixed(1)}
                </span>
                {/* Runtime */}
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/80 text-sm">
                  <Clock className="w-3.5 h-3.5" />
                  {formatRuntime(movie.runtime)}
                </span>
                {/* Release date */}
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/80 text-sm">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatReleaseDate(movie.release_date)}
                </span>
              </div>

              {/* Genres */}
              <div className="flex flex-wrap gap-2 mb-4">
                {movie.genres.map((g) => (
                  <Badge
                    key={g.id}
                    variant="secondary"
                    className="bg-white/10 text-white/80 border-white/10 hover:bg-white/20"
                  >
                    {g.name}
                  </Badge>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="lg"
                  onClick={toggleWatchlist}
                  className={cn(
                    "rounded-xl font-semibold transition-all duration-300",
                    inWatchlist
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                      : "gradient-primary text-white hover:opacity-90",
                  )}
                >
                  <Heart
                    className={cn(
                      "w-4 h-4 mr-2",
                      inWatchlist && "fill-current",
                    )}
                  />
                  {inWatchlist ? t("in_watchlist") : t("add_to_watchlist")}
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  onClick={toggleReminder}
                  className={cn(
                    "rounded-xl font-semibold border-white/20 transition-all duration-300",
                    reminderActive
                      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                      : "text-white hover:bg-white/10",
                  )}
                >
                  {reminderActive ? (
                    <BellRing className="w-4 h-4 mr-2" />
                  ) : (
                    <Bell className="w-4 h-4 mr-2" />
                  )}
                  {reminderActive ? t("reminder_set") : t("set_reminder")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Content area                                                 */}
      {/* ============================================================ */}
      <div className="px-4 lg:px-8 max-w-5xl mx-auto -mt-2 relative z-10 space-y-8 pb-16">
        {/* Mobile poster row (poster only visible on small screens) */}
        <div className="sm:hidden flex gap-4 animate-slide-up">
          <div className="w-[110px] flex-shrink-0 rounded-xl overflow-hidden shadow-xl shadow-black/40 hover-lift">
            <div className="aspect-[2/3]">
              <img
                src={getPosterUrl(movie.poster_path)}
                alt={movie.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {movie.tagline && (
              <p className="text-primary/90 text-sm italic">
                &ldquo;{movie.tagline}&rdquo;
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {movie.genres.map((g) => (
                <Badge
                  key={g.id}
                  variant="secondary"
                  className="bg-white/10 text-white/80 border-white/10"
                >
                  {g.name}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={toggleWatchlist}
                className={cn(
                  "rounded-lg text-xs",
                  inWatchlist
                    ? "bg-primary text-primary-foreground"
                    : "gradient-primary text-white",
                )}
              >
                <Heart
                  className={cn("w-3 h-3 mr-1", inWatchlist && "fill-current")}
                />
                {inWatchlist ? t("in_watchlist") : t("add_to_watchlist")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={toggleReminder}
                className={cn(
                  "rounded-lg text-xs border-white/20",
                  reminderActive
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                    : "text-white",
                )}
              >
                {reminderActive ? (
                  <BellRing className="w-3 h-3 mr-1" />
                ) : (
                  <Bell className="w-3 h-3 mr-1" />
                )}
                {reminderActive ? t("reminder_set") : t("set_reminder")}
              </Button>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  2. WHERE TO WATCH                                            */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-4">
            {t("where_to_watch")}
          </h2>

          <Tabs defaultValue="cinema" className="w-full">
            <TabsList className="w-full grid grid-cols-2 bg-white/5 h-auto p-1 rounded-xl gap-1">
              <TabsTrigger
                value="cinema"
                className="rounded-lg text-xs data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-md"
              >
                <Ticket className="w-3.5 h-3.5 mr-1.5" />
                {t("cinema")}
              </TabsTrigger>
              <TabsTrigger
                value="ott"
                className="rounded-lg text-xs data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-md"
              >
                <Tv className="w-3.5 h-3.5 mr-1.5" />
                {t("ott")}
              </TabsTrigger>
            </TabsList>

            {/* Cinema tab */}
            <TabsContent value="cinema" className="mt-4">
              {isNowPlaying ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {INDONESIA_CINEMAS.map((c) => (
                      <div
                        key={c.name}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover-lift"
                      >
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                          <Film className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {c.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {c.cities.slice(0, 3).join(", ")}
                            {c.cities.length > 3
                              ? ` +${c.cities.length - 3}`
                              : ""}
                          </p>
                          <Badge className="mt-1 text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            {t("platform_status_now")}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3 text-center">
                    {locale === "id"
                      ? "Jadwal tayang real-time tersedia di aplikasi 21Cineplex & CGV"
                      : "Real-time showtimes available on 21Cineplex & CGV apps"}
                  </p>
                </>
              ) : isUpcoming ? (
                <div className="flex flex-col items-center justify-center py-8 animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl glass-strong flex items-center justify-center mb-3">
                    <Ticket className="w-8 h-8 text-amber-400/70" />
                  </div>
                  <p className="text-sm font-semibold text-amber-400 mb-1">
                    {locale === "id" ? "Segera Tayang" : "Coming Soon"}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    {locale === "id"
                      ? `Dijadwalkan tayang ${formatReleaseDate(movie.release_date)}`
                      : `Scheduled for ${formatReleaseDate(movie.release_date)}`}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl glass-strong flex items-center justify-center mb-3">
                    <Film className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {locale === "id"
                      ? "Film ini sudah tidak tayang di bioskop"
                      : "This movie is no longer showing in cinemas"}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* OTT tab */}
            <TabsContent value="ott" className="mt-4">
              {displayOTT.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {displayOTT.map((p, i) => (
                    <div
                      key={`${p.provider_id}-${i}`}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-3 rounded-xl border hover-lift transition-all",
                        p.status === "leaving"
                          ? "bg-red-500/5 border-red-500/30"
                          : "bg-white/5 border-white/10",
                      )}
                    >
                      {p.logo_path ? (
                        <img
                          src={getLogoUrl(p.logo_path)}
                          alt={p.provider_name}
                          className="w-10 h-10 rounded-lg object-contain bg-white/90 p-0.5"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = "none";
                            const fallback = target.nextElementSibling;
                            if (fallback)
                              (fallback as HTMLElement).style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center"
                        style={{ display: p.logo_path ? "none" : "flex" }}
                      >
                        <Tv className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-xs font-medium text-foreground truncate w-full text-center">
                        {p.provider_name}
                      </p>
                      <Badge
                        className={cn(
                          "text-[10px]",
                          p.status === "now"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : p.status === "coming"
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30 animate-pulse-glow",
                        )}
                      >
                        {p.status === "now"
                          ? t("platform_status_now")
                          : p.status === "coming"
                            ? t("platform_status_coming")
                            : `${t("platform_status_leaving")} ${p.leavingDays ? `${p.leavingDays}d` : ""}`}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl glass-strong flex items-center justify-center mb-3">
                    <Tv className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {locale === "id"
                      ? "Data streaming belum tersedia untuk film ini di Indonesia"
                      : "Streaming data not available for this movie in Indonesia"}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>

        {/* ============================================================ */}
        {/*  3. QUICK DECISION CARD                                       */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-4">
            {t("quick_decision")}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Worth It? */}
            <div className="glass-strong rounded-xl p-4 flex flex-col items-center gap-3">
              <Zap className="w-6 h-6 text-primary" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Worth It?
              </p>
              <div className="flex gap-2">
                <Badge
                  className={cn(
                    "cursor-default text-xs px-3 py-1",
                    movie.worth_it === "yes"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 ring-1 ring-emerald-500/40"
                      : "bg-white/5 text-white/40 border-white/10",
                  )}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {t("worth_it_yes")}
                </Badge>
                <Badge
                  className={cn(
                    "cursor-default text-xs px-3 py-1",
                    movie.worth_it === "skip"
                      ? "bg-red-500/20 text-red-400 border-red-500/40 ring-1 ring-red-500/40"
                      : "bg-white/5 text-white/40 border-white/10",
                  )}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  {t("worth_it_skip")}
                </Badge>
                <Badge
                  className={cn(
                    "cursor-default text-xs px-3 py-1",
                    movie.worth_it === "fan"
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40 ring-1 ring-amber-500/40"
                      : "bg-white/5 text-white/40 border-white/10",
                  )}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  {t("worth_it_fan")}
                </Badge>
              </div>
              {/* Default to "yes" if no worth_it field */}
              {(!movie.worth_it || movie.worth_it === "yes") && (
                <div className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">
                    {t("worth_it_yes")}
                  </span>
                </div>
              )}
            </div>

            {/* Mood tags */}
            <div className="glass-strong rounded-xl p-4 flex flex-col items-center gap-3">
              <Sparkles className="w-6 h-6 text-primary" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {t("nav_mood")}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {(movie.mood_tags || ["Tegang", "Mikir"]).map((mood) => {
                  const moodKey =
                    `mood_${mood.toLowerCase()}` as keyof typeof t extends (
                      k: infer K,
                    ) => string
                      ? K
                      : never;
                  const label =
                    locale === "id"
                      ? mood
                      : {
                          ketawa: "Laugh",
                          tegang: "Thrill",
                          nangis: "Cry",
                          santai: "Chill",
                          mikir: "Think",
                          berat: "Heavy",
                        }[mood.toLowerCase()] || mood;
                  return (
                    <Badge
                      key={mood}
                      variant="secondary"
                      className="bg-primary/10 text-primary border-primary/20 text-xs"
                    >
                      {label}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {/* Pace */}
            <div className="glass-strong rounded-xl p-4 flex flex-col items-center gap-3">
              <Gauge className="w-6 h-6 text-primary" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Pace
              </p>
              <div className="flex gap-2 items-center">
                {(["slow", "medium", "fast"] as const).map((p) => {
                  const active =
                    movie.pace === p || (!movie.pace && p === "medium");
                  return (
                    <Badge
                      key={p}
                      className={cn(
                        "text-xs px-3 py-1",
                        active
                          ? "bg-primary/20 text-primary border-primary/40 ring-1 ring-primary/40"
                          : "bg-white/5 text-white/40 border-white/10",
                      )}
                    >
                      {t(
                        `pace_${p}` as
                          | "pace_slow"
                          | "pace_medium"
                          | "pace_fast",
                      )}
                    </Badge>
                  );
                })}
              </div>
              {/* Pace visual bar */}
              <div className="w-full mt-1">
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full gradient-primary transition-all duration-700"
                    style={{
                      width: `${{ slow: 33, medium: 66, fast: 100 }[movie.pace || "medium"]}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {t("pace_slow")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t("pace_fast")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  4. FILM SCORES                                                */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-5">Film Score</h2>

          <div className="space-y-4">
            {/* Popularity */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {t("score_popularity")}
                </span>
                <span className="text-sm font-bold text-primary">
                  {scores.popularity}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${scores.popularity}%` }}
                />
              </div>
            </div>

            {/* Completion Rate */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  {t("score_completion")}
                </span>
                <span className="text-sm font-bold text-emerald-400">
                  {scores.completion}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${scores.completion}%` }}
                />
              </div>
            </div>

            {/* Social Buzz */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MessageCircle className="w-4 h-4 text-sky-400" />
                  {t("score_buzz")}
                </span>
                <span className="text-sm font-bold text-sky-400">
                  {scores.buzz}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-700"
                  style={{ width: `${scores.buzz}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  4b. FILM STATS                                               */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-4">
            {locale === "id" ? "Info Film" : "Film Info"}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Runtime */}
            {movie.runtime > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {locale === "id" ? "Durasi" : "Runtime"}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {formatRuntime(movie.runtime)}
                </p>
              </div>
            )}

            {/* Vote count */}
            {movie.vote_count > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {locale === "id" ? "Voting" : "Votes"}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {movie.vote_count.toLocaleString()}
                </p>
              </div>
            )}

            {/* Popularity */}
            {movie.popularity > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    Popularity
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {Number(movie.popularity).toFixed(1)}
                </p>
              </div>
            )}

            {/* Budget */}
            {movie.budget > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    Budget
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  ${(movie.budget / 1_000_000).toFixed(1)}M
                </p>
              </div>
            )}

            {/* Revenue */}
            {movie.revenue > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {locale === "id" ? "Pendapatan" : "Revenue"}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  ${(movie.revenue / 1_000_000).toFixed(1)}M
                </p>
              </div>
            )}

            {/* ROI — hanya tampil jika ada budget & revenue */}
            {movie.budget > 0 && movie.revenue > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Star className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    ROI
                  </span>
                </div>
                <p
                  className={cn(
                    "text-sm font-bold",
                    movie.revenue >= movie.budget
                      ? "text-emerald-400"
                      : "text-red-400",
                  )}
                >
                  {movie.revenue >= movie.budget
                    ? `+${(((movie.revenue - movie.budget) / movie.budget) * 100).toFixed(0)}%`
                    : `-${(((movie.budget - movie.revenue) / movie.budget) * 100).toFixed(0)}%`}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ============================================================ */}
        {/*  5. OVERVIEW                                                   */}
        {/* ============================================================ */}
        {displayOverview && (
          <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
            <h2 className="text-lg font-bold text-gradient mb-3">
              {t("overview")}
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
              {displayOverview}
            </p>
          </section>
        )}

        {/* ============================================================ */}
        {/*  6. CAST                                                       */}
        {/* ============================================================ */}
        {movie.credits?.cast && movie.credits.cast.length > 0 && (
          <section className="animate-slide-up">
            <SectionHeader title={t("cast")} />
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
              {movie.credits.cast.slice(0, 20).map((person) => (
                <div
                  key={person.id}
                  className="flex-shrink-0 w-[100px] lg:w-[120px] group"
                >
                  <div className="relative rounded-xl overflow-hidden hover-lift card-shine">
                    <div className="aspect-[3/4]">
                      <img
                        src={getProfileUrl(person.profile_path)}
                        alt={person.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white/70 line-clamp-1">
                        {person.character}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {person.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {person.character}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  7. SIMILAR / RECOMMENDATIONS                                  */}
        {/* ============================================================ */}
        {movie.similar?.results && movie.similar.results.length > 0 && (
          <section className="animate-slide-up">
            <SectionHeader title={t("similar")} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {movie.similar.results.slice(0, 12).map((m) => (
                <div
                  key={m.id}
                  className="w-[140px] lg:w-[160px] flex-shrink-0"
                >
                  <MovieCard movie={m as never} />
                </div>
              ))}
            </div>
          </section>
        )}

        {recommendations.length > 0 && (
          <section className="animate-slide-up">
            <SectionHeader title={t("recommendations")} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {recommendations.map((m) => (
                <div
                  key={m.id}
                  className="w-[140px] lg:w-[160px] flex-shrink-0"
                >
                  <MovieCard movie={m as never} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
