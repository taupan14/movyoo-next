"use client";

// app/quiz/page.tsx
// Trivia / Kuis — semua phase dalam satu file:
//   lobby → loading → playing → answered → completed → leaderboard

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Flame,
  Trophy,
  Zap,
  Star,
  Clock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Scissors,
  Timer,
  SkipForward,
  Sparkles,
  Medal,
  Crown,
  ArrowLeft,
  Calendar,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type {
  TriviaSession,
  TriviaQuestion,
  AnswerOption,
  AnswerResult,
  SessionResult,
  PowerupsState,
  LeaderboardEntry,
  DailyTriviaStatus,
  QuizPhase,
  PowerupType,
  TriviaMode,
  TriviaDifficulty,
  TriviaCategory,
} from "@/types/trivia";

import NativeBannerAd from "@/components/ads/NativeBannerAd";

// ─── Constants ────────────────────────────────────────────────────────────────
const TIME_PER_QUESTION = 15; // detik
const AUTO_NEXT_DELAY = 2000; // ms sebelum otomatis lanjut ke soal berikutnya
const DIFFICULTY_LABELS: Record<TriviaDifficulty, string> = {
  easy: "Mudah",
  medium: "Sedang",
  hard: "Sulit",
};
const DIFFICULTY_COLORS: Record<TriviaDifficulty, string> = {
  easy: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  medium: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  hard: "text-rose-400 border-rose-500/30 bg-rose-500/10",
};
const CATEGORY_LABELS: Record<TriviaCategory, string> = {
  general: "Umum",
  director: "Sutradara",
  actor: "Aktor",
  rating: "Rating",
  popularity: "Popularitas",
  synopsis: "Sinopsis",
  year: "Tahun Rilis",
  genre: "Genre",
  franchise: "Franchise",
  awards: "Penghargaan",
};
const OPTION_KEYS: AnswerOption[] = ["A", "B", "C", "D"];

// ─── Powerup Icon ─────────────────────────────────────────────────────────────
const POWERUP_META: Record<
  PowerupType,
  { icon: React.ElementType; color: string; shortLabel: string }
> = {
  fifty_fifty: {
    icon: Scissors,
    color: "text-violet-400",
    shortLabel: "50:50",
  },
  extra_time: { icon: Timer, color: "text-blue-400", shortLabel: "+10s" },
  skip: { icon: SkipForward, color: "text-amber-400", shortLabel: "Skip" },
  double_points: { icon: Sparkles, color: "text-pink-400", shortLabel: "×2" },
};

