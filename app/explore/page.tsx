'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/use-locale';
import {
  fetchTrendingByPlatform,
  fetchPopular,
  fetchTopRated,
  fetchNowPlaying,
  fetchUpcoming,
  fetchGenres,
  fetchFromEdge,
} from '@/lib/tmdb';
import { MovieCard } from '@/components/movie-card';
import { SectionHeader } from '@/components/section-header';
import { cn } from '@/lib/utils';
import { TranslationKey } from '@/lib/i18n';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';

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

interface Genre {
  id: number;
  name: string;
}

type SortOption = 'popular' | 'top_rated' | 'now_playing' | 'coming_soon';

const platforms = [
  { key: 'all', labelId: 'nav_explore' as TranslationKey },
  { key: 'indonesian', labelId: 'indonesian' as TranslationKey },
  { key: 'korean', labelId: 'korean' as TranslationKey },
  { key: 'netflix', labelId: 'trending_netflix' as TranslationKey },
  { key: 'disney+', labelId: 'trending_disney' as TranslationKey },
  { key: 'prime', labelId: 'trending_prime' as TranslationKey },
  { key: 'hbo-max', labelId: 'trending_hbo' as TranslationKey },
  { key: 'catchplay', labelId: 'trending_catchplay' as TranslationKey },
  { key: 'bioskop', labelId: 'trending_bioskop' as TranslationKey },
];

const sortOptions: { key: SortOption; labelId: 'popular' | 'top_rated' | 'now_playing' | 'coming_soon' }[] = [
  { key: 'popular', labelId: 'popular' },
  { key: 'top_rated', labelId: 'top_rated' },
  { key: 'now_playing', labelId: 'now_playing' },
  { key: 'coming_soon', labelId: 'coming_soon' },
];

const PLATFORM_SHORT_LABELS: Record<string, Record<string, string>> = {
  all: { id: 'Semua', en: 'All' },
  indonesian: { id: 'Indonesia', en: 'Indonesian' },
  korean: { id: 'Korea', en: 'Korean' },
  netflix: { id: 'Netflix', en: 'Netflix' },
  'disney+': { id: 'Disney+', en: 'Disney+' },
  prime: { id: 'Prime', en: 'Prime' },
  'hbo-max': { id: 'HBO Max', en: 'HBO Max' },
  catchplay: { id: 'Catchplay', en: 'Catchplay' },
  bioskop: { id: 'Bioskop', en: 'Cinema' },
};

