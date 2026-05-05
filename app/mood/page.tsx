'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/use-locale';
import { fetchMoodMovies, getPosterUrl } from '@/lib/tmdb';
import { MovieCard } from '@/components/movie-card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Laugh, Flashlight, Droplets, TreePalm as Palmtree, Brain, Weight, ArrowLeft, RefreshCw, CircleAlert as AlertCircle } from 'lucide-react';

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

type MoodKey = 'ketawa' | 'tegang' | 'nangis' | 'santai' | 'mikir' | 'berat';

interface MoodOption {
  key: MoodKey;
  icon: React.ElementType;
  colors: string;
  bgGlow: string;
  emoji: string;
}

const moods: MoodOption[] = [
  {
    key: 'ketawa',
    icon: Laugh,
    colors: 'from-yellow-400 to-amber-500',
    bgGlow: 'bg-yellow-500/20',
    emoji: '😂',
  },
  {
    key: 'tegang',
    icon: Flashlight,
    colors: 'from-red-500 to-rose-600',
    bgGlow: 'bg-red-500/20',
    emoji: '😰',
  },
  {
    key: 'nangis',
    icon: Droplets,
    colors: 'from-blue-400 to-indigo-500',
    bgGlow: 'bg-blue-500/20',
    emoji: '😢',
  },
  {
    key: 'santai',
    icon: Palmtree,
    colors: 'from-green-400 to-emerald-500',
    bgGlow: 'bg-green-500/20',
    emoji: '😎',
  },
  {
    key: 'mikir',
    icon: Brain,
    colors: 'from-cyan-400 to-teal-500',
    bgGlow: 'bg-cyan-500/20',
    emoji: '🤔',
  },
  {
    key: 'berat',
    icon: Weight,
    colors: 'from-gray-400 to-slate-500',
    bgGlow: 'bg-gray-500/20',
    emoji: '🎭',
  },
];

function MovieGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 px-4 lg:px-6">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default function MoodPage() {
  const { t, locale, region } = useI18n();
  const [selectedMood, setSelectedMood] = useState<MoodKey | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMovies = useCallback(
    async (mood: MoodKey) => {
      setLoading(true);
      setError(null);
      setSelectedMood(mood);
      try {
        const lang = locale === 'id' ? 'id' : 'en';
        const res = await fetchMoodMovies(mood, lang, region);
        setMovies(res.results || []);
      } catch (err) {
        console.error(err);
        setError('Failed to load movies. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [locale, region]
  );

  const handleMoodClick = (mood: MoodKey) => {
    loadMovies(mood);
  };

  const handleBack = () => {
    setSelectedMood(null);
    setMovies([]);
    setError(null);
  };

  const handleRetry = () => {
    if (selectedMood) {
      loadMovies(selectedMood);
    }
  };

  const selectedMoodData = moods.find((m) => m.key === selectedMood);

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="sticky top-0 z-30 glass-strong">
        <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
          {selectedMood && (
            <button
              onClick={handleBack}
              className="flex items-center justify-center w-9 h-9 rounded-xl glass hover:bg-white/10 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">
              {selectedMood
                ? `${selectedMoodData?.emoji} ${t(`mood_${selectedMood}` as `mood_${MoodKey}`)}`
                : t('mood_label')}
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-0 lg:px-2">
        {!selectedMood ? (
          /* Mood Selection */
          <div className="animate-fade-in px-4 lg:px-6 pt-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl lg:text-4xl font-bold text-gradient mb-3">
                {t('mood_label')}
              </h2>
              <p className="text-muted-foreground text-sm lg:text-base max-w-md mx-auto">
                {locale === 'id'
                  ? 'Pilih mood kamu, kami cariin film yang pas!'
                  : 'Pick your mood, we\'ll find the perfect movie!'}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
              {moods.map((mood, idx) => (
                <button
                  key={mood.key}
                  onClick={() => handleMoodClick(mood.key)}
                  className={cn(
                    'group relative flex flex-col items-center gap-3 p-6 rounded-2xl glass hover-lift card-shine transition-all duration-300 overflow-hidden animate-slide-up'
                  )}
                  style={{ animationDelay: `${idx * 80}ms`, animationFillMode: 'both' }}
                >
                  {/* Glow Background */}
                  <div
                    className={cn(
                      'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500',
                      mood.bgGlow
                    )}
                  />
                  {/* Gradient Ring */}
                  <div
                    className={cn(
                      'relative w-16 h-16 lg:w-20 lg:h-20 rounded-2xl bg-gradient-to-br flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg',
                      mood.colors
                    )}
                  >
                    <mood.icon className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
                  </div>
                  {/* Label */}
                  <span className="relative text-sm lg:text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                    {t(`mood_${mood.key}` as `mood_${MoodKey}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Movie Results */
          <div className="pt-4 animate-fade-in">
            {/* Active Mood Banner */}
            <div className="px-4 lg:px-6 mb-6">
              <div
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r text-white font-medium text-sm',
                  selectedMoodData?.colors
                )}
              >
                <span>{selectedMoodData?.emoji}</span>
                <span>{t(`mood_${selectedMood}` as `mood_${MoodKey}`)}</span>
              </div>
            </div>

            {/* Loading */}
            {loading && <MovieGridSkeleton />}

            {/* Error */}
            {error && !loading && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <p className="text-muted-foreground text-sm mb-4 text-center">{error}</p>
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="w-4 h-4" />
                  {locale === 'id' ? 'Coba Lagi' : 'Try Again'}
                </button>
              </div>
            )}

            {/* Empty */}
            {!loading && !error && movies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="text-5xl mb-4">🎬</div>
                <p className="text-muted-foreground text-sm text-center">
                  {locale === 'id'
                    ? 'Belum ada film untuk mood ini. Coba mood lain!'
                    : 'No movies for this mood yet. Try another mood!'}
                </p>
                <button
                  onClick={handleBack}
                  className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl glass text-foreground font-medium text-sm hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {locale === 'id' ? 'Pilih Mood Lain' : 'Pick Another Mood'}
                </button>
              </div>
            )}

            {/* Movie Grid */}
            {!loading && !error && movies.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 px-4 lg:px-6">
                {movies.map((movie, idx) => (
                  <div
                    key={movie.id}
                    className="animate-slide-up"
                    style={{
                      animationDelay: `${idx * 50}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    <MovieCard movie={movie} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
