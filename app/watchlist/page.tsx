'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/hooks/use-locale';
import { getPosterUrl } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { Star, BookmarkPlus, Eye, Play, Trash2, Bell, BellRing, Film } from 'lucide-react';
import Link from 'next/link';

type WatchStatus = 'want_to_watch' | 'watching' | 'watched';

interface WatchlistMovie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  status: WatchStatus;
  remindWhenAvailable: boolean;
  addedAt: number;
}

const STORAGE_KEY = 'movyoo-watchlist';

const statusTabs: { key: WatchStatus; icon: typeof BookmarkPlus }[] = [
  { key: 'want_to_watch', icon: BookmarkPlus },
  { key: 'watching', icon: Play },
  { key: 'watched', icon: Eye },
];

function loadWatchlist(): WatchlistMovie[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(movies: WatchlistMovie[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
}

export default function WatchlistPage() {
  const { t, locale } = useI18n();
  const [movies, setMovies] = useState<WatchlistMovie[]>([]);
  const [activeTab, setActiveTab] = useState<WatchStatus>('want_to_watch');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMovies(loadWatchlist());
    setMounted(true);
  }, []);

  const persist = useCallback((updated: WatchlistMovie[]) => {
    setMovies(updated);
    saveWatchlist(updated);
  }, []);

  const changeStatus = useCallback((movieId: number, newStatus: WatchStatus) => {
    const updated = movies.map((m) =>
      m.id === movieId ? { ...m, status: newStatus } : m
    );
    persist(updated);
  }, [movies, persist]);

  const removeMovie = useCallback((movieId: number) => {
    const updated = movies.filter((m) => m.id !== movieId);
    persist(updated);
  }, [movies, persist]);

  const toggleReminder = useCallback((movieId: number) => {
    const updated = movies.map((m) =>
      m.id === movieId ? { ...m, remindWhenAvailable: !m.remindWhenAvailable } : m
    );
    persist(updated);
  }, [movies, persist]);

  const filteredMovies = movies
    .filter((m) => m.status === activeTab)
    .sort((a, b) => b.addedAt - a.addedAt);

  const tabCounts = {
    want_to_watch: movies.filter((m) => m.status === 'want_to_watch').length,
    watching: movies.filter((m) => m.status === 'watching').length,
    watched: movies.filter((m) => m.status === 'watched').length,
  };

  const getTabLabel = (key: WatchStatus): string => {
    switch (key) {
      case 'want_to_watch': return t('want_to_watch');
      case 'watching': return t('watching');
      case 'watched': return t('watched');
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-muted-foreground text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-6 pb-24">
      {/* Header */}
      <div className="px-4 lg:px-6 mb-6 animate-fade-in">
        <h1 className="text-2xl lg:text-3xl font-bold text-gradient">{t('nav_watchlist')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {locale === 'id' ? 'Kelola film yang ingin kamu tonton' : 'Manage movies you want to watch'}
        </p>
      </div>

      {/* Tabs */}
      <div className="px-4 lg:px-6 mb-6 animate-slide-up">
        <div className="flex gap-2 p-1 rounded-xl glass">
          {statusTabs.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'relative flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200',
                activeTab === key
                  ? 'gradient-primary text-white shadow-lg shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{getTabLabel(key)}</span>
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold',
                  activeTab === key
                    ? 'bg-white/25 text-white'
                    : 'bg-white/10 text-muted-foreground'
                )}
              >
                {tabCounts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Movie Grid */}
      <div className="px-4 lg:px-6">
        {filteredMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="w-20 h-20 rounded-2xl glass-strong flex items-center justify-center mb-4">
              <Film className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {activeTab === 'want_to_watch'
                ? (locale === 'id' ? 'Belum ada film yang mau ditonton' : 'No movies in your watchlist yet')
                : activeTab === 'watching'
                  ? (locale === 'id' ? 'Belum ada film yang sedang ditonton' : 'No movies being watched')
                  : (locale === 'id' ? 'Belum ada film yang sudah ditonton' : 'No watched movies yet')}
            </h3>
            <p className="text-muted-foreground text-sm text-center max-w-xs">
              {locale === 'id'
                ? 'Tambahkan film dari halaman Jelajahi untuk memulai'
                : 'Add movies from the Explore page to get started'}
            </p>
            <Link
              href="/explore"
              className="mt-6 px-6 py-2.5 rounded-xl gradient-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
            >
              {t('nav_explore')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in">
            {filteredMovies.map((movie) => (
              <WatchlistCard
                key={movie.id}
                movie={movie}
                currentTab={activeTab}
                onChangeStatus={changeStatus}
                onRemove={removeMovie}
                onToggleReminder={toggleReminder}
                locale={locale}
                t={t as any}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface WatchlistCardProps {
  movie: WatchlistMovie;
  currentTab: WatchStatus;
  onChangeStatus: (id: number, status: WatchStatus) => void;
  onRemove: (id: number) => void;
  onToggleReminder: (id: number) => void;
  locale: string;
  t: (key: string) => string;
}

function WatchlistCard({
  movie,
  currentTab,
  onChangeStatus,
  onRemove,
  onToggleReminder,
  locale,
  t: tProp,
}: WatchlistCardProps) {
  const t = tProp as any;
  const [menuOpen, setMenuOpen] = useState(false);

  const otherStatuses = statusTabs
    .map((s) => s.key)
    .filter((k) => k !== currentTab);

  return (
    <div className="group relative animate-slide-up">
      <Link href={`/movie/${movie.id}`} className="block">
        <div className="relative rounded-xl overflow-hidden hover-lift card-shine">
          <div className="aspect-[2/3] relative">
            <img
              src={getPosterUrl(movie.poster_path)}
              alt={movie.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Rating badge */}
          {movie.vote_average > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-xs">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span className="text-white font-medium">{movie.vote_average.toFixed(1)}</span>
            </div>
          )}

          {/* Reminder indicator */}
          {movie.remindWhenAvailable && (
            <div className="absolute top-2 left-2 p-1 rounded-md bg-primary/80 backdrop-blur-sm">
              <BellRing className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>

        {/* Title info below poster */}
        <div className="mt-2 px-0.5">
          <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
            {movie.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {movie.release_date && (
              <p className="text-xs text-muted-foreground">{movie.release_date.slice(0, 4)}</p>
            )}
          </div>
        </div>
      </Link>

      {/* Action buttons below card */}
      <div className="mt-2 flex gap-1.5">
        {otherStatuses.map((status) => {
          const tab = statusTabs.find((s) => s.key === status)!;
          const TabIcon = tab.icon;
          const label =
            status === 'want_to_watch' ? t('want_to_watch') :
            status === 'watching' ? t('watching') :
            t('watched');

          return (
            <button
              key={status}
              onClick={(e) => {
                e.preventDefault();
                onChangeStatus(movie.id, status);
              }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg glass text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title={String(label)}
            >
              <TabIcon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline truncate">{label}</span>
            </button>
          );
        })}

        {/* Reminder toggle */}
        <button
          onClick={(e) => {
            e.preventDefault();
            onToggleReminder(movie.id);
          }}
          className={cn(
            'flex items-center justify-center p-1.5 rounded-lg text-xs transition-colors',
            movie.remindWhenAvailable
              ? 'text-primary bg-primary/10 hover:bg-primary/20'
              : 'text-muted-foreground glass hover:text-primary hover:bg-primary/10'
          )}
          title={movie.remindWhenAvailable ? String(locale === 'id' ? 'Matikan Reminder' : 'Disable Reminder') : String(t('set_reminder'))}
        >
          {movie.remindWhenAvailable ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
        </button>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            onRemove(movie.id);
          }}
          className="flex items-center justify-center p-1.5 rounded-lg glass text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title={locale === 'id' ? 'Hapus dari Watchlist' : 'Remove from Watchlist'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