function ExploreContent() {
  const { t, locale, region } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const platformParam = searchParams.get('platform');

  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [selectedSort, setSelectedSort] = useState<SortOption>('popular');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [redirectCinema, setRedirectCinema] = useState(false);

  useEffect(() => {
    if (platformParam) {
      const matched = platforms.find(
        (p) => p.key === platformParam || p.key === platformParam.toLowerCase()
      );
      if (matched) setSelectedPlatform(matched.key);
    }
  }, [platformParam]);

  useEffect(() => {
    if (selectedPlatform === 'bioskop') {
      router.push('/cinema');
    }
  }, [selectedPlatform, router]);

  useEffect(() => {
    async function loadGenres() {
      try {
        const lang = locale === 'id' ? 'id' : 'en';
        const res = await fetchGenres(lang);
        setGenres(res.genres || []);
      } catch (e) {
        console.error(e);
      }
    }
    loadGenres();
  }, [locale]);

  const fetchMovies = useCallback(
    async (currentPage: number, isLoadMore: boolean) => {
      const lang = locale === 'id' ? 'id' : 'en';

      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        let result: { results?: Movie[]; total_pages?: number };

        if (selectedPlatform === 'indonesian') {
          result = await fetchFromEdge('/discover', {
            language: lang,
            region,
            with_original_language: 'id',
            sort_by: 'popularity.desc',
          });
          const allResults = result.results || [];
          if (!isLoadMore) {
            setMovies(allResults);
          } else {
            setMovies((prev) => [...prev, ...allResults]);
          }
          setHasMore(false);
          return;
        }

        if (selectedPlatform === 'korean') {
          result = await fetchFromEdge('/discover', {
            language: lang,
            region,
            with_original_language: 'ko',
            sort_by: 'popularity.desc',
          });
          const allResults = result.results || [];
          if (!isLoadMore) {
            setMovies(allResults);
          } else {
            setMovies((prev) => [...prev, ...allResults]);
          }
          setHasMore(false);
          return;
        }

        if (selectedPlatform === 'hbo-max') {
          result = await fetchTrendingByPlatform('hbo', lang, region);
          const allResults = result.results || [];
          if (!isLoadMore) {
            setMovies(allResults);
          } else {
            setMovies((prev) => [...prev, ...allResults]);
          }
          setHasMore(false);
          return;
        }

        if (selectedPlatform === 'catchplay') {
          result = await fetchTrendingByPlatform('catchplay', lang, region);
          const allResults = result.results || [];
          if (!isLoadMore) {
            setMovies(allResults);
          } else {
            setMovies((prev) => [...prev, ...allResults]);
          }
          setHasMore(false);
          return;
        }

        if (selectedPlatform !== 'all') {
          result = await fetchTrendingByPlatform(selectedPlatform, lang, region);
          const allResults = result.results || [];
          if (!isLoadMore) {
            setMovies(allResults);
          } else {
            setMovies((prev) => [...prev, ...allResults]);
          }
          setHasMore(false);
          return;
        }

        switch (selectedSort) {
          case 'popular':
            result = await fetchPopular(lang, region);
            break;
          case 'top_rated':
            result = await fetchTopRated(lang, region);
            break;
          case 'now_playing':
            result = await fetchNowPlaying(lang, region);
            break;
          case 'coming_soon':
            result = await fetchUpcoming(lang, region);
            break;
          default:
            result = await fetchPopular(lang, region);
        }

        const newMovies = result.results || [];
        if (!isLoadMore) {
          setMovies(newMovies);
        } else {
          setMovies((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const filtered = newMovies.filter((m) => !existingIds.has(m.id));
            return [...prev, ...filtered];
          });
        }

        const totalPages = result.total_pages || 1;
        setHasMore(currentPage < totalPages);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedPlatform, selectedSort, locale, region]
  );

  useEffect(() => {
    setPage(1);
    fetchMovies(1, false);
  }, [fetchMovies]);

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMovies(nextPage, true);
  }, [page, fetchMovies]);

  const displayMovies = selectedGenre
    ? movies.filter((m) => m.genre_ids?.includes(selectedGenre))
    : movies;

  const currentSortLabel = t(sortOptions.find((s) => s.key === selectedSort)!.labelId);

  return (
    <div className="min-h-screen pt-6 pb-24">
      {/* Header */}
      <div className="px-4 lg:px-6 mb-6 animate-fade-in">
        <h1 className="text-2xl lg:text-3xl font-bold text-gradient">{t('nav_explore')}</h1>
      </div>

      {/* Platform Tabs */}
      <div className="px-4 lg:px-6 mb-5 animate-slide-up">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {platforms.map((platform) => {
            const label = PLATFORM_SHORT_LABELS[platform.key]?.[locale] || t(platform.labelId);

            return (
              <button
                key={platform.key}
                onClick={() => setSelectedPlatform(platform.key)}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  selectedPlatform === platform.key
                    ? 'gradient-primary text-white shadow-lg shadow-primary/20'
                    : 'glass text-muted-foreground hover:text-foreground hover:bg-white/10'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Genre Chips */}
      {genres.length > 0 && (
        <div className="px-4 lg:px-6 mb-5 animate-slide-up">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            <button
              onClick={() => setSelectedGenre(null)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                selectedGenre === null
                  ? 'gradient-primary text-white'
                  : 'glass text-muted-foreground hover:text-foreground hover:bg-white/10'
              )}
            >
              {locale === 'id' ? 'Semua Genre' : 'All Genres'}
            </button>
            {genres.map((genre) => (
              <button
                key={genre.id}
                onClick={() => setSelectedGenre(genre.id === selectedGenre ? null : genre.id)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                  genre.id === selectedGenre
                    ? 'gradient-primary text-white'
                    : 'glass text-muted-foreground hover:text-foreground hover:bg-white/10'
                )}
              >
                {genre.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sort Options */}
      <div className="px-4 lg:px-6 mb-5 animate-slide-up">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setSortMenuOpen(!sortMenuOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg glass text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              <span>{currentSortLabel}</span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-muted-foreground transition-transform duration-200',
                  sortMenuOpen && 'rotate-180'
                )}
              />
            </button>

            {sortMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSortMenuOpen(false)}
                />
                <div className="absolute top-full left-0 mt-2 z-20 min-w-[180px] rounded-xl glass-strong py-1 animate-fade-in">
                  {sortOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => {
                        setSelectedSort(option.key);
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-4 py-2.5 text-sm transition-colors',
                        selectedSort === option.key
                          ? 'text-primary bg-primary/10 font-medium'
                          : 'text-foreground hover:bg-white/5'
                      )}
                    >
                      {t(option.labelId)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {selectedGenre && (
            <span className="text-xs text-muted-foreground">
              {genres.find((g) => g.id === selectedGenre)?.name}
            </span>
          )}
        </div>
      </div>

      {/* Movie Grid */}
      <div className="px-4 lg:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="text-muted-foreground text-sm">Loading...</span>
            </div>
          </div>
        ) : displayMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="w-20 h-20 rounded-2xl glass-strong flex items-center justify-center mb-4">
              <SlidersHorizontal className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {t('no_results')}
            </h3>
            <p className="text-muted-foreground text-sm text-center max-w-xs">
              {locale === 'id'
                ? 'Coba ubah filter atau pilih platform lain'
                : 'Try changing your filters or selecting another platform'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in">
              {displayMovies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-8 mb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className={cn(
                    'flex items-center gap-2 px-8 py-3 rounded-xl font-medium text-sm transition-all',
                    loadingMore
                      ? 'glass text-muted-foreground cursor-wait'
                      : 'gradient-primary text-white hover:opacity-90 shadow-lg shadow-primary/20'
                  )}
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      {locale === 'id' ? 'Memuat...' : 'Loading...'}
                    </>
                  ) : (
                    t('load_more')
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        </div>
      }
    >
      <ExploreContent />
    </Suspense>
  );
}
