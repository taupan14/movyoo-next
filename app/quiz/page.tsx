'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/use-locale';
import { fetchPopular, fetchTopRated, fetchTrending, getPosterUrl } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Trophy, Flame, Star, RotateCcw, Clock, Zap } from 'lucide-react';

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

type QuizQuestion =
  | {
      type: 'higher_rating';
      question: string;
      movieA: Movie;
      movieB: Movie;
      correctAnswer: 'A' | 'B';
    }
  | {
      type: 'guess_from_overview';
      question: string;
      overviewSnippet: string;
      choices: Movie[];
      correctIndex: number;
    }
  | {
      type: 'more_popular';
      question: string;
      movieA: Movie;
      movieB: Movie;
      correctAnswer: 'A' | 'B';
    };

interface QuizHistory {
  date: string;
  score: number;
  xpEarned: number;
}

const BADGE_TIERS = [
  { minScore: 5, key: 'gold', label: { id: 'Sempurna!', en: 'Perfect!' }, emoji: '🏆' },
  { minScore: 4, key: 'silver', label: { id: 'Luar Biasa!', en: 'Awesome!' }, emoji: '🥈' },
  { minScore: 3, key: 'bronze', label: { id: 'Bagus!', en: 'Nice!' }, emoji: '🥉' },
  { minScore: 1, key: 'effort', label: { id: 'Tetap Semangat!', en: 'Keep Going!' }, emoji: '💪' },
  { minScore: 0, key: 'none', label: { id: 'Coba Lagi Besok!', en: 'Try Again Tomorrow!' }, emoji: '🎬' },
];

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getQuizHistory(): QuizHistory[] {
  try {
    const raw = localStorage.getItem('movyoo-quiz-history');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveQuizHistory(entry: QuizHistory) {
  const history = getQuizHistory();
  history.push(entry);
  localStorage.setItem('movyoo-quiz-history', JSON.stringify(history));
}

function getStreak(): number {
  try {
    const raw = localStorage.getItem('movyoo-streak');
    if (!raw) return 0;
    return parseInt(raw, 10) || 0;
  } catch {
    return 0;
  }
}

function updateStreak() {
  const history = getQuizHistory();
  const today = getTodayStr();
  if (history.some((h) => h.date === today)) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const currentStreak = getStreak();
  if (history.some((h) => h.date === yesterdayStr)) {
    localStorage.setItem('movyoo-streak', String(currentStreak + 1));
  } else {
    localStorage.setItem('movyoo-streak', '1');
  }
}

function getXP(): number {
  try {
    const raw = localStorage.getItem('movyoo-xp');
    if (!raw) return 0;
    return parseInt(raw, 10) || 0;
  } catch {
    return 0;
  }
}

function addXP(amount: number) {
  const current = getXP();
  localStorage.setItem('movyoo-xp', String(current + amount));
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateQuestions(movies: Movie[], locale: string): QuizQuestion[] {
  const available = movies.filter(
    (m) => m.overview && m.overview.trim().length > 20
  );
  const questions: QuizQuestion[] = [];

  // Question 1: Higher rating
  const ratingPool = shuffleArray(available.length > 1 ? available : movies);
  if (ratingPool.length >= 2) {
    const a = ratingPool[0];
    const b = ratingPool[1];
    questions.push({
      type: 'higher_rating',
      question:
        locale === 'id'
          ? 'Film mana yang ratingnya lebih tinggi?'
          : 'Which movie has a higher rating?',
      movieA: a,
      movieB: b,
      correctAnswer: a.vote_average >= b.vote_average ? 'A' : 'B',
    });
  }

  // Question 2: Guess from overview
  const guessPool = shuffleArray(available.length > 3 ? available : movies);
  if (guessPool.length >= 4) {
    const target = guessPool[0];
    const snippet =
      target.overview!.length > 120
        ? target.overview!.substring(0, 120) + '...'
        : target.overview!;
    const wrongChoices = shuffleArray(
      guessPool.filter((m) => m.id !== target.id)
    ).slice(0, 3);
    const choices = shuffleArray([target, ...wrongChoices]);
    const correctIndex = choices.findIndex((c) => c.id === target.id);
    questions.push({
      type: 'guess_from_overview',
      question:
        locale === 'id'
          ? 'Tebak film dari sinopsis ini:'
          : 'Guess the movie from this overview:',
      overviewSnippet: snippet,
      choices,
      correctIndex,
    });
  }

  // Question 3: More popular
  const popPool = shuffleArray(
    available.filter((m) => m.popularity != null).length >= 2
      ? available
      : movies.filter((m) => m.popularity != null)
  );
  if (popPool.length >= 2) {
    const a = popPool[0];
    const b = popPool[1];
    questions.push({
      type: 'more_popular',
      question:
        locale === 'id'
          ? 'Film mana yang lebih populer?'
          : 'Which movie is more popular?',
      movieA: a,
      movieB: b,
      correctAnswer: (a.popularity || 0) >= (b.popularity || 0) ? 'A' : 'B',
    });
  }

  // Question 4: Second higher-rating pair
  const ratingPool2 = shuffleArray(available.length > 3 ? available : movies);
  if (ratingPool2.length >= 2) {
    const a = ratingPool2[0];
    const b = ratingPool2[1];
    if (!questions.some((q) => q.type === 'higher_rating' && q.movieA.id === a.id && q.movieB.id === b.id)) {
      questions.push({
        type: 'higher_rating',
        question:
          locale === 'id'
            ? 'Mana yang ratingnya lebih tinggi?'
            : 'Which one has the higher rating?',
        movieA: a,
        movieB: b,
        correctAnswer: a.vote_average >= b.vote_average ? 'A' : 'B',
      });
    }
  }

  // Question 5: Second guess-from-overview
  const guessPool2 = shuffleArray(available.length > 7 ? available : movies);
  if (guessPool2.length >= 4) {
    const usedIds = questions
      .filter((q) => q.type === 'guess_from_overview')
      .flatMap((q) => (q as { choices: Movie[] }).choices.map((c) => c.id));
    const freshPool = guessPool2.filter((m) => !usedIds.includes(m.id));
    if (freshPool.length >= 4) {
      const target = freshPool[0];
      const snippet =
        target.overview!.length > 120
          ? target.overview!.substring(0, 120) + '...'
          : target.overview!;
      const wrongChoices = shuffleArray(
        freshPool.filter((m) => m.id !== target.id)
      ).slice(0, 3);
      const choices = shuffleArray([target, ...wrongChoices]);
      const correctIndex = choices.findIndex((c) => c.id === target.id);
      questions.push({
        type: 'guess_from_overview',
        question:
          locale === 'id'
            ? 'Tebak film dari sinopsis berikut:'
            : 'Guess the movie from this overview:',
        overviewSnippet: snippet,
        choices,
        correctIndex,
      });
    }
  }

  // Fill up to 5 if we don't have enough
  if (questions.length < 5) {
    const allPool = shuffleArray(movies);
    for (let i = 0; i < allPool.length - 1 && questions.length < 5; i += 2) {
      const a = allPool[i];
      const b = allPool[i + 1];
      if (!a || !b) break;
      questions.push({
        type: 'higher_rating',
        question:
          locale === 'id'
            ? 'Film mana yang ratingnya lebih tinggi?'
            : 'Which movie has a higher rating?',
        movieA: a,
        movieB: b,
        correctAnswer: a.vote_average >= b.vote_average ? 'A' : 'B',
      });
    }
  }

  return questions.slice(0, 5);
}

export default function QuizPage() {
  const { t, locale, region } = useI18n();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'playing' | 'done' | 'completed_today'>('loading');
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [finalXP, setFinalXP] = useState(0);
  const [earnedBadge, setEarnedBadge] = useState<(typeof BADGE_TIERS)[number] | null>(null);

  // Load movies
  useEffect(() => {
    async function load() {
      try {
        const lang = locale === 'id' ? 'id' : 'en';
        const [popularRes, topRatedRes, trendingRes] = await Promise.all([
          fetchPopular(lang, region),
          fetchTopRated(lang, region),
          fetchTrending('week', lang, region),
        ]);
        const all = [
          ...(popularRes.results || []),
          ...(topRatedRes.results || []),
          ...(trendingRes.results || []),
        ];
        // Deduplicate
        const unique = Array.from(
          new Map(all.map((m: Movie) => [m.id, m])).values()
        );
        setMovies(unique);
      } catch (err) {
        console.error('Failed to load quiz data', err);
        setPhase('ready');
      }
    }
    load();
  }, [locale, region]);

  // Check if already completed today & init streak/xp
  useEffect(() => {
    const history = getQuizHistory();
    const today = getTodayStr();
    setStreak(getStreak());
    setXp(getXP());
    if (history.some((h) => h.date === today)) {
      setPhase('completed_today');
    }
  }, []);

  // Generate questions once movies are loaded
  useEffect(() => {
    if (movies.length >= 4 && phase === 'loading') {
      const qs = generateQuestions(movies, locale);
      setQuestions(qs);
      setPhase('ready');
    }
  }, [movies, phase, locale]);

  const startQuiz = useCallback(() => {
    setPhase('playing');
    setCurrentQuestion(0);
    setScore(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
  }, []);

  const handleAnswer = useCallback(
    (answer: string | number) => {
      if (isAnswered) return;
      setSelectedAnswer(answer);
      setIsAnswered(true);

      const q = questions[currentQuestion];
      let correct = false;

      if (q.type === 'higher_rating' || q.type === 'more_popular') {
        correct = answer === q.correctAnswer;
      } else if (q.type === 'guess_from_overview') {
        correct = answer === q.correctIndex;
      }

      setIsCorrect(correct);
      if (correct) {
        setScore((s) => s + 1);
      }

      // Delay before moving to next question
      setTimeout(() => {
        if (currentQuestion < questions.length - 1) {
          setCurrentQuestion((c) => c + 1);
          setSelectedAnswer(null);
          setIsAnswered(false);
          setIsCorrect(false);
        } else {
          // Quiz complete
          const finalScore = correct ? score + 1 : score;
          const xpEarned = finalScore * 10;
          setFinalXP(xpEarned);
          const badge = BADGE_TIERS.find((b) => finalScore >= b.minScore) || BADGE_TIERS[BADGE_TIERS.length - 1];
          setEarnedBadge(badge);

          saveQuizHistory({
            date: getTodayStr(),
            score: finalScore,
            xpEarned,
          });
          addXP(xpEarned);
          updateStreak();
          setStreak(getStreak());
          setXp(getXP());
          setPhase('done');
        }
      }, 1500);
    },
    [isAnswered, questions, currentQuestion, score]
  );

  // --- Render ---

  if (phase === 'loading') {
    return (
      <div className="min-h-screen pb-10">
        <div className="sticky top-0 z-30 glass-strong">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
            <h1 className="text-lg font-bold text-foreground">{t('quiz_title')}</h1>
          </div>
        </div>
        <div className="px-4 lg:px-6 pt-8 space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-full max-w-md mx-auto" />
          <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto pt-6">
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Already completed today
  if (phase === 'completed_today') {
    const history = getQuizHistory();
    const todayEntry = [...history].reverse().find((h) => h.date === getTodayStr());
    return (
      <div className="min-h-screen pb-10">
        <div className="sticky top-0 z-30 glass-strong">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
            <h1 className="text-lg font-bold text-foreground">{t('quiz_title')}</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-4 pt-16 animate-fade-in">
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center animate-pulse-glow">
              <Trophy className="w-12 h-12 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gradient mb-2">
            {locale === 'id' ? 'Kuis Hari Ini Selesai!' : "Today's Quiz Complete!"}
          </h2>
          {todayEntry && (
            <p className="text-muted-foreground mb-1">
              {t('quiz_score')}: {todayEntry.score}/5
            </p>
          )}
          {todayEntry && (
            <p className="text-sm text-primary font-semibold mb-6">
              +{todayEntry.xpEarned} {t('xp')}
            </p>
          )}
          <div className="glass rounded-2xl p-6 w-full max-w-sm text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-foreground font-medium">
                {locale === 'id' ? 'Kembali Besok!' : 'Come back tomorrow!'}
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              {locale === 'id'
                ? 'Kuis baru tersedia setiap hari.'
                : 'A new quiz is available every day.'}
            </p>
          </div>
          <div className="flex gap-4">
            <div className="glass rounded-xl px-4 py-3 text-center min-w-[100px]">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-muted-foreground">{t('streak')}</span>
              </div>
              <span className="text-xl font-bold text-foreground">{streak}</span>
              <span className="text-xs text-muted-foreground ml-1">{t('days')}</span>
            </div>
            <div className="glass rounded-xl px-4 py-3 text-center min-w-[100px]">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-muted-foreground">{t('xp')}</span>
              </div>
              <span className="text-xl font-bold text-foreground">{xp}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ready to start
  if (phase === 'ready') {
    return (
      <div className="min-h-screen pb-10">
        <div className="sticky top-0 z-30 glass-strong">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
            <h1 className="text-lg font-bold text-foreground">{t('quiz_title')}</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-4 pt-16 animate-fade-in">
          <div className="relative mb-6">
            <div className="w-28 h-28 rounded-full gradient-primary flex items-center justify-center animate-pulse-glow">
              <Star className="w-14 h-14 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gradient mb-3">
            {t('quiz_title')}
          </h2>
          <p className="text-muted-foreground text-center max-w-xs mb-8">
            {locale === 'id'
              ? '5 pertanyaan film, jawab benar dapat XP! Bisa dimainkan 1x sehari.'
              : '5 movie questions, answer correctly to earn XP! Playable once per day.'}
          </p>

          <div className="flex gap-4 mb-8">
            <div className="glass rounded-xl px-4 py-3 text-center min-w-[100px]">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-muted-foreground">{t('streak')}</span>
              </div>
              <span className="text-xl font-bold text-foreground">{streak}</span>
              <span className="text-xs text-muted-foreground ml-1">{t('days')}</span>
            </div>
            <div className="glass rounded-xl px-4 py-3 text-center min-w-[100px]">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-muted-foreground">{t('xp')}</span>
              </div>
              <span className="text-xl font-bold text-foreground">{xp}</span>
            </div>
          </div>

          <button
            onClick={startQuiz}
            className="gradient-primary text-white font-bold text-lg px-8 py-3.5 rounded-2xl hover:opacity-90 transition-opacity animate-pulse-glow"
          >
            {locale === 'id' ? 'Mulai Kuis!' : 'Start Quiz!'}
          </button>
        </div>
      </div>
    );
  }

  // Results
  if (phase === 'done') {
    return (
      <div className="min-h-screen pb-10">
        <div className="sticky top-0 z-30 glass-strong">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
            <h1 className="text-lg font-bold text-foreground">{t('quiz_title')}</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-4 pt-12 animate-fade-in">
          {/* Badge */}
          {earnedBadge && (
            <div className="animate-bounce-in mb-4">
              <div className="text-6xl text-center">{earnedBadge.emoji}</div>
            </div>
          )}
          <h2 className="text-3xl font-bold text-gradient mb-2">
            {earnedBadge
              ? earnedBadge.label[locale === 'id' ? 'id' : 'en']
              : ''}
          </h2>

          {/* Score */}
          <div className="glass rounded-2xl p-6 w-full max-w-sm text-center mb-6 animate-slide-up">
            <p className="text-muted-foreground text-sm mb-2">{t('quiz_score')}</p>
            <div className="flex items-baseline justify-center gap-2 mb-4">
              <span className="text-5xl font-bold text-primary">{score}</span>
              <span className="text-2xl text-muted-foreground">/5</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <span className="text-lg font-semibold text-foreground">
                +{finalXP} {t('xp')}
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 mb-8">
            <div className="glass rounded-xl px-4 py-3 text-center min-w-[100px]">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-muted-foreground">{t('streak')}</span>
              </div>
              <span className="text-xl font-bold text-foreground">{streak}</span>
              <span className="text-xs text-muted-foreground ml-1">{t('days')}</span>
            </div>
            <div className="glass rounded-xl px-4 py-3 text-center min-w-[100px]">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-muted-foreground">{t('xp')}</span>
              </div>
              <span className="text-xl font-bold text-foreground">{xp}</span>
            </div>
          </div>

          {/* Come back tomorrow */}
          <div className="glass rounded-xl px-5 py-3 flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Clock className="w-4 h-4" />
            <span>
              {locale === 'id'
                ? 'Kembali besok untuk kuis baru!'
                : 'Come back tomorrow for a new quiz!'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Playing
  const question = questions[currentQuestion];
  if (!question) return null;

  const progressValue = ((currentQuestion + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="sticky top-0 z-30 glass-strong">
        <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
          <h1 className="text-lg font-bold text-foreground">{t('quiz_title')}</h1>
        </div>
      </div>

      <div className="px-4 lg:px-6 pt-6 max-w-lg mx-auto animate-fade-in">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {locale === 'id' ? 'Pertanyaan' : 'Question'} {currentQuestion + 1}{' '}
              {locale === 'id' ? 'dari' : 'of'} {questions.length}
            </span>
            <span className="text-sm font-semibold text-primary">
              {score}/{currentQuestion + (isAnswered ? 0 : 0)} {t('quiz_score').toLowerCase()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full gradient-primary transition-all duration-500" style={{ width: `${progressValue}%` }} />
          </div>
        </div>

        {/* Question */}
        <div className="animate-slide-up" key={currentQuestion}>
          <h2 className="text-xl font-bold text-foreground text-center mb-6">
            {question.question}
          </h2>

          {/* Higher Rating / More Popular: Two posters side by side */}
          {(question.type === 'higher_rating' || question.type === 'more_popular') && (
            <div className="grid grid-cols-2 gap-4">
              {(['A', 'B'] as const).map((side) => {
                const movie = side === 'A' ? question.movieA : question.movieB;
                const isPicked = selectedAnswer === side;
                const isWin =
                  isAnswered &&
                  side === question.correctAnswer;
                const isLose =
                  isAnswered &&
                  isPicked &&
                  side !== question.correctAnswer;

                return (
                  <button
                    key={side}
                    onClick={() => handleAnswer(side)}
                    disabled={isAnswered}
                    className={cn(
                      'group relative rounded-2xl overflow-hidden transition-all duration-300 hover-lift card-shine',
                      'border-2',
                      isAnswered && isWin && 'border-green-400 ring-2 ring-green-400/30',
                      isAnswered && isLose && 'border-red-400/50 opacity-60',
                      isAnswered && !isPicked && !isWin && 'border-white/5 opacity-40',
                      !isAnswered && isPicked && 'border-primary ring-2 ring-primary/30',
                      !isAnswered && 'border-white/10 hover:border-primary/50'
                    )}
                  >
                    <img
                      src={getPosterUrl(movie.poster_path, 'w342')}
                      alt={movie.title}
                      className="aspect-[2/3] w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white font-semibold text-sm line-clamp-2">
                        {movie.title}
                      </p>
                      {question.type === 'higher_rating' && (
                        <div className="flex items-center gap-1 mt-1">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                          <span className="text-yellow-400 text-xs font-bold">
                            {movie.vote_average.toFixed(1)}
                          </span>
                        </div>
                      )}
                      {question.type === 'more_popular' && (
                        <div className="flex items-center gap-1 mt-1">
                          <Zap className="w-3.5 h-3.5 text-primary" />
                          <span className="text-primary text-xs font-bold">
                            {Math.round(movie.popularity || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Answer overlay */}
                    {isAnswered && side === question.correctAnswer && (
                      <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-green-500/80 flex items-center justify-center animate-bounce-in">
                          <Star className="w-6 h-6 text-white fill-white" />
                        </div>
                      </div>
                    )}
                    {isAnswered && isPicked && side !== question.correctAnswer && (
                      <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-red-500/80 flex items-center justify-center animate-bounce-in">
                          <span className="text-white text-xl font-bold">X</span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Guess from Overview: Snippet + 4 choices */}
          {question.type === 'guess_from_overview' && (
            <div>
              <div className="glass rounded-2xl p-5 mb-6">
                <p className="text-foreground/90 text-sm leading-relaxed italic">
                  &ldquo;{question.overviewSnippet}&rdquo;
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {question.choices.map((movie, idx) => {
                  const isPicked = selectedAnswer === idx;
                  const isWin = isAnswered && idx === question.correctIndex;
                  const isLose =
                    isAnswered && isPicked && idx !== question.correctIndex;

                  return (
                    <button
                      key={movie.id}
                      onClick={() => handleAnswer(idx)}
                      disabled={isAnswered}
                      className={cn(
                        'group relative rounded-xl overflow-hidden transition-all duration-300',
                        'border-2',
                        isAnswered && isWin && 'border-green-400 ring-2 ring-green-400/30',
                        isAnswered && isLose && 'border-red-400/50 opacity-60',
                        isAnswered &&
                          !isPicked &&
                          !isWin && 'border-white/5 opacity-40',
                        !isAnswered && isPicked && 'border-primary ring-2 ring-primary/30',
                        !isAnswered && 'border-white/10 hover:border-primary/50'
                      )}
                    >
                      <img
                        src={getPosterUrl(movie.poster_path, 'w342')}
                        alt={movie.title}
                        className="aspect-[2/3] w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2.5">
                        <p className="text-white font-semibold text-xs line-clamp-2">
                          {movie.title}
                        </p>
                      </div>
                      {/* Answer overlay */}
                      {isAnswered && idx === question.correctIndex && (
                        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-green-500/80 flex items-center justify-center animate-bounce-in">
                            <Star className="w-5 h-5 text-white fill-white" />
                          </div>
                        </div>
                      )}
                      {isAnswered && isPicked && idx !== question.correctIndex && (
                        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-red-500/80 flex items-center justify-center animate-bounce-in">
                            <span className="text-white text-lg font-bold">X</span>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Correct / Wrong indicator */}
          {isAnswered && (
            <div
              className={cn(
                'mt-6 text-center animate-bounce-in',
                isCorrect ? 'text-green-400' : 'text-red-400'
              )}
            >
              <p className="font-bold text-lg">
                {isCorrect
                  ? locale === 'id'
                    ? 'Benar! +10 XP'
                    : 'Correct! +10 XP'
                  : locale === 'id'
                  ? 'Salah!'
                  : 'Wrong!'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
