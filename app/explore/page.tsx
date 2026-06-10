"use client";
// app/explore/page.tsx

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  Suspense,
  useMemo,
} from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";
import {
  Search,
  SlidersHorizontal,
  X,
  Clapperboard,
  ChevronDown,
  Tv,
  Film,
  Play,
  Info,
  Star,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Movie {
  id: number;
  title: string;
  tmdb_id: number;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  popularity?: number;
  overview?: string;
  genre_ids?: number[];
  trailer?: string | null;
}

interface TvSeries {
  id: number;
  name: string;
  tmdb_id: number;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date?: string;
  popularity?: number;
  overview?: string;
  number_of_seasons?: number;
  genre_ids?: number[];
  trailer?: string | null;
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

interface ProductionCompany {
  id: number;
  tmdb_company_id: number;
  name: string;
}

interface TvNetwork {
  id: number;
  tmdb_network_id: number;
  name: string;
}

type ContentTab = "movie" | "tv";
type MovieSortKey = "release_date" | "popular" | "top_rated";
type TvSortKey = "popular" | "top_rated" | "on_the_air" | "trending";
// "all" = tidak filter, "id" = hanya Bahasa Indonesia
type OriginalLanguageFilter = "all" | "id";

interface FilterState {
  platforms: string[]; // [] = all; multi-select OR
  genreIds: number[]; // [] = all; multi-select AND
  yearFrom: number | null;
  yearTo: number | null;
  companyId: number | null; // movie only
  networkId: number | null; // tv only
  voteMin: number | null;
  voteMax: number | null;
  originalLanguage: OriginalLanguageFilter; // NEW
}

const EMPTY_FILTER: FilterState = {
  platforms: [],
  genreIds: [],
  yearFrom: null,
  yearTo: null,
  companyId: null,
  networkId: null,
  voteMin: null,
  voteMax: null,
  originalLanguage: "all", // NEW
};

// Slug platform yang tidak muncul di filter
const EXCLUDED_PLATFORM_SLUGS = ["bioskop", "disney-lama"];

const MOVIE_SORT_OPTIONS: {
  key: MovieSortKey;
  labelId: string;
  labelEn: string;
}[] = [
  { key: "release_date", labelId: "Terbaru", labelEn: "Latest" },
  { key: "popular", labelId: "Populer", labelEn: "Popular" },
  { key: "top_rated", labelId: "Rating Terbaik", labelEn: "Top Rated" },
];

const TV_SORT_OPTIONS: { key: TvSortKey; labelId: string; labelEn: string }[] =
  [
    { key: "popular", labelId: "Populer", labelEn: "Popular" },
    { key: "top_rated", labelId: "Rating Terbaik", labelEn: "Top Rated" },
    { key: "on_the_air", labelId: "Sedang Tayang", labelEn: "On The Air" },
    { key: "trending", labelId: "Trending", labelEn: "Trending" },
  ];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 1899 },
  (_, i) => CURRENT_YEAR - i,
);

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

// ─── Trailer Modal ────────────────────────────────────────────────────────────

interface TrailerModalProps {
  videoId: string;
  title: string;
  onClose: () => void;
}

