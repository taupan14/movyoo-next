'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/use-locale';
import { fetchTrending, fetchPopular, getPosterUrl } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { TriangleAlert as AlertTriangle, Clock, Play, Zap, TrendingUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';

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
}

type UrgencyTier = 'critical' | 'urgent' | 'warning';

type Platform = 'netflix' | 'disney+' | 'prime' | 'cinema';

interface LeavingMovie extends Movie {
  leavingDate: Date;
  daysLeft: number;
  tier: UrgencyTier;
  platform: Platform;
}

const platformConfig: Record<Platform, { label_id: string; label_en: string; color: string; bg: string; icon: typeof Play }> = {
  netflix: { label_id: 'Netflix', label_en: 'Netflix', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', icon: Play },
  'disney+': { label_id: 'Disney+', label_en: 'Disney+', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30', icon: Play },
  prime: { label_id: 'Prime Video', label_en: 'Prime Video', color: 'text-cyan-400', bg: 'bg-cyan-500/20 border-cyan-500/30', icon: Play },
  cinema: { label_id: 'Bioskop', label_en: 'Cinema', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30', icon: Play },
};

const allPlatforms: Platform[] = ['netflix', 'disney+', 'prime', 'cinema'];

const tierConfig: Record<UrgencyTier, { color: string; bg: string; border: string; glow: string; icon: typeof AlertTriangle }> = {
  critical: {
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    glow: 'shadow-red-500/20',
    icon: AlertTriangle,
  },
  urgent: {
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    glow: 'shadow-orange-500/20',
    icon: Zap,
  },
  warning: {
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    glow: 'shadow-yellow-500/20',
    icon: Clock,
  },
};

function getTier(daysLeft: number): UrgencyTier {
  if (daysLeft <= 3) return 'critical';
  if (daysLeft <= 7) return 'urgent';
  return 'warning';
}

function getLeavingLabel(daysLeft: number, locale: 'id' | 'en'): string {
  if (locale === 'id') {
    if (daysLeft <= 3) return `${daysLeft} hari lagi`;
    if (daysLeft <= 7) return '1 minggu lagi';
    return `${Math.ceil(daysLeft / 7)} minggu lagi`;
  }
  if (daysLeft <= 3) return `${daysLeft} days left`;
  if (daysLeft <= 7) return '1 week left';
  return `${Math.ceil(daysLeft / 7)} weeks left`;
}

function getUrgencyLabel(tier: UrgencyTier, locale: 'id' | 'en'): string {
  if (tier === 'critical') return locale === 'id' ? 'KRITIS' : 'CRITICAL';
  if (tier === 'urgent') return locale === 'id' ? 'MENDADAK' : 'URGENT';
  return locale === 'id' ? 'PERHATIAN' : 'WARNING';
}

function simulateLeavingData(movies: Movie[]): LeavingMovie[] {
  const now = Date.now();
  return movies.map((movie, index) => {
    // Pseudo-random-ish distribution of days left: 1-14
    const seed = ((movie.id * 7 + index * 3) % 14) + 1;
    const daysLeft = seed;
    const leavingDate = new Date(now + daysLeft * 86400000);
    const platform = allPlatforms[index % allPlatforms.length];
    return {
      ...movie,
      leavingDate,
      daysLeft,
      tier: getTier(daysLeft),
      platform,
    };
  });
}

interface CountdownTimerProps {
  leavingDate: Date;
  locale: 'id' | 'en';
}

function CountdownTimer({ leavingDate, locale }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(leavingDate));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(calcTimeLeft(leavingDate));
    }, 60000);
    return () => clearInterval(interval);
  }, [leavingDate]);

  return (
    <span className="font-mono tabular-nums text-xs">
      {timeLeft.days > 0 && (
        <>
          <span className="text-foreground font-bold">{timeLeft.days}</span>
          <span className="text-muted-foreground ml-0.5">{locale === 'id' ? 'h' : 'd'}</span>
          <span className="mx-1 text-muted-foreground">:</span>
        </>
      )}
      <span className="text-foreground font-bold">{String(timeLeft.hours).padStart(2, '0')}</span>
      <span className="mx-1 text-muted-foreground">:</span>
      <span className="text-foreground font-bold">{String(timeLeft.minutes).padStart(2, '0')}</span>
    </span>
  );
}

