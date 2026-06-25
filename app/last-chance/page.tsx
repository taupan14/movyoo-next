"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/hooks/use-locale";
import { getPosterUrl } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import {
  TriangleAlert as AlertTriangle,
  Clock,
  Play,
  Zap,
  TrendingUp,
  Film,
  Tv,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

// ─── TYPES ──────────────────────────────────────────────────────────────────

type UrgencyTier = "critical" | "urgent" | "warning";
type ContentType = "movie" | "tv";
type ContentFilter = "all" | "movie" | "tv";

interface LeavingSoonItem {
  id: number;
  content_type: ContentType;
  platform_slug: string;
  available_until: string;
  days_left: number;
  tier: UrgencyTier;
  content_id: number;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string | null;
  popularity?: number;
  overview?: string;
}

interface ApiResponse {
  items: LeavingSoonItem[];
  total: number;
  criticalCount: number;
  urgentCount: number;
  warningCount: number;
}

// ─── PLATFORM CONFIG ─────────────────────────────────────────────────────────

interface PlatformConfig {
  label: string;
  color: string;
  bg: string;
  // Fungsi untuk generate watch URL per konten
  watchUrl: (item: LeavingSoonItem) => string;
  // Apakah link ke external platform (true) atau internal halaman (false)
  isExternal: boolean;
}

const platformConfig: Record<string, PlatformConfig> = {
  netflix: {
    label: "Netflix",
    color: "text-red-400",
    bg: "bg-red-500/20 border-red-500/30",
    watchUrl: (item) =>
      `https://www.netflix.com/search?q=${encodeURIComponent(item.title)}`,
    isExternal: true,
  },
  "disney+": {
    label: "Disney+",
    color: "text-blue-400",
    bg: "bg-blue-500/20 border-blue-500/30",
    watchUrl: (item) =>
      `https://www.disneyplus.com/search/${encodeURIComponent(item.title)}`,
    isExternal: true,
  },
  prime: {
    label: "Prime Video",
    color: "text-cyan-400",
    bg: "bg-cyan-500/20 border-cyan-500/30",
    watchUrl: (item) =>
      `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(item.title)}`,
    isExternal: true,
  },
  "apple-tv": {
    label: "Apple TV+",
    color: "text-gray-300",
    bg: "bg-gray-500/20 border-gray-500/30",
    watchUrl: (item) =>
      `https://tv.apple.com/search?term=${encodeURIComponent(item.title)}`,
    isExternal: true,
  },
  cinema: {
    label: "Bioskop",
    color: "text-yellow-400",
    bg: "bg-yellow-500/20 border-yellow-500/30",
    // 21cineplex search by movie title
    watchUrl: (item) =>
      `https://www.21cineplex.com/nowplaying/${item.title.toLowerCase().replace(/\s+/g, "-")},0,ALL.htm`,
    isExternal: true,
  },
};

function getPlatformCfg(slug: string): PlatformConfig {
  return (
    platformConfig[slug] ?? {
      label: slug,
      color: "text-muted-foreground",
      bg: "bg-white/10 border-white/20",
      watchUrl: (item) => `/movie/${item.content_id}`,
      isExternal: false,
    }
  );
}

// ─── TIER CONFIG ─────────────────────────────────────────────────────────────

const tierConfig: Record<
  UrgencyTier,
  {
    color: string;
    bg: string;
    border: string;
    icon: typeof AlertTriangle;
  }
> = {
  critical: {
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: AlertTriangle,
  },
  urgent: {
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: Zap,
  },
  warning: {
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: Clock,
  },
};

// ─── UTILS ──────────────────────────────────────────────────────────────────

function getLeavingLabel(daysLeft: number, locale: "id" | "en"): string {
  if (locale === "id") {
    if (daysLeft === 0) return "Hari ini!";
    if (daysLeft === 1) return "Besok!";
    if (daysLeft <= 7) return `${daysLeft} hari lagi`;
    return `${Math.ceil(daysLeft / 7)} minggu lagi`;
  }
  if (daysLeft === 0) return "Today!";
  if (daysLeft === 1) return "Tomorrow!";
  if (daysLeft <= 7) return `${daysLeft} days left`;
  return `${Math.ceil(daysLeft / 7)} weeks left`;
}

function getUrgencyLabel(tier: UrgencyTier, locale: "id" | "en"): string {
  if (tier === "critical") return locale === "id" ? "KRITIS" : "CRITICAL";
  if (tier === "urgent") return locale === "id" ? "MENDADAK" : "URGENT";
  return locale === "id" ? "PERHATIAN" : "WARNING";
}

function calcTimeLeft(availableUntil: string) {
  const target = new Date(availableUntil);
  target.setHours(23, 59, 59, 0);
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
  };
}

// ─── COMPONENTS ─────────────────────────────────────────────────────────────

