// types/trivia.ts

export type TriviaMode = "daily" | "practice" | "category";
export type TriviaDifficulty = "easy" | "medium" | "hard";
export type TriviaCategory =
  | "general"
  | "director"
  | "actor"
  | "rating"
  | "popularity"
  | "synopsis"
  | "year"
  | "genre"
  | "franchise"
  | "awards";
export type AnswerOption = "A" | "B" | "C" | "D";
export type PowerupType =
  | "fifty_fifty"
  | "extra_time"
  | "skip"
  | "double_points";

// ─── Question ─────────────────────────────────────────────────────────────────
// Frontend tidak pernah menerima correct_option sebelum menjawab
export interface TriviaQuestion {
  id: number;
  type: string;
  difficulty: TriviaDifficulty;
  category: TriviaCategory;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  image_url: string | null;
  movie_id: number | null;
  tmdb_id: number | null;
}

// ─── Session ──────────────────────────────────────────────────────────────────
export interface TriviaSession {
  session_id: string;
  mode: TriviaMode;
  difficulty: TriviaDifficulty | null;
  category: TriviaCategory | null;
  total_questions: number;
  current_index: number;
  is_daily: boolean;
  resumed: boolean;
  questions: TriviaQuestion[];
}

// ─── Answer result ────────────────────────────────────────────────────────────
export interface AnswerResult {
  correct: boolean;
  correct_option: AnswerOption;
  explanation: string | null;
  xp_earned: number;
  pts_earned: number;
  score_delta: number;
}

// ─── Session result (complete) ────────────────────────────────────────────────
export interface SessionResult {
  success: boolean;
  correct_count: number;
  total_questions: number;
  score: number;
  is_perfect: boolean;
  xp_earned: number;
  pts_earned: number;
  tickets_earned: number;
  bonus_xp: number;
  bonus_pts: number;
}

// ─── Powerups ─────────────────────────────────────────────────────────────────
export interface PowerupStatus {
  used: boolean;
  label: string;
  description: string;
}

export interface PowerupsState {
  date: string;
  fifty_fifty: PowerupStatus;
  extra_time: PowerupStatus;
  skip: PowerupStatus;
  double_points: PowerupStatus;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  weekly_score: number;
  sessions_count: number;
  perfect_count: number;
  is_current_user: boolean;
}

export interface LeaderboardResponse {
  week_start: string;
  entries: LeaderboardEntry[];
  user_rank: LeaderboardEntry | null;
}

// ─── Daily status ─────────────────────────────────────────────────────────────
export interface DailyTriviaStatus {
  completed: boolean;
  started: boolean;
  session_id: string | null;
  score?: number;
  correct_count?: number;
  total_questions?: number;
  xp_earned?: number;
  pts_earned?: number;
  tickets_earned?: number;
  started_at?: string;
  completed_at?: string;
  next_reset_at: string;
}

// ─── UI state ─────────────────────────────────────────────────────────────────
export type QuizPhase =
  | "lobby" // pilih mode/difficulty/category
  | "loading" // fetch soal
  | "playing" // sedang menjawab soal
  | "answered" // sudah jawab, tampilkan result + explanation
  | "completed" // semua soal selesai, tampilkan result screen
  | "leaderboard"; // tampilkan leaderboard

export interface ActiveQuestion extends TriviaQuestion {
  index: number;
  time_remaining: number; // detik tersisa
  eliminated_options: AnswerOption[]; // untuk 50:50
  selected_answer: AnswerOption | null;
  answer_result: AnswerResult | null;
}

export interface QuizState {
  phase: QuizPhase;
  session: TriviaSession | null;
  active_question: ActiveQuestion | null;
  session_result: SessionResult | null;
  powerups: PowerupsState | null;
  total_xp_earned: number;
  total_pts_earned: number;
  error: string | null;
}