function calcTimeLeft(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
  };
}

function LeavingCard({
  movie,
  locale,
  index,
}: {
  movie: LeavingMovie;
  locale: 'id' | 'en';
  index: number;
}) {
  const tier = tierConfig[movie.tier];
  const TierIcon = tier.icon;
  const pc = platformConfig[movie.platform];
  const PlIcon = pc.icon;

  return (
    <div
      className={cn(
        'animate-slide-up relative rounded-2xl overflow-hidden',
        'glass card-shine',
        movie.tier === 'critical' && 'ring-1 ring-red-500/40 animate-pulse-glow',
        movie.tier === 'urgent' && 'ring-1 ring-orange-500/30',
        movie.tier === 'warning' && 'ring-1 ring-yellow-500/20'
      )}
      style={{ animationDelay: `${Math.min(index * 60, 600)}ms` }}
    >
      {/* Urgency stripe */}
      <div className={cn('flex items-center gap-1.5 px-3 py-1.5', tier.bg, tier.border, 'border-b')}>
        <TierIcon className={cn('w-3.5 h-3.5', tier.color)} />
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', tier.color)}>
          {getUrgencyLabel(movie.tier, locale)}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Clock className={cn('w-3 h-3', tier.color)} />
          <CountdownTimer leavingDate={movie.leavingDate} locale={locale} />
        </span>
      </div>

      <div className="flex gap-4 p-4">
        {/* Poster */}
        <div className="w-20 sm:w-24 flex-shrink-0">
          <div className="aspect-[2/3] rounded-xl overflow-hidden">
            <img
              src={getPosterUrl(movie.poster_path, 'w342')}
              alt={movie.title}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            {/* Platform badge */}
            <div className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-semibold mb-2', pc.bg, pc.color)}>
              <PlIcon className="w-3 h-3" />
              {locale === 'id' ? pc.label_id : pc.label_en}
            </div>

            {/* Title */}
            <Link href={`/movie/${movie.id}`} className="block">
              <h3 className="font-bold text-foreground text-sm sm:text-base line-clamp-2 group-hover:text-primary transition-colors">
                {movie.title}
              </h3>
            </Link>

            {/* Rating */}
            {movie.vote_average > 0 && (
              <div className="flex items-center gap-1 text-xs text-yellow-400 mt-1">
                <TrendingUp className="w-3 h-3 fill-yellow-400" />
                <span className="font-medium">{movie.vote_average.toFixed(1)}</span>
              </div>
            )}

            {/* Leaving label */}
            <div className={cn('text-xs font-semibold mt-2', tier.color)}>
              {getLeavingLabel(movie.daysLeft, locale)}
            </div>
          </div>

          {/* Watch Now CTA */}
          <Link
            href={`/movie/${movie.id}`}
            className={cn(
              'mt-3 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200',
              movie.tier === 'critical' && 'gradient-primary text-white hover:opacity-90',
              movie.tier === 'urgent' && 'bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30',
              movie.tier === 'warning' && 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
            )}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {locale === 'id' ? 'Tonton Sekarang' : 'Watch Now'}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LastChancePage() {
  const { t, locale, region } = useI18n();
  const [leavingMovies, setLeavingMovies] = useState<LeavingMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTier, setActiveTier] = useState<UrgencyTier | 'all'>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const lang = locale === 'id' ? 'id' : 'en';
        const [trendRes, popRes] = await Promise.allSettled([
          fetchTrending('week', lang, region),
          fetchPopular(lang, region),
        ]);
        const trendingResults: Movie[] = trendRes.status === 'fulfilled' ? (trendRes.value.results || []) : [];
        const popularResults: Movie[] = popRes.status === 'fulfilled' ? (popRes.value.results || []) : [];

        // Merge and deduplicate
        const seen = new Set<number>();
        const all: Movie[] = [];
        for (const movie of [...trendingResults, ...popularResults]) {
          if (!seen.has(movie.id)) {
            seen.add(movie.id);
            all.push(movie);
          }
        }

        const leaving = simulateLeavingData(all);
        // Sort by urgency (soonest first)
        leaving.sort((a, b) => a.daysLeft - b.daysLeft);
        setLeavingMovies(leaving);
      } catch (err) {
        console.error('Failed to load last chance data:', err);
      }
      setLoading(false);
    }
    load();
  }, [locale, region]);

  const filteredMovies = activeTier === 'all'
    ? leavingMovies
    : leavingMovies.filter((m) => m.tier === activeTier);

  const criticalCount = leavingMovies.filter((m) => m.tier === 'critical').length;
  const urgentCount = leavingMovies.filter((m) => m.tier === 'urgent').length;
  const warningCount = leavingMovies.filter((m) => m.tier === 'warning').length;

  const tierFilters: { key: UrgencyTier | 'all'; label: string; count: number }[] = [
    { key: 'all', label: locale === 'id' ? 'Semua' : 'All', count: leavingMovies.length },
    { key: 'critical', label: locale === 'id' ? 'Kritis' : 'Critical', count: criticalCount },
    { key: 'urgent', label: locale === 'id' ? 'Mendadak' : 'Urgent', count: urgentCount },
    { key: 'warning', label: locale === 'id' ? 'Perhatian' : 'Warning', count: warningCount },
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
              {t('last_chance_title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {locale === 'id'
                ? 'Film yang akan segera hilang dari platform'
                : 'Movies leaving platforms soon'}
            </p>
          </div>
        </div>
      </div>

      {/* Urgency Summary Cards */}
      <div className="animate-slide-up grid grid-cols-3 gap-3 mb-6">
        <div className={cn('rounded-xl p-3 text-center', 'bg-red-500/10 border border-red-500/20')}>
          <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-red-400/70 font-semibold mt-0.5">
            {locale === 'id' ? 'Kritis' : 'Critical'}
          </div>
          <div className="text-[10px] text-red-400/50 mt-0.5">
            {locale === 'id' ? '<= 3 hari' : '<= 3 days'}
          </div>
        </div>
        <div className={cn('rounded-xl p-3 text-center', 'bg-orange-500/10 border border-orange-500/20')}>
          <div className="text-2xl font-bold text-orange-400">{urgentCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-orange-400/70 font-semibold mt-0.5">
            {locale === 'id' ? 'Mendadak' : 'Urgent'}
          </div>
          <div className="text-[10px] text-orange-400/50 mt-0.5">
            {locale === 'id' ? '4-7 hari' : '4-7 days'}
          </div>
        </div>
        <div className={cn('rounded-xl p-3 text-center', 'bg-yellow-500/10 border border-yellow-500/20')}>
          <div className="text-2xl font-bold text-yellow-400">{warningCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-yellow-400/70 font-semibold mt-0.5">
            {locale === 'id' ? 'Perhatian' : 'Warning'}
          </div>
          <div className="text-[10px] text-yellow-400/50 mt-0.5">
            {locale === 'id' ? '8-14 hari' : '8-14 days'}
          </div>
        </div>
      </div>

      {/* Tier filter tabs */}
      <div className="animate-slide-up flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
        {tierFilters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveTier(filter.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200',
              activeTier === filter.key
                ? 'bg-primary text-white'
                : 'glass text-muted-foreground hover:text-foreground hover:bg-white/10'
            )}
          >
            {filter.label}
            <span className={cn(
              'px-1.5 py-0.5 rounded-md text-[10px] font-bold',
              activeTier === filter.key ? 'bg-white/20' : 'bg-white/10'
            )}>
              {filter.count}
            </span>
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
            <span className="text-muted-foreground text-sm">
              {locale === 'id' ? 'Memuat data...' : 'Loading data...'}
            </span>
          </div>
        </div>
      )}

      {/* Movie list */}
      {!loading && filteredMovies.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMovies.map((movie, index) => (
            <LeavingCard
              key={movie.id}
              movie={movie}
              locale={locale}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredMovies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {locale === 'id' ? 'Semua Aman!' : 'All Clear!'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {locale === 'id'
              ? 'Tidak ada film yang akan segera hilang dari platform'
              : 'No movies leaving platforms anytime soon'}
          </p>
        </div>
      )}
    </div>
  );
}