function CountdownTimer({
  availableUntil,
  locale,
}: {
  availableUntil: string;
  locale: "id" | "en";
}) {
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(availableUntil));
  useEffect(() => {
    const interval = setInterval(
      () => setTimeLeft(calcTimeLeft(availableUntil)),
      60000,
    );
    return () => clearInterval(interval);
  }, [availableUntil]);
  return (
    <span className="font-mono tabular-nums text-xs">
      {timeLeft.days > 0 && (
        <>
          <span className="text-foreground font-bold">{timeLeft.days}</span>
          <span className="text-muted-foreground ml-0.5">
            {locale === "id" ? "h" : "d"}
          </span>
          <span className="mx-1 text-muted-foreground">:</span>
        </>
      )}
      <span className="text-foreground font-bold">
        {String(timeLeft.hours).padStart(2, "0")}
      </span>
      <span className="mx-1 text-muted-foreground">:</span>
      <span className="text-foreground font-bold">
        {String(timeLeft.minutes).padStart(2, "0")}
      </span>
    </span>
  );
}

function LeavingCard({
  item,
  locale,
  index,
}: {
  item: LeavingSoonItem;
  locale: "id" | "en";
  index: number;
}) {
  const tier = tierConfig[item.tier];
  const TierIcon = tier.icon;
  const pc = getPlatformCfg(item.platform_slug);

  // Detail konten selalu ke halaman internal
  const detailHref =
    item.content_type === "tv"
      ? `/tv/${item.content_id}`
      : `/movie/${item.content_id}`;

  // Watch URL: external platform atau internal
  const watchHref = pc.watchUrl(item);

  const watchLabel =
    locale === "id"
      ? item.platform_slug === "cinema"
        ? "Cek Jadwal"
        : "Tonton Sekarang"
      : item.platform_slug === "cinema"
        ? "Check Showtimes"
        : "Watch Now";

  return (
    <div
      className={cn(
        "animate-slide-up relative rounded-2xl overflow-hidden",
        "glass card-shine",
        item.tier === "critical" && "ring-1 ring-red-500/40 animate-pulse-glow",
        item.tier === "urgent" && "ring-1 ring-orange-500/30",
        item.tier === "warning" && "ring-1 ring-yellow-500/20",
      )}
      style={{ animationDelay: `${Math.min(index * 60, 600)}ms` }}
    >
      {/* Urgency stripe */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5",
          tier.bg,
          tier.border,
          "border-b",
        )}
      >
        <TierIcon className={cn("w-3.5 h-3.5", tier.color)} />
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            tier.color,
          )}
        >
          {getUrgencyLabel(item.tier, locale)}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Clock className={cn("w-3 h-3", tier.color)} />
          <CountdownTimer
            availableUntil={item.available_until}
            locale={locale}
          />
        </span>
      </div>

      <div className="flex gap-4 p-4">
        {/* Poster — klik ke detail halaman internal */}
        <Link href={detailHref} className="w-20 sm:w-24 flex-shrink-0">
          <div className="aspect-[2/3] rounded-xl overflow-hidden">
            <img
              src={getPosterUrl(item.poster_path, "w342")}
              alt={item.title}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
            />
          </div>
        </Link>

        {/* Details */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            {/* Platform badge + content type */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <div
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold",
                  pc.bg,
                  pc.color,
                )}
              >
                {pc.label}
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-medium text-muted-foreground">
                {item.content_type === "tv" ? (
                  <>
                    <Tv className="w-2.5 h-2.5" /> Series
                  </>
                ) : (
                  <>
                    <Film className="w-2.5 h-2.5" /> Film
                  </>
                )}
              </div>
            </div>

            {/* Title — klik ke detail internal */}
            <Link href={detailHref} className="block">
              <h3 className="font-bold text-foreground text-sm sm:text-base line-clamp-2 hover:text-primary transition-colors">
                {item.title}
              </h3>
            </Link>

            {/* Rating */}
            {item.vote_average > 0 && (
              <div className="flex items-center gap-1 text-xs text-yellow-400 mt-1">
                <TrendingUp className="w-3 h-3" />
                <span className="font-medium">
                  {item.vote_average.toFixed(1)}
                </span>
              </div>
            )}

            {/* Leaving label */}
            <div className={cn("text-xs font-semibold mt-2", tier.color)}>
              {getLeavingLabel(item.days_left, locale)}
            </div>
          </div>

          {/* Watch CTA — external platform link */}
          <a
            href={watchHref}
            target={pc.isExternal ? "_blank" : undefined}
            rel={pc.isExternal ? "noopener noreferrer" : undefined}
            className={cn(
              "mt-3 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200",
              item.tier === "critical" &&
                "gradient-primary text-white hover:opacity-90",
              item.tier === "urgent" &&
                "bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30",
              item.tier === "warning" &&
                "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30",
            )}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {watchLabel}
            {pc.isExternal && <ExternalLink className="w-3 h-3 opacity-70" />}
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export default function LastChancePage() {
  const { t, locale, region } = useI18n();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTier, setActiveTier] = useState<UrgencyTier | "all">("all");
  const [activeType, setActiveType] = useState<ContentFilter>("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const lang = locale === "id" ? "id" : "en";
        const params = new URLSearchParams({
          lang,
          region,
          type: "all",
          max_days: "45",
        });
        const res = await fetch(`/api/movies/last-chance?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to load last-chance data:", err);
        setError(
          locale === "id" ? "Gagal memuat data." : "Failed to load data.",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [locale, region]);

  const allItems = data?.items ?? [];

  const filteredItems = allItems
    .filter((item) => activeTier === "all" || item.tier === activeTier)
    .filter((item) => activeType === "all" || item.content_type === activeType);

  const criticalCount = allItems.filter((i) => i.tier === "critical").length;
  const urgentCount = allItems.filter((i) => i.tier === "urgent").length;
  const warningCount = allItems.filter((i) => i.tier === "warning").length;

  const tierFilters: {
    key: UrgencyTier | "all";
    label: string;
    count: number;
  }[] = [
    {
      key: "all",
      label: locale === "id" ? "Semua" : "All",
      count: allItems.length,
    },
    {
      key: "critical",
      label: locale === "id" ? "Kritis" : "Critical",
      count: criticalCount,
    },
    {
      key: "urgent",
      label: locale === "id" ? "Mendadak" : "Urgent",
      count: urgentCount,
    },
    {
      key: "warning",
      label: locale === "id" ? "Perhatian" : "Warning",
      count: warningCount,
    },
  ];

  const typeFilters: {
    key: ContentFilter;
    label: string;
    icon: typeof Film;
  }[] = [
    { key: "all", label: locale === "id" ? "Semua" : "All", icon: Play },
    { key: "movie", label: locale === "id" ? "Film" : "Movies", icon: Film },
    { key: "tv", label: locale === "id" ? "Series" : "Series", icon: Tv },
  ];

  return (
    <div className="min-h-screen px-4 lg:px-6 py-6 lg:py-8">
      {/* Header */}
      <div className="animate-fade-in mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center animate-pulse-glow">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              {t("last_chance_title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {locale === "id"
                ? "Film & series yang akan segera hilang dari platform"
                : "Movies & series leaving platforms soon"}
            </p>
          </div>
        </div>
      </div>

      {/* Urgency summary cards */}
      <div className="animate-slide-up grid grid-cols-3 gap-3 mb-6">
        {[
          {
            count: criticalCount,
            label_id: "Kritis",
            label_en: "Critical",
            sub_id: "<= 3 hari",
            sub_en: "<= 3 days",
            color: "red",
          },
          {
            count: urgentCount,
            label_id: "Mendadak",
            label_en: "Urgent",
            sub_id: "4–7 hari",
            sub_en: "4–7 days",
            color: "orange",
          },
          {
            count: warningCount,
            label_id: "Perhatian",
            label_en: "Warning",
            sub_id: "8–45 hari",
            sub_en: "8–45 days",
            color: "yellow",
          },
        ].map((c) => (
          <div
            key={c.color}
            className={`rounded-xl p-3 text-center bg-${c.color}-500/10 border border-${c.color}-500/20`}
          >
            <div className={`text-2xl font-bold text-${c.color}-400`}>
              {loading ? "—" : c.count}
            </div>
            <div
              className={`text-[10px] uppercase tracking-wider text-${c.color}-400/70 font-semibold mt-0.5`}
            >
              {locale === "id" ? c.label_id : c.label_en}
            </div>
            <div className={`text-[10px] text-${c.color}-400/50 mt-0.5`}>
              {locale === "id" ? c.sub_id : c.sub_en}
            </div>
          </div>
        ))}
      </div>

      {/* Content type filter */}
      <div className="animate-slide-up flex gap-2 mb-4">
        {typeFilters.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => setActiveType(f.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                activeType === f.key
                  ? "bg-primary text-white"
                  : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Tier filter */}
      <div className="animate-slide-up flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
        {tierFilters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveTier(filter.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200",
              activeTier === filter.key
                ? "bg-primary text-white"
                : "glass text-muted-foreground hover:text-foreground hover:bg-white/10",
            )}
          >
            {filter.label}
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-md text-[10px] font-bold",
                activeTier === filter.key ? "bg-white/20" : "bg-white/10",
              )}
            >
              {filter.count}
            </span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
            <span className="text-muted-foreground text-sm">
              {locale === "id" ? "Memuat data..." : "Loading data..."}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Grid */}
      {!loading && !error && filteredItems.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item, index) => (
            <LeavingCard
              key={`${item.content_type}-${item.id}`}
              item={item}
              locale={locale}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {locale === "id" ? "Semua Aman!" : "All Clear!"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {locale === "id"
              ? "Tidak ada konten yang akan segera hilang dari platform"
              : "No content leaving platforms anytime soon"}
          </p>
        </div>
      )}
    </div>
  );
}
