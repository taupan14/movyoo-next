"use client";
// app/cinema/page.tsx

import { useEffect, useState, useMemo, useCallback } from "react";
import { useI18n } from "@/hooks/use-locale";
import { supabase } from "@/lib/supabase";
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
  Play,
  ChevronRight,
  Ticket,
  Star,
  Info,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
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

interface MovieSchedule {
  time: string;
  price: number;
  studio: string;
  format: string;
}

interface Theater {
  id: string;
  name: string;
  chain: "XXI" | "CGV" | "Cinepolis";
  address: string;
  city: string;
  google_maps_url: string;
  booking_url: string;
  schedules: MovieSchedule[];
}

interface TheatersByChain {
  XXI: Theater[];
  CGV: Theater[];
  Cinepolis: Theater[];
}

interface TheaterMovie {
  id: string;
  title: string;
  genre: string;
  duration: string;
  age_rating: string;
  format: string;
  poster: string;
  trailer: string;
  synopsis: string;
  director?: string;
  producer?: string;
  player?: string;
  date_show?: string;
  theaters: Theater[];
  theaters_by_chain: TheatersByChain;
}

interface ComingSoonMovie {
  id: string;
  title: string;
  genre: string;
  duration: string;
  age_rating: string;
  format: string;
  poster: string;
  trailer: string;
  synopsis: string;
  date_show: string;
  can_buy: boolean;
  is_ats: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
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

const XXI_CITIES = [
  { id: "10", name: "Jakarta" },
  { id: "2", name: "Bandung" },
  { id: "17", name: "Surabaya" },
  { id: "26", name: "Yogyakarta" },
  { id: "13", name: "Medan" },
  { id: "9", name: "Denpasar" },
];

const CHAINS = ["XXI", "CGV", "Cinepolis"] as const;

/* ------------------------------------------------------------------ */
/*  Movie Detail Modal                                                 */
/* ------------------------------------------------------------------ */

function MovieDetailModal({
  movie,
  onClose,
  locale,
}: {
  movie: TheaterMovie | ComingSoonMovie;
  onClose: () => void;
  locale: string;
}) {
  const [activeChain, setActiveChain] = useState<"XXI" | "CGV" | "Cinepolis">(
    "XXI",
  );
  const [playingTrailer, setPlayingTrailer] = useState(false);

  // Type guard
  const isNowPlaying = "theaters_by_chain" in movie;

  const chainsAvailable = isNowPlaying
    ? (CHAINS.filter(
        (c) => (movie as TheaterMovie).theaters_by_chain[c]?.length > 0,
      ) as ("XXI" | "CGV" | "Cinepolis")[])
    : [];

  useEffect(() => {
    // Auto-select first chain that has data
    if (chainsAvailable.length > 0 && !chainsAvailable.includes(activeChain)) {
      setActiveChain(chainsAvailable[0]);
    }
    // Prevent body scroll
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const theaters = isNowPlaying
    ? (movie as TheaterMovie).theaters_by_chain[activeChain] || []
    : [];

  const formatPrice = (price: number) =>
    price > 0
      ? `Rp ${price.toLocaleString("id-ID")}`
      : locale === "id"
        ? "Cek harga"
        : "Check price";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto
          bg-[#0f0f0f] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Poster + trailer hero */}
        <div className="relative aspect-video bg-black overflow-hidden rounded-t-2xl sm:rounded-t-2xl">
          {playingTrailer && movie.trailer ? (
            <video
              src={movie.trailer}
              autoPlay
              controls
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <>
              {movie.poster ? (
                <img
                  src={movie.poster}
                  alt={movie.title}
                  className="w-full h-full object-cover opacity-60"
                />
              ) : (
                <div className="w-full h-full bg-secondary flex items-center justify-center">
                  <Film className="w-16 h-16 text-muted-foreground" />
                </div>
              )}
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-transparent to-transparent" />

              {/* Play trailer button */}
              {movie.trailer && (
                <button
                  onClick={() => setPlayingTrailer(true)}
                  className="absolute inset-0 flex items-center justify-center group"
                >
                  <div
                    className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30
                    flex items-center justify-center group-hover:bg-white/30 transition-all group-hover:scale-110"
                  >
                    <Play className="w-6 h-6 fill-white text-white ml-0.5" />
                  </div>
                </button>
              )}
            </>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Title & badges */}
          <div>
            <h2 className="text-xl font-bold text-white mb-2 leading-tight">
              {movie.title}
            </h2>
            <div className="flex flex-wrap gap-2">
              {movie.age_rating && movie.age_rating !== "-" && (
                <Badge className="bg-white/10 text-xs">
                  {movie.age_rating}
                </Badge>
              )}
              {movie.genre && (
                <Badge className="bg-white/10 text-xs">{movie.genre}</Badge>
              )}
              {movie.duration && (
                <Badge className="bg-white/10 text-xs">
                  <Clock className="w-2.5 h-2.5 mr-1" />
                  {movie.duration}
                </Badge>
              )}
              {movie.format && (
                <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                  {movie.format}
                </Badge>
              )}
              {"date_show" in movie && movie.date_show && (
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
                  <Calendar className="w-2.5 h-2.5 mr-1" />
                  {movie.date_show}
                </Badge>
              )}
            </div>
          </div>

          {/* Synopsis */}
          {movie.synopsis && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {locale === "id" ? "Sinopsis" : "Synopsis"}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                {movie.synopsis}
              </p>
            </div>
          )}

          {/* Cast info */}
          {"player" in movie && movie.player && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                {locale === "id" ? "Pemain" : "Cast"}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {movie.player}
              </p>
            </div>
          )}

          {/* ---- COMING SOON: CTA ---- */}
          {!isNowPlaying && (
            <div className="flex gap-2 pt-2">
              {(movie as ComingSoonMovie).can_buy && (
                <a
                  href="https://www.21cineplex.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                    bg-rose-500/20 text-rose-300 border border-rose-500/30
                    hover:bg-rose-500/30 transition-colors text-sm font-semibold"
                >
                  <Ticket className="w-4 h-4" />
                  {locale === "id" ? "Beli Tiket" : "Buy Ticket"}
                </a>
              )}
              {movie.trailer && (
                <button
                  onClick={() => setPlayingTrailer(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                    bg-white/10 text-white border border-white/20
                    hover:bg-white/15 transition-colors text-sm font-semibold"
                >
                  <Play className="w-4 h-4" />
                  {locale === "id" ? "Tonton Trailer" : "Watch Trailer"}
                </button>
              )}
            </div>
          )}

          {/* ---- NOW PLAYING: Theater schedules by chain ---- */}
          {isNowPlaying && (
            <div className="space-y-3 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {locale === "id" ? "Jadwal Bioskop" : "Cinema Schedules"}
              </p>

              {/* Chain tabs */}
              {chainsAvailable.length > 0 ? (
                <>
                  <div className="flex gap-2">
                    {chainsAvailable.map((chain) => (
                      <button
                        key={chain}
                        onClick={() => setActiveChain(chain)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                          activeChain === chain
                            ? CHAIN_COLORS[chain]
                            : "border-white/10 text-muted-foreground hover:border-white/25",
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full inline-block mr-1.5 align-middle",
                            CHAIN_DOT[chain],
                          )}
                        />
                        {chain}
                        <span className="ml-1.5 opacity-70">
                          (
                          {theaters.length > 0 || activeChain !== chain
                            ? (movie as TheaterMovie).theaters_by_chain[chain]
                                ?.length
                            : 0}
                          )
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Theater list */}
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {theaters.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {locale === "id"
                          ? "Tidak ada jadwal tersedia"
                          : "No schedules available"}
                      </p>
                    ) : (
                      theaters.map((theater) => (
                        <div
                          key={theater.id}
                          className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2"
                        >
                          {/* Theater header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-white leading-tight">
                                {theater.name}
                              </p>
                              {theater.address && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                  {theater.city ? `${theater.city} — ` : ""}
                                  {theater.address}
                                </p>
                              )}
                            </div>
                            {/* Action buttons */}
                            <div className="flex gap-1.5 shrink-0">
                              <a
                                href={theater.google_maps_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Buka Google Maps"
                                className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300
                                  hover:bg-emerald-500/30 transition-colors"
                              >
                                <Navigation className="w-3.5 h-3.5" />
                              </a>
                              <a
                                href={
                                  theater.booking_url ||
                                  CHAIN_BOOKING[theater.chain]
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Beli Tiket"
                                className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300
                                  hover:bg-rose-500/30 transition-colors"
                              >
                                <Ticket className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>

                          {/* Schedules */}
                          {theater.schedules.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {theater.schedules.map((sch, i) => (
                                <div
                                  key={i}
                                  className="flex flex-col items-center rounded-lg bg-white/10
                                    border border-white/10 px-2.5 py-1.5 min-w-[56px]"
                                >
                                  <span className="text-xs font-bold text-white">
                                    {sch.time}
                                  </span>
                                  {sch.studio && (
                                    <span className="text-[9px] text-muted-foreground">
                                      {sch.studio}
                                    </span>
                                  )}
                                  {sch.price > 0 && (
                                    <span className="text-[9px] text-emerald-400 mt-0.5">
                                      {formatPrice(sch.price)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {locale === "id"
                    ? "Jadwal tidak tersedia untuk kota ini"
                    : "No schedule available for this city"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function CinemaPage() {
  const { t, locale } = useI18n();

  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [cinemaMovies, setCinemaMovies] = useState<TheaterMovie[]>([]);
  const [comingSoon, setComingSoon] = useState<ComingSoonMovie[]>([]);
  const [loading] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [activeChain, setActiveChain] = useState("XXI");
  const [selectedCityId, setSelectedCityId] = useState("10");

  const [cityFilter, setCityFilter] = useState("Jakarta");
  const [chainFilter, setChainFilter] = useState("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCinema, setSelectedCinema] = useState<Cinema | null>(null);
  const [locating, setLocating] = useState(false);

  // Modal state
  const [selectedMovie, setSelectedMovie] = useState<
    TheaterMovie | ComingSoonMovie | null
  >(null);

  /* ------------------------------------------------------------------ */
  /*  Data loading                                                        */
  /* ------------------------------------------------------------------ */

  const loadXXIData = useCallback(async (cityId: string) => {
    setLoadingSchedule(true);
    try {
      const { data, error } = await supabase.functions.invoke("xxi-data", {
        body: { city_id: cityId },
      });
      if (error) throw error;
      setCinemaMovies(data?.movies || []);
      setComingSoon(data?.coming_soon || []);
    } catch (e) {
      console.error("Failed load XXI data", e);
    }
    setLoadingSchedule(false);
  }, []);

  useEffect(() => {
    if (activeChain === "XXI") {
      loadXXIData(selectedCityId);
    }
  }, [activeChain, selectedCityId, loadXXIData]);

  /* ------------------------------------------------------------------ */
  /*  Derived / filter                                                    */
  /* ------------------------------------------------------------------ */

  const chains = useMemo(
    () => [locale === "id" ? "Semua" : "All", "XXI", "CGV", "Cinepolis"],
    [locale],
  );

  const filtered = useMemo(() => {
    const allKey = locale === "id" ? "Semua" : "All";
    return cinemas.filter((c) => {
      if (cityFilter !== allKey && c.city !== cityFilter) return false;
      if (chainFilter !== allKey && c.chain !== chainFilter) return false;
      if (
        searchQuery &&
        !c.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
  }, [cinemas, cityFilter, chainFilter, searchQuery, locale]);

  /* Geolocation */
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (lat > -7.5 && lat < -5.9 && lng > 106.5 && lng < 107.2) {
          setCityFilter("Jakarta");
          setSelectedCityId("10");
        } else if (lat > -7.1 && lat < -6.7) {
          setCityFilter("Bandung");
          setSelectedCityId("2");
        } else if (lat > -7.4 && lat < -7.1 && lng > 112) {
          setCityFilter("Surabaya");
          setSelectedCityId("17");
        } else {
          setCityFilter(locale === "id" ? "Semua" : "All");
        }
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
  }, [locale]);

  /* ------------------------------------------------------------------ */
  /*  Movie Card (shared between Now Playing & Coming Soon)             */
  /* ------------------------------------------------------------------ */

  const MovieCard = ({
    movie,
    showDateBadge = false,
  }: {
    movie: TheaterMovie | ComingSoonMovie;
    showDateBadge?: boolean;
  }) => (
    <button
      key={movie.id}
      onClick={() => setSelectedMovie(movie)}
      className="group block text-left w-full"
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-secondary mb-2">
        {movie.poster ? (
          <img
            src={movie.poster}
            alt={movie.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        {/* Overlay on hover */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent
          opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"
        >
          <span className="text-[10px] text-white/80 font-medium flex items-center gap-1">
            <Info className="w-2.5 h-2.5" />
            {locale === "id" ? "Detail" : "Details"}
          </span>
        </div>

        {/* Coming soon date badge */}
        {showDateBadge && "date_show" in movie && movie.date_show && (
          <div className="absolute top-1.5 left-1.5">
            <span className="text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded">
              {movie.date_show}
            </span>
          </div>
        )}

        {/* Trailer play indicator */}
        {movie.trailer && (
          <div
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60
            flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Play className="w-2.5 h-2.5 fill-white text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[9px] px-1.5">
            XXI
          </Badge>
          {movie.age_rating && movie.age_rating !== "-" && (
            <Badge className="bg-white/10 text-[9px] px-1.5">
              {movie.age_rating}
            </Badge>
          )}
        </div>

        <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors mb-0.5">
          {movie.title}
        </p>

        <p className="text-[11px] text-muted-foreground truncate">
          {movie.genre}
        </p>

        {movie.duration && (
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {movie.duration}
          </p>
        )}
      </div>
    </button>
  );

  /* ------------------------------------------------------------------ */
  /*  Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div className="min-h-screen pt-6 pb-24 animate-fade-in">
      {/* Header */}
      <div className="px-4 lg:px-6 mb-6">
        <Badge className="mb-3 bg-emerald-600/20 text-emerald-300 border-emerald-500/30">
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

      {/* Filters */}
      <div className="px-4 lg:px-6 mb-5 space-y-3">
        {/* Search + Locate */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                locale === "id"
                  ? "Cari nama bioskop..."
                  : "Search cinema name..."
              }
              className="pl-9 h-9"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLocate}
            disabled={locating}
            className="gap-2 border border-white/10 hover:border-white/25"
          >
            {locating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {locale === "id" ? "Lokasi Saya" : "My Location"}
            </span>
          </Button>
        </div>

        {/* City filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {XXI_CITIES.map((city) => (
            <button
              key={city.id}
              onClick={() => {
                setSelectedCityId(city.id);
                setCityFilter(city.name);
              }}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                cityFilter === city.name
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground",
              )}
            >
              {city.name}
            </button>
          ))}
        </div>

        {/* Chain filter */}
        <div className="flex gap-2">
          {chains.map((chain) => (
            <button
              key={chain}
              onClick={() => {
                setChainFilter(chain);
                setActiveChain(chain);
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                chainFilter === chain
                  ? chain === (locale === "id" ? "Semua" : "All")
                    ? "bg-white/10 text-white border-white/30"
                    : CHAIN_COLORS[chain] ||
                      "bg-white/10 text-white border-white/30"
                  : "border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground",
              )}
            >
              {chain}
            </button>
          ))}
        </div>
      </div>

      {/* Cinema list (from Supabase DB) */}
      {filtered.length > 0 && (
        <div className="px-4 lg:px-6 mb-8">
          <p className="text-xs text-muted-foreground mb-3">
            {filtered.length}{" "}
            {locale === "id" ? "bioskop ditemukan" : "cinemas found"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((cinema) => (
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
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full",
                          CHAIN_DOT[cinema.chain] || "bg-gray-500",
                        )}
                      />
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-4",
                          CHAIN_COLORS[cinema.chain] || "",
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
        </div>
      )}

      {/* ================================================================ */}
      {/* NOW PLAYING IN CINEMAS                                            */}
      {/* ================================================================ */}
      <div className="px-4 lg:px-6 mb-8">
        <div className="flex items-center gap-2 mb-5">
          <Calendar className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-gradient">
            {locale === "id"
              ? "Sedang Tayang di Bioskop"
              : "Now Playing in Cinemas"}
          </h2>
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 ml-1">
            <Clock className="w-3 h-3 mr-1" />
            {locale === "id" ? "Sekarang" : "Now"}
          </Badge>
        </div>

        {loadingSchedule ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : cinemaMovies.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {cinemaMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
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

      {/* ================================================================ */}
      {/* COMING SOON                                                       */}
      {/* ================================================================ */}
      {comingSoon.length > 0 && (
        <div className="px-4 lg:px-6 mb-8">
          <div className="flex items-center gap-2 mb-5">
            <Star className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-gradient">
              {locale === "id" ? "Segera Hadir" : "Coming Soon"}
            </h2>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 ml-1">
              <ChevronRight className="w-3 h-3 mr-0.5" />
              {locale === "id" ? "Mendatang" : "Upcoming"}
            </Badge>
          </div>

          {loadingSchedule ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {comingSoon.map((movie) => (
                <MovieCard key={movie.id} movie={movie} showDateBadge />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attribution */}
      <div className="px-4 lg:px-6 text-center">
        <p className="text-[10px] text-muted-foreground/50">
          {locale === "id"
            ? "Data bioskop dari 21 Cineplex & CGV Indonesia. Jadwal dapat berubah sewaktu-waktu."
            : "Cinema data from 21 Cineplex & CGV Indonesia. Schedules may change without notice."}
        </p>
      </div>

      {/* ================================================================ */}
      {/* MOVIE DETAIL MODAL                                                */}
      {/* ================================================================ */}
      {selectedMovie && (
        <MovieDetailModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
