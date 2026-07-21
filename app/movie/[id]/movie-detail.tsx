"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-locale";
import type { TranslationKey } from "@/lib/i18n";
import { getPosterUrl, getBackdropUrl, getProfileUrl } from "@/lib/tmdb";
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
  BookmarkPlus,
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
  MapPin,
  ExternalLink,
  X,
  DollarSign,
  TrendingDown,
  Users,
  Clapperboard,
  Building2,
  PenLine,
  UserCircle2,
  ThumbsUp,
  ThumbsDown,
  Flame,
  Wind,
  Zap as ZapIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";

import AdSenseUnit from "@/components/ads/AdSenseUnit";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
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

interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface ProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

interface DisplayProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  logo_url: string | null;
  url: string | null;
  status: "now" | "coming" | "leaving";
  leavingDays?: number;
}

interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  logo_url: string | null;
  url: string | null;
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

interface CinemaChain {
  chain: string;
  cities: string[];
  booking_url: string;
  google_maps_url: string;
  formats: string[];
  earliest_date: string;
  latest_date: string;
  status: "now_playing" | "ending_soon";
}

interface CinemaData {
  is_showing: boolean;
  chains: CinemaChain[];
}

interface MovieData {
  id: number;
  title: string;
  original_title?: string;
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
  status: string;
  trailer_key?: string | null;
  credits?: {
    cast?: CastMember[];
    crew?: CrewMember[];
  };
  production_companies?: ProductionCompany[];
  "watch/providers"?: WatchProviders;
  cinema?: CinemaData;
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
/*  Community Vote Types                                               */
/* ------------------------------------------------------------------ */

interface VoteCounts {
  worth_it: { yes: number; skip: number; fan: number; total: number };
  pace: { slow: number; medium: number; fast: number; total: number };
  moods: Record<string, number>;
}

interface UserVote {
  worth_it: "yes" | "skip" | "fan" | null;
  pace: "slow" | "medium" | "fast" | null;
  moods: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const WATCHLIST_KEY = "movyoo-watchlist";
const REMINDERS_KEY = "movyoo-reminders";
const VOTE_KEY = "movyoo-votes"; // localStorage key untuk menyimpan vote user

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
  } catch {}
}

function getStoredVotes(movieId: number): UserVote {
  if (typeof window === "undefined")
    return { worth_it: null, pace: null, moods: [] };
  try {
    const raw = localStorage.getItem(`${VOTE_KEY}-${movieId}`);
    return raw ? JSON.parse(raw) : { worth_it: null, pace: null, moods: [] };
  } catch {
    return { worth_it: null, pace: null, moods: [] };
  }
}

function setStoredVote(movieId: number, vote: UserVote) {
  try {
    localStorage.setItem(`${VOTE_KEY}-${movieId}`, JSON.stringify(vote));
  } catch {}
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

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  }
  return `$${(amount / 1_000_000).toFixed(1)}M`;
}

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

async function fetchVoteCounts(tmdbId: number): Promise<VoteCounts> {
  const empty: VoteCounts = {
    worth_it: { yes: 0, skip: 0, fan: 0, total: 0 },
    pace: { slow: 0, medium: 0, fast: 0, total: 0 },
    moods: {},
  };
  try {
    const res = await fetch(`/api/movies/${tmdbId}/vote`);
    if (!res.ok) return empty;
    const data = await res.json();
    return {
      worth_it: data.worth_it ?? empty.worth_it,
      pace: data.pace ?? empty.pace,
      moods: data.moods ?? {},
    };
  } catch {
    return empty;
  }
}

