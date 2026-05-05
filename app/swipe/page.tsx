'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from '@/hooks/use-locale';
import { fetchTrending, fetchPopular, getPosterUrl, getBackdropUrl } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { X, Heart, Star, RotateCcw, Sparkles, ArrowLeft, Loader as Loader2 } from 'lucide-react';

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

const MAX_SWIPES = 15;
const SWIPE_THRESHOLD = 100;
const STORAGE_KEY = 'movyoo-liked-movies';

type SwipeDirection = 'left' | 'right' | null;

export default function SwipePage() {
  const { t, locale, region } = useI18n();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked, setLiked] = useState<Movie[]>([]);
  const [skipped, setSkipped] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const totalSwipes = liked.length + skipped.length;
  const currentMovie = movies[currentIndex];
  const progressPercent = Math.min((totalSwipes / MAX_SWIPES) * 100, 100);

  // Load liked movies from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          JSON.parse(stored);
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch movies
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const lang = locale === 'id' ? 'id' : 'en';
        const [trendRes, popRes] = await Promise.allSettled([
          fetchTrending('week', lang, region),
          fetchPopular(lang, region),
        ]);

        const trendMovies: Movie[] =
          trendRes.status === 'fulfilled' ? trendRes.value.results || [] : [];
        const popMovies: Movie[] =
          popRes.status === 'fulfilled' ? popRes.value.results || [] : [];

        // Merge and deduplicate, limit to 20
        const seen = new Set<number>();
        const combined: Movie[] = [];
        for (const m of [...trendMovies, ...popMovies]) {
          if (!seen.has(m.id) && combined.length < 20) {
            seen.add(m.id);
            combined.push(m);
          }
        }

        if (combined.length === 0) {
          setError(locale === 'id' ? 'Gagal memuat film' : 'Failed to load movies');
        } else {
          setMovies(combined);
        }
      } catch (err) {
        console.error(err);
        setError(locale === 'id' ? 'Gagal memuat film' : 'Failed to load movies');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [locale, region]);

  const saveLikedToStorage = useCallback((likedMovies: Movie[]) => {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      const existingMovies: Movie[] = existing ? JSON.parse(existing) : [];
      const seen = new Set<number>(existingMovies.map((m: Movie) => m.id));
      const merged = [...existingMovies];
      for (const m of likedMovies) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          merged.push(m);
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged.slice(-50)));
    } catch {
      // ignore
    }
  }, []);

  const processSwipe = useCallback(
    (direction: 'left' | 'right') => {
      if (isAnimating || !currentMovie) return;
      setIsAnimating(true);
      setSwipeDirection(direction);

      const movie = currentMovie;
      setTimeout(() => {
        if (direction === 'right') {
          setLiked((prev) => {
            const updated = [...prev, movie];
            saveLikedToStorage(updated);
            return updated;
          });
        } else {
          setSkipped((prev) => [...prev, movie]);
        }

        const newTotal = liked.length + skipped.length + 1;
        if (newTotal >= MAX_SWIPES || currentIndex + 1 >= movies.length) {
          setShowResults(true);
        } else {
          setCurrentIndex((prev) => prev + 1);
        }

        setSwipeDirection(null);
        setIsAnimating(false);
      }, 300);
    },
    [currentMovie, isAnimating, liked.length, skipped.length, currentIndex, movies.length, saveLikedToStorage]
  );

  const handleSkip = () => processSwipe('left');
  const handleLike = () => processSwipe('right');

  const handleRestart = () => {
    setCurrentIndex(0);
    setLiked([]);
    setSkipped([]);
    setShowResults(false);
    setSwipeDirection(null);
    setIsAnimating(false);
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    const touch = e.touches[0];
    startPos.current = { x: touch.clientX, y: touch.clientY };
    currentPos.current = { x: touch.clientX, y: touch.clientY };
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || isAnimating) return;
    const touch = e.touches[0];
    currentPos.current = { x: touch.clientX, y: touch.clientY };
    const deltaX = currentPos.current.x - startPos.current.x;

    if (cardRef.current) {
      const rotation = deltaX * 0.1;
      cardRef.current.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;
      cardRef.current.style.transition = 'none';
    }

    if (deltaX > SWIPE_THRESHOLD * 0.5) {
      setSwipeDirection('right');
    } else if (deltaX < -SWIPE_THRESHOLD * 0.5) {
      setSwipeDirection('left');
    } else {
      setSwipeDirection(null);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current || isAnimating) return;
    isDragging.current = false;

    const deltaX = currentPos.current.x - startPos.current.x;

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      processSwipe(deltaX > 0 ? 'right' : 'left');
    } else {
      // Snap back
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.3s ease';
        cardRef.current.style.transform = 'translateX(0) rotate(0deg)';
      }
      setSwipeDirection(null);
    }
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isAnimating) return;
    e.preventDefault();
    startPos.current = { x: e.clientX, y: e.clientY };
    currentPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = true;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || isAnimating) return;
      currentPos.current = { x: e.clientX, y: e.clientY };
      const deltaX = currentPos.current.x - startPos.current.x;

      if (cardRef.current) {
        const rotation = deltaX * 0.1;
        cardRef.current.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;
        cardRef.current.style.transition = 'none';
      }

      if (deltaX > SWIPE_THRESHOLD * 0.5) {
        setSwipeDirection('right');
      } else if (deltaX < -SWIPE_THRESHOLD * 0.5) {
        setSwipeDirection('left');
      } else {
        setSwipeDirection(null);
      }
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;

      const deltaX = currentPos.current.x - startPos.current.x;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        processSwipe(deltaX > 0 ? 'right' : 'left');
      } else {
        if (cardRef.current) {
          cardRef.current.style.transition = 'transform 0.3s ease';
          cardRef.current.style.transform = 'translateX(0) rotate(0deg)';
        }
        setSwipeDirection(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isAnimating, processSwipe]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground text-sm">
          {locale === 'id' ? 'Memuat film...' : 'Loading movies...'}
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-muted-foreground text-sm mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium"
        >
          {locale === 'id' ? 'Coba Lagi' : 'Try Again'}
        </button>
      </div>
    );
  }

  // Results screen
  if (showResults) {
    const topPicks = liked.slice(0, 3);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 animate-fade-in">
        {/* Sparkle decoration */}
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 animate-bounce-in">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>

        <h2 className="text-2xl lg:text-3xl font-bold text-gradient mb-2 text-center">
          {t('tonights_pick')}
        </h2>

        <p className="text-muted-foreground text-sm mb-8 text-center">
          {locale === 'id'
            ? `${liked.length} film dipilih dari ${totalSwipes} swipe`
            : `${liked.length} movies picked from ${totalSwipes} swipes`}
        </p>

        {topPicks.length > 0 ? (
          <div className="w-full max-w-lg space-y-4 mb-8">
            {topPicks.map((movie, idx) => (
              <Link
                key={movie.id}
                href={`/movie/${movie.id}`}
                className="flex items-center gap-4 p-3 rounded-2xl glass hover-lift animate-slide-up group"
                style={{
                  animationDelay: `${idx * 120}ms`,
                  animationFillMode: 'both',
                }}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-lg absolute -left-2 -top-2 z-10 shadow-lg">
                    {idx + 1}
                  </div>
                  <div className="w-20 h-28 rounded-xl overflow-hidden ml-4">
                    <img
                      src={getPosterUrl(movie.poster_path, 'w185')}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors truncate">
                    {movie.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {movie.vote_average > 0 && (
                      <span className="flex items-center gap-1 text-xs text-yellow-400">
                        <Star className="w-3 h-3 fill-yellow-400" />
                        {movie.vote_average.toFixed(1)}
                      </span>
                    )}
                    {movie.release_date && (
                      <span className="text-xs text-muted-foreground">
                        {movie.release_date.slice(0, 4)}
                      </span>
                    )}
                  </div>
                </div>
                <Heart className="w-5 h-5 text-red-400 fill-red-400 flex-shrink-0" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center mb-8">
            <p className="text-muted-foreground text-sm">
              {locale === 'id'
                ? 'Kamu belum menyukai film apapun. Coba lagi!'
                : 'You didn\'t like any movies. Try again!'}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleRestart}
            className="flex items-center gap-2 px-6 py-3 rounded-xl glass text-foreground font-medium text-sm hover:bg-white/10 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {locale === 'id' ? 'Putar Ulang' : 'Start Over'}
          </button>
          {topPicks.length > 0 && (
            <Link
              href={`/movie/${topPicks[0].id}`}
              className="flex items-center gap-2 px-6 py-3 rounded-xl gradient-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
            >
              {locale === 'id' ? 'Nonton Ini!' : 'Watch This!'}
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Main swipe UI
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar with progress */}
      <div className="sticky top-0 z-30 glass-strong">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/"
              className="flex items-center justify-center w-9 h-9 rounded-xl glass hover:bg-white/10 transition-colors"
              aria-label="Home"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Link>
            <div className="flex-1">
              <h1 className="text-sm font-bold text-foreground">
                {t('nav_swipe')}
              </h1>
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {totalSwipes}/{MAX_SWIPES}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full gradient-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-4 py-6 relative">
        {currentMovie ? (
          <div className="relative w-full max-w-sm">
            {/* Next card hint (behind) */}
            {movies[currentIndex + 1] && (
              <div className="absolute inset-2 rounded-3xl glass opacity-40 scale-[0.95]" />
            )}

            {/* Current card */}
            <div
              ref={cardRef}
              className="relative rounded-3xl overflow-hidden glass-strong cursor-grab active:cursor-grabbing select-none touch-none"
              style={{
                transform: 'translateX(0) rotate(0deg)',
                willChange: 'transform',
              }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Poster Image */}
              <div className="relative aspect-[2/3]">
                <img
                  src={getPosterUrl(currentMovie.poster_path, 'w780')}
                  alt={currentMovie.title}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                {/* Bottom gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                {/* LIKE stamp */}
                <div
                  className={cn(
                    'absolute top-8 left-6 px-4 py-2 rounded-xl border-4 border-green-500 text-green-500 font-black text-2xl rotate-[-20deg] transition-opacity duration-200',
                    swipeDirection === 'right' ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  {t('swipe_right').toUpperCase()}
                </div>

                {/* NOPE stamp */}
                <div
                  className={cn(
                    'absolute top-8 right-6 px-4 py-2 rounded-xl border-4 border-red-500 text-red-500 font-black text-2xl rotate-[20deg] transition-opacity duration-200',
                    swipeDirection === 'left' ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  {t('swipe_left').toUpperCase()}
                </div>

                {/* Movie info overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <h2 className="text-xl lg:text-2xl font-bold text-white leading-tight mb-2">
                    {currentMovie.title}
                  </h2>

                  <div className="flex items-center gap-3 mb-2">
                    {currentMovie.vote_average > 0 && (
                      <span className="flex items-center gap-1 text-sm text-yellow-400 font-medium">
                        <Star className="w-4 h-4 fill-yellow-400" />
                        {currentMovie.vote_average.toFixed(1)}
                      </span>
                    )}
                    {currentMovie.release_date && (
                      <span className="text-sm text-white/60">
                        {currentMovie.release_date.slice(0, 4)}
                      </span>
                    )}
                  </div>

                  {currentMovie.overview && (
                    <p className="text-xs text-white/70 line-clamp-3 leading-relaxed">
                      {currentMovie.overview}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-muted-foreground text-sm">
              {locale === 'id' ? 'Tidak ada film lagi' : 'No more movies'}
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {currentMovie && (
        <div className="sticky bottom-0 z-30 pb-6 pt-2 px-4">
          <div className="flex items-center justify-center gap-8">
            {/* Skip button */}
            <button
              onClick={handleSkip}
              disabled={isAnimating}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200',
                'bg-red-500/10 border-2 border-red-500/40 text-red-500',
                'hover:bg-red-500 hover:text-white hover:border-red-500 hover:scale-110',
                'active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
                'shadow-lg shadow-red-500/10'
              )}
              aria-label={t('swipe_left')}
            >
              <X className="w-7 h-7" />
            </button>

            {/* Like button */}
            <button
              onClick={handleLike}
              disabled={isAnimating}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200',
                'bg-green-500/10 border-2 border-green-500/40 text-green-500',
                'hover:bg-green-500 hover:text-white hover:border-green-500 hover:scale-110',
                'active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
                'shadow-lg shadow-green-500/10'
              )}
              aria-label={t('swipe_right')}
            >
              <Heart className="w-7 h-7" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
