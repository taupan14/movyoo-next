"use client";
// app/cinema/page.tsx

import { useEffect, useState, useMemo, useCallback } from "react";
import { useI18n } from "@/hooks/use-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Navigation,
  Search,
  Clock,
  ExternalLink,
  Film,
  Loader as Loader2,
  Calendar,
  X,
  Star,
  Info,
  Ticket,
  CalendarDays,
  ChevronDown,
  AlertCircle,
  Sparkles,
  Play,
  Users,
  Clapperboard,
  User,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Cinema {
  id: string;
  name: string;
  chain: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  google_maps_url: string;
  booking_url: string;
  source: string;
}

interface ShowtimeItem {
  id: string;
  show_time: string;
  format: string;
  studio_id: number | null;
  ticket_price: number | null;
}

interface CinemaEntry {
  cinema_movie_id: string;
  cinema_id: string;
  name: string;
  chain: string;
  city: string;
  address: string;
  google_maps_url: string;
  booking_url: string;
  format: string;
  showtimes: ShowtimeItem[];
}

interface NowPlayingMovie {
  movie_id: number | null;
  title: string;
  genre: string;
  duration: string;
  age_rating: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  overview: string | null;
  cinemas: CinemaEntry[];
}

interface NowPlayingByChain {
  chain: string;
  movies: NowPlayingMovie[];
  show_date_used: string;
  is_fallback: boolean;
}

// interface ComingSoonCinema {
//   cinema_id: string;
//   name: string;
//   chain: string;
//   city: string;
//   show_date: string;
//   format: string;
// }

// interface ComingSoonMovie {
//   movie_id: number | null;
//   title: string;
//   genre: string;
//   duration: string;
//   age_rating: string;
//   poster_path: string | null;
//   backdrop_path: string | null;
//   vote_average: number | null;
//   overview: string | null;
//   earliest_show_date: string;
//   cinemas: ComingSoonCinema[];
// }

interface UpcomingMovie {
  id: number;
  tmdb_id: number | null;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string | null;
  popularity: number;
  overview: string | null;
  trailer_key: string | null;
}