// ─── Timer Bar ────────────────────────────────────────────────────────────────
function TimerBar({ seconds, total }: { seconds: number; total: number }) {
  const pct = (seconds / total) * 100;
  const urgent = seconds <= 5;
  return (
    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-1000",
          urgent ? "bg-rose-500" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Option Button ────────────────────────────────────────────────────────────
function OptionButton({
  label,
  text,
  selected,
  correct,
  revealed,
  eliminated,
  onClick,
}: {
  label: AnswerOption;
  text: string;
  selected: boolean;
  correct: boolean;
  revealed: boolean;
  eliminated: boolean;
  onClick: () => void;
}) {
  const isCorrectAnswer = revealed && correct;
  const isWrongSelected = revealed && selected && !correct;
  const isEliminated = eliminated && !revealed;

  return (
    <button
      onClick={onClick}
      disabled={revealed || eliminated}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left",
        "transition-all duration-200 text-sm font-medium",
        isCorrectAnswer &&
          "border-emerald-500 bg-emerald-500/15 text-emerald-300",
        isWrongSelected && "border-rose-500 bg-rose-500/15 text-rose-300",
        isEliminated &&
          "border-white/5 bg-white/[0.02] text-muted-foreground/30 line-through",
        !revealed &&
          !eliminated &&
          !selected &&
          "border-white/10 bg-white/[0.03] hover:border-primary/40 hover:bg-primary/5 hover:text-foreground text-muted-foreground",
        selected && !revealed && "border-primary bg-primary/10 text-primary",
      )}
    >
      <span
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
          isCorrectAnswer && "bg-emerald-500 text-white",
          isWrongSelected && "bg-rose-500 text-white",
          !isCorrectAnswer && !isWrongSelected && "bg-white/8",
        )}
      >
        {isCorrectAnswer ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : isWrongSelected ? (
          <XCircle className="w-4 h-4" />
        ) : (
          label
        )}
      </span>
      {text}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function QuizPage() {
  const { user, openAuthModal } = useAuth();

  // Phase management
  const [phase, setPhase] = useState<QuizPhase>("lobby");

  // Lobby config
  const [mode, setMode] = useState<TriviaMode>("practice");
  const [difficulty, setDiff] = useState<TriviaDifficulty | "">("");
  const [category, setCategory] = useState<TriviaCategory | "">("");
  const [count, setCount] = useState<number>(10);

  // Session state
  const [session, setSession] = useState<TriviaSession | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelected] = useState<AnswerOption | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [eliminatedOpts, setEliminated] = useState<AnswerOption[]>([]);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [doubleActive, setDoubleActive] = useState(false);
  const [totalXp, setTotalXp] = useState(0);
  const [totalPts, setTotalPts] = useState(0);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(
    null,
  );

  // Powerups + daily + leaderboard
  const [powerups, setPowerups] = useState<PowerupsState | null>(null);
  const [dailyStatus, setDaily] = useState<DailyTriviaStatus | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<LeaderboardEntry | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Menyiapkan soal...");
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoNextProgress, setAutoNextProgress] = useState(100);

  const currentQ: TriviaQuestion | null =
    session?.questions?.[currentIdx] ?? null;

  // ── Fetch daily status dan powerups saat mount ───────────────────────────
  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/trivia/daily").then((r) => r.json()),
      fetch("/api/trivia/powerups").then((r) => r.json()),
    ])
      .then(([daily, pu]) => {
        setDaily(daily);
        setPowerups(pu);
      })
      .catch(() => {});
  }, [user]);

  // ── Timer ────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setTimeLeft(TIME_PER_QUESTION);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopTimer();
          // Auto-submit dengan jawaban null (timeout)
          setAnswerResult({
            correct: false,
            correct_option: "A", // placeholder, akan diisi dari server
            explanation: null,
            xp_earned: 0,
            pts_earned: 0,
            score_delta: 0,
          });
          setPhase("answered");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // ── Auto-next setelah jawab ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "answered") {
      if (autoNextRef.current) clearTimeout(autoNextRef.current);
      setAutoNextProgress(100);
      return;
    }

    // Animasi progress bar mengecil selama AUTO_NEXT_DELAY
    const steps = 20;
    const stepMs = AUTO_NEXT_DELAY / steps;
    let currentStep = 0;

    const progressInterval = setInterval(() => {
      currentStep++;
      setAutoNextProgress(Math.max(0, 100 - (currentStep / steps) * 100));
      if (currentStep >= steps) clearInterval(progressInterval);
    }, stepMs);

    autoNextRef.current = setTimeout(() => {
      clearInterval(progressInterval);
      setAutoNextProgress(0);
      nextQuestion();
    }, AUTO_NEXT_DELAY);

    return () => {
      clearInterval(progressInterval);
      if (autoNextRef.current) clearTimeout(autoNextRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Start session ────────────────────────────────────────────────────────
  const startSession = async () => {
    if (!user) {
      openAuthModal("signin");
      return;
    }
    setLoading(true);
    setError(null);
    setLoadingLabel("Menyiapkan soal...");
    setPhase("loading");

    const params = new URLSearchParams({
      mode,
      count: String(count),
      ...(difficulty && { difficulty }),
      ...(category && { category }),
    });

    try {
      const res = await fetch(`/api/trivia/questions?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Gagal memuat soal");
        setPhase("lobby");
        return;
      }
      setSession(data);
      setCurrentIdx(data.current_index ?? 0);
      setTotalXp(0);
      setTotalPts(0);
      setSelected(null);
      setAnswerResult(null);
      setEliminated([]);
      setDoubleActive(false);
      setPhase("playing");
      startTimer();
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
      setPhase("lobby");
    } finally {
      setLoading(false);
    }
  };

  // ── Submit jawaban ────────────────────────────────────────────────────────
  const submitAnswer = async (answer: AnswerOption) => {
    if (!session || !currentQ || answerResult) return;
    stopTimer();
    setSelected(answer);

    const res = await fetch(
      `/api/trivia/sessions/${session.session_id}/answer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: currentQ.id,
          answer,
          time_taken_ms: (TIME_PER_QUESTION - timeLeft) * 1000,
          use_double_points: doubleActive,
        }),
      },
    );
    const data: AnswerResult = await res.json();
    setAnswerResult(data);
    setDoubleActive(false);
    if (data.xp_earned) setTotalXp((prev) => prev + data.xp_earned);
    if (data.pts_earned) setTotalPts((prev) => prev + data.pts_earned);
    setPhase("answered");
  };

  // ── Next soal ────────────────────────────────────────────────────────────
  const nextQuestion = async () => {
    if (!session) return;
    const nextIdx = currentIdx + 1;

    if (nextIdx >= session.total_questions) {
      // Selesai — complete session
      await completeSession();
      return;
    }

    setCurrentIdx(nextIdx);
    setSelected(null);
    setAnswerResult(null);
    setEliminated([]);
    setDoubleActive(false);
    setPhase("playing");
    startTimer();
  };

  // ── Complete session ──────────────────────────────────────────────────────
  const completeSession = async () => {
    if (!session) return;
    setLoadingLabel("Menampilkan hasil...");
    setPhase("loading");

    const res = await fetch(
      `/api/trivia/sessions/${session.session_id}/complete`,
      {
        method: "POST",
      },
    );
    const data = await res.json();

    if (res.ok) {
      setSessionResult(data);
      setTotalXp(data.xp_earned);
      setTotalPts(data.pts_earned);
      // Refresh daily status
      fetch("/api/trivia/daily")
        .then((r) => r.json())
        .then(setDaily);
    }
    setPhase("completed");
  };

  // ── Powerup: 50:50 ───────────────────────────────────────────────────────
  const useFiftyFifty = async () => {
    if (!currentQ || !powerups?.fifty_fifty || powerups.fifty_fifty.used)
      return;
    const res = await fetch("/api/trivia/powerups/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fifty_fifty", question_id: currentQ.id }),
    });
    const data = await res.json();
    if (data.success && data.eliminated?.length) {
      setEliminated(data.eliminated as AnswerOption[]);
      setPowerups((prev) =>
        prev
          ? { ...prev, fifty_fifty: { ...prev.fifty_fifty, used: true } }
          : prev,
      );
    }
  };

  const useExtraTime = async () => {
    if (!powerups?.extra_time || powerups.extra_time.used) return;
    await fetch("/api/trivia/powerups/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "extra_time" }),
    });
    setTimeLeft((prev) => prev + 10);
    setPowerups((prev) =>
      prev ? { ...prev, extra_time: { ...prev.extra_time, used: true } } : prev,
    );
  };

  const useSkip = async () => {
    if (!powerups?.skip || powerups.skip.used) return;
    await fetch("/api/trivia/powerups/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "skip" }),
    });
    setPowerups((prev) =>
      prev ? { ...prev, skip: { ...prev.skip, used: true } } : prev,
    );
    stopTimer();
    // Lanjut ke soal berikutnya tanpa menjawab
    setAnswerResult({
      correct: false,
      correct_option: "A",
      explanation: null,
      xp_earned: 0,
      pts_earned: 0,
      score_delta: 0,
    });
    setPhase("answered");
  };

  const useDoublePoints = async () => {
    if (!powerups?.double_points || powerups.double_points.used) return;
    setDoubleActive(true);
    setPowerups((prev) =>
      prev
        ? { ...prev, double_points: { ...prev.double_points, used: true } }
        : prev,
    );
  };

  // ── Load leaderboard ──────────────────────────────────────────────────────
  const loadLeaderboard = async () => {
    setPhase("leaderboard");
    const res = await fetch("/api/trivia/leaderboard");
    const data = await res.json();
    setLeaderboard(data.entries ?? []);
    setUserRank(data.user_rank ?? null);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  // ── Phase: Loading ────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{loadingLabel}</p>
        </div>
      </div>
    );
  }

  // ── Phase: Lobby ──────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <>
        <div className="max-w-lg mx-auto px-4 py-8 pb-28 lg:pb-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Flame className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Trivia Film</h1>
                <p className="text-xs text-muted-foreground">
                  Uji pengetahuan sinema kamu
                </p>
              </div>
            </div>
          </div>

          {/* Daily trivia card */}
          {dailyStatus && (
            <div
              className={cn(
                "p-4 rounded-2xl border mb-6",
                dailyStatus.completed
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : "bg-primary/5 border-primary/20",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Daily Trivia</span>
                </div>
                {dailyStatus.completed && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
                  </span>
                )}
              </div>
              {dailyStatus.completed ? (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {dailyStatus.correct_count}/{dailyStatus.total_questions}{" "}
                    benar
                  </span>
                  <span className="text-amber-400 font-medium">
                    +{dailyStatus.xp_earned} XP
                  </span>
                  <span className="text-emerald-400 font-medium">
                    +{dailyStatus.pts_earned} Pts
                  </span>
                  {(dailyStatus.tickets_earned ?? 0) > 0 && (
                    <span className="text-violet-400 font-medium flex items-center gap-1">
                      <Ticket className="w-3 h-3" />+
                      {dailyStatus.tickets_earned}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    +30 XP bonus jika selesai hari ini
                  </p>
                  <button
                    onClick={() => {
                      setMode("daily");
                      setTimeout(startSession, 0);
                    }}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    Mulai <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Config */}
          <div className="space-y-4">
            {/* Mode */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["practice", "category", "daily"] as TriviaMode[]).map(
                  (m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={cn(
                        "py-2.5 rounded-xl border text-sm font-medium transition-all",
                        mode === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20",
                      )}
                    >
                      {m === "practice"
                        ? "Latihan"
                        : m === "category"
                          ? "Kategori"
                          : "Daily"}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Tingkat Kesulitan
              </label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => setDiff("")}
                  className={cn(
                    "py-2.5 rounded-xl border text-sm font-medium transition-all",
                    difficulty === ""
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground",
                  )}
                >
                  Semua
                </button>
                {(["easy", "medium", "hard"] as TriviaDifficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDiff(d)}
                    className={cn(
                      "py-2.5 rounded-xl border text-sm font-medium transition-all",
                      difficulty === d
                        ? DIFFICULTY_COLORS[d] + " border-current"
                        : "border-white/10 bg-white/[0.03] text-muted-foreground",
                    )}
                  >
                    {DIFFICULTY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            {/* Category (hanya jika mode = category) */}
            {mode === "category" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Kategori
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    Object.entries(CATEGORY_LABELS) as [
                      TriviaCategory,
                      string,
                    ][]
                  ).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => setCategory(k)}
                      className={cn(
                        "py-2 rounded-xl border text-sm transition-all text-left px-3",
                        category === k
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-white/10 bg-white/[0.03] text-muted-foreground",
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Count */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Jumlah Soal:{" "}
                <span className="text-foreground font-bold">{count}</span>
              </label>
              <input
                type="range"
                min={10}
                max={25}
                step={5}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>10</span>
                <span>15</span>
                <span>20</span>
                <span>25</span>
              </div>
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={startSession}
            disabled={loading}
            className="w-full mt-8 py-4 rounded-2xl gradient-primary text-white font-bold text-base hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Flame className="w-5 h-5" />
            )}
            Mulai Trivia
          </button>

          {/* Leaderboard link */}
          <button
            onClick={loadLeaderboard}
            className="w-full mt-3 py-3 rounded-2xl border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all flex items-center justify-center gap-2"
          >
            <Trophy className="w-4 h-4" /> Lihat Leaderboard Minggu Ini
          </button>
        </div>
        <NativeBannerAd className="px-4" />
      </>
    );
  }

  // ── Phase: Playing / Answered ─────────────────────────────────────────────
  if ((phase === "playing" || phase === "answered") && session && currentQ) {
    const optionTexts: Record<AnswerOption, string> = {
      A: currentQ.option_a,
      B: currentQ.option_b,
      C: currentQ.option_c,
      D: currentQ.option_d,
    };

    return (
      <>
        <div className="max-w-lg mx-auto px-4 py-6 pb-28 lg:pb-8">
          {/* Header: progress + timer */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-muted-foreground shrink-0">
              {currentIdx + 1} / {session.total_questions}
            </span>
            <div className="flex-1">
              {/* Progress bar */}
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${(currentIdx / session.total_questions) * 100}%`,
                  }}
                />
              </div>
              {phase === "playing" && (
                <TimerBar seconds={timeLeft} total={TIME_PER_QUESTION} />
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {phase === "playing" && (
                <span
                  className={cn(
                    "text-xs font-bold w-8 text-right",
                    timeLeft <= 5 ? "text-rose-400" : "text-muted-foreground",
                  )}
                >
                  {timeLeft}s
                </span>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mb-4">
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-md border",
                DIFFICULTY_COLORS[currentQ.difficulty],
              )}
            >
              {DIFFICULTY_LABELS[currentQ.difficulty]}
            </span>
            <span className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[currentQ.category] ?? currentQ.category}
            </span>
            <div className="flex-1" />
            <span className="text-xs font-medium text-amber-400">
              +{totalXp} XP
            </span>
            <span className="text-xs font-medium text-emerald-400">
              +{totalPts} Pts
            </span>
            {doubleActive && (
              <span className="text-xs font-bold text-pink-400 animate-pulse">
                ×2 aktif
              </span>
            )}
          </div>

          {/* Image jika ada */}
          {currentQ.image_url && (
            <div className="mb-4 rounded-2xl overflow-hidden aspect-[2/1] bg-white/5">
              <img
                src={currentQ.image_url}
                alt="Poster"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Soal */}
          <div className="mb-5">
            <p className="text-base font-semibold leading-relaxed">
              {currentQ.question_text}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-2.5 mb-6">
            {OPTION_KEYS.map((key) => (
              <OptionButton
                key={key}
                label={key}
                text={optionTexts[key]}
                selected={selectedAnswer === key}
                correct={answerResult?.correct_option === key}
                revealed={phase === "answered"}
                eliminated={eliminatedOpts.includes(key)}
                onClick={() => phase === "playing" && submitAnswer(key)}
              />
            ))}
          </div>

          {/* Explanation (setelah jawab) */}
          {phase === "answered" && answerResult && (
            <div
              className={cn(
                "p-4 rounded-xl border mb-5",
                answerResult.correct
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : "bg-rose-500/10 border-rose-500/20",
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {answerResult.correct ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
                <span
                  className={cn(
                    "text-sm font-semibold",
                    answerResult.correct ? "text-emerald-300" : "text-rose-300",
                  )}
                >
                  {answerResult.correct ? "Benar!" : "Salah"}
                </span>
                {answerResult.xp_earned > 0 && (
                  <span className="ml-auto text-xs text-amber-400 font-medium">
                    +{answerResult.xp_earned} XP
                  </span>
                )}
              </div>
              {answerResult.explanation && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {answerResult.explanation}
                </p>
              )}
            </div>
          )}

          {/* Powerups (hanya saat playing) */}
          {phase === "playing" && powerups && (
            <div className="flex gap-2 mb-4">
              {(
                [
                  "fifty_fifty",
                  "extra_time",
                  "skip",
                  "double_points",
                ] as PowerupType[]
              ).map((type) => {
                const meta = POWERUP_META[type];
                const pu = powerups[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    disabled={pu.used}
                    onClick={() => {
                      if (type === "fifty_fifty") useFiftyFifty();
                      else if (type === "extra_time") useExtraTime();
                      else if (type === "skip") useSkip();
                      else if (type === "double_points") useDoublePoints();
                    }}
                    title={pu.label}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-xs transition-all",
                      pu.used
                        ? "border-white/5 bg-white/[0.02] text-muted-foreground/30"
                        : `border-white/15 bg-white/[0.04] ${meta.color} hover:bg-white/[0.08]`,
                      type === "double_points" &&
                        doubleActive &&
                        "border-pink-500 bg-pink-500/10",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Auto-next countdown (setelah jawab) */}
          {phase === "answered" && (
            <button
              onClick={nextQuestion}
              className="w-full py-3.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-sm font-semibold text-muted-foreground flex flex-col items-center gap-2 overflow-hidden relative"
            >
              <span className="flex items-center gap-2">
                {currentIdx + 1 >= session.total_questions ? (
                  <>
                    <Trophy className="w-4 h-4" /> Lihat Hasil
                  </>
                ) : (
                  <>
                    Soal Berikutnya <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </span>
              {/* Progress bar auto-next */}
              <div className="w-full h-0.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/50 rounded-full transition-all"
                  style={{
                    width: `${autoNextProgress}%`,
                    transitionDuration: `${AUTO_NEXT_DELAY / 20}ms`,
                    transitionTimingFunction: "linear",
                  }}
                />
              </div>
            </button>
          )}
        </div>
        <NativeBannerAd className="px-4" />
      </>
    );
  }

  // ── Phase: Completed ──────────────────────────────────────────────────────
  if (phase === "completed" && sessionResult) {
    const accuracy = Math.round(
      (sessionResult.correct_count / sessionResult.total_questions) * 100,
    );

    return (
      <>
        <div className="max-w-lg mx-auto px-4 py-8 pb-28 lg:pb-8">
          {/* Result hero */}
          <div className="text-center mb-8">
            <div
              className={cn(
                "w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center",
                sessionResult.is_perfect
                  ? "bg-amber-500/20 border-2 border-amber-500/40"
                  : "bg-primary/10 border border-primary/20",
              )}
            >
              {sessionResult.is_perfect ? (
                <Crown className="w-10 h-10 text-amber-400" />
              ) : (
                <Trophy className="w-10 h-10 text-primary" />
              )}
            </div>
            <h2 className="text-2xl font-bold mb-1">
              {sessionResult.is_perfect ? "Perfect Score! 🎉" : "Sesi Selesai!"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {sessionResult.correct_count} dari {sessionResult.total_questions}{" "}
              jawaban benar
            </p>
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 text-center">
              <div className="text-3xl font-bold text-primary mb-1">
                {accuracy}%
              </div>
              <div className="text-xs text-muted-foreground">Akurasi</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 text-center">
              <div className="text-3xl font-bold text-amber-400 mb-1">
                {sessionResult.score.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Skor</div>
            </div>
          </div>

          {/* Rewards */}
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/15 mb-6">
            <h3 className="text-sm font-semibold mb-3">Reward Didapat</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">
                  XP dari jawaban benar
                </span>
                <span className="font-bold text-amber-400">
                  +{sessionResult.xp_earned - sessionResult.bonus_xp} XP
                </span>
              </div>
              {sessionResult.bonus_xp > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    {sessionResult.is_perfect
                      ? "Perfect score bonus"
                      : "Session bonus"}
                  </span>
                  <span className="font-bold text-amber-400">
                    +{sessionResult.bonus_xp} XP
                  </span>
                </div>
              )}
              <div className="border-t border-white/8 pt-2 flex justify-between items-center">
                <span className="text-sm font-semibold">Total XP</span>
                <span className="text-lg font-bold text-amber-400">
                  +{sessionResult.xp_earned} XP
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Points</span>
                <span className="font-bold text-emerald-400">
                  +{sessionResult.pts_earned} Pts
                </span>
              </div>
              {sessionResult.tickets_earned > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Lucky Ticket</span>
                  <span className="font-bold text-violet-400 flex items-center gap-1">
                    <Ticket className="w-3 h-3" />+
                    {sessionResult.tickets_earned}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            <button
              onClick={() => setPhase("lobby")}
              className="w-full py-3.5 rounded-xl gradient-primary text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Main Lagi
            </button>
            <button
              onClick={loadLeaderboard}
              className="w-full py-3 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
            >
              <Trophy className="w-4 h-4" /> Leaderboard
            </button>
            <Link
              href="/profile"
              className="w-full py-3 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
            >
              <Star className="w-4 h-4" /> Lihat Progression
            </Link>
          </div>
        </div>
        <NativeBannerAd className="px-4" />
      </>
    );
  }

  // ── Phase: Leaderboard ────────────────────────────────────────────────────
  if (phase === "leaderboard") {
    const rankColors = ["text-amber-400", "text-slate-300", "text-amber-700"];
    const rankIcons = [Crown, Medal, Medal];

    return (
      <>
        <div className="max-w-lg mx-auto px-4 py-6 pb-28 lg:pb-8">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setPhase("lobby")}
              className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-bold">Leaderboard Minggu Ini</h2>
              <p className="text-xs text-muted-foreground">
                Global · Reset setiap Senin
              </p>
            </div>
          </div>

          {/* User rank card jika tidak di top 50 */}
          {userRank && !leaderboard.find((e) => e.is_current_user) && (
            <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3">
              <span className="text-sm font-bold text-primary w-8 text-center">
                #{userRank.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Kamu</p>
                <p className="text-xs text-muted-foreground">
                  {userRank.weekly_score.toLocaleString()} poin
                </p>
              </div>
            </div>
          )}

          {leaderboard.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              Belum ada data leaderboard minggu ini.
            </div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, idx) => {
                const RankIcon = idx < 3 ? rankIcons[idx] : null;
                return (
                  <div
                    key={entry.user_id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                      entry.is_current_user
                        ? "bg-primary/10 border-primary/20"
                        : "bg-white/[0.02] border-white/8",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 text-center shrink-0 font-bold text-sm",
                        idx < 3 ? rankColors[idx] : "text-muted-foreground",
                      )}
                    >
                      {RankIcon ? (
                        <RankIcon className="w-4 h-4 mx-auto" />
                      ) : (
                        `#${entry.rank}`
                      )}
                    </div>
                    {entry.avatar_url ? (
                      <img
                        src={entry.avatar_url}
                        alt={entry.display_name}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {entry.display_name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.display_name}
                        {entry.is_current_user ? " (Kamu)" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.sessions_count} sesi · {entry.perfect_count}{" "}
                        perfect
                      </p>
                    </div>
                    <span className="text-sm font-bold text-amber-400 shrink-0">
                      {entry.weekly_score.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <NativeBannerAd className="px-4" />
      </>
    );
  }

  return null;
}
