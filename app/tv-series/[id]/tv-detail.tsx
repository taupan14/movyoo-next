"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-locale";
import { getPosterUrl, getBackdropUrl, getProfileUrl } from "@/lib/tmdb";
import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TranslationKey } from "@/lib/i18n";
import SeasonTabs from "./season-tabs";
import { cn } from "@/lib/utils";
import {
  Star,
  Clock,
  Calendar,
  Heart,
  BookmarkPlus,
  ChevronLeft,
  Play,
  Tv,
  Eye,
  TrendingUp,
  MessageCircle,
  Sparkles,
  Gauge,
  MapPin,
  X,
  Users,
  Clapperboard,
  Building2,
  ChevronDown,
  ChevronUp,
  Layers,
  Radio,
  CheckCircle2,
  CheckCircle2 as CheckCircle2Icon,
  Circle as XCircleIcon,
  Globe,
  Film,
  ExternalLink,
  Wind,
  Flame,
  Zap,
  PenLine,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";

import NativeBannerAd from "@/components/ads/NativeBannerAd";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Genre {
  id: number;
  name: string;
}

interface CastMember {
  person_id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
  order_index: number;
}

interface CrewMember {
  person_id: number;
  name: string;
  job: string;
  department: string | null;
  profile_path: string | null;
}

interface Network {
  tmdb_network_id: number;
  name: string;
  logo_path: string | null;
  origin_country: string | null;
}

interface Platform {
  platform_id: number;
  type: string;
  platforms: {
    name: string;
    logo_path: string | null;
    url: string | null;
  } | null;
}

export interface TvSeason {
  season_number: number;
  name: string;
  overview: string | null;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
  episodes?: TvEpisode[];
}

export interface TvEpisode {
  episode_number: number;
  name: string;
  overview: string | null;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
}

interface TvSeriesData {
  id: number;
  tmdb_id: number;
  name: string;
  original_name?: string;
  tagline?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  status: string;
  type: string | null;
  original_language: string | null;
  first_air_date: string;
  last_air_date: string | null;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number | null;
  in_production: boolean;
  trailer_key: string | null;
  genres: Genre[];
  cast: CastMember[];
  crew: CrewMember[];
  networks: Network[];
  platforms: Platform[];
  countries: { iso_3166_1: string; name: string | null }[];
  languages: {
    iso_639_1: string;
    name: string | null;
    english_name: string | null;
  }[];
  seasons?: TvSeason[];
  similarSeries?: SimilarSeries[];
}

interface SimilarSeries {
  id: number;
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date?: string;
  popularity?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(date: string | null | undefined, locale = "en"): string {
  if (!date) return "--";
  try {
    return new Date(date).toLocaleDateString(
      locale === "id" ? "id-ID" : "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      },
    );
  } catch {
    return date;
  }
}

function formatRuntime(mins: number | null | undefined): string {
  if (!mins) return "--";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function computeScores(s: TvSeriesData) {
  const popularity = Math.min(Math.round((s.popularity || 0) / 3), 100);
  const completion = s.vote_count
    ? Math.min(Math.round((s.vote_count / 5000) * 100), 100)
    : 50;
  const buzz = Math.min(
    Math.round((s.vote_average || 0) * 10 + (s.popularity || 0) / 5),
    100,
  );
  return { popularity, completion, buzz };
}

/* ------------------------------------------------------------------ */
/*  Community Vote Types                                               */
/* ------------------------------------------------------------------ */

interface TvVoteCounts {
  worth_it: { yes: number; skip: number; fan: number; total: number };
  pace: { slow: number; medium: number; fast: number; total: number };
  moods: Record<string, number>;
}

interface TvUserVote {
  worth_it: "yes" | "skip" | "fan" | null;
  pace: "slow" | "medium" | "fast" | null;
  moods: string[];
}

const TV_VOTE_KEY = "movyoo-tv-votes";

function getTvStoredVotes(seriesId: number): TvUserVote {
  if (typeof window === "undefined")
    return { worth_it: null, pace: null, moods: [] };
  try {
    const raw = localStorage.getItem(`${TV_VOTE_KEY}-${seriesId}`);
    return raw ? JSON.parse(raw) : { worth_it: null, pace: null, moods: [] };
  } catch {
    return { worth_it: null, pace: null, moods: [] };
  }
}

function setTvStoredVote(seriesId: number, vote: TvUserVote) {
  try {
    localStorage.setItem(`${TV_VOTE_KEY}-${seriesId}`, JSON.stringify(vote));
  } catch {}
}

async function fetchTvVoteCounts(seriesId: number): Promise<TvVoteCounts> {
  const empty: TvVoteCounts = {
    worth_it: { yes: 0, skip: 0, fan: 0, total: 0 },
    pace: { slow: 0, medium: 0, fast: 0, total: 0 },
    moods: {},
  };
  try {
    const res = await fetch(`/api/tv/${seriesId}/vote`);
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

async function callTvVoteApi(
  seriesId: number,
  type: "worth_it" | "pace" | "mood",
  vote: string,
  action: "add" | "remove",
) {
  try {
    await fetch(`/api/tv/${seriesId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, vote, action }),
    });
  } catch {}
}

const ALL_MOODS = [
  { key: "ketawa", emoji: "😂", label_id: "Lucu", label_en: "Funny" },
  { key: "tegang", emoji: "😰", label_id: "Tegang", label_en: "Thrill" },
  { key: "nangis", emoji: "😢", label_id: "Haru", label_en: "Touching" },
  { key: "santai", emoji: "😌", label_id: "Santai", label_en: "Chill" },
  {
    key: "mikir",
    emoji: "🤔",
    label_id: "Mikir",
    label_en: "Thought-Provoking",
  },
  { key: "berat", emoji: "😞", label_id: "Berat", label_en: "Heavy" },
  { key: "seru", emoji: "🤩", label_id: "Seru", label_en: "Exciting" },
  { key: "horor", emoji: "😱", label_id: "Horor", label_en: "Scary" },
];

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
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
/*  Quick Decision — Community Vote Card                               */
/* ------------------------------------------------------------------ */

function TvQuickDecisionCard({
  seriesId,
  locale,
  t,
}: {
  seriesId: number;
  locale: string;
  t: (key: TranslationKey) => string;
}) {
  const [voteCounts, setVoteCounts] = useState<TvVoteCounts>({
    worth_it: { yes: 0, skip: 0, fan: 0, total: 0 },
    pace: { slow: 0, medium: 0, fast: 0, total: 0 },
    moods: {},
  });
  const [userVote, setUserVote] = useState<TvUserVote>({
    worth_it: null,
    pace: null,
    moods: [],
  });
  const [loadingVotes, setLoadingVotes] = useState(true);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setUserVote(getTvStoredVotes(seriesId));
    fetchTvVoteCounts(seriesId).then((counts) => {
      setVoteCounts(counts);
      setLoadingVotes(false);
    });
  }, [seriesId]);

  const handleWorthItVote = useCallback(
    async (vote: "yes" | "skip" | "fan") => {
      const prev = userVote.worth_it;
      const next = prev === vote ? null : vote;
      setVoteCounts((c) => {
        const wi = { ...c.worth_it };
        if (prev) wi[prev] = Math.max(0, wi[prev] - 1);
        if (next) wi[next] = wi[next] + 1;
        wi.total = wi.yes + wi.skip + wi.fan;
        return { ...c, worth_it: wi };
      });
      const newVote = { ...userVote, worth_it: next };
      setUserVote(newVote);
      setTvStoredVote(seriesId, newVote);
      setAnimKey((k) => k + 1);
      if (prev) await callTvVoteApi(seriesId, "worth_it", prev, "remove");
      if (next) await callTvVoteApi(seriesId, "worth_it", next, "add");
    },
    [seriesId, userVote],
  );

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
      setTvStoredVote(seriesId, newVote);
      setAnimKey((k) => k + 1);
      if (prev) await callTvVoteApi(seriesId, "pace", prev, "remove");
      if (next) await callTvVoteApi(seriesId, "pace", next, "add");
    },
    [seriesId, userVote],
  );

  const handleMoodToggle = useCallback(
    async (moodKey: string) => {
      const hasVoted = userVote.moods.includes(moodKey);
      const newMoods = hasVoted
        ? userVote.moods.filter((m) => m !== moodKey)
        : [...userVote.moods, moodKey];
      setVoteCounts((c) => {
        const m = { ...c.moods };
        m[moodKey] = hasVoted
          ? Math.max(0, (m[moodKey] ?? 0) - 1)
          : (m[moodKey] ?? 0) + 1;
        return { ...c, moods: m };
      });
      const newVote = { ...userVote, moods: newMoods };
      setUserVote(newVote);
      setTvStoredVote(seriesId, newVote);
      setAnimKey((k) => k + 1);
      await callTvVoteApi(
        seriesId,
        "mood",
        moodKey,
        hasVoted ? "remove" : "add",
      );
    },
    [seriesId, userVote],
  );

  const worthItConfig = [
    {
      key: "yes" as const,
      icon: CheckCircle2Icon,
      label: t("worth_it_yes"),
      activeClass:
        "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10",
      barClass: "bg-emerald-500",
      hoverClass: "hover:bg-emerald-500/10 hover:border-emerald-500/30",
    },
    {
      key: "skip" as const,
      icon: XCircleIcon,
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
        {/* Worth It */}
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

        {/* Mood */}
        <div className="glass-strong rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {t("nav_mood")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MOODS.map(({ key, emoji, label_id, label_en }) => {
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

        {/* Pace */}
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
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function TvDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { t, locale, region } = useI18n();

  const tmdbId = Number(params.id);

  const [series, setSeries] = useState<TvSeriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likedId, setLikedId] = useState<number | null>(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistId, setWatchlistId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<
    "liked" | "watchlist" | null
  >(null);

  /* ── Fetch series data ─────────────────────────────────────────── */
  useEffect(() => {
    if (!tmdbId || Number.isNaN(tmdbId)) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const lang = locale === "id" ? "id" : "en";
        const res = await fetch(
          `/api/tv/${tmdbId}?lang=${lang}&region=${region}`,
        );
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json = await res.json();
        // console.log("Fetched TV series:", json);
        if (cancelled) return;
        // console.log("Fetched TV series:", json.series);
        if (json.series) setSeries(json.series as TvSeriesData);
      } catch (err) {
        console.error("Failed to load TV series", err);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tmdbId, locale, region]);

  /* ── Sync liked & watchlist ────────────────────────────────────── */
  useEffect(() => {
    if (!series?.id) return;
    async function fetchStatus() {
      try {
        const [likedRes, watchlistRes] = await Promise.all([
          fetch("/api/liked"),
          fetch("/api/watchlist?media_type=tv"),
        ]);
        if (likedRes.ok) {
          const liked: any[] = await likedRes.json();
          const found = liked.find((l) => l.series_id === series!.id);
          setIsLiked(!!found);
          setLikedId(found?.id ?? null);
        }
        if (watchlistRes.ok) {
          const wl: any[] = await watchlistRes.json();
          const found = wl.find((w) => w.series_id === series!.id);
          setInWatchlist(!!found);
          setWatchlistId(found?.id ?? null);
        }
      } catch {}
    }
    fetchStatus();
  }, [series?.id]);

  const toggleLiked = useCallback(async () => {
    if (actionLoading || !series?.id) return;
    setActionLoading("liked");
    try {
      if (isLiked && likedId) {
        await fetch(`/api/liked?id=${likedId}`, { method: "DELETE" });
        setIsLiked(false);
        setLikedId(null);
      } else {
        const res = await fetch("/api/liked", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ media_type: "tv", series_id: series.id }),
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
  }, [isLiked, likedId, series?.id, actionLoading]);

  const toggleWatchlist = useCallback(async () => {
    if (actionLoading || !series?.id) return;
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
            media_type: "tv",
            series_id: series.id,
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
  }, [inWatchlist, watchlistId, series?.id, actionLoading]);

  /* ── Derived ───────────────────────────────────────────────────── */
  const scores = series
    ? computeScores(series)
    : { popularity: 0, completion: 0, buzz: 0 };
  const directors = series?.crew.filter((c) => c.job === "Director") ?? [];
  const creators =
    series?.crew.filter((c) =>
      ["Creator", "Executive Producer", "Showrunner"].includes(c.job),
    ) ?? [];
  const writers =
    series?.crew.filter(
      (c) => c.job === "Writer" || c.department === "Writing",
    ) ?? [];

  const platforms = series?.platforms ?? [];
  const streamingPlatforms = platforms.filter((p) => p.type === "streaming");

  /* ── Loading skeleton ──────────────────────────────────────────── */
  if (loading || !series) {
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

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen animate-fade-in">
      {/* Trailer Modal */}
      {showTrailer && series.trailer_key && (
        <TrailerModal
          trailerKey={series.trailer_key}
          title={series.name}
          onClose={() => setShowTrailer(false)}
        />
      )}

      {/* ============================================================ */}
      {/*  1. HERO                                                      */}
      {/* ============================================================ */}
      <section className="relative h-[55vh] lg:h-[70vh] -mt-14 lg:mt-0 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={getBackdropUrl(series.backdrop_path ?? series.poster_path)}
            alt={series.name}
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
                    src={getPosterUrl(series.poster_path)}
                    alt={series.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                {series.trailer_key && (
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
              {series.tagline && (
                <p className="text-primary/90 text-sm italic mb-1 line-clamp-1">
                  &ldquo;{series.tagline}&rdquo;
                </p>
              )}
              <h1 className="text-2xl lg:text-4xl font-bold text-white leading-tight mb-1">
                {series.name}
              </h1>
              {series.original_name && series.original_name !== series.name && (
                <p className="text-white/50 text-sm mb-1">
                  {series.original_name}
                </p>
              )}

              {series.overview && (
                <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                  {series.overview}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-semibold">
                  <Star className="w-4 h-4 fill-yellow-400" />
                  {series.vote_average.toFixed(1)}
                </span>
                {series.episode_run_time && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/80 text-sm">
                    <Clock className="w-3.5 h-3.5" />
                    {formatRuntime(series.episode_run_time)}/ep
                  </span>
                )}
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/80 text-sm">
                  <Layers className="w-3.5 h-3.5" />
                  {series.number_of_seasons}{" "}
                  {locale === "id" ? "Season" : "Season"}
                  {series.number_of_seasons > 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/80 text-sm">
                  <Film className="w-3.5 h-3.5" />
                  {series.number_of_episodes}{" "}
                  {locale === "id" ? "Episode" : "Episodes"}
                </span>
                {/* Status badge */}
                <span
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium",
                    series.in_production
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-white/10 text-white/60",
                  )}
                >
                  {series.in_production ? (
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {series.in_production
                    ? locale === "id"
                      ? "Sedang Tayang"
                      : "Ongoing"
                    : locale === "id"
                      ? "Tamat"
                      : "Ended"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {series.genres.map((g) => (
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

                  {/* {series.trailer_key && (
                    <Button
                      size="lg"
                      onClick={() => setShowTrailer(true)}
                      className="rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20"
                    >
                      <Play className="w-4 h-4 mr-2 fill-current" />
                      Trailer
                    </Button>
                  )} */}
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Content area                                                 */}
      {/* ============================================================ */}
      <div className="px-4 lg:px-8 max-w-5xl mx-auto -mt-4 relative z-10 space-y-8 pb-16">
        {/* ============================================================ */}
        {/*  3. NONTON DIMANA                                              */}
        {/* ============================================================ */}
        {platforms.length > 0 && (
          <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
            <h2 className="text-lg font-bold text-gradient mb-4">
              {locale === "id" ? "Nonton Dimana?" : "Where to Watch?"}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {platforms.map((p) => {
                const pl = p.platforms;
                if (!pl) return null;
                const logoSrc = pl.logo_path
                  ? `https://image.tmdb.org/t/p/w92${pl.logo_path}`
                  : null;
                const card = (
                  <div
                    className={cn(
                      "relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all group",
                      "bg-white/5 border-white/10",
                      pl.url
                        ? "hover-lift cursor-pointer hover:border-primary/20"
                        : "",
                    )}
                  >
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt={pl.name}
                        className="w-10 h-10 rounded-lg object-contain bg-white/10"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <Tv className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs font-medium text-foreground truncate w-full text-center">
                      {pl.name}
                    </p>
                    <Badge className="text-[10px] pointer-events-none bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      {p.type === "streaming"
                        ? locale === "id"
                          ? "Streaming"
                          : "Stream"
                        : p.type === "rent"
                          ? locale === "id"
                            ? "Sewa"
                            : "Rent"
                          : locale === "id"
                            ? "Beli"
                            : "Buy"}
                    </Badge>
                    {pl.url && (
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink className="w-3 h-3 text-primary/70" />
                      </div>
                    )}
                  </div>
                );
                return pl.url ? (
                  <a
                    key={p.platform_id}
                    href={pl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {card}
                  </a>
                ) : (
                  <div key={p.platform_id}>{card}</div>
                );
              })}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  3. SERIES INFO                                               */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-3">
            {locale === "id" ? "Sinopsis" : "Overview"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {series.overview}
          </p>

          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3 mt-5">
            {locale === "id" ? "Info Series" : "Series Info"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Layers className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">
                  {locale === "id" ? "Season" : "Seasons"}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {series.number_of_seasons}
              </p>
            </div>

            <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Film className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">
                  {locale === "id" ? "Total Episode" : "Episodes"}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {series.number_of_episodes}
              </p>
            </div>

            {series.episode_run_time && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {locale === "id" ? "Durasi/Ep" : "Runtime/Ep"}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {formatRuntime(series.episode_run_time)}
                </p>
              </div>
            )}

            <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">
                  {locale === "id" ? "Tayang Perdana" : "First Air"}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {formatDate(series.first_air_date, locale)}
              </p>
            </div>

            {series.last_air_date && (
              <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {locale === "id" ? "Tayang Terakhir" : "Last Air"}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {formatDate(series.last_air_date, locale)}
                </p>
              </div>
            )}

            <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">
                  {locale === "id" ? "Voting" : "Votes"}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {series.vote_count.toLocaleString()}
              </p>
            </div>

            <div className="glass-strong rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-semibold">
                  Popularity
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {Number(series.popularity).toFixed(1)}
              </p>
            </div>
          </div>

          {/* Networks */}
          {series.networks.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                {locale === "id" ? "Jaringan / Channel" : "Networks"}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {series.networks.map((n) => (
                  <div
                    key={n.tmdb_network_id}
                    className="flex items-center gap-2"
                  >
                    {n.logo_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${n.logo_path}`}
                        alt={n.name}
                        className="h-3.5 object-contain filter brightness-0 invert opacity-60"
                        title={n.name}
                      />
                    ) : (
                      <span className="text-sm font-medium text-foreground">
                        {n.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Countries */}
          {series.countries.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  {locale === "id" ? "Negara Asal" : "Origin Countries"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {series.countries.map((c) => (
                    <Badge
                      key={c.iso_3166_1}
                      variant="secondary"
                      className="bg-white/5 text-muted-foreground border-white/10 text-xs"
                    >
                      {c.name ?? c.iso_3166_1}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/*  6. SEASONS & EPISODES                                        */}
        {/* ============================================================ */}
        {series.number_of_seasons > 0 && (
          <section className="animate-slide-up">
            <SectionHeader
              title={
                locale === "id"
                  ? `Season & Episode (${series.number_of_seasons} Season)`
                  : `Seasons & Episodes (${series.number_of_seasons} Season${
                      series.number_of_seasons > 1 ? "s" : ""
                    })`
              }
            />
            <SeasonTabs
              seasons={
                series.seasons ??
                Array.from({ length: series.number_of_seasons }, (_, i) => ({
                  season_number: i + 1,
                  name: `Season ${i + 1}`,
                  overview: null,
                  poster_path: null,
                  air_date: null,
                  episode_count: 0,
                }))
              }
              locale={locale}
              seriesTmdbId={series.tmdb_id}
            />
          </section>
        )}

        <NativeBannerAd className="px-4" />

        {/* ============================================================ */}
        {/*  4. FILM SCORE                                                */}
        {/* ============================================================ */}
        <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
          <h2 className="text-lg font-bold text-gradient mb-5">Series Score</h2>
          <div className="space-y-4">
            {[
              {
                label: locale === "id" ? "Popularitas" : "Popularity",
                value: scores.popularity,
                colorClass: "bg-primary",
                icon: TrendingUp,
                iconClass: "text-primary",
              },
              {
                label: locale === "id" ? "Engagement" : "Engagement",
                value: scores.completion,
                colorClass: "bg-emerald-500",
                icon: Eye,
                iconClass: "text-emerald-400",
              },
              {
                label: "Buzz",
                value: scores.buzz,
                colorClass: "bg-sky-500",
                icon: MessageCircle,
                iconClass: "text-sky-400",
              },
            ].map(({ label, value, colorClass, icon: Icon, iconClass }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn(
                      "flex items-center gap-2 text-sm font-medium text-foreground",
                    )}
                  >
                    <Icon className={cn("w-4 h-4", iconClass)} />
                    {label}
                  </span>
                  <span className={cn("text-sm font-bold", iconClass)}>
                    {value}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      colorClass,
                    )}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/*  5. KEPUTUSAN CEPAT                                           */}
        {/* ============================================================ */}
        <TvQuickDecisionCard seriesId={series.id} locale={locale} t={t} />

        {/* ============================================================ */}
        {/*  6. TRAILER                                                   */}
        {/* ============================================================ */}
        {series.trailer_key && (
          <section className="animate-slide-up">
            <SectionHeader title="Trailer" />
            <div
              className="relative rounded-2xl overflow-hidden cursor-pointer hover-lift group"
              onClick={() => setShowTrailer(true)}
            >
              <div className="aspect-video w-full bg-black/40">
                <img
                  src={`https://img.youtube.com/vi/${series.trailer_key}/maxresdefault.jpg`}
                  alt={`${series.name} trailer`}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity duration-300"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (!el.src.includes("hqdefault")) {
                      el.src = `https://img.youtube.com/vi/${series.trailer_key}/hqdefault.jpg`;
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
                  {series.name} — Official Trailer
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  7. CAST                                                       */}
        {/* ============================================================ */}
        {series.cast.length > 0 && (
          <section className="animate-slide-up">
            <SectionHeader title={locale === "id" ? "Pemeran" : "Cast"} />
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
              {series.cast.slice(0, 20).map((person) => (
                <div
                  key={person.person_id}
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
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {person.name}
                  </p>
                  {person.character && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {person.character}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  8. CREW (Creator / Director / Writer)                        */}
        {/* ============================================================ */}
        {(creators.length > 0 ||
          directors.length > 0 ||
          writers.length > 0) && (
          <section className="glass rounded-2xl p-5 lg:p-6 animate-slide-up">
            <h2 className="text-lg font-bold text-gradient mb-4">
              {locale === "id" ? "Kreator & Kru" : "Creators & Crew"}
            </h2>
            <div className="space-y-4">
              {[
                {
                  label:
                    locale === "id"
                      ? "Kreator / Produser Eksekutif"
                      : "Creator / Executive Producer",
                  people: creators,
                  icon: Sparkles,
                },
                {
                  label: locale === "id" ? "Sutradara" : "Director",
                  people: directors,
                  icon: Clapperboard,
                },
                {
                  label: locale === "id" ? "Penulis" : "Writer",
                  people: writers,
                  icon: Building2,
                },
              ]
                .filter((g) => g.people.length > 0)
                .map(({ label, people, icon: Icon }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                        {label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {people.slice(0, 5).map((p) => (
                          <div
                            key={`${p.person_id}-${p.job}`}
                            className="flex items-center gap-1.5"
                          >
                            {p.profile_path && (
                              <img
                                src={getProfileUrl(p.profile_path)}
                                alt={p.name}
                                className="w-5 h-5 rounded-full object-cover"
                              />
                            )}
                            <span className="text-sm text-foreground">
                              {p.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  9. SIMILAR SERIES                                            */}
        {/* ============================================================ */}
        {series.similarSeries && series.similarSeries.length > 0 && (
          <section className="animate-slide-up">
            <SectionHeader
              title={locale === "id" ? "Series Serupa" : "Similar Series"}
            />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {series.similarSeries.slice(0, 15).map((s) => (
                <div
                  key={s.id}
                  className="w-[140px] lg:w-[160px] flex-shrink-0 group cursor-pointer"
                  onClick={() => router.push(`/tv/${s.tmdb_id}`)}
                >
                  <div className="relative rounded-xl overflow-hidden hover-lift card-shine">
                    <div className="aspect-[2/3]">
                      <img
                        src={getPosterUrl(s.poster_path)}
                        alt={s.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="absolute top-2 right-2">
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/60 text-yellow-400 text-[10px] font-semibold backdrop-blur-sm">
                        <Star className="w-2.5 h-2.5 fill-yellow-400" />
                        {s.vote_average.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {s.name}
                  </p>
                  {s.first_air_date && (
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(s.first_air_date).getFullYear()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
