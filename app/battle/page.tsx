'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/use-locale';
import { fetchPopular, fetchTrending, getPosterUrl } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Swords,
  Trophy,
  Crown,
  Medal,
  RotateCcw,
  Star,
  Zap,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

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
  vote_count?: number;
}

interface BattleRound {
  movieA: Movie;
  movieB: Movie;
  winner: 'A' | 'B' | null;
}

interface BattleResult {
  movie: Movie;
  wins: number;
}

interface BattleHistory {
  date: string;
  results: { id: number; title: string; wins: number }[];
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getBattleHistory(): BattleHistory[] {
  try {
    const raw = localStorage.getItem('movyoo-battles');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveBattleHistory(results: BattleResult[]) {
  const history = getBattleHistory();
  history.push({
    date: getTodayStr(),
    results: results.map((r) => ({
      id: r.movie.id,
      title: r.movie.title,
      wins: r.wins,
    })),
  });
  // Keep last 50 entries
  if (history.length > 50) history.splice(0, history.length - 50);
  localStorage.setItem('movyoo-battles', JSON.stringify(history));
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function BattlePage() {
  const { t, locale, region } = useI18n();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [battles, setBattles] = useState<BattleRound[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'versus' | 'picked' | 'results'>('loading');
  const [results, setResults] = useState<BattleResult[]>([]);
  const [animatingVS, setAnimatingVS] = useState(false);
  const [pickedSide, setPickedSide] = useState<'A' | 'B' | null>(null);

  // Load movies
  useEffect(() => {
    async function load() {
      try {
        const lang = locale === 'id' ? 'id' : 'en';
        const [popularRes, trendingRes] = await Promise.all([
          fetchPopular(lang, region),
          fetchTrending('week', lang, region),
        ]);
        const all = [
          ...(popularRes.results || []),
          ...(trendingRes.results || []),
        ];
        const unique = Array.from(
          new Map(all.map((m: Movie) => [m.id, m])).values()
        );
        setMovies(unique);
        setPhase('ready');
      } catch (err) {
        console.error('Failed to load battle data', err);
        setPhase('ready');
      }
    }
    load();
  }, [locale, region]);

  const prepareBattles = useCallback(() => {
    if (movies.length < 10) return;
    const pool = shuffleArray(movies).slice(0, 10);
    const rounds: BattleRound[] = [];
    for (let i = 0; i < 5; i++) {
      rounds.push({
        movieA: pool[i * 2],
        movieB: pool[i * 2 + 1],
        winner: null,
      });
    }
    return rounds;
  }, [movies]);

  const startBattle = useCallback(() => {
    const rounds = prepareBattles();
    if (!rounds) return;
    setBattles(rounds);
    setCurrentRound(0);
    setResults([]);
    setPickedSide(null);
    setAnimatingVS(true);
    setPhase('versus');
    // VS animation duration
    setTimeout(() => {
      setAnimatingVS(false);
    }, 800);
  }, [prepareBattles]);

  const handlePick = useCallback(
    (side: 'A' | 'B') => {
      if (pickedSide) return;
      setPickedSide(side);

      const updated = [...battles];
      updated[currentRound] = { ...updated[currentRound], winner: side };
      setBattles(updated);

      // Brief pause to show the pick, then advance
      setTimeout(() => {
        if (currentRound < battles.length - 1) {
          // Next round with VS animation
          setCurrentRound((r) => r + 1);
          setPickedSide(null);
          setAnimatingVS(true);
          setPhase('versus');
          setTimeout(() => {
            setAnimatingVS(false);
          }, 800);
        } else {
          // All rounds complete - compute results
          const winMap = new Map<number, BattleResult>();
          for (const round of updated) {
            const winner = round.winner === 'A' ? round.movieA : round.movieB;
            const loser = round.winner === 'A' ? round.movieB : round.movieA;
            if (!winMap.has(winner.id)) {
              winMap.set(winner.id, { movie: winner, wins: 0 });
            }
            winMap.get(winner.id)!.wins += 1;
            if (!winMap.has(loser.id)) {
              winMap.set(loser.id, { movie: loser, wins: 0 });
            }
          }
          const sorted = Array.from(winMap.values()).sort(
            (a, b) => b.wins - a.wins
          );
          setResults(sorted);
          saveBattleHistory(sorted);
          setPhase('results');
        }
      }, 1200);
    },
    [pickedSide, battles, currentRound]
  );

  const playAgain = useCallback(() => {
    setPhase('ready');
  }, []);

  // --- Render: Loading ---
  if (phase === 'loading') {
    return (
      <div className="min-h-screen pb-10">
        <div className="sticky top-0 z-30 glass-strong">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
            <Swords className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">{t('battle_title')}</h1>
          </div>
        </div>
        <div className="px-4 lg:px-6 pt-8">
          <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto">
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // --- Render: Ready ---
  if (phase === 'ready') {
    return (
      <div className="min-h-screen pb-10">
        <div className="sticky top-0 z-30 glass-strong">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
            <Swords className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">{t('battle_title')}</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-4 pt-16 animate-fade-in">
          <div className="relative mb-6">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center animate-pulse-glow">
              <Swords className="w-14 h-14 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gradient mb-3">
            {t('battle_title')}
          </h2>
          <p className="text-muted-foreground text-center max-w-xs mb-8">
            {locale === 'id'
              ? '5 ronde pertarungan! Pilih film favorit di setiap VS.'
              : '5 rounds of VS battles! Pick your favorite in each matchup.'}
          </p>

          <button
            onClick={startBattle}
            className="bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold text-lg px-8 py-3.5 rounded-2xl hover:opacity-90 transition-opacity animate-pulse-glow"
          >
            {locale === 'id' ? 'Mulai Battle!' : 'Start Battle!'}
          </button>
        </div>
      </div>
    );
  }

  // --- Render: Results ---
  if (phase === 'results') {
    const maxWins = results.length > 0 ? results[0].wins : 0;

    return (
      <div className="min-h-screen pb-10">
        <div className="sticky top-0 z-30 glass-strong">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
            <Swords className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">{t('battle_title')}</h1>
          </div>
        </div>

        <div className="px-4 lg:px-6 pt-8 max-w-lg mx-auto animate-fade-in">
          <h2 className="text-2xl font-bold text-center text-gradient mb-8">
            {t('your_top_picks')}
          </h2>

          <div className="space-y-3">
            {results.map((result, idx) => {
              const isChampion = idx === 0;
              const medalColors = [
                'from-yellow-400 to-amber-500',
                'from-gray-300 to-gray-400',
                'from-amber-600 to-amber-700',
              ];
              return (
                <div
                  key={result.movie.id}
                  className={cn(
                    'glass rounded-2xl p-3 flex items-center gap-3 animate-slide-up',
                    isChampion && 'ring-2 ring-primary/30 glass-strong'
                  )}
                  style={{
                    animationDelay: `${idx * 80}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  {/* Rank */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm',
                      idx < 3
                        ? `bg-gradient-to-br ${medalColors[idx]} text-white`
                        : 'bg-white/10 text-muted-foreground'
                    )}
                  >
                    {idx + 1}
                  </div>
                  {/* Poster */}
                  <img
                    src={getPosterUrl(result.movie.poster_path, 'w92')}
                    alt={result.movie.title}
                    className="w-12 h-[72px] rounded-lg object-cover shrink-0"
                  />
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-semibold text-sm truncate">
                      {result.movie.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span className="text-xs text-muted-foreground">
                        {result.movie.vote_average.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  {/* Wins */}
                  <div className="shrink-0 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Trophy className="w-3.5 h-3.5 text-primary" />
                      <span className="text-sm font-bold text-primary">
                        {result.wins}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {locale === 'id' ? 'menang' : 'wins'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Champion callout */}
          {results.length > 0 && (
            <div className="mt-6 glass-strong rounded-2xl p-5 text-center animate-bounce-in">
              <Crown className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm mb-1">
                {t('battle_winner')}
              </p>
              <p className="text-xl font-bold text-gradient">
                {results[0].movie.title}
              </p>
              <p className="text-sm text-primary font-medium mt-1">
                {results[0].wins} {locale === 'id' ? 'kemenangan' : 'wins'}
              </p>
            </div>
          )}

          {/* Play Again */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={playAgain}
              className="flex items-center gap-2 gradient-primary text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              <RotateCcw className="w-4 h-4" />
              {locale === 'id' ? 'Main Lagi' : 'Play Again'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render: Versus (playing) ---
  const battle = battles[currentRound];
  if (!battle) return null;

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="sticky top-0 z-30 glass-strong">
        <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
          <Swords className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">{t('battle_title')}</h1>
          <div className="flex-1" />
          <Badge variant="secondary" className="text-xs">
            {currentRound + 1}/{battles.length}
          </Badge>
        </div>
      </div>

      {/* Round indicator dots */}
      <div className="flex justify-center gap-2 pt-4 pb-2">
        {battles.map((_, idx) => (
          <div
            key={idx}
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-all duration-300',
              idx < currentRound
                ? 'bg-primary'
                : idx === currentRound
                ? 'bg-primary animate-pulse-glow scale-125'
                : 'bg-white/20'
            )}
          />
        ))}
      </div>

      {/* VS Arena */}
      <div className="px-4 lg:px-6 pt-4 max-w-lg mx-auto">
        <div className="relative grid grid-cols-2 gap-4">
          {/* Movie A */}
          <button
            onClick={() => handlePick('A')}
            disabled={!!pickedSide}
            className={cn(
              'group relative rounded-2xl overflow-hidden transition-all duration-500',
              'border-2',
              pickedSide === 'A'
                ? 'border-primary ring-2 ring-primary/40 scale-[1.02]'
                : pickedSide === 'B'
                ? 'border-white/5 opacity-50 scale-95'
                : 'border-white/10 hover:border-primary/50 hover-lift',
              animatingVS && 'animate-slide-right'
            )}
          >
            <img
              src={getPosterUrl(battle.movieA.poster_path, 'w342')}
              alt={battle.movieA.title}
              className="aspect-[2/3] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <p className="text-white font-bold text-sm line-clamp-2 mb-1">
                {battle.movieA.title}
              </p>
              <div className="flex items-center gap-1.5">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                <span className="text-yellow-400 text-xs font-semibold">
                  {battle.movieA.vote_average.toFixed(1)}
                </span>
              </div>
            </div>
            {/* Selected overlay */}
            {pickedSide === 'A' && (
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center animate-bounce-in">
                <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
              </div>
            )}
          </button>

          {/* VS Badge */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div
              className={cn(
                'w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/30',
                animatingVS
                  ? 'animate-bounce-in scale-110'
                  : 'scale-100'
              )}
            >
              <span className="text-white font-black text-lg tracking-wider">
                {t('battle_vs')}
              </span>
            </div>
          </div>

          {/* Movie B */}
          <button
            onClick={() => handlePick('B')}
            disabled={!!pickedSide}
            className={cn(
              'group relative rounded-2xl overflow-hidden transition-all duration-500',
              'border-2',
              pickedSide === 'B'
                ? 'border-primary ring-2 ring-primary/40 scale-[1.02]'
                : pickedSide === 'A'
                ? 'border-white/5 opacity-50 scale-95'
                : 'border-white/10 hover:border-primary/50 hover-lift',
              animatingVS && 'animate-slide-left'
            )}
          >
            <img
              src={getPosterUrl(battle.movieB.poster_path, 'w342')}
              alt={battle.movieB.title}
              className="aspect-[2/3] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <p className="text-white font-bold text-sm line-clamp-2 mb-1">
                {battle.movieB.title}
              </p>
              <div className="flex items-center gap-1.5">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                <span className="text-yellow-400 text-xs font-semibold">
                  {battle.movieB.vote_average.toFixed(1)}
                </span>
              </div>
            </div>
            {/* Selected overlay */}
            {pickedSide === 'B' && (
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center animate-bounce-in">
                <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
              </div>
            )}
          </button>
        </div>

        {/* Prompt */}
        {!pickedSide && !animatingVS && (
          <p className="text-center text-muted-foreground text-sm mt-6 animate-fade-in">
            {locale === 'id'
              ? 'Pilih film favoritmu!'
              : 'Pick your favorite!'}
          </p>
        )}
        {pickedSide && (
          <div className="text-center mt-6 animate-bounce-in">
            <p className="text-primary font-bold text-sm">
              {locale === 'id' ? 'Pilihan dicatat!' : 'Choice recorded!'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