function TrailerModal({ videoId, title, onClose }: TrailerModalProps) {
  // Tutup dengan Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="w-full max-w-3xl pointer-events-auto animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm font-semibold text-white/90 truncate pr-4">
              {title}
            </p>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          {/* Player */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Explore Card Wrapper ─────────────────────────────────────────────────────

// ─── Explore Card (standalone) ───────────────────────────────────────────────

interface ExploreCardProps {
  href: string;
  posterPath: string | null;
  trailer: string | null | undefined;
  title: string;
  locale: string;
  year?: string | null;
  genreIds?: number[];
  allGenres: Genre[];
  voteAverage?: number;
  isTv?: boolean;
  numberOfSeasons?: number;
  onTrailerClick: () => void;
}

function ExploreCard({
  href,
  posterPath,
  trailer,
  title,
  locale,
  year,
  genreIds,
  allGenres,
  voteAverage,
  isTv = false,
  numberOfSeasons,
  onTrailerClick,
}: ExploreCardProps) {
  const firstGenre =
    genreIds && genreIds.length > 0
      ? allGenres.find((g) => genreIds.includes(g.tmdb_genre_id))
      : null;

  const posterUrl = posterPath
    ? posterPath.startsWith("http://") || posterPath.startsWith("https://")
      ? posterPath
      : `https://image.tmdb.org/t/p/w342${posterPath}`
    : null;

  return (
    <div className="group relative">
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 hover-lift card-shine">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            No Image
          </div>
        )}

        {/* Gradient overlay saat hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-xs">
          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
          <span className="text-white font-medium">
            {voteAverage.toFixed(1)}
          </span>
        </div>

        {/* TV badge */}
        {isTv && (
          <div className="absolute top-2.5 left-2 px-2 py-1 rounded-md bg-primary/80 backdrop-blur-sm">
            <Tv className="w-2.5 h-2.5 text-white" />
          </div>
        )}

        {/* Hover action buttons */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          {trailer && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTrailerClick();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg gradient-primary text-white text-xs font-semibold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              {locale === "id" ? "Nonton Trailer" : "Watch Trailer"}
            </button>
          )}
          <a
            href={href}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all duration-200 active:scale-95 text-xs font-semibold"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="w-3.5 h-3.5" />
            {locale === "id" ? "Lihat Detail" : "View Detail"}
          </a>
        </div>
      </div>

      {/* Info di bawah poster */}
      <div className="mt-2 px-0.5">
        <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
          {title}
        </h3>
        <div className="flex items-center gap-1.5 mt-0.5">
          {year && (
            <span className="text-xs text-muted-foreground">{year}</span>
          )}
          {year && firstGenre && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          )}
          {isTv ? (
            <span className="text-xs text-muted-foreground">
              {numberOfSeasons} {numberOfSeasons > 1 ? "Seasons" : "Season"}
            </span>
          ) : firstGenre ? (
            <span className="text-xs text-muted-foreground">
              {firstGenre.name}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ActiveBadgesProps {
  search: string;
  filters: FilterState;
  platforms: Platform[];
  genres: Genre[];
  selectedCompanyName: string | null;
  selectedNetworkName: string | null;
  movieSort: MovieSortKey;
  tvSort: TvSortKey;
  tab: ContentTab;
  locale: string;
  onClearSearch: () => void;
  onClearPlatform: (slug: string) => void;
  onClearGenre: (id: number) => void;
  onClearFilter: (key: keyof FilterState) => void;
  onClearSort: () => void;
}

function ActiveBadges({
  search,
  filters,
  platforms,
  genres,
  selectedCompanyName,
  selectedNetworkName,
  movieSort,
  tvSort,
  tab,
  locale,
  onClearSearch,
  onClearPlatform,
  onClearGenre,
  onClearFilter,
  onClearSort,
}: ActiveBadgesProps) {
  const badges: { label: string; onRemove: () => void }[] = [];

  if (search.trim()) {
    badges.push({ label: `"${search.trim()}"`, onRemove: onClearSearch });
  }

  // Multi platform badges
  for (const slug of filters.platforms) {
    const p = platforms.find((pl) => pl.slug === slug);
    if (p)
      badges.push({ label: p.name, onRemove: () => onClearPlatform(slug) });
  }

  // Multi genre badges
  for (const gid of filters.genreIds) {
    const g = genres.find((ge) => ge.tmdb_genre_id === gid);
    if (g) badges.push({ label: g.name, onRemove: () => onClearGenre(gid) });
  }

  if (filters.yearFrom !== null || filters.yearTo !== null) {
    const from = filters.yearFrom ?? "...";
    const to = filters.yearTo ?? "...";
    badges.push({
      label: `${from} – ${to}`,
      onRemove: () => {
        onClearFilter("yearFrom");
        onClearFilter("yearTo");
      },
    });
  }

  if (filters.companyId !== null && selectedCompanyName) {
    badges.push({
      label: selectedCompanyName,
      onRemove: () => onClearFilter("companyId"),
    });
  }

  if (filters.networkId !== null && selectedNetworkName) {
    badges.push({
      label: selectedNetworkName,
      onRemove: () => onClearFilter("networkId"),
    });
  }

  if (filters.voteMin !== null || filters.voteMax !== null) {
    const min = filters.voteMin ?? 0;
    const max = filters.voteMax ?? 10;
    badges.push({
      label: `⭐ ${min}–${max}`,
      onRemove: () => {
        onClearFilter("voteMin");
        onClearFilter("voteMax");
      },
    });
  }

  // NEW: Original language badge
  if (filters.originalLanguage === "id") {
    badges.push({
      label: locale === "id" ? "🇮🇩 Bahasa Indonesia" : "🇮🇩 Indonesian",
      onRemove: () => onClearFilter("originalLanguage"),
    });
  }

  // Sort badge — hanya jika non-default
  if (tab === "movie" && movieSort !== "release_date") {
    const opt = MOVIE_SORT_OPTIONS.find((s) => s.key === movieSort);
    if (opt)
      badges.push({
        label: locale === "id" ? opt.labelId : opt.labelEn,
        onRemove: onClearSort,
      });
  }
  if (tab === "tv" && tvSort !== "popular") {
    const opt = TV_SORT_OPTIONS.find((s) => s.key === tvSort);
    if (opt)
      badges.push({
        label: locale === "id" ? opt.labelId : opt.labelEn,
        onRemove: onClearSort,
      });
  }

  if (badges.length === 0) return null;

  return (
    <div className="px-4 lg:px-6 mb-3 flex flex-wrap gap-2">
      {badges.map((b, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-medium"
        >
          {b.label}
          <button
            onClick={b.onRemove}
            className="hover:text-primary/70 transition-colors ml-0.5"
            aria-label="Hapus filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

// ─── Filter Modal ─────────────────────────────────────────────────────────────

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  tab: ContentTab;
  filters: FilterState;
  platforms: Platform[];
  genres: Genre[];
  locale: string;
  onApply: (f: FilterState) => void;
  onSelectCompanyName: (name: string | null) => void;
  onSelectNetworkName: (name: string | null) => void;
}

function FilterModal({
  open,
  onClose,
  tab,
  filters,
  platforms,
  genres,
  locale,
  onApply,
  onSelectCompanyName,
  onSelectNetworkName,
}: FilterModalProps) {
  const [draft, setDraft] = useState<FilterState>(filters);

  // ── Company search state ──
  const [companyQuery, setCompanyQuery] = useState("");
  const [companies, setCompanies] = useState<ProductionCompany[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);

  // ── Network search state ──
  const [networkQuery, setNetworkQuery] = useState("");
  const [networks, setNetworks] = useState<TvNetwork[]>([]);
  const [networkLoading, setNetworkLoading] = useState(false);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  // Fetch companies dengan debounce 300ms
  useEffect(() => {
    if (!open || tab !== "movie") return;
    setCompanyLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/movies/companies?q=${encodeURIComponent(companyQuery)}&limit=50`,
        );
        const data = await res.json();
        setCompanies(data ?? []);
      } catch {
        setCompanies([]);
      } finally {
        setCompanyLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [companyQuery, open, tab]);

  // Fetch networks dengan debounce 300ms
  useEffect(() => {
    if (!open || tab !== "tv") return;
    setNetworkLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tv/networks?q=${encodeURIComponent(networkQuery)}&limit=50`,
        );
        const data = await res.json();
        setNetworks(data ?? []);
      } catch {
        setNetworks([]);
      } finally {
        setNetworkLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [networkQuery, open, tab]);

  if (!open) return null;

  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  // Toggle platform (multi)
  const togglePlatform = (slug: string) => {
    setDraft((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(slug)
        ? prev.platforms.filter((s) => s !== slug)
        : [...prev.platforms, slug],
    }));
  };

  // Toggle genre (multi)
  const toggleGenre = (tmdbId: number) => {
    setDraft((prev) => ({
      ...prev,
      genreIds: prev.genreIds.includes(tmdbId)
        ? prev.genreIds.filter((id) => id !== tmdbId)
        : [...prev.genreIds, tmdbId],
    }));
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(EMPTY_FILTER);

  const l = (id: string, en: string) => (locale === "id" ? id : en);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/*
        ── FIX: Modal fixed screen, no scroll on outer container ──
        Struktur: fixed container → flex column → header (sticky) + body (flex-1 overflow-y-auto) + footer (sticky)
        Dengan ini modal sendiri tidak scroll, hanya konten body-nya yang scroll.
      */}
      <div className="fixed inset-x-0 bottom-0 z-50 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg animate-slide-up md:animate-fade-in">
        <div className="glass-strong rounded-t-2xl md:rounded-2xl flex flex-col max-h-[85vh] md:max-h-[80vh]">
          {/* Header — tidak scroll */}
          <div className="shrink-0 border-b border-white/10 px-5 py-4 flex items-center justify-between rounded-t-2xl">
            <h2 className="text-base font-semibold text-foreground">
              {l("Filter", "Filter")}
            </h2>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <button
                  onClick={() => setDraft(EMPTY_FILTER)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-white/10"
                >
                  {l("Reset", "Reset")}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Body — hanya bagian ini yang scroll */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* ── Original Bahasa (NEW) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                {l("Original Bahasa", "Original Language")}
              </p>
              <div className="flex gap-2">
                {(
                  [
                    {
                      value: "all",
                      labelId: "Semua Bahasa",
                      labelEn: "All Languages",
                    },
                    {
                      value: "id",
                      labelId: "Bahasa Indonesia",
                      labelEn: "Indonesian",
                    },
                  ] as {
                    value: OriginalLanguageFilter;
                    labelId: string;
                    labelEn: string;
                  }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => set("originalLanguage", opt.value)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-medium transition-all",
                      draft.originalLanguage === opt.value
                        ? "gradient-primary text-white"
                        : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
                    )}
                  >
                    {locale === "id" ? opt.labelId : opt.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Platform (multi-select) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                {l("Platform", "Platform")}
                {draft.platforms.length > 0 && (
                  <span className="ml-2 text-primary normal-case font-bold">
                    ({draft.platforms.length} dipilih)
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {platforms
                  .filter((p) => !EXCLUDED_PLATFORM_SLUGS.includes(p.slug))
                  .map((p) => {
                    const selected = draft.platforms.includes(p.slug);
                    return (
                      <button
                        key={p.slug}
                        onClick={() => togglePlatform(p.slug)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                          selected
                            ? "gradient-primary text-white"
                            : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* ── Genre (multi-select) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                {l("Genre", "Genre")}
                {draft.genreIds.length > 0 && (
                  <span className="ml-2 text-primary normal-case font-bold">
                    ({draft.genreIds.length} dipilih)
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {genres.map((g) => {
                  const selected = draft.genreIds.includes(g.tmdb_genre_id);
                  return (
                    <button
                      key={g.tmdb_genre_id}
                      onClick={() => toggleGenre(g.tmdb_genre_id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        selected
                          ? "gradient-primary text-white"
                          : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
                      )}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Year Range ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                {l("Tahun Rilis", "Release Year")}
              </p>
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {l("Dari", "From")}
                  </label>
                  <div className="relative">
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <select
                      value={draft.yearFrom ?? ""}
                      onChange={(e) =>
                        set(
                          "yearFrom",
                          e.target.value ? parseInt(e.target.value) : null,
                        )
                      }
                      className="w-full appearance-none rounded-lg border border-white/10 bg-background/80 px-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
                    >
                      <option value="">—</option>
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {l("Sampai", "To")}
                  </label>
                  <div className="relative">
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <select
                      value={draft.yearTo ?? ""}
                      onChange={(e) =>
                        set(
                          "yearTo",
                          e.target.value ? parseInt(e.target.value) : null,
                        )
                      }
                      className="w-full appearance-none rounded-lg border border-white/10 bg-background/80 px-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
                    >
                      <option value="">—</option>
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Production Company (movie only) ── */}
            {tab === "movie" && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                  {l("Production House", "Production Company")}
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={companyQuery}
                    onChange={(e) => setCompanyQuery(e.target.value)}
                    placeholder={l(
                      "Cari production house...",
                      "Search company...",
                    )}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                  <button
                    onClick={() => {
                      set("companyId", null);
                      onSelectCompanyName(null);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-xs transition-colors",
                      draft.companyId === null
                        ? "text-primary bg-primary/10 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                    )}
                  >
                    {l("Semua Production House", "All Companies")}
                  </button>
                  {companyLoading && (
                    <p className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
                      {l("Memuat...", "Loading...")}
                    </p>
                  )}
                  {!companyLoading && companies.length === 0 && (
                    <p className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
                      {l("Tidak ditemukan", "Not found")}
                    </p>
                  )}
                  {!companyLoading &&
                    companies.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          const next = draft.companyId === c.id ? null : c.id;
                          set("companyId", next);
                          onSelectCompanyName(next === null ? null : c.name);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 text-xs transition-colors",
                          draft.companyId === c.id
                            ? "text-primary bg-primary/10 font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* ── Network / Channel (tv only) ── */}
            {tab === "tv" && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                  {l("Network / Channel", "Network / Channel")}
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={networkQuery}
                    onChange={(e) => setNetworkQuery(e.target.value)}
                    placeholder={l("Cari network...", "Search network...")}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                  <button
                    onClick={() => {
                      set("networkId", null);
                      onSelectNetworkName(null);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-xs transition-colors",
                      draft.networkId === null
                        ? "text-primary bg-primary/10 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                    )}
                  >
                    {l("Semua Network", "All Networks")}
                  </button>
                  {networkLoading && (
                    <p className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
                      {l("Memuat...", "Loading...")}
                    </p>
                  )}
                  {!networkLoading && networks.length === 0 && (
                    <p className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
                      {l("Tidak ditemukan", "Not found")}
                    </p>
                  )}
                  {!networkLoading &&
                    networks.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          const next = draft.networkId === n.id ? null : n.id;
                          set("networkId", next);
                          onSelectNetworkName(next === null ? null : n.name);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 text-xs transition-colors",
                          draft.networkId === n.id
                            ? "text-primary bg-primary/10 font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                        )}
                      >
                        {n.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* ── Vote Average ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                {l("Rating (Vote Average)", "Rating (Vote Average)")}
                {(draft.voteMin !== null || draft.voteMax !== null) && (
                  <span className="ml-2 text-primary font-bold normal-case">
                    {draft.voteMin ?? 0} – {draft.voteMax ?? 10}
                  </span>
                )}
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-8">Min</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={draft.voteMin ?? 0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      set("voteMin", v === 0 ? null : v);
                    }}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-xs text-foreground w-8 text-right font-medium">
                    {draft.voteMin ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-8">Max</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={draft.voteMax ?? 10}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      set("voteMax", v === 10 ? null : v);
                    }}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-xs text-foreground w-8 text-right font-medium">
                    {draft.voteMax ?? 10}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer — tidak scroll */}
          <div className="shrink-0 border-t border-white/10 px-5 py-4">
            <button
              onClick={() => {
                onApply(draft);
                onClose();
              }}
              className="w-full gradient-primary text-white font-semibold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
            >
              {l("Terapkan Filter", "Apply Filters")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────

function ExploreContent() {
  const { locale } = useI18n();
  const searchParams = useSearchParams();

  // ── Tab ──
  const [tab, setTab] = useState<ContentTab>("movie");

  // ── Metadata ──
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string | null>(
    null,
  );
  const [selectedNetworkName, setSelectedNetworkName] = useState<string | null>(
    null,
  );

  // ── Search ──
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Filter & Sort ──
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER);
  const [movieSort, setMovieSort] = useState<MovieSortKey>("release_date");
  const [tvSort, setTvSort] = useState<TvSortKey>("popular");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // ── Data ──
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tvSeries, setTvSeries] = useState<TvSeries[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "done">(
    "loading",
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // ── Trailer ──
  const [trailerItem, setTrailerItem] = useState<{
    videoId: string;
    title: string;
  } | null>(null);

  // Refs untuk infinite scroll
  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const loadingRef = useRef(true);

  // ── Init: platforms & genres ───────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────────────────
  // Poin 3: Init filter dari URL search params (deep link dari halaman lain)
  //
  // Supported params:
  //   tab            → "movie" | "tv"
  //   sort           → MovieSortKey | TvSortKey
  //   lang_filter    → "id"  (aktifkan filter Bahasa Indonesia)
  //   platform       → slug platform (sudah ada sebelumnya)
  //   genre_id       → tmdb_genre_id (sudah ada sebelumnya)
  //
  // Contoh: /explore?tab=movie&sort=popular&lang_filter=id
  // ──────────────────────────────────────────────────────────────────────────
  const urlParamsInitialized = useRef(false);

  useEffect(() => {
    if (urlParamsInitialized.current) return;
    urlParamsInitialized.current = true;

    let newFilters = { ...EMPTY_FILTER };
    let newMovieSort: MovieSortKey = "release_date";
    let newTvSort: TvSortKey = "popular";
    let newTab: ContentTab = "movie";

    // Tab
    const tabParam = searchParams.get("tab");
    if (tabParam === "tv") newTab = "tv";

    // Sort
    const sortParam = searchParams.get("sort");
    if (sortParam) {
      const validMovieSorts: MovieSortKey[] = [
        "release_date",
        "popular",
        "top_rated",
      ];
      const validTvSorts: TvSortKey[] = [
        "popular",
        "top_rated",
        "on_the_air",
        "trending",
      ];
      if (
        newTab === "movie" &&
        validMovieSorts.includes(sortParam as MovieSortKey)
      ) {
        newMovieSort = sortParam as MovieSortKey;
      } else if (
        newTab === "tv" &&
        validTvSorts.includes(sortParam as TvSortKey)
      ) {
        newTvSort = sortParam as TvSortKey;
      }
    }

    // Original language filter
    const langFilter = searchParams.get("lang_filter");
    if (langFilter === "id") {
      newFilters = { ...newFilters, originalLanguage: "id" };
    }

    // Platform (sudah ada sebelumnya)
    const platformParam = searchParams.get("platform");
    if (platformParam && platformParam !== "all") {
      newFilters = { ...newFilters, platforms: [platformParam.toLowerCase()] };
    }

    // Genre IDs
    const genreParams = searchParams
      .getAll("genre_id")
      .map(Number)
      .filter(Boolean);
    if (genreParams.length > 0) {
      newFilters = { ...newFilters, genreIds: genreParams };
    }

    setTab(newTab);
    setMovieSort(newMovieSort);
    setTvSort(newTvSort);
    setFilters(newFilters);
  }, [searchParams]);

  // ── Search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setAppliedSearch(searchInput);
    }, 500);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(
    async (currentPage: number, isLoadMore: boolean) => {
      if (!isLoadMore) {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
      }

      if (isLoadMore) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        loadingRef.current = true;
        setLoadState("loading");
      }

      try {
        const params = new URLSearchParams({
          lang: locale === "id" ? "id" : "en",
          page: String(currentPage),
          limit: "20",
        });

        if (appliedSearch) params.set("search", appliedSearch);
        if (filters.yearFrom !== null)
          params.set("year_from", String(filters.yearFrom));
        if (filters.yearTo !== null)
          params.set("year_to", String(filters.yearTo));
        if (filters.voteMin !== null)
          params.set("vote_min", String(filters.voteMin));
        if (filters.voteMax !== null)
          params.set("vote_max", String(filters.voteMax));

        // NEW: original_language filter
        if (filters.originalLanguage === "id") {
          params.set("original_language", "id");
        }

        // Multi platform → append masing-masing
        for (const slug of filters.platforms) {
          params.append("platform", slug);
        }
        // Multi genre → append masing-masing
        for (const gid of filters.genreIds) {
          params.append("genre_id", String(gid));
        }

        if (tab === "movie") {
          params.set("sort", movieSort);
          if (filters.companyId !== null)
            params.set("company_id", String(filters.companyId));

          const res = await fetch(`/api/movies/explore?${params}`, {
            signal: isLoadMore ? undefined : abortRef.current?.signal,
          });
          if (!res.ok) throw new Error(`API ${res.status}`);
          const json = await res.json();
          const newMovies: Movie[] = json.movies ?? [];
          const more = currentPage < (json.totalPages ?? 1);

          setMovies((prev) => {
            if (!isLoadMore) return newMovies;
            const existing = new Set(prev.map((m) => m.id));
            return [...prev, ...newMovies.filter((m) => !existing.has(m.id))];
          });
          hasMoreRef.current = more;
          setHasMore(more);
        } else {
          params.set("sort", tvSort);
          if (filters.networkId !== null)
            params.set("network_id", String(filters.networkId));

          const res = await fetch(`/api/tv/explore?${params}`, {
            signal: isLoadMore ? undefined : abortRef.current?.signal,
          });
          if (!res.ok) throw new Error(`API ${res.status}`);
          const json = await res.json();
          const newSeries: TvSeries[] = json.series ?? [];
          const more = currentPage < (json.totalPages ?? 1);

          setTvSeries((prev) => {
            if (!isLoadMore) return newSeries;
            const existing = new Set(prev.map((s) => s.id));
            return [...prev, ...newSeries.filter((s) => !existing.has(s.id))];
          });
          hasMoreRef.current = more;
          setHasMore(more);
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.error("[Explore] fetch error:", e);
      } finally {
        loadingRef.current = false;
        loadingMoreRef.current = false;
        setLoadingMore(false);
        if (!isLoadMore) setLoadState("done");
      }
    },
    [tab, filters, appliedSearch, movieSort, tvSort, locale],
  );

  // Reset & fetch saat dependency berubah
  useEffect(() => {
    pageRef.current = 1;
    hasMoreRef.current = true;
    setPage(1);
    setMovies([]);
    setTvSeries([]);
    setHasMore(true);
    fetchData(1, false);
  }, [fetchData]);

  // ── Infinite scroll observer ──────────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMoreRef.current &&
          !loadingMoreRef.current &&
          !loadingRef.current
        ) {
          const next = pageRef.current + 1;
          pageRef.current = next;
          setPage(next);
          fetchData(next, true);
        }
      },
      { threshold: 0, rootMargin: "300px" },
    );

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [fetchData]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleApplyFilter = useCallback((f: FilterState) => setFilters(f), []);

  const handleClearPlatform = useCallback((slug: string) => {
    setFilters((prev) => ({
      ...prev,
      platforms: prev.platforms.filter((s) => s !== slug),
    }));
  }, []);

  const handleClearGenre = useCallback((id: number) => {
    setFilters((prev) => ({
      ...prev,
      genreIds: prev.genreIds.filter((g) => g !== id),
    }));
  }, []);

  const handleClearFilter = useCallback((key: keyof FilterState) => {
    setFilters((prev) => ({ ...prev, [key]: EMPTY_FILTER[key] }));
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setAppliedSearch("");
  }, []);

  const handleClearSort = useCallback(() => {
    if (tab === "movie") setMovieSort("release_date");
    else setTvSort("popular");
  }, [tab]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentSortLabel = useMemo(() => {
    if (tab === "movie") {
      const opt = MOVIE_SORT_OPTIONS.find((s) => s.key === movieSort);
      return opt ? (locale === "id" ? opt.labelId : opt.labelEn) : "";
    }
    const opt = TV_SORT_OPTIONS.find((s) => s.key === tvSort);
    return opt ? (locale === "id" ? opt.labelId : opt.labelEn) : "";
  }, [tab, movieSort, tvSort, locale]);

  const sortOptions = tab === "movie" ? MOVIE_SORT_OPTIONS : TV_SORT_OPTIONS;
  const currentSort = tab === "movie" ? movieSort : tvSort;
  const displayMovies = movies;
  const displaySeries = tvSeries;

  const hasActiveFilter =
    filters.platforms.length > 0 ||
    filters.genreIds.length > 0 ||
    filters.yearFrom !== null ||
    filters.yearTo !== null ||
    filters.companyId !== null ||
    filters.networkId !== null ||
    filters.voteMin !== null ||
    filters.voteMax !== null ||
    filters.originalLanguage !== "all"; // NEW

  const switchTab = (next: ContentTab) => {
    setTab(next);
    setPage(1);
    pageRef.current = 1;
    setMovies([]);
    setTvSeries([]);
    setHasMore(true);
    hasMoreRef.current = true;
    setLoadState("loading");
  };

  return (
    <div className="min-h-screen pt-6 pb-24">
      {/* ── Header ── */}
      <div className="px-4 lg:px-6 mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
          {locale === "id" ? "Jelajahi" : "Explore"}
        </h1>
      </div>

      {/* ── Content Tabs ── */}
      <div className="px-4 lg:px-6 mb-5">
        <div className="inline-flex gap-1 p-1 rounded-xl glass">
          <button
            onClick={() => switchTab("movie")}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
              tab === "movie"
                ? "gradient-primary text-white shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Film className="w-4 h-4" />
            {locale === "id" ? "Film" : "Movies"}
          </button>
          <button
            onClick={() => switchTab("tv")}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
              tab === "tv"
                ? "gradient-primary text-white shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Tv className="w-4 h-4" />
            {locale === "id" ? "TV Series" : "TV Series"}
          </button>
        </div>
      </div>

      {/* ── Search + Filter + Sort bar ── */}
      <div className="px-4 lg:px-6 mb-4">
        <div className="flex gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            {searchInput && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={
                locale === "id"
                  ? tab === "movie"
                    ? "Cari judul film..."
                    : "Cari judul series..."
                  : tab === "movie"
                    ? "Search movie title..."
                    : "Search series title..."
              }
              className="pl-9 pr-9 h-10"
            />
          </div>

          {/* Filter button */}
          <button
            onClick={() => setFilterModalOpen(true)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all h-10 shrink-0",
              hasActiveFilter
                ? "gradient-primary text-white shadow-lg shadow-primary/20"
                : "glass text-muted-foreground hover:text-foreground hover:bg-white/10 border border-white/10",
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">
              {locale === "id" ? "Filter" : "Filter"}
            </span>
            {hasActiveFilter && (
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
            )}
          </button>

          {/* Sort dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setSortMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg glass text-sm font-medium text-foreground hover:bg-white/10 transition-colors h-10 border border-white/10"
            >
              <span className="hidden sm:inline text-muted-foreground text-xs">
                {locale === "id" ? "Sortir:" : "Sort:"}
              </span>
              <span>{currentSortLabel}</span>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
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
                <div className="absolute top-full right-0 mt-2 z-20 min-w-[180px] rounded-xl glass-strong py-1 animate-fade-in">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        if (tab === "movie")
                          setMovieSort(opt.key as MovieSortKey);
                        else setTvSort(opt.key as TvSortKey);
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm transition-colors",
                        currentSort === opt.key
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
      </div>

      {/* ── Active Filter Badges ── */}
      <ActiveBadges
        search={appliedSearch}
        filters={filters}
        platforms={platforms}
        genres={genres}
        selectedCompanyName={selectedCompanyName}
        selectedNetworkName={selectedNetworkName}
        movieSort={movieSort}
        tvSort={tvSort}
        tab={tab}
        locale={locale}
        onClearSearch={handleClearSearch}
        onClearPlatform={handleClearPlatform}
        onClearGenre={handleClearGenre}
        onClearFilter={handleClearFilter}
        onClearSort={handleClearSort}
      />

      {/* ── Grid ── */}
      <div className="px-4 lg:px-6">
        {loadState === "loading" ? (
          <GridSkeleton />
        ) : loadState === "done" &&
          displayMovies.length === 0 &&
          displaySeries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="w-20 h-20 rounded-2xl glass-strong flex items-center justify-center mb-4">
              <Clapperboard className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {locale === "id" ? "Tidak ada hasil" : "No results"}
            </h3>
            <p className="text-muted-foreground text-sm text-center max-w-xs">
              {locale === "id"
                ? "Coba ubah filter atau kata kunci pencarian"
                : "Try changing your filters or search terms"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in">
            {tab === "movie"
              ? displayMovies.map((item) => (
                  <ExploreCard
                    key={item.id}
                    href={`/movie/${item.tmdb_id}`}
                    posterPath={item.poster_path}
                    trailer={item.trailer}
                    title={item.title}
                    locale={locale}
                    year={
                      item.release_date
                        ? item.release_date.substring(0, 4)
                        : undefined
                    }
                    genreIds={item.genre_ids}
                    allGenres={genres}
                    voteAverage={item.vote_average}
                    onTrailerClick={() =>
                      setTrailerItem({
                        videoId: item.trailer!,
                        title: item.title,
                      })
                    }
                  />
                ))
              : displaySeries.map((item) => (
                  <ExploreCard
                    key={item.id}
                    href={`/tv-series/${item.tmdb_id}`}
                    posterPath={item.poster_path}
                    trailer={item.trailer}
                    title={item.name}
                    locale={locale}
                    year={
                      item.first_air_date
                        ? item.first_air_date.substring(0, 4)
                        : undefined
                    }
                    genreIds={item.genre_ids}
                    allGenres={genres}
                    voteAverage={item.vote_average}
                    isTv
                    numberOfSeasons={item.number_of_seasons}
                    onTrailerClick={() =>
                      setTrailerItem({
                        videoId: item.trailer!,
                        title: item.name,
                      })
                    }
                  />
                ))}
          </div>
        )}

        {/* Sentinel selalu di DOM */}
        <div
          ref={sentinelRef}
          className="h-20 flex items-center justify-center mt-2"
        >
          {loadingMore && (
            <div className="flex items-center gap-3 text-muted-foreground text-md">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
              {/* {locale === "id" ? "Memuat..." : "Loading..."} */}
            </div>
          )}
          {loadState === "done" &&
            !loadingMore &&
            !hasMore &&
            (tab === "movie" ? displayMovies : displaySeries).length > 0 && (
              <p className="text-muted-foreground/50 text-xs">
                {locale === "id"
                  ? `${(tab === "movie" ? displayMovies : displaySeries).length} hasil ditampilkan`
                  : `${(tab === "movie" ? displayMovies : displaySeries).length} results shown`}
              </p>
            )}
        </div>
      </div>

      {/* ── Filter Modal ── */}
      <FilterModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        tab={tab}
        filters={filters}
        platforms={platforms}
        genres={genres}
        locale={locale}
        onSelectCompanyName={setSelectedCompanyName}
        onSelectNetworkName={setSelectedNetworkName}
        onApply={handleApplyFilter}
      />

      {/* ── Trailer Modal ── */}
      {trailerItem && (
        <TrailerModal
          videoId={trailerItem.videoId}
          title={trailerItem.title}
          onClose={() => setTrailerItem(null)}
        />
      )}
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
