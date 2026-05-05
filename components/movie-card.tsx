'use client';

import Link from 'next/link';
import { getPosterUrl, getBackdropUrl } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { Star, TriangleAlert as AlertTriangle } from 'lucide-react';

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

interface MovieCardProps {
  movie: Movie;
  variant?: 'poster' | 'backdrop' | 'compact';
  showRating?: boolean;
  showLeaving?: boolean;
  leavingDays?: number;
  className?: string;
}

export function MovieCard({
  movie,
  variant = 'poster',
  showRating = true,
  showLeaving = false,
  leavingDays,
  className,
}: MovieCardProps) {
  if (variant === 'backdrop') {
    return (
      <Link href={`/movie/${movie.id}`} className={cn('block group', className)}>
        <div className="relative rounded-xl overflow-hidden hover-lift card-shine">
          <div className="aspect-video relative">
            <img
              src={getBackdropUrl(movie.backdrop_path)}
              alt={movie.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="font-semibold text-white text-sm line-clamp-2">{movie.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                {showRating && (
                  <span className="flex items-center gap-1 text-xs text-yellow-400">
                    <Star className="w-3 h-3 fill-yellow-400" />
                    {movie.vote_average?.toFixed(1)}
                  </span>
                )}
                {movie.release_date && (
                  <span className="text-xs text-white/60">{movie.release_date?.slice(0, 4)}</span>
                )}
              </div>
            </div>
          </div>
          {showLeaving && leavingDays !== undefined && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/90 text-white text-xs font-medium animate-pulse-glow">
              <AlertTriangle className="w-3 h-3" />
              {leavingDays}d
            </div>
          )}
        </div>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link href={`/movie/${movie.id}`} className={cn('flex gap-3 group', className)}>
        <div className="w-16 h-24 rounded-lg overflow-hidden flex-shrink-0">
          <img
            src={getPosterUrl(movie.poster_path, 'w185')}
            alt={movie.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 py-1">
          <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
            {movie.title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {showRating && (
              <span className="flex items-center gap-1 text-xs text-yellow-400">
                <Star className="w-3 h-3 fill-yellow-400" />
                {movie.vote_average?.toFixed(1)}
              </span>
            )}
            {movie.release_date && (
              <span className="text-xs text-muted-foreground">{movie.release_date?.slice(0, 4)}</span>
            )}
          </div>
          {movie.overview && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{movie.overview}</p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/movie/${movie.id}`} className={cn('block group', className)}>
      <div className="relative rounded-xl overflow-hidden hover-lift card-shine">
        <div className="aspect-[2/3] relative">
          <img
            src={getPosterUrl(movie.poster_path)}
            alt={movie.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <h3 className="font-semibold text-white text-sm line-clamp-2">{movie.title}</h3>
          </div>
        </div>
        {showRating && movie.vote_average > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-xs">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-white font-medium">{movie.vote_average?.toFixed(1)}</span>
          </div>
        )}
        {showLeaving && leavingDays !== undefined && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/90 text-white text-xs font-medium animate-pulse-glow">
            <AlertTriangle className="w-3 h-3" />
            {leavingDays}d
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
          {movie.title}
        </h3>
        {movie.release_date && (
          <p className="text-xs text-muted-foreground mt-0.5">{movie.release_date?.slice(0, 4)}</p>
        )}
      </div>
    </Link>
  );
}

interface MovieRowProps {
  title: string;
  movies: Movie[];
  variant?: 'poster' | 'backdrop';
  showLeaving?: boolean;
  leavingData?: Record<number, number>;
}

export function MovieRow({ title, movies, variant = 'poster', showLeaving = false, leavingData }: MovieRowProps) {
  if (!movies.length) return null;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-foreground mb-3 px-4 lg:px-6">{title}</h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-2">
        {movies.map((movie) => (
          <div key={movie.id} className={cn(variant === 'poster' ? 'w-[140px] lg:w-[160px]' : 'w-[280px] lg:w-[320px]', 'flex-shrink-0')}>
            <MovieCard
              movie={movie}
              variant={variant}
              showLeaving={showLeaving}
              leavingDays={leavingData?.[movie.id]}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