// TMDB detail types (dari DB — tabel movies, movie_cast, movie_crew, movie_companies)
interface MovieDetailFull {
  id: number;
  tmdb_id: number | null;
  title: string;
  original_title: string | null;
  overview: string | null;
  overview_en: string | null;
  tagline: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  vote_count: number | null;
  runtime: number | null;
  release_date: string | null;
  status: string | null;
  trailer_key: string | null;
  cast: {
    id: number;
    person_id: number;
    name: string;
    character: string | null;
    profile_path: string | null;
    order_index: number;
  }[];
  crew: {
    person_id: number;
    name: string;
    job: string;
    department: string | null;
    profile_path: string | null;
  }[];
  companies: {
    id: number;
    name: string | null;
    logo_path: string | null;
    origin_country: string | null;
  }[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const CHAIN_COLORS: Record<string, string> = {
  XXI: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  CGV: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Cinepolis: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const CHAIN_DOT: Record<string, string> = {
  XXI: "bg-rose-500",
  CGV: "bg-amber-500",
  Cinepolis: "bg-emerald-500",
};

const CHAIN_BOOKING: Record<string, string> = {
  XXI: "https://21cineplex.com",
  CGV: "https://www.cgv.id",
  Cinepolis: "https://www.cinepolis.co.id",
};

const CHAINS = ["XXI", "CGV", "Cinepolis"] as const;
type Chain = (typeof CHAINS)[number];

const DEFAULT_CITY = "Jakarta";
const DEFAULT_CHAIN = "XXI";

/* ------------------------------------------------------------------ */
/*  API Helpers                                                         */
/* ------------------------------------------------------------------ */

async function apiFetchCities(): Promise<string[]> {
  const res = await fetch("/api/cinema?type=cities");
  if (!res.ok) throw new Error("Failed to fetch cities");
  const data = await res.json();
  return data.cities ?? [];
}

async function apiFetchCinemas(
  city: string,
  chain?: string,
): Promise<Cinema[]> {
  const params = new URLSearchParams({ type: "cinemas", city });
  if (chain) params.set("chain", chain);
  const res = await fetch(`/api/cinema?${params}`);
  if (!res.ok) throw new Error("Failed to fetch cinemas");
  const data = await res.json();
  return data.cinemas ?? [];
}

interface MoviesApiResult {
  nowPlaying: NowPlayingMovie[];
  nowPlayingByChain: NowPlayingByChain[];
  // comingSoon: ComingSoonMovie[];
  show_date_used: string;
  is_fallback: boolean;
}

async function apiFetchMovies(
  city: string,
  chain?: string,
  lang?: string,
): Promise<MoviesApiResult> {
  const params = new URLSearchParams({
    type: "movies",
    city,
    lang: lang ?? "en",
  });
  if (chain) params.set("chain", chain);
  const res = await fetch(`/api/cinema?${params}`);
  if (!res.ok) throw new Error("Failed to fetch movies");
  const data = await res.json();
  return {
    nowPlaying: data.nowPlaying ?? [],
    nowPlayingByChain: data.nowPlayingByChain ?? [],
    // comingSoon: data.comingSoon ?? [],
    show_date_used: data.show_date_used ?? "",
    is_fallback: data.is_fallback ?? false,
  };
}

async function apiFetchUpcoming(
  city: string,
  lang?: string,
): Promise<UpcomingMovie[]> {
  const params = new URLSearchParams({
    type: "upcoming",
    city,
    lang: lang ?? "en",
  });
  const res = await fetch(`/api/cinema?${params}`);
  if (!res.ok) throw new Error("Failed to fetch upcoming");
  const data = await res.json();
  return data.upcomingMovies ?? [];
}

async function apiFetchMovieDetail(
  movieId: number,
  lang: string,
): Promise<MovieDetailFull | null> {
  try {
    const params = new URLSearchParams({
      type: "movie_detail",
      movie_id: String(movieId),
      lang,
    });
    const res = await fetch(`/api/cinema?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.detail ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Format helpers                                                      */
/* ------------------------------------------------------------------ */

function formatShowTime(t: string) {
  return t?.slice(0, 5) ?? t;
}

function formatPrice(price: number | null, locale: string) {
  if (!price || price <= 0)
    return locale === "id" ? "Cek harga" : "Check price";
  return `Rp ${price.toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string, locale: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(dateStr: string, locale: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getPosterUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `https://image.tmdb.org/t/p/w342${path}`;
}

function getBackdropUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `https://image.tmdb.org/t/p/w780${path}`;
}

function getProfileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `https://image.tmdb.org/t/p/w185${path}`;
}

/* ------------------------------------------------------------------ */
/*  Trailer Player — handles both YouTube ID and full MP4 URL          */
/* ------------------------------------------------------------------ */

function TrailerPlayer({
  trailerKey,
  title,
}: {
  trailerKey: string;
  title: string;
}) {
  const isFullUrl =
    trailerKey.startsWith("http://") || trailerKey.startsWith("https://");

  if (isFullUrl) {
    return (
      <video
        src={trailerKey}
        className="w-full h-full object-cover"
        autoPlay
        controls
        playsInline
        preload="auto"
        title={title}
      />
    );
  }

  // YouTube ID
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1`}
      title={`${title} Trailer`}
      className="w-full h-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Now Playing Detail Modal — Opsi B: 2-panel full height             */
/*  Kiri: Trailer (atas) + Detail film (bawah, scroll)                 */
/*  Kanan: Jadwal bioskop (full height, scroll)                        */
/* ------------------------------------------------------------------ */

function NowPlayingDetailModal({
  movie,
  onClose,
  locale,
  activeChainFilter,
}: {
  movie: NowPlayingMovie;
  onClose: () => void;
  locale: string;
  activeChainFilter: Chain;
}) {
  const [detail, setDetail] = useState<MovieDetailFull | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeChain, setActiveChain] = useState<Chain>(activeChainFilter);
  // Tab state for mobile: "info" | "schedule"
  const [mobileTab, setMobileTab] = useState<"info" | "schedule">("info");

  useEffect(() => {
    if (!movie.movie_id) return;
    let cancelled = false;
    setLoadingDetail(true);
    apiFetchMovieDetail(movie.movie_id, locale === "id" ? "id" : "en").then(
      (d) => {
        if (!cancelled) {
          setDetail(d);
          setLoadingDetail(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [movie.movie_id, locale]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const chainsAvailable = useMemo(() => {
    const set = new Set(movie.cinemas.map((c) => c.chain));
    return CHAINS.filter((ch) => set.has(ch)) as Chain[];
  }, [movie]);

  useEffect(() => {
    if (chainsAvailable.length > 0 && !chainsAvailable.includes(activeChain)) {
      setActiveChain(chainsAvailable[0]);
    }
  }, [chainsAvailable]);

  const cinemasForChain = useMemo(() => {
    const filtered = movie.cinemas.filter((c) => c.chain === activeChain);
    const map = new Map<
      string,
      {
        cinema: CinemaEntry;
        formats: { format: string; showtimes: ShowtimeItem[] }[];
      }
    >();
    for (const c of filtered) {
      if (!map.has(c.cinema_id))
        map.set(c.cinema_id, { cinema: c, formats: [] });
      map
        .get(c.cinema_id)!
        .formats.push({ format: c.format, showtimes: c.showtimes });
    }
    return Array.from(map.values());
  }, [movie, activeChain]);

  const trailerKey = detail?.trailer_key ?? null;
  const directors = detail?.crew?.filter((c) => c.job === "Director") ?? [];
  const producers =
    detail?.crew?.filter(
      (c) => c.job === "Producer" || c.job === "Executive Producer",
    ) ?? [];
  const writers =
    detail?.crew?.filter(
      (c) => c.job === "Writer" || c.job === "Screenplay" || c.job === "Story",
    ) ?? [];
  const displayOverview =
    locale === "id"
      ? (detail?.overview ?? detail?.overview_en ?? movie.overview)
      : (detail?.overview_en ?? detail?.overview ?? movie.overview);

  const posterUrl = getPosterUrl(detail?.poster_path ?? movie.poster_path);
  const backdropUrl = getBackdropUrl(
    detail?.backdrop_path ?? movie.backdrop_path,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-3 lg:p-5"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      {/* Modal shell */}
      <div
        className="relative z-10 w-full sm:max-w-5xl xl:max-w-6xl
          h-[96dvh] sm:h-[90vh]
          bg-[#111] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl
          flex flex-col lg:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close ── */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-40 p-1.5 rounded-full bg-black/70 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Mobile Tab Bar (hidden on lg+) ── */}
        <div className="lg:hidden flex-shrink-0 flex border-b border-white/10 bg-[#111]">
          <button
            onClick={() => setMobileTab("info")}
            className={cn(
              "flex-1 py-2.5 text-[12px] font-semibold transition-colors",
              mobileTab === "info"
                ? "text-white border-b-2 border-primary"
                : "text-muted-foreground",
            )}
          >
            {locale === "id" ? "Info Film" : "Movie Info"}
          </button>
          <button
            onClick={() => setMobileTab("schedule")}
            className={cn(
              "flex-1 py-2.5 text-[12px] font-semibold transition-colors",
              mobileTab === "schedule"
                ? "text-white border-b-2 border-primary"
                : "text-muted-foreground",
            )}
          >
            {locale === "id" ? "Jadwal" : "Schedule"}
            {movie.cinemas.length > 0 && (
              <span className="ml-1 opacity-60 text-[10px]">
                ({movie.cinemas.length})
              </span>
            )}
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════
            LEFT PANEL — Trailer + Detail film
        ════════════════════════════════════════════════════════════ */}
        <div
          className={cn(
            "flex flex-col lg:flex-1 min-h-0 min-w-0 border-b lg:border-b-0 lg:border-r border-white/10",
            // Mobile tab visibility
            mobileTab === "info" ? "flex" : "hidden lg:flex",
          )}
        >
          {/* ── Trailer / Backdrop ── */}
          <div
            className="relative w-full flex-shrink-0"
            style={{ aspectRatio: "16/9" }}
          >
            {trailerKey ? (
              <TrailerPlayer trailerKey={trailerKey} title={movie.title} />
            ) : (
              <>
                {backdropUrl ? (
                  <img
                    src={backdropUrl}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                  />
                ) : posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={movie.title}
                    className="w-full h-full object-cover object-top opacity-40"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-[#111]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#111]/70 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-5 h-5 text-white/40 ml-0.5" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Detail film (scrollable) ── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 pt-3 pb-6">
              {/* Title + badges */}
              <div className="flex gap-3 mb-3">
                {posterUrl && (
                  <div className="w-[52px] sm:w-[56px] flex-shrink-0 rounded-lg overflow-hidden shadow-lg shadow-black/50 self-start">
                    <div className="aspect-[2/3]">
                      <img
                        src={posterUrl}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {detail?.tagline && (
                    <p className="text-primary/70 text-[10px] italic mb-0.5 line-clamp-1">
                      &ldquo;{detail.tagline}&rdquo;
                    </p>
                  )}
                  <h2 className="text-sm font-bold text-white leading-snug mb-1.5 pr-6">
                    {movie.title}
                  </h2>
                  <div className="flex flex-wrap gap-1">
                    {(detail?.vote_average ?? movie.vote_average) != null &&
                      (detail?.vote_average ?? movie.vote_average)! > 0 && (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] h-5 px-1.5">
                          <Star className="w-2.5 h-2.5 mr-0.5 fill-amber-400" />
                          {(detail?.vote_average ??
                            movie.vote_average)!.toFixed(1)}
                        </Badge>
                      )}
                    {(detail?.runtime ?? 0) > 0 ? (
                      <Badge className="bg-white/10 text-white/70 border-white/10 text-[10px] h-5 px-1.5">
                        <Clock className="w-2.5 h-2.5 mr-0.5" />
                        {Math.floor(detail!.runtime! / 60)}h{" "}
                        {detail!.runtime! % 60}m
                      </Badge>
                    ) : movie.duration ? (
                      <Badge className="bg-white/10 text-white/70 border-white/10 text-[10px] h-5 px-1.5">
                        <Clock className="w-2.5 h-2.5 mr-0.5" />
                        {movie.duration}
                      </Badge>
                    ) : null}
                    {movie.age_rating && movie.age_rating !== "-" && (
                      <Badge className="bg-white/10 text-white/70 border-white/10 text-[10px] h-5 px-1.5">
                        {movie.age_rating}
                      </Badge>
                    )}
                    {movie.genre && (
                      <Badge className="bg-white/10 text-white/70 border-white/10 text-[10px] h-5 px-1.5">
                        {movie.genre}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Synopsis */}
              {displayOverview && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {locale === "id" ? "Sinopsis" : "Synopsis"}
                  </p>
                  <p className="text-[13px] text-white leading-relaxed line-clamp-4">
                    {displayOverview}
                  </p>
                </div>
              )}

              {/* Loading skeleton */}
              {loadingDetail && !detail && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              )}

              {/* Crew grid */}
              {detail &&
                (directors.length > 0 ||
                  producers.length > 0 ||
                  writers.length > 0 ||
                  detail.companies.length > 0) && (
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {directors.length > 0 && (
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                          {locale === "id" ? "Sutradara" : "Director"}
                        </p>
                        <p className="text-[11px] text-foreground font-medium line-clamp-2">
                          {directors.map((d) => d.name).join(", ")}
                        </p>
                      </div>
                    )}
                    {producers.length > 0 && (
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                          {locale === "id" ? "Produser" : "Producer"}
                        </p>
                        <p className="text-[11px] text-foreground font-medium line-clamp-2">
                          {producers
                            .slice(0, 3)
                            .map((p) => p.name)
                            .join(", ")}
                        </p>
                      </div>
                    )}
                    {writers.length > 0 && (
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                          {locale === "id" ? "Penulis" : "Writer"}
                        </p>
                        <p className="text-[11px] text-foreground font-medium line-clamp-2">
                          {writers
                            .slice(0, 3)
                            .map((w) => w.name)
                            .join(", ")}
                        </p>
                      </div>
                    )}
                    {detail.companies.length > 0 && (
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                          {locale === "id" ? "Rumah Produksi" : "Production"}
                        </p>
                        <p className="text-[11px] text-foreground font-medium line-clamp-2">
                          {detail.companies
                            .slice(0, 3)
                            .map((p) => p.name ?? "")
                            .join(", ")}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              {/* Cast */}
              {detail?.cast && detail.cast.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-primary" />
                    {locale === "id" ? "Pemeran" : "Cast"}
                    <span className="normal-case font-normal opacity-60">
                      ({detail.cast.length})
                    </span>
                  </p>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4">
                    {detail.cast.slice(0, 20).map((person) => (
                      <div
                        key={person.id}
                        className="flex-shrink-0 w-[56px] text-center"
                      >
                        <div className="w-[56px] h-[56px] rounded-full overflow-hidden bg-secondary mx-auto mb-1 mt-1 ring-2 ring-white/10">
                          {person.profile_path ? (
                            <img
                              src={getProfileUrl(person.profile_path)!}
                              alt={person.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/5">
                              <User className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <p className="text-[9px] font-medium text-foreground leading-tight line-clamp-2">
                          {person.name}
                        </p>
                        <p className="text-[8px] text-muted-foreground leading-tight line-clamp-1">
                          {person.character}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Crew */}
              {detail?.crew && detail.crew.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Clapperboard className="w-3 h-3 text-primary" />
                    {locale === "id" ? "Kru" : "Crew"}
                    <span className="normal-case font-normal opacity-60">
                      ({detail.crew.length})
                    </span>
                  </p>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4">
                    {detail.crew.slice(0, 25).map((person, idx) => (
                      <div
                        key={`${person.person_id}-${person.job}-${idx}`}
                        className="flex-shrink-0 w-[56px] text-center"
                      >
                        <div className="w-[56px] h-[56px] rounded-full overflow-hidden bg-secondary mx-auto mb-1 mt-1 ring-2 ring-white/10">
                          {person.profile_path ? (
                            <img
                              src={getProfileUrl(person.profile_path)!}
                              alt={person.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/5">
                              <User className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <p className="text-[9px] font-medium text-foreground leading-tight line-clamp-2">
                          {person.name}
                        </p>
                        <p className="text-[8px] text-muted-foreground leading-tight line-clamp-1">
                          {person.job}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            RIGHT PANEL — Jadwal bioskop
        ════════════════════════════════════════════════════════════ */}
        <div
          className={cn(
            "lg:w-[320px] xl:w-[360px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden",
            // Mobile tab visibility
            mobileTab === "schedule" ? "flex flex-1" : "hidden lg:flex",
          )}
        >
          {/* Sticky header */}
          <div className="px-4 pt-3 pb-2 border-b border-white/10 flex-shrink-0">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
              {locale === "id" ? "Jadwal Bioskop" : "Cinema Schedule"}
            </p>
            {/* Chain tabs */}
            {chainsAvailable.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {chainsAvailable.map((chain) => (
                  <button
                    key={chain}
                    onClick={() => setActiveChain(chain)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all",
                      activeChain === chain
                        ? CHAIN_COLORS[chain]
                        : "border-white/10 text-muted-foreground hover:border-white/25",
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full inline-block mr-1 align-middle",
                        CHAIN_DOT[chain],
                      )}
                    />
                    {chain}
                    <span className="ml-1 opacity-60 text-[10px]">
                      ({movie.cinemas.filter((c) => c.chain === chain).length})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scrollable cinema list */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {chainsAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {locale === "id"
                  ? "Jadwal tidak tersedia"
                  : "No schedule available"}
              </p>
            ) : cinemasForChain.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {locale === "id"
                  ? "Tidak ada jadwal untuk chain ini"
                  : "No schedules for this chain"}
              </p>
            ) : (
              cinemasForChain.map(({ cinema, formats }) => (
                <div
                  key={cinema.cinema_id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                >
                  {/* Cinema header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[13px] text-white leading-tight truncate">
                        {cinema.name}
                      </p>
                      {cinema.address && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                          {cinema.address}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {cinema.google_maps_url && (
                        <a
                          href={cinema.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors flex items-center justify-center"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <a
                        href={cinema.booking_url || CHAIN_BOOKING[cinema.chain]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors flex items-center justify-center"
                      >
                        <Ticket className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Formats + showtimes */}
                  <div className="space-y-2">
                    {formats.map(({ format, showtimes }) => (
                      <div key={format}>
                        {formats.length > 1 && (
                          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-1">
                            {format}
                          </p>
                        )}
                        {showtimes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {showtimes.map((st) => (
                              <div
                                key={st.id}
                                className="rounded-lg bg-white/10 border border-white/10 px-2 py-1.5 text-center min-w-[52px]"
                              >
                                <p className="text-[12px] font-bold text-white tabular-nums leading-none">
                                  {formatShowTime(st.show_time)}
                                </p>
                                {st.studio_id && (
                                  <p className="text-[9px] text-muted-foreground leading-none mt-0.5">
                                    Std {st.studio_id}
                                  </p>
                                )}
                                {st.ticket_price != null &&
                                  st.ticket_price > 0 && (
                                    <p className="text-[9px] text-emerald-400 leading-none mt-0.5">
                                      {formatPrice(st.ticket_price, locale)}
                                    </p>
                                  )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            {locale === "id"
                              ? "Jadwal belum tersedia"
                              : "No showtimes yet"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Upcoming Movie Modal — simple, no cinema schedule                  */
/* ------------------------------------------------------------------ */

function UpcomingDetailModal({
  movie,
  onClose,
  locale,
}: {
  movie: UpcomingMovie;
  onClose: () => void;
  locale: string;
}) {
  const [detail, setDetail] = useState<MovieDetailFull | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!movie.id) return;
    let cancelled = false;
    setLoadingDetail(true);
    apiFetchMovieDetail(movie.id, locale === "id" ? "id" : "en").then((d) => {
      if (!cancelled) {
        setDetail(d);
        setLoadingDetail(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [movie.id, locale]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const trailerKey = detail?.trailer_key ?? movie.trailer_key ?? null;
  const directors = detail?.crew?.filter((c) => c.job === "Director") ?? [];
  const producers =
    detail?.crew?.filter(
      (c) => c.job === "Producer" || c.job === "Executive Producer",
    ) ?? [];
  const writers =
    detail?.crew?.filter(
      (c) => c.job === "Writer" || c.job === "Screenplay" || c.job === "Story",
    ) ?? [];
  const displayOverview =
    locale === "id"
      ? (detail?.overview ?? detail?.overview_en ?? movie.overview)
      : (detail?.overview_en ?? detail?.overview ?? movie.overview);

  const posterUrl = getPosterUrl(detail?.poster_path ?? movie.poster_path);
  const backdropUrl = getBackdropUrl(
    detail?.backdrop_path ?? movie.backdrop_path,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-3 lg:p-5"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      {/* Modal shell */}
      <div
        className="relative z-10 w-full sm:max-w-2xl
          h-[94vh] sm:h-[90vh]
          bg-[#111] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl
          flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close ── */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-40 p-1.5 rounded-full bg-black/70 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Trailer / Backdrop ── */}
        <div
          className="relative w-full flex-shrink-0"
          style={{ aspectRatio: "16/9" }}
        >
          {trailerKey ? (
            <TrailerPlayer trailerKey={trailerKey} title={movie.title} />
          ) : (
            <>
              {backdropUrl ? (
                <img
                  src={backdropUrl}
                  alt={movie.title}
                  className="w-full h-full object-cover"
                />
              ) : posterUrl ? (
                <img
                  src={posterUrl}
                  alt={movie.title}
                  className="w-full h-full object-cover object-top opacity-40"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-900/30 to-[#111]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#111]/70 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-5 h-5 text-white/40 ml-0.5" />
                </div>
              </div>
            </>
          )}
          {/* Coming Soon badge */}
          <div className="absolute top-3 left-3">
            <Badge className="bg-violet-500/80 text-white border-0 text-[10px] backdrop-blur-sm">
              <CalendarDays className="w-3 h-3 mr-1" />
              {locale === "id" ? "Segera Tayang" : "Coming Soon"}
            </Badge>
          </div>
        </div>

        {/* ── Detail film (scrollable) ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 pt-3 pb-5">
            {/* Title + badges */}
            <div className="flex gap-3 mb-3">
              {posterUrl && (
                <div className="w-[56px] flex-shrink-0 rounded-lg overflow-hidden shadow-lg shadow-black/50 self-start">
                  <div className="aspect-[2/3]">
                    <img
                      src={posterUrl}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                {detail?.tagline && (
                  <p className="text-violet-400/70 text-[10px] italic mb-0.5 line-clamp-1">
                    &ldquo;{detail.tagline}&rdquo;
                  </p>
                )}
                <h2 className="text-sm font-bold text-white leading-snug mb-1.5">
                  {movie.title}
                </h2>
                <div className="flex flex-wrap gap-1">
                  {(detail?.vote_average ?? movie.vote_average) != null &&
                    (detail?.vote_average ?? movie.vote_average)! > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] h-5 px-1.5">
                        <Star className="w-2.5 h-2.5 mr-0.5 fill-amber-400" />
                        {(detail?.vote_average ?? movie.vote_average)!.toFixed(
                          1,
                        )}
                      </Badge>
                    )}
                  {(detail?.runtime ?? 0) > 0 && (
                    <Badge className="bg-white/10 text-white/70 border-white/10 text-[10px] h-5 px-1.5">
                      <Clock className="w-2.5 h-2.5 mr-0.5" />
                      {Math.floor(detail!.runtime! / 60)}h{" "}
                      {detail!.runtime! % 60}m
                    </Badge>
                  )}
                  {movie.release_date && (
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-[10px] h-5 px-1.5">
                      <CalendarDays className="w-2.5 h-2.5 mr-0.5" />
                      {formatDateShort(movie.release_date, locale)}
                    </Badge>
                  )}
                  {movie.genres?.slice(0, 2).map((g) => (
                    <Badge
                      key={g.id}
                      className="bg-white/10 text-white/70 border-white/10 text-[10px] h-5 px-1.5"
                    >
                      {g.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Synopsis */}
            {displayOverview && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  {locale === "id" ? "Sinopsis" : "Synopsis"}
                </p>
                <p className="text-[13px] text-white leading-relaxed line-clamp-4">
                  {displayOverview}
                </p>
              </div>
            )}

            {/* Loading skeleton */}
            {loadingDetail && !detail && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            )}

            {/* Crew grid */}
            {detail &&
              (directors.length > 0 ||
                producers.length > 0 ||
                writers.length > 0 ||
                detail.companies.length > 0) && (
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {directors.length > 0 && (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                        {locale === "id" ? "Sutradara" : "Director"}
                      </p>
                      <p className="text-[11px] text-foreground font-medium line-clamp-2">
                        {directors.map((d) => d.name).join(", ")}
                      </p>
                    </div>
                  )}
                  {producers.length > 0 && (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                        {locale === "id" ? "Produser" : "Producer"}
                      </p>
                      <p className="text-[11px] text-foreground font-medium line-clamp-2">
                        {producers
                          .slice(0, 3)
                          .map((p) => p.name)
                          .join(", ")}
                      </p>
                    </div>
                  )}
                  {writers.length > 0 && (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                        {locale === "id" ? "Penulis" : "Writer"}
                      </p>
                      <p className="text-[11px] text-foreground font-medium line-clamp-2">
                        {writers
                          .slice(0, 3)
                          .map((w) => w.name)
                          .join(", ")}
                      </p>
                    </div>
                  )}
                  {detail.companies.length > 0 && (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                        {locale === "id" ? "Rumah Produksi" : "Production"}
                      </p>
                      <p className="text-[11px] text-foreground font-medium line-clamp-2">
                        {detail.companies
                          .slice(0, 3)
                          .map((p) => p.name ?? "")
                          .join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              )}

            {/* Cast */}
            {detail?.cast && detail.cast.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-violet-400" />
                  {locale === "id" ? "Pemeran" : "Cast"}
                  <span className="normal-case font-normal opacity-60">
                    ({detail.cast.length})
                  </span>
                </p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {detail.cast.slice(0, 20).map((person) => (
                    <div
                      key={person.id}
                      className="flex-shrink-0 w-[56px] text-center"
                    >
                      <div className="w-[56px] h-[56px] rounded-full overflow-hidden bg-secondary mx-auto mb-1 mt-1 ms-1 ring-2 ring-white/10">
                        {person.profile_path ? (
                          <img
                            src={getProfileUrl(person.profile_path)!}
                            alt={person.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-white/5">
                            <User className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] font-medium text-foreground leading-tight line-clamp-2">
                        {person.name}
                      </p>
                      <p className="text-[8px] text-muted-foreground leading-tight line-clamp-1">
                        {person.character}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Crew */}
            {detail?.crew && detail.crew.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clapperboard className="w-3 h-3 text-violet-400" />
                  {locale === "id" ? "Kru" : "Crew"}
                  <span className="normal-case font-normal opacity-60">
                    ({detail.crew.length})
                  </span>
                </p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {detail.crew.slice(0, 25).map((person, idx) => (
                    <div
                      key={`${person.person_id}-${person.job}-${idx}`}
                      className="flex-shrink-0 w-[56px] text-center"
                    >
                      <div className="w-[56px] h-[56px] rounded-full overflow-hidden bg-secondary mx-auto mb-1 mt-1 ms-1 ring-2 ring-white/10">
                        {person.profile_path ? (
                          <img
                            src={getProfileUrl(person.profile_path)!}
                            alt={person.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-white/5">
                            <User className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] font-medium text-foreground leading-tight line-clamp-2">
                        {person.name}
                      </p>
                      <p className="text-[8px] text-muted-foreground leading-tight line-clamp-1">
                        {person.job}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Movie Card (shared)                                                 */
/* ------------------------------------------------------------------ */

function MovieCard({
  movie,
  onClick,
  locale,
  badge,
}: {
  movie: NowPlayingMovie | UpcomingMovie;
  onClick: () => void;
  locale: string;
  badge?: React.ReactNode;
}) {
  const posterUrl = getPosterUrl(movie.poster_path);

  // Cinemas exist on NowPlayingMovie
  const chains =
    "cinemas" in movie
      ? Array.from(
          new Set((movie as NowPlayingMovie).cinemas.map((c) => c.chain)),
        )
      : [];

  return (
    <button onClick={onClick} className="group block text-left w-full">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-secondary mb-2">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={movie.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
          <span className="text-[10px] text-white/80 font-medium flex items-center gap-1">
            <Info className="w-2.5 h-2.5" />
            {locale === "id" ? "Detail" : "Details"}
          </span>
        </div>
        {movie.vote_average != null && movie.vote_average > 0 && (
          <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            <span className="text-[9px] font-bold text-white">
              {movie.vote_average.toFixed(1)}
            </span>
          </div>
        )}
        {badge && <div className="absolute top-1.5 left-1.5">{badge}</div>}
      </div>

      <div className="flex-1 min-w-0">
        {chains.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-1.5">
            {chains.map((ch) => (
              <Badge
                key={ch}
                className={cn(
                  "text-[9px] px-1.5",
                  CHAIN_COLORS[ch] ?? "bg-white/10",
                )}
              >
                {ch}
              </Badge>
            ))}
            {"age_rating" in movie &&
              (movie as NowPlayingMovie).age_rating &&
              (movie as NowPlayingMovie).age_rating !== "-" && (
                <Badge className="bg-white/10 text-[9px] px-1.5">
                  {(movie as NowPlayingMovie).age_rating}
                </Badge>
              )}
          </div>
        )}
        <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors mb-0.5">
          {movie.title}
        </p>
        {"genre" in movie && (movie as NowPlayingMovie).genre && (
          <p className="text-[11px] text-muted-foreground truncate">
            {(movie as NowPlayingMovie).genre}
          </p>
        )}

        {"duration" in movie && (movie as NowPlayingMovie).duration && (
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {(movie as NowPlayingMovie).duration}
          </p>
        )}
        {"genres" in movie && (
          <p className="text-[11px] text-violet-300 mt-0.5 truncate">
            {(movie as NowPlayingMovie).genres?.length > 0
              ? (movie as NowPlayingMovie).genres.map((g) => g.name).join(" • ")
              : locale === "id"
                ? "Belum dikategorikan"
                : "Not categorized"}
          </p>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function CinemaPage() {
  const { locale } = useI18n();

  // ── State ──────────────────────────────────────────────────────────
  const [cities, setCities] = useState<string[]>([]);
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingMovie[]>([]);
  const [nowPlayingByChain, setNowPlayingByChain] = useState<
    NowPlayingByChain[]
  >([]);
  // const [comingSoon, setComingSoon] = useState<ComingSoonMovie[]>([]);
  const [upcomingMovies, setUpcomingMovies] = useState<UpcomingMovie[]>([]);
  const [showDateUsed, setShowDateUsed] = useState<string>("");
  const [isFallback, setIsFallback] = useState(false);

  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingCinemas, setLoadingCinemas] = useState(false);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [locating, setLocating] = useState(false);

  // Default: Jakarta + XXI
  const [cityFilter, setCityFilter] = useState(DEFAULT_CITY);
  const [chainFilter, setChainFilter] = useState<Chain>(DEFAULT_CHAIN);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedNowPlaying, setSelectedNowPlaying] =
    useState<NowPlayingMovie | null>(null);
  // const [selectedComingSoon, setSelectedComingSoon] =
  //   useState<ComingSoonMovie | null>(null);
  const [selectedUpcoming, setSelectedUpcoming] =
    useState<UpcomingMovie | null>(null);
  const [selectedCinema, setSelectedCinema] = useState<Cinema | null>(null);

  // ── Load cities on mount ───────────────────────────────────────────
  useEffect(() => {
    setLoadingCities(true);
    apiFetchCities()
      .then((data) => {
        setCities(data);
        if (data.length > 0 && !data.includes(DEFAULT_CITY)) {
          setCityFilter(data[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingCities(false));
  }, []);

  // ── Load upcoming on mount (once, independent of city/chain) ──────
  useEffect(() => {
    setLoadingUpcoming(true);
    apiFetchUpcoming(locale)
      .then(setUpcomingMovies)
      .catch(console.error)
      .finally(() => setLoadingUpcoming(false));
  }, [locale]);

  // ── Load cinemas when city / chain changes ─────────────────────────
  useEffect(() => {
    if (!cityFilter) return;
    setLoadingCinemas(true);
    setSelectedCinema(null);
    apiFetchCinemas(cityFilter, chainFilter)
      .then(setCinemas)
      .catch(console.error)
      .finally(() => setLoadingCinemas(false));
  }, [cityFilter, chainFilter]);

  // ── Load movies when city / chain / locale changes ─────────────────
  useEffect(() => {
    if (!cityFilter) return;
    setLoadingMovies(true);
    apiFetchMovies(cityFilter, chainFilter, locale)
      .then(
        ({
          nowPlaying,
          nowPlayingByChain,
          comingSoon,
          show_date_used,
          is_fallback,
        }) => {
          setNowPlaying(nowPlaying);
          setNowPlayingByChain(nowPlayingByChain);
          // setComingSoon(comingSoon);
          setShowDateUsed(show_date_used);
          setIsFallback(is_fallback);
        },
      )
      .catch(console.error)
      .finally(() => setLoadingMovies(false));
  }, [cityFilter, chainFilter, locale]);

  // ── Geolocation ────────────────────────────────────────────────────
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        let detected = "";
        if (lat > -7.5 && lat < -5.9 && lng > 106.5 && lng < 107.2)
          detected = "Jakarta";
        else if (lat > -7.1 && lat < -6.7 && lng > 107.3 && lng < 107.8)
          detected = "Bandung";
        else if (lat > -7.4 && lat < -7.1 && lng > 112.5 && lng < 113)
          detected = "Surabaya";
        else if (lat > -8.0 && lat < -7.6 && lng > 110.2 && lng < 110.7)
          detected = "Yogyakarta";
        else if (lat > 3.3 && lat < 3.7 && lng > 98.5 && lng < 99)
          detected = "Medan";
        else if (lat > -8.8 && lat < -8.5 && lng > 115.0 && lng < 115.5)
          detected = "Denpasar";
        if (detected && cities.includes(detected)) setCityFilter(detected);
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
  }, [cities]);

  // ── Derived ────────────────────────────────────────────────────────
  const filteredCinemas = useMemo(
    () =>
      cinemas.filter(
        (c) =>
          !searchQuery ||
          c.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [cinemas, searchQuery],
  );

  // Active chain's now-playing data (for fallback badge)
  const activeChainData = useMemo(
    () => nowPlayingByChain.find((b) => b.chain === chainFilter),
    [nowPlayingByChain, chainFilter],
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen pt-6 pb-24 animate-fade-in">
      {/* ── Header ── */}
      <div className="px-4 lg:px-6 mb-6">
        <Badge
          className="mb-3 bg-emerald-600/20 text-emerald-300 border-emerald-500/30"
          variant="outline"
        >
          <MapPin className="w-3 h-3 mr-1" />
          {locale === "id" ? "Bioskop Terdekat" : "Nearest Cinema"}
        </Badge>
        <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
          {locale === "id"
            ? "Cari Bioskop & Jadwal Tayang"
            : "Find Cinemas & Showtimes"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {locale === "id"
            ? "Temukan XXI, CGV, dan Cinépolis terdekat — plus film yang sedang tayang."
            : "Find the nearest XXI, CGV, and Cinépolis — plus currently showing movies."}
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="px-4 lg:px-6 mb-8 space-y-3">
        {/* Row 1: Search + City dropdown + Locate button */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                locale === "id"
                  ? "Cari nama bioskop ..."
                  : "Search cinema name ..."
              }
              className="pl-9 h-9"
            />
          </div>

          <div className="relative">
            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 pointer-events-none" />
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              disabled={loadingCities}
              className={cn(
                "h-9 appearance-none rounded-md border border-white/10 bg-background",
                "pl-7 pr-7 text-sm font-medium text-foreground",
                "focus:outline-none transition-colors cursor-pointer disabled:opacity-50",
              )}
            >
              {loadingCities ? (
                <option>Loading...</option>
              ) : (
                cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))
              )}
            </select>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLocate}
            disabled={locating}
            className="gap-1.5 border border-white/10 hover:border-white/25 shrink-0 px-3"
          >
            {locating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
            <span className="hidden sm:inline text-xs">
              {locale === "id" ? "Lokasi Saya" : "My Location"}
            </span>
          </Button>
        </div>

        {/* Row 2: Chain filter pills */}
        <div className="flex gap-2">
          {CHAINS.map((chain) => (
            <button
              key={chain}
              onClick={() => setChainFilter(chain)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                chainFilter === chain
                  ? CHAIN_COLORS[chain]
                  : "border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full inline-block mr-1.5 align-middle",
                  CHAIN_DOT[chain],
                )}
              />
              {chain}
            </button>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Now Playing                                                    */}
      {/* ============================================================ */}
      <div className="px-4 lg:px-6 mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">
            {locale === "id" ? "Sedang Tayang" : "Now Playing"}
          </h2>
          {!loadingMovies && activeChainData?.show_date_used && (
            <Badge
              className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 ml-3 mt-0.5 text-[10px]"
              variant="outline"
            >
              <Clock className="w-2.5 h-2.5 mr-1" />
              {formatDateShort(activeChainData.show_date_used, locale)}
            </Badge>
          )}
        </div>

        {/* Per-chain fallback notices */}
        {!loadingMovies &&
          nowPlayingByChain.some(
            (b) => b.is_fallback && b.movies.length > 0,
          ) && (
            <div className="space-y-2 mb-4">
              {nowPlayingByChain
                .filter((b) => b.is_fallback && b.movies.length > 0)
                .map((b) => (
                  <div
                    key={b.chain}
                    className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10
                    px-3 py-2.5 text-xs text-amber-300"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      <span
                        className={cn(
                          "font-bold mr-1",
                          CHAIN_COLORS[b.chain].split(" ")[1],
                        )}
                      >
                        {b.chain}:
                      </span>
                      {locale === "id"
                        ? `Jadwal hari ini belum tersedia. Menampilkan dari ${formatDate(b.show_date_used, locale)}.`
                        : `Today's schedule unavailable. Showing from ${formatDate(b.show_date_used, locale)}.`}
                    </span>
                  </div>
                ))}
            </div>
          )}