async function callVoteApi(
  movieId: number,
  type: "worth_it" | "pace" | "mood",
  vote: string,
  action: "add" | "remove",
) {
  try {
    await fetch(`/api/movies/${movieId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, vote, action }),
    });
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Trailer Modal                                                      */
/* ------------------------------------------------------------------ */

function TrailerModal({
  trailerKey,
  title,
  onClose,
}: {
  trailerKey: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl mx-4 rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="aspect-video w-full bg-black">
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
            title={`${title} — Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cinema chain card                                                  */
/* ------------------------------------------------------------------ */

function CinemaChainCard({
  chain,
  locale,
}: {
  chain: CinemaChain;
  locale: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const CITY_LIMIT = 4;
  const visibleCities = expanded
    ? chain.cities
    : chain.cities.slice(0, CITY_LIMIT);
  const hasMore = chain.cities.length > CITY_LIMIT;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover-lift transition-all">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
          <Film className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{chain.chain}</p>
          {chain.formats.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {chain.formats.join(" · ")}
            </p>
          )}
        </div>
        <Badge
          className={cn(
            "text-[10px] shrink-0 pointer-events-none mt-0",
            "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          )}
        >
          {locale === "id" ? "Sedang Tayang" : "Now Playing"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1 pl-13">
        {visibleCities.map((city) => (
          <span
            key={city}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full"
          >
            <MapPin className="w-2.5 h-2.5" />
            {city}
          </span>
        ))}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-primary/80 hover:text-primary transition-colors px-1"
          >
            {expanded
              ? locale === "id"
                ? "Sembunyikan"
                : "Hide"
              : `+${chain.cities.length - CITY_LIMIT} ${locale === "id" ? "kota lainnya" : "more cities"}`}
          </button>
        )}
      </div>

      {chain.booking_url && (
        <a
          href={chain.booking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start mt-1 text-xs text-primary/80 hover:text-primary transition-colors font-medium"
        >
          <ExternalLink className="w-3 h-3" />
          {locale === "id" ? "Pesan Tiket" : "Book Tickets"}
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider card                                                      */
/* ------------------------------------------------------------------ */

function ProviderCard({
  p,
  badge,
  badgeClass,
  purchaseLabel,
}: {
  p: DisplayProvider & { purchaseType?: string };
  badge: string;
  badgeClass: string;
  purchaseLabel?: string;
}) {
  const card = (
    <div
      className={cn(
        "relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all group",
        p.status === "leaving"
          ? "bg-red-500/5 border-red-500/30"
          : "bg-white/5 border-white/10",
        p.url ? "hover-lift cursor-pointer hover:border-primary/10" : "",
      )}
    >
      {p.logo_url ? (
        <img
          src={p.logo_url}
          alt={p.provider_name}
          className="w-10 h-10 rounded-lg object-contain bg-white/30 p-0.3"
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = "none";
            const fallback = target.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
      ) : null}
      <div
        className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center"
        style={{ display: p.logo_url ? "none" : "flex" }}
      >
        <Tv className="w-5 h-5 text-muted-foreground" />
      </div>

      <p className="text-xs font-medium text-foreground truncate w-full text-center">
        {p.provider_name}
      </p>

      {purchaseLabel && (
        <p className="text-[10px] text-muted-foreground">{purchaseLabel}</p>
      )}

      <Badge className={cn("text-[10px] pointer-events-none", badgeClass)}>
        {badge}
      </Badge>

      {p.url && (
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-3 h-3 text-primary/70" />
        </div>
      )}
    </div>
  );

  if (p.url) {
    return (
      <a href={p.url} target="_blank" rel="noopener noreferrer">
        {card}
      </a>
    );
  }
  return card;
}

/* ------------------------------------------------------------------ */
/*  Quick Decision — Community Vote Card                               */
/* ------------------------------------------------------------------ */

const ALL_MOODS = [
  { key: "ketawa", id: "😂", label_id: "Lucu", label_en: "Funny" },
  { key: "tegang", id: "😰", label_id: "Tegang", label_en: "Thrill" },
  { key: "nangis", id: "😢", label_id: "Haru", label_en: "Touching" },
  { key: "santai", id: "😌", label_id: "Santai", label_en: "Chill" },
  { key: "mikir", id: "🤔", label_id: "Mikir", label_en: "Thought-Provoking" },
  { key: "berat", id: "😞", label_id: "Berat", label_en: "Heavy" },
  { key: "seru", id: "🤩", label_id: "Seru", label_en: "Exciting" },
  { key: "horor", id: "😱", label_id: "Horor", label_en: "Scary" },
];

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function QuickDecisionCard({
  movieId,
  locale,
  t,
}: {
  movieId: number;
  locale: string;
  t: (k: TranslationKey) => string;
}) {
  const [voteCounts, setVoteCounts] = useState<VoteCounts>({
    worth_it: { yes: 0, skip: 0, fan: 0, total: 0 },
    pace: { slow: 0, medium: 0, fast: 0, total: 0 },
    moods: {},
  });
  const [userVote, setUserVote] = useState<UserVote>({
    worth_it: null,
    pace: null,
    moods: [],
  });
  const [loadingVotes, setLoadingVotes] = useState(true);
  const [animKey, setAnimKey] = useState(0); // trigger re-anim on vote

  useEffect(() => {
    setUserVote(getStoredVotes(movieId));
    fetchVoteCounts(movieId).then((counts) => {
      setVoteCounts(counts);
      setLoadingVotes(false);
    });
  }, [movieId]);

  /* Worth It vote */
  const handleWorthItVote = useCallback(
    async (vote: "yes" | "skip" | "fan") => {
      const prev = userVote.worth_it;
      const next = prev === vote ? null : vote; // toggle off jika sama

      // Optimistic update
      setVoteCounts((c) => {
        const wi = { ...c.worth_it };
        if (prev) wi[prev] = Math.max(0, wi[prev] - 1);
        if (next) wi[next] = wi[next] + 1;
        wi.total = wi.yes + wi.skip + wi.fan;
        return { ...c, worth_it: wi };
      });
      const newVote = { ...userVote, worth_it: next };
      setUserVote(newVote);
      setStoredVote(movieId, newVote);
      setAnimKey((k) => k + 1);

      if (prev) await callVoteApi(movieId, "worth_it", prev, "remove");
      if (next) await callVoteApi(movieId, "worth_it", next, "add");
    },
    [movieId, userVote],
  );

  /* Pace vote */
  const handlePaceVote = useCallback(
    async (vote: "slow" | "medium" | "fast") => {
      const prev = userVote.pace;
      const next = prev === vote ? null : vote;

      setVoteCounts((c) => {
        const p = { ...c.pace };
        if (prev) p[prev] = Math.max(0, p[prev] - 1);
        if (next) p[next] = p[next] + 1;
        p.total = p.slow + p.medium + p.fast;
        return { ...c, pace: p };
      });
      const newVote = { ...userVote, pace: next };
      setUserVote(newVote);
      setStoredVote(movieId, newVote);
      setAnimKey((k) => k + 1);

      if (prev) await callVoteApi(movieId, "pace", prev, "remove");
      if (next) await callVoteApi(movieId, "pace", next, "add");
    },
    [movieId, userVote],
  );

  /* Mood vote */
  const handleMoodToggle = useCallback(
    async (moodKey: string) => {
      const hasVoted = userVote.moods.includes(moodKey);
      const newMoods = hasVoted
        ? userVote.moods.filter((m) => m !== moodKey)
        : [...userVote.moods, moodKey];

      setVoteCounts((c) => {
        const m = { ...c.moods };
        if (hasVoted) {
          m[moodKey] = Math.max(0, (m[moodKey] ?? 0) - 1);
        } else {
          m[moodKey] = (m[moodKey] ?? 0) + 1;
        }
        return { ...c, moods: m };
      });
      const newVote = { ...userVote, moods: newMoods };
      setUserVote(newVote);
      setStoredVote(movieId, newVote);
      setAnimKey((k) => k + 1);

      await callVoteApi(movieId, "mood", moodKey, hasVoted ? "remove" : "add");
    },
    [movieId, userVote],
  );

  const worthItConfig = [
    {
      key: "yes" as const,
      icon: CheckCircle2,
      label: t("worth_it_yes"),
      activeClass:
        "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10",
      barClass: "bg-emerald-500",
      hoverClass: "hover:bg-emerald-500/10 hover:border-emerald-500/30",
    },
    {
      key: "skip" as const,
      icon: XCircle,
      label: t("worth_it_skip"),
      activeClass:
        "bg-red-500/20 text-red-400 border-red-500/50 ring-2 ring-red-500/30 shadow-lg shadow-red-500/10",
      barClass: "bg-red-500",
      hoverClass: "hover:bg-red-500/10 hover:border-red-500/30",
    },
    {
      key: "fan" as const,
      icon: Sparkles,
      label: t("worth_it_fan"),
      activeClass:
        "bg-amber-500/20 text-amber-400 border-amber-500/50 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10",
      barClass: "bg-amber-500",
      hoverClass: "hover:bg-amber-500/10 hover:border-amber-500/30",
    },
  ];

  const paceConfig = [
    {
      key: "slow" as const,
      icon: Wind,
      label: t("pace_slow"),
      activeClass:
        "bg-sky-500/20 text-sky-400 border-sky-500/50 ring-2 ring-sky-500/30",
      barClass: "bg-sky-500",
      hoverClass: "hover:bg-sky-500/10 hover:border-sky-500/30",
    },
    {
      key: "medium" as const,
      icon: Gauge,
      label: t("pace_medium"),
      activeClass:
        "bg-yellow-500/20 text-yellow-400 border-yellow-500/50 ring-2 ring-yellow-500/30",
      barClass: "bg-yellow-500",
      hoverClass: "hover:bg-yellow-500/10 hover:border-yellow-500/30",
    },
    {
      key: "fast" as const,
      icon: Flame,
      label: t("pace_fast"),
      activeClass:
        "bg-green-500/20 text-green-400 border-green-500/50 ring-2 ring-green-500/30",
      barClass: "bg-green-500",
      hoverClass: "hover:bg-green-500/10 hover:border-green-500/30",
    },
  ];

  return (
    <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-primary">
          {t("quick_decision")}
        </h2>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
          <Users className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-muted-foreground">
            {locale === "id" ? "Voting komunitas" : "Community vote"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* ── Worth It ─────────────────────────────────────────────── */}
        <div className="glass-strong rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Worth It?
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {worthItConfig.map(
              ({
                key,
                icon: Icon,
                label,
                activeClass,
                barClass,
                hoverClass,
              }) => {
                const isActive = userVote.worth_it === key;
                const count = voteCounts.worth_it[key];
                const total = voteCounts.worth_it.total;
                const percent = pct(count, total);

                return (
                  <button
                    key={key}
                    onClick={() => handleWorthItVote(key)}
                    className={cn(
                      "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 overflow-hidden text-left",
                      "bg-white/5 border-white/10",
                      hoverClass,
                      isActive && activeClass,
                    )}
                  >
                    {/* Progress bar background */}
                    <div
                      className={cn(
                        "absolute inset-0 opacity-10 transition-all duration-500",
                        barClass,
                      )}
                      style={{ width: `${percent}%` }}
                    />
                    <Icon className="w-3.5 h-3.5 relative z-10 flex-shrink-0" />
                    <span className="relative z-10 flex-1">{label}</span>
                    <span className="relative z-10 text-[10px] text-muted-foreground font-normal ml-auto">
                      {loadingVotes ? "…" : `${percent}%`}
                    </span>
                  </button>
                );
              },
            )}
          </div>

          {voteCounts.worth_it.total > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              {voteCounts.worth_it.total.toLocaleString()}{" "}
              {locale === "id" ? "vote" : "votes"}
            </p>
          )}
        </div>

        {/* ── Mood ─────────────────────────────────────────────────── */}
        <div className="glass-strong rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {t("nav_mood")}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ALL_MOODS.map(({ key, id: emoji, label_id, label_en }) => {
              const isSelected = userVote.moods.includes(key);
              const count = voteCounts.moods[key] ?? 0;
              const label = locale === "id" ? label_id : label_en;

              return (
                <button
                  key={key}
                  onClick={() => handleMoodToggle(key)}
                  title={`${count} vote${count !== 1 ? "s" : ""}`}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all duration-200",
                    isSelected
                      ? "bg-primary/20 text-primary border-primary/40 ring-1 ring-primary/30 scale-105"
                      : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-foreground hover:border-white/20",
                  )}
                >
                  <span>{emoji}</span>
                  <span>{label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[9px] rounded-full px-1",
                        isSelected
                          ? "text-primary/80"
                          : "text-muted-foreground/60",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-muted-foreground">
            {locale === "id"
              ? "Pilih suasana yang kamu rasakan"
              : "Pick the vibes you felt"}
          </p>
        </div>

        {/* ── Pace ─────────────────────────────────────────────────── */}
        <div className="glass-strong rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Pace
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {paceConfig.map(
              ({
                key,
                icon: Icon,
                label,
                activeClass,
                barClass,
                hoverClass,
              }) => {
                const isActive = userVote.pace === key;
                const count = voteCounts.pace[key];
                const total = voteCounts.pace.total;
                const percent = pct(count, total);

                return (
                  <button
                    key={key}
                    onClick={() => handlePaceVote(key)}
                    className={cn(
                      "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 overflow-hidden text-left",
                      "bg-white/5 border-white/10",
                      hoverClass,
                      isActive && activeClass,
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-0 opacity-10 transition-all duration-500",
                        barClass,
                      )}
                      style={{ width: `${percent}%` }}
                    />
                    <Icon className="w-3.5 h-3.5 relative z-10 flex-shrink-0" />
                    <span className="relative z-10 flex-1">{label}</span>
                    <span className="relative z-10 text-[10px] text-muted-foreground font-normal ml-auto">
                      {loadingVotes ? "…" : `${percent}%`}
                    </span>
                  </button>
                );
              },
            )}
          </div>

          {voteCounts.pace.total > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              {voteCounts.pace.total.toLocaleString()}{" "}
              {locale === "id" ? "vote" : "votes"}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MovieDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { t, locale, region } = useI18n();

  const movieId = Number(params.id);

  const [movie, setMovie] = useState<MovieData | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationMovie[]>(
    [],
  );
  const [similarByGenre, setSimilarByGenre] = useState<RecommendationMovie[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likedId, setLikedId] = useState<number | null>(null); // id row di user_liked
  const [watchlistId, setWatchlistId] = useState<number | null>(null); // id row di user_watchlist
  const [actionLoading, setActionLoading] = useState<
    "liked" | "watchlist" | null
  >(null);

  const internalMovieId: number | null = (movie as any)?._internalId ?? null;

  /* Fetch movie + recommendations ---------------------------------- */
  useEffect(() => {
    if (!movieId || Number.isNaN(movieId)) return;

    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const lang = locale === "id" ? "id" : "en";
        const qp = new URLSearchParams({ lang, region });

        const res = await fetch(`/api/movies/${movieId}?${qp}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const json = await res.json();

        if (cancelled) return;

        // console.log("Fetched movie:", json);
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

  /* Fetch similar movies by genre from DB -------------------------- */
  useEffect(() => {
    if (!movie || movie.genres.length === 0) return;

    async function loadSimilarByGenre() {
      try {
        // Ambil genre_id dari genre pertama film ini
        const primaryGenreName = movie!.genres[0]?.name;
        if (!primaryGenreName) return;

        // Cari genre di DB
        const { data: genreRow } = await supabase
          .from("genres")
          .select("id")
          .ilike("name", primaryGenreName)
          .single();

        if (!genreRow?.id) return;

        // Ambil movie_id dari genre tersebut
        const { data: movieGenres } = await supabase
          .from("movie_genres")
          .select("movie_id")
          .eq("genre_id", genreRow.id)
          .limit(50);

        if (!movieGenres?.length) return;

        const ids = movieGenres
          .map((r: any) => r.movie_id)
          .filter((id: number) => id !== movie!.id);

        if (ids.length === 0) return;

        // Ambil detail film
        const { data: movies } = await supabase
          .from("movies")
          .select(
            "id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en",
          )
          .in("id", ids)
          .order("popularity", { ascending: false })
          .limit(15);

        if (movies) {
          setSimilarByGenre(
            movies.map((m: any) => ({
              id: m.id,
              title: m.title,
              poster_path: m.poster_path,
              backdrop_path: m.backdrop_path,
              vote_average: Number(m.vote_average),
              release_date: m.release_date,
              popularity: Number(m.popularity),
              overview:
                locale === "id"
                  ? m.overview || m.overview_en || ""
                  : m.overview_en || m.overview || "",
            })),
          );
        }
      } catch (err) {
        console.error("Failed to load similar by genre", err);
      }
    }

    loadSimilarByGenre();
  }, [movie, locale]);

  /* Sync liked & watchlist status dari API -------------------------  */
  useEffect(() => {
    if (!internalMovieId) return;

    async function fetchStatus() {
      try {
        const [likedRes, watchlistRes] = await Promise.all([
          fetch("/api/liked"),
          fetch("/api/watchlist?media_type=movie"),
        ]);
        if (likedRes.ok) {
          const liked: any[] = await likedRes.json();
          const found = liked.find((l) => l.movie_id === internalMovieId);
          if (found) {
            setIsLiked(true);
            setLikedId(found.id);
          } else {
            setIsLiked(false);
            setLikedId(null);
          }
        }
        if (watchlistRes.ok) {
          const wl: any[] = await watchlistRes.json();
          const found = wl.find((w) => w.movie_id === internalMovieId);
          if (found) {
            setInWatchlist(true);
            setWatchlistId(found.id);
          } else {
            setInWatchlist(false);
            setWatchlistId(null);
          }
        }
      } catch {}
    }
    fetchStatus();
  }, [internalMovieId]);

  const toggleLiked = useCallback(async () => {
    if (actionLoading || !internalMovieId) return;
    setActionLoading("liked");
    try {
      if (isLiked && likedId) {
        await fetch(`/api/liked?id=${likedId}`, { method: "DELETE" });
        setIsLiked(false);
        setLikedId(null);
      } else {
        // console.log("Like movie", internalMovieId);
        const res = await fetch("/api/liked", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_type: "movie",
            movie_id: internalMovieId,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setIsLiked(true);
          setLikedId(data.id);
        }
      }
    } catch {
    } finally {
      setActionLoading(null);
    }
  }, [isLiked, likedId, internalMovieId, actionLoading]);

  const toggleWatchlist = useCallback(async () => {
    if (actionLoading || !internalMovieId) return;
    setActionLoading("watchlist");
    try {
      if (inWatchlist && watchlistId) {
        await fetch(`/api/watchlist?id=${watchlistId}`, { method: "DELETE" });
        setInWatchlist(false);
        setWatchlistId(null);
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_type: "movie",
            movie_id: internalMovieId,
            status: "want_to_watch",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setInWatchlist(true);
          setWatchlistId(data.id);
        }
      }
    } catch {
    } finally {
      setActionLoading(null);
    }
  }, [inWatchlist, watchlistId, internalMovieId, actionLoading]);

  /* Derived data --------------------------------------------------- */
  const scores = movie
    ? computeScores(movie)
    : { popularity: 0, completion: 0, buzz: 0 };

  const displayOverview = movie?.overview;

  const today = new Date();
  const releaseDate = movie?.release_date ? new Date(movie.release_date) : null;
  const isUpcoming = releaseDate ? releaseDate > today : false;

  const cinemaData = movie?.cinema;
  const isShowingInCinema = cinemaData?.is_showing ?? false;
  const cinemaChains = cinemaData?.chains ?? [];

  const countryProviders: ProviderResult | undefined =
    movie?.["watch/providers"]?.results?.[region] ||
    movie?.["watch/providers"]?.results?.["ID"];

  const displayOTT: DisplayProvider[] = (countryProviders?.flatrate ?? []).map(
    (p) => ({ ...p, status: "now" as const }),
  );

  const rentRaw = countryProviders?.rent ?? [];
  const buyRaw = countryProviders?.buy ?? [];
  const rentBuyMap = new Map<
    number,
    DisplayProvider & { purchaseType: "rent" | "buy" | "rent_buy" }
  >();
  for (const p of rentRaw) {
    rentBuyMap.set(p.provider_id, {
      ...p,
      status: "now",
      purchaseType: "rent",
    });
  }
  for (const p of buyRaw) {
    const existing = rentBuyMap.get(p.provider_id);
    if (existing) {
      existing.purchaseType = "rent_buy";
    } else {
      rentBuyMap.set(p.provider_id, {
        ...p,
        status: "now",
        purchaseType: "buy",
      });
    }
  }
  const displayRentBuy = Array.from(rentBuyMap.values());

  const streamingRegions = Object.entries(
    movie?.["watch/providers"]?.results ?? {},
  )
    .filter(([, v]) => (v.flatrate?.length ?? 0) > 0)
    .map(([k]) => k);

  // Crew derived data
  const crew = movie?.credits?.crew ?? [];
  const directors = crew.filter((c) => c.job === "Director");
  const producers = crew.filter(
    (c) => c.job === "Producer" || c.job === "Executive Producer",
  );
  const writers = crew.filter(
    (c) =>
      c.job === "Screenplay" ||
      c.job === "Writer" ||
      c.job === "Story" ||
      c.department === "Writing",
  );

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
      {/* Trailer Modal */}
      {showTrailer && movie.trailer_key && (
        <TrailerModal
          trailerKey={movie.trailer_key}
          title={movie.title}
          onClose={() => setShowTrailer(false)}
        />
      )}

      {/* ============================================================ */}
      {/*  1. HERO SECTION                                              */}
      {/* ============================================================ */}
      <section className="relative h-[55vh] lg:h-[70vh] -mt-14 lg:mt-0 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={getBackdropUrl(movie.backdrop_path ?? movie.poster_path)}
            alt={movie.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />
        </div>

        <button
          onClick={() => router.back()}
          className="absolute top-16 lg:top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full glass text-white text-sm font-medium hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {locale === "id" ? "Kembali" : "Back"}
        </button>

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
                {movie.trailer_key && (
                  <button
                    onClick={() => setShowTrailer(true)}
                    className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pb-1">
              {movie.tagline && (
                <p className="text-primary/90 text-sm italic mb-1 line-clamp-1">
                  &ldquo;{movie.tagline}&rdquo;
                </p>
              )}
              <h1 className="text-2xl lg:text-4xl font-bold text-white leading-tight mb-1">
                {movie.title}
              </h1>

              {displayOverview && (
                <p className="text-muted-foreground text-sm mb-1 line-clamp-2 mb-3">
                  {displayOverview}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-semibold">
                  <Star className="w-4 h-4 fill-yellow-400" />
                  {movie.vote_average.toFixed(1)}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/80 text-sm">
                  <Clock className="w-3.5 h-3.5" />
                  {formatRuntime(movie.runtime)}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/80 text-sm">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatReleaseDate(movie.release_date)}
                </span>
              </div>

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

              <div className="flex flex-wrap gap-2">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="lg"
                        onClick={toggleLiked}
                        disabled={actionLoading === "liked"}
                        className={cn(
                          "rounded-xl font-semibold transition-all duration-300",
                          isLiked
                            ? "gradient-primary text-white shadow-lg shadow-primary/30"
                            : "gradient-primary border border-white/20 text-white hover:bg-white/20",
                        )}
                      >
                        <Heart
                          className={cn(
                            "w-4 h-4 transition-all",
                            isLiked && "fill-current",
                            actionLoading === "liked" && "animate-pulse",
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-black/90 border border-white/10 text-white text-xs px-3 py-2 rounded-lg backdrop-blur-sm"
                    >
                      {isLiked
                        ? locale === "id"
                          ? "Klik untuk batal menyukai"
                          : "Click to unlike"
                        : locale === "id"
                          ? "Tandai film ini sebagai favorit"
                          : "Mark this film as a favorite"}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="lg"
                        onClick={toggleWatchlist}
                        disabled={actionLoading === "watchlist"}
                        className={cn(
                          "rounded-xl font-semibold transition-all duration-300",
                          inWatchlist
                            ? "gradient-primary text-white shadow-lg shadow-primary/30"
                            : "bg-white/10 border border-white/20 text-white hover:bg-white/20",
                        )}
                      >
                        <BookmarkPlus
                          className={cn(
                            "w-4 h-4 mr-2 transition-all",
                            inWatchlist && "fill-current",
                            actionLoading === "watchlist" && "animate-pulse",
                          )}
                        />
                        {inWatchlist ? t("bookmarked") : t("bookmark")}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-black/90 border border-white/10 text-white text-xs px-3 py-2 rounded-lg backdrop-blur-sm"
                    >
                      {inWatchlist
                        ? locale === "id"
                          ? "Klik untuk hapus dari daftar tontonan"
                          : "Click to remove from watchlist"
                        : locale === "id"
                          ? "Simpan ke daftar tontonan kamu"
                          : "Save to your watchlist"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {!isShowingInCinema &&
                  !isUpcoming &&
                  displayOTT.length === 0 &&
                  displayRentBuy.length === 0 && (
                    <p className="flex items-center text-primary/90 text-sm italic ml-2">
                      {t("not_available")}
                    </p>
                  )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Content area                                                 */}
      {/* ============================================================ */}
      <div className="px-4 lg:px-8 max-w-5xl mx-auto -mt-4 relative z-10 space-y-8 pb-16">
        {/* Mobile not available notice */}
        <div className="sm:hidden flex gap-4 animate-slide-up">
          {!isShowingInCinema &&
            displayOTT.length == 0 &&
            displayRentBuy.length == 0 && (
              <p className="text-primary/90 text-sm italic ml-2">
                {t("not_available")}
              </p>
            )}
        </div>

        {/* ============================================================ */}
        {/*  2. WHERE TO WATCH                                            */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-4">
            {t("where_to_watch")}
          </h2>

          <Tabs defaultValue="cinema" className="w-full">
            <TabsList className="w-full grid grid-cols-3 bg-white/5 h-auto p-1 rounded-xl gap-1">
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
              <TabsTrigger
                value="rentbuy"
                className="rounded-lg text-xs data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-md"
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                {locale === "id" ? "Sewa/Beli" : "Rent/Buy"}
              </TabsTrigger>
            </TabsList>

            {/* Cinema tab */}
            <TabsContent value="cinema" className="mt-4">
              {isShowingInCinema ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cinemaChains.map((chain) => (
                      <CinemaChainCard
                        key={chain.chain}
                        chain={chain}
                        locale={locale}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3 text-center">
                    {locale === "id"
                      ? "Klik 'Pesan Tiket' untuk jadwal & ketersediaan kursi terkini"
                      : "Click 'Book Tickets' for the latest showtimes & seat availability"}
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
                      ? "Film ini tidak tayang di bioskop Indonesia"
                      : "This movie is no longer showing in cinemas"}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Streaming tab */}
            <TabsContent value="ott" className="mt-4">
              {displayOTT.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {displayOTT.map((p, i) => (
                      <ProviderCard
                        key={`${p.provider_id}-${i}`}
                        p={p}
                        badge={
                          p.status === "now"
                            ? t("platform_status_now")
                            : p.status === "coming"
                              ? t("platform_status_coming")
                              : `${t("platform_status_leaving")} ${p.leavingDays ? `${p.leavingDays}d` : ""}`
                        }
                        badgeClass={
                          p.status === "now"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : p.status === "coming"
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30 animate-pulse-glow"
                        }
                      />
                    ))}
                  </div>
                  {streamingRegions.length > 1 && (
                    <p className="text-[10px] text-muted-foreground mt-3 text-center">
                      {locale === "id"
                        ? `Tersedia di: ${streamingRegions.join(", ")}`
                        : `Available in: ${streamingRegions.join(", ")}`}
                    </p>
                  )}
                </>
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

            {/* Sewa/Beli tab */}
            <TabsContent value="rentbuy" className="mt-4">
              {displayRentBuy.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {displayRentBuy.map((p, i) => {
                      const typeLabel =
                        p.purchaseType === "rent_buy"
                          ? locale === "id"
                            ? "Sewa & Beli"
                            : "Rent & Buy"
                          : p.purchaseType === "rent"
                            ? locale === "id"
                              ? "Sewa"
                              : "Rent"
                            : locale === "id"
                              ? "Beli"
                              : "Buy";
                      return (
                        <ProviderCard
                          key={`rb-${p.provider_id}-${i}`}
                          p={p}
                          badge={locale === "id" ? "Tersedia" : "Available"}
                          badgeClass="bg-sky-500/20 text-sky-400 border-sky-500/30"
                          purchaseLabel={typeLabel}
                        />
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3 text-center">
                    {locale === "id"
                      ? "Klik platform untuk membuka halaman pembelian/sewa"
                      : "Click a platform to open its purchase or rental page"}
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl glass-strong flex items-center justify-center mb-3">
                    <ShoppingCart className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {locale === "id"
                      ? "Opsi sewa/beli belum tersedia untuk film ini"
                      : "Rent/buy options are not available for this movie"}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>

        {/* ============================================================ */}
        {/*  5. SINOPSIS + FILMMAKER INFO                                 */}
        {/* ============================================================ */}
        {displayOverview && (
          <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
            <h2 className="text-lg font-bold text-gradient mb-3">
              {t("overview")}
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line mb-5">
              {displayOverview}
            </p>

            {/* Divider hanya jika ada info filmmaker */}
            {(directors.length > 0 ||
              producers.length > 0 ||
              writers.length > 0 ||
              (movie.production_companies?.length ?? 0) > 0) && (
              <div className="border-t border-white/8 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {/* Sutradara */}
                {directors.length > 0 && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                      <Clapperboard className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        {locale === "id" ? "Sutradara" : "Director"}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {directors.map((d) => (
                          <span
                            key={d.id}
                            className="text-sm font-medium text-foreground"
                          >
                            {d.name}
                            {directors.indexOf(d) < directors.length - 1
                              ? ", "
                              : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Penulis */}
                {writers.length > 0 && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                      <PenLine className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        {locale === "id" ? "Penulis" : "Writer"}
                      </p>
                      <div className="flex flex-wrap gap-x-1">
                        {writers.slice(0, 3).map((w, i) => (
                          <span
                            key={w.id}
                            className="text-sm font-medium text-foreground"
                          >
                            {w.name}
                            {i < Math.min(writers.length, 3) - 1 ? ", " : ""}
                          </span>
                        ))}
                        {writers.length > 3 && (
                          <span className="text-sm text-muted-foreground">
                            +{writers.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Produser */}
                {producers.length > 0 && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                      <UserCircle2 className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        {locale === "id" ? "Produser" : "Producer"}
                      </p>
                      <div className="flex flex-wrap gap-x-1">
                        {producers.slice(0, 3).map((p, i) => (
                          <span
                            key={`${p.id}-${p.job}`}
                            className="text-sm font-medium text-foreground"
                          >
                            {p.name}
                            {i < Math.min(producers.length, 3) - 1 ? ", " : ""}
                          </span>
                        ))}
                        {producers.length > 3 && (
                          <span className="text-sm text-muted-foreground">
                            +{producers.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Rumah Produksi */}
                {(movie.production_companies?.length ?? 0) > 0 && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        {locale === "id"
                          ? "Rumah Produksi"
                          : "Production House"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {movie.production_companies!.slice(0, 4).map((pc) => (
                          <div
                            key={pc.id}
                            className="flex items-center gap-1.5"
                          >
                            {pc.logo_path ? (
                              <img
                                src={`https://image.tmdb.org/t/p/w92${pc.logo_path}`}
                                alt={pc.name}
                                className="h-3.5 object-contain filter brightness-0 invert opacity-60"
                                title={pc.name}
                              />
                            ) : (
                              <span className="text-sm font-medium text-foreground">
                                {pc.name}
                              </span>
                            )}
                          </div>
                        ))}
                        {(movie.production_companies?.length ?? 0) > 4 && (
                          <span className="text-xs text-muted-foreground">
                            +{(movie.production_companies?.length ?? 0) - 4}{" "}
                            more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/*  4b. INFO FILM                                                */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-4">
            {locale === "id" ? "Info Film" : "Film Info"}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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

            {movie.budget > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    Budget
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {formatCurrency(movie.budget)}
                </p>
              </div>
            )}

            {movie.revenue > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {locale === "id" ? "Pendapatan" : "Revenue"}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {formatCurrency(movie.revenue)}
                </p>
              </div>
            )}

            {movie.budget > 0 && movie.revenue > 0 && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  {movie.revenue >= movie.budget ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
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
          <p className="text-[10px] text-muted-foreground mt-4 text-center">
            {locale === "id"
              ? "* Informasi film dikurasi dari TMDB dan Wikipedia untuk memastikan data tetap lengkap dan relevan."
              : "* Movie information is curated from TMDB and Wikipedia to ensure the data remains complete and relevant."}
          </p>
        </section>

        <AdSenseUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY!} />

        {/* ============================================================ */}
        {/*  4a. FILM SCORES                                               */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-5">Film Score</h2>

          <div className="space-y-4">
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
        {/*  3. QUICK DECISION — Community Vote                           */}
        {/* ============================================================ */}
        <QuickDecisionCard movieId={movieId} locale={locale} t={t} />

        {/* ============================================================ */}
        {/*  6. TRAILER                                                    */}
        {/* ============================================================ */}
        {movie.trailer_key && (
          <section className="animate-slide-up">
            <SectionHeader title="Trailer" />
            <div
              className="relative rounded-2xl overflow-hidden cursor-pointer hover-lift group"
              onClick={() => setShowTrailer(true)}
            >
              <div className="aspect-video w-full bg-black/40">
                <img
                  src={`https://img.youtube.com/vi/${movie.trailer_key}/maxresdefault.jpg`}
                  alt={`${movie.title} trailer`}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity duration-300"
                  onError={(e) => {
                    const t = e.currentTarget;
                    if (!t.src.includes("hqdefault")) {
                      t.src = `https://img.youtube.com/vi/${movie.trailer_key}/hqdefault.jpg`;
                    }
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-2xl shadow-black/40 group-hover:scale-110 transition-transform duration-300">
                    <Play className="w-7 h-7 text-black fill-black ml-1" />
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-white font-semibold text-sm">
                  {movie.title} — Official Trailer
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  7. CAST                                                       */}
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
                      {/* <p className="text-[10px] text-white/70 line-clamp-1">
                        {person.character}
                      </p> */}
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
        {/*  7b. CREW — 1 baris horizontal scroll seperti Cast           */}
        {/* ============================================================ */}
        {crew.length > 0 && (
          <section className="animate-slide-up">
            <SectionHeader
              title={locale === "id" ? "Staf & Kru Film" : "Movie Crew & Staff"}
            />
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
              {crew.map((person) => (
                <div
                  key={`${person.id}-${person.job}`}
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
                      {/* <p className="text-[10px] text-white/70 line-clamp-1">
                        {person.job}
                      </p> */}
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {person.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {person.department}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  8. FILM SERUPA — berdasarkan genre yang sama dari DB          */}
        {/* ============================================================ */}
        {(similarByGenre.length > 0 ||
          (movie.similar?.results && movie.similar.results.length > 0)) && (
          <section className="animate-slide-up">
            <SectionHeader title={t("similar")} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {/* Prioritaskan similarByGenre dari DB, fallback ke TMDB similar */}
              {(similarByGenre.length > 0
                ? similarByGenre
                : (movie.similar?.results ?? [])
              )
                .slice(0, 15)
                .map((m) => (
                  <div
                    key={m.id}
                    className="w-[140px] lg:w-[160px] flex-shrink-0"
                  >
                    <MovieCard movie={m as never} />
                  </div>
                ))}
            </div>
            {similarByGenre.length > 0 && movie.genres[0] && (
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                {locale === "id"
                  ? `Film ${movie.genres[0].name} populer lainnya`
                  : `More popular ${movie.genres[0].name} films`}
              </p>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/*  9. REKOMENDASI                                                */}
        {/* ============================================================ */}
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
