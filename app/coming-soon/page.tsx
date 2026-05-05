'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/use-locale';
import { fetchUpcoming, getPosterUrl, getBackdropUrl } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { Bell, BellOff, Calendar, Star, Clock, Film, Tv, MonitorPlay } from 'lucide-react';

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

interface EnrichedMovie extends Movie {
  platform: Platform;
}

type Platform = 'netflix' | 'disney+' | 'prime' | 'cinema';

const REMINDERS_KEY = 'movyoo-reminders';

const platformConfig: Record<Platform, { label_id: string; label_en: string; color: string; bg: string; icon: typeof Film }> = {
  netflix: { label_id: 'Netflix', label_en: 'Netflix', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', icon: Tv },
  'disney+': { label_id: 'Disney+', label_en: 'Disney+', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30', icon: MonitorPlay },
  prime: { label_id: 'Prime Video', label_en: 'Prime Video', color: 'text-cyan-400', bg: 'bg-cyan-500/20 border-cyan-500/30', icon: Tv },
  cinema: { label_id: 'Bioskop', label_en: 'Cinema', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30', icon: Film },
};

const platforms: Platform[] = ['netflix', 'disney+', 'prime', 'cinema'];

function assignPlatform(index: number): Platform {
  return platforms[index % platforms.length];
}

function getReminders(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function toggleReminder(movieId: number): boolean {
  const reminders = getReminders();
  const exists = reminders.includes(movieId);
  const updated = exists ? reminders.filter((id) => id !== movieId) : [...reminders, movieId];
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(updated));
  return !exists;
}

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  totalMs: number;
}

function getCountdown(releaseDate: string): CountdownResult {
  const target = new Date(releaseDate).getTime();
  const now = Date.now();
  const totalMs = Math.max(0, target - now);
  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes, totalMs };
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key: string, locale: 'id' | 'en'): string {
  const [year, month] = key.split('-').map(Number);
  const monthNames_id = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const monthNames_en = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const names = locale === 'id' ? monthNames_id : monthNames_en;
  return `${names[month - 1]} ${year}`;
}

function RadarAnimation() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Radar circles */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-[600px] h-[600px] rounded-full border border-primary/5 animate-ping" style={{ animationDuration: '4s' }} />
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-[400px] h-[400px] rounded-full border border-primary/8 animate-ping" style={{ animationDuration: '3s' }} />
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-[200px] h-[200px] rounded-full border border-primary/10 animate-ping" style={{ animationDuration: '2s' }} />
      </div>
      {/* Center pulse */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-4 h-4 rounded-full bg-primary/20 animate-pulse-glow" />
      </div>
      {/* Sweep line */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[1px] origin-left"
        style={{
          background: 'linear-gradient(90deg, hsl(25 95% 55% / 0.3), transparent)',
          animation: 'radarSweep 4s linear infinite',
        }}
      />
      {/* Dot blips */}
      <div className="absolute top-[30%] left-[20%] w-2 h-2 rounded-full bg-primary/40 animate-pulse-glow" />
      <div className="absolute top-[45%] left-[75%] w-1.5 h-1.5 rounded-full bg-primary/30 animate-pulse-glow" style={{ animationDelay: '1s' }} />
      <div className="absolute top-[65%] left-[40%] w-2 h-2 rounded-full bg-primary/35 animate-pulse-glow" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[25%] left-[60%] w-1.5 h-1.5 rounded-full bg-primary/25 animate-pulse-glow" style={{ animationDelay: '0.5s' }} />
      {/* Gradient overlay to fade edges */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />
    </div>
  );
}

function TimelineCard({
  movie,
  platform,
  isReminded,
  onToggleReminder,
  now,
  locale,
  isFirstInMonth,
}: {
  movie: EnrichedMovie;
  platform: Platform;
  isReminded: boolean;
  onToggleReminder: () => void;
  now: number;
  locale: 'id' | 'en';
  isFirstInMonth: boolean;
}) {
  const pc = platformConfig[platform];
  const Icon = pc.icon;
  const countdown = getCountdown(movie.release_date || '');
  const isReleased = countdown.totalMs <= 0;

  return (
    <div className="relative pl-8 md:pl-12 pb-8 animate-slide-up">
      {/* Timeline line */}
      <div className="absolute left-[11px] md:left-[19px] top-0 bottom-0 w-px bg-white/10" />

      {/* Timeline dot */}
      <div className={cn(
        'absolute left-[7px] md:left-[15px] top-2 w-[9px] h-[9px] rounded-full border-2',
        isReleased ? 'bg-green-500 border-green-400' : 'bg-primary border-primary/50'
      )} />

      {/* Month label */}
      {isFirstInMonth && (
        <div className="mb-3 -ml-1">
          <span className="text-xs font-bold uppercase tracking-widest text-primary px-3 py-1 rounded-full glass">
            <Calendar className="w-3 h-3 inline mr-1.5 -mt-0.5" />
            {getMonthLabel(getMonthKey(movie.release_date || ''), locale)}
          </span>
        </div>
      )}

      {/* Card */}
      <div className={cn(
        'relative rounded-2xl overflow-hidden',
        'glass hover-lift card-shine',
        isReleased && 'ring-1 ring-green-500/30'
      )}>
        <div className="flex flex-col sm:flex-row">
          {/* Poster */}
          <div className="sm:w-28 sm:flex-shrink-0">
            <div className="aspect-[2/3] sm:aspect-auto sm:h-full">
              <img
                src={getPosterUrl(movie.poster_path, 'w342')}
                alt={movie.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
            <div>
              {/* Platform badge */}
              <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium mb-2', pc.bg, pc.color)}>
                <Icon className="w-3 h-3" />
                {locale === 'id' ? pc.label_id : pc.label_en}
              </div>

              {/* Release date */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <Calendar className="w-3 h-3" />
                {movie.release_date
                  ? new Date(movie.release_date).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : ''}
              </div>

              {/* Title */}
              <h3 className="font-bold text-foreground text-base mb-1 line-clamp-2">
                {movie.title}
              </h3>

              {/* Rating */}
              {movie.vote_average > 0 && (
                <div className="flex items-center gap-1 text-xs text-yellow-400 mb-2">
                  <Star className="w-3 h-3 fill-yellow-400" />
                  <span className="font-medium">{movie.vote_average.toFixed(1)}</span>
                </div>
              )}

              {/* Overview */}
              {movie.overview && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {movie.overview}
                </p>
              )}
            </div>

            {/* Bottom row: countdown + remind me */}
            <div className="flex items-center justify-between gap-3 mt-2">
              {/* Countdown */}
              {isReleased ? (
                <span className="text-xs font-medium text-green-400 flex items-center gap-1">
                  {locale === 'id' ? 'Sudah Tayang!' : 'Now Available!'}
                </span>
              ) : (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono tabular-nums">
                    {countdown.days > 0 && (
                      <span className="text-foreground font-semibold">{countdown.days}<span className="text-muted-foreground ml-0.5">{locale === 'id' ? 'h' : 'd'}</span></span>
                    )}
                    {countdown.days > 0 && <span className="mx-1">:</span>}
                    <span className="text-foreground font-semibold">{String(countdown.hours).padStart(2, '0')}</span>
                    <span className="mx-1">:</span>
                    <span className="text-foreground font-semibold">{String(countdown.minutes).padStart(2, '0')}</span>
                  </span>
                </div>
              )}

              {/* Remind Me button */}
              <button
                onClick={onToggleReminder}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  isReminded
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10 hover:text-foreground'
                )}
              >
                {isReminded ? (
                  <>
                    <BellOff className="w-3.5 h-3.5" />
                    {locale === 'id' ? 'Reminder Aktif' : 'Reminder On'}
                  </>
                ) : (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    {t('set_reminder_btn') === 'set_reminder_btn' ? (locale === 'id' ? 'Ingatkan Saya' : 'Remind Me') : t('set_reminder_btn')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function t(key: string): string {
  return key;
}

export default function ComingSoonPage() {
  const { t: translate, locale, region } = useI18n();
  const [movies, setMovies] = useState<EnrichedMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setReminders(getReminders());
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const lang = locale === 'id' ? 'id' : 'en';
        const data = await fetchUpcoming(lang, region);
        const results: Movie[] = data.results || [];
        const upcoming = results
          .filter((m) => m.release_date && new Date(m.release_date).getTime() >= Date.now() - 86400000)
          .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))
          .map((m, i) => ({
            ...m,
            platform: assignPlatform(i),
          }));
        setMovies(upcoming);
      } catch (err) {
        console.error('Failed to load upcoming:', err);
      }
      setLoading(false);
    }
    load();
  }, [locale, region]);

  const handleToggleReminder = useCallback((movieId: number) => {
    const isNowReminded = toggleReminder(movieId);
    setReminders(getReminders());
  }, []);

  // Group by month
  const groupedMovies: Record<string, EnrichedMovie[]> = {};
  movies.forEach((movie) => {
    const key = getMonthKey(movie.release_date || '');
    if (!groupedMovies[key]) groupedMovies[key] = [];
    groupedMovies[key].push(movie);
  });

  const sortedMonths = Object.keys(groupedMovies).sort();

  // Track which movie ids are first in their month
  const firstInMonthIds = new Set<string>();
  sortedMonths.forEach((monthKey) => {
    if (groupedMovies[monthKey].length > 0) {
      firstInMonthIds.add(`${monthKey}-${groupedMovies[monthKey][0].id}`);
    }
  });

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Radar background animation */}
      <div className="fixed inset-0 opacity-30 pointer-events-none">
        <RadarAnimation />
      </div>

      <div className="relative z-10 px-4 lg:px-6 py-6 lg:py-8">
        {/* Header */}
        <div className="animate-fade-in mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse-glow">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
                {translate('coming_soon_radar')}
              </h1>
              <p className="text-muted-foreground text-sm">
                {locale === 'id'
                  ? 'Film yang akan segera hadir di platformmu'
                  : 'Movies coming soon to your platforms'}
              </p>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '1.5s' }} />
                <div className="absolute inset-2 rounded-full border-2 border-primary/50 animate-ping" style={{ animationDuration: '1s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
                </div>
              </div>
              <span className="text-muted-foreground text-sm">
                {locale === 'id' ? 'Memindai radar...' : 'Scanning radar...'}
              </span>
            </div>
          </div>
        )}

        {/* Timeline */}
        {!loading && movies.length > 0 && (
          <div className="max-w-2xl mx-auto">
            {sortedMonths.map((monthKey) => {
              const monthMovies = groupedMovies[monthKey];
              return monthMovies.map((movie, idx) => (
                <TimelineCard
                  key={movie.id}
                  movie={movie}
                  platform={movie.platform}
                  isReminded={reminders.includes(movie.id)}
                  onToggleReminder={() => handleToggleReminder(movie.id)}
                  now={now}
                  locale={locale}
                  isFirstInMonth={idx === 0}
                />
              ));
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && movies.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {locale === 'id' ? 'Belum Ada Film Segera Hadir' : 'No Coming Soon Movies'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {locale === 'id'
                ? 'Radar sedang memindai, coba lagi nanti!'
                : 'The radar is scanning, check back later!'}
            </p>
          </div>
        )}
      </div>

      {/* Radar sweep keyframe */}
      <style jsx>{`
        @keyframes radarSweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