        {loadingMovies ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : nowPlaying.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {nowPlaying.map((movie, i) => (
              <MovieCard
                key={movie.movie_id ?? `${movie.title}-${i}`}
                movie={movie}
                onClick={() => setSelectedNowPlaying(movie)}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">
            {locale === "id"
              ? "Tidak ada film yang sedang tayang untuk kota ini."
              : "No movies currently playing for this city."}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* Upcoming (from movie_categories)                              */}
      {/* ============================================================ */}
      <div className="px-4 lg:px-6 mb-10">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-bold text-white">
            {locale === "id" ? "Segera Hadir" : "Coming Soon"}
          </h2>
        </div>

        {loadingUpcoming ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : upcomingMovies.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {upcomingMovies.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onClick={() => setSelectedUpcoming(movie)}
                locale={locale}
                badge={
                  movie.release_date ? (
                    <Badge
                      className="bg-violet-500/80 text-white border-0 text-[9px] px-1.5 backdrop-blur-sm"
                      variant="outline"
                    >
                      {formatDateShort(movie.release_date, locale)}
                    </Badge>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {locale === "id"
              ? "Belum ada film yang akan tayang."
              : "No upcoming movies yet."}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* Cinema List                                                    */}
      {/* ============================================================ */}
      {(loadingCinemas || filteredCinemas.length > 0) && (
        <div className="px-4 lg:px-6 mb-8">
          {!loadingCinemas && (
            <div className="flex items-center gap-2 mb-5">
              <Film className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-white">
                {filteredCinemas.length}{" "}
                {locale === "id" ? "Bioskop di Lokasi-Mu" : "Cinemas Found"}
              </h2>
            </div>
          )}
          {loadingCinemas ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCinemas.map((cinema) => (
                <div
                  key={cinema.id}
                  onClick={() =>
                    setSelectedCinema(
                      selectedCinema?.id === cinema.id ? null : cinema,
                    )
                  }
                  className={cn(
                    "rounded-xl p-4 border transition-all cursor-pointer",
                    selectedCinema?.id === cinema.id
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full",
                            CHAIN_DOT[cinema.chain] ?? "bg-gray-500",
                          )}
                        />
                        <Badge
                          className={cn(
                            "text-[10px] px-1.5 py-0 h-4",
                            CHAIN_COLORS[cinema.chain] ?? "",
                          )}
                        >
                          {cinema.chain}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {cinema.city}
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-foreground leading-tight truncate">
                        {cinema.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {cinema.address}
                      </p>
                    </div>
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>

                  {selectedCinema?.id === cinema.id && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
                      {cinema.google_maps_url && (
                        <a
                          href={cinema.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg
                            bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                        >
                          <Navigation className="w-3 h-3 inline mr-1" />
                          {locale === "id" ? "Rute" : "Route"}
                        </a>
                      )}
                      <a
                        href={cinema.booking_url || CHAIN_BOOKING[cinema.chain]}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg
                          bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 inline mr-1" />
                        {locale === "id" ? "Beli Tiket" : "Buy Ticket"}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attribution */}
      <div className="px-4 lg:px-6 text-center pb-4">
        <p className="text-[10px] text-muted-foreground/50">
          {locale === "id"
            ? "Data bioskop dari database internal. Jadwal dapat berubah sewaktu-waktu."
            : "Cinema data from internal database. Schedules may change without notice."}
        </p>
      </div>

      {/* ── Modals ── */}
      {selectedNowPlaying && (
        <NowPlayingDetailModal
          movie={selectedNowPlaying}
          onClose={() => setSelectedNowPlaying(null)}
          locale={locale}
          activeChainFilter={chainFilter}
        />
      )}
      {/* {selectedComingSoon && (
        <ComingSoonModal
          movie={selectedComingSoon}
          onClose={() => setSelectedComingSoon(null)}
          locale={locale}
        />
      )} */}
      {selectedUpcoming && (
        <UpcomingDetailModal
          movie={selectedUpcoming}
          onClose={() => setSelectedUpcoming(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
