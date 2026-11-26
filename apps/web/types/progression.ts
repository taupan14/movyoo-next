// types/progression.ts

export type CurrencyType = "xp" | "points" | "tickets";
export type ChallengeFeature = "swipe" | "battle" | "trivia";
export type ChallengeType = "daily" | "weekly";
export type AchievementCategory =
  | "genre"
  | "director"
  | "activity"
  | "collection"
  | "social"
  | "secret";

export type XpSource =
  | "swipe_like"
  | "swipe_session_complete"
  | "watchlist_add"
  | "movie_rate"
  | "movie_review"
  | "daily_challenge"
  | "weekly_challenge"
  | "battle_win"
  | "trivia_correct"
  | "trivia_session_complete"
  | "achievement_unlock"
  | "friend_challenge_win"
  | "collection_complete"
  | "admin_grant";

// ─── Database row types ────────────────────────────────────────────────────────

export interface UserProgression {
  id: string;
  user_id: string;
  level: number;
  xp: number;
  total_xp: number;
  points: number;
  total_points_earned: number;
  lucky_tickets: number;
  updated_at: string;
}

export interface XpTransaction {
  id: number;
  user_id: string;
  amount: number;
  currency: CurrencyType;
  source: XpSource;
  ref_id: number | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface LevelThreshold {
  level: number;
  xp_required: number;
  rank_name: string;
  unlock_key: string | null;
}

export interface Achievement {
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  is_secret: boolean;
  icon: string | null;
  xp_reward: number;
  pts_reward: number;
  target: number;
  criteria: Record<string, unknown> | null;
  sort_order: number;
}

export interface UserAchievement {
  id: number;
  user_id: string;
  achievement_key: string;
  progress: number;
  unlocked_at: string | null;
  xp_rewarded: boolean;
  pts_rewarded: boolean;
}

export interface Challenge {
  id: number;
  type: ChallengeType;
  feature: ChallengeFeature;
  tier: number; // 1–5, tier 5 termudah / muncul pertama
  title: string;
  description: string;
  action: XpSource;
  target_count: number;
  xp_reward: number;
  pts_reward: number;
  ticket_reward: number;
  is_active: boolean;
  sort_order: number;
  condition: ChallengeCondition | null;
}

// Tipe-tipe condition yang didukung
export type ChallengeCondition =
  | { type: "genre"; genre_ids: number[] }
  | { type: "hidden_gem"; vote_avg_min: number; vote_count_max: number }
  | { type: "release_before"; year: number }
  | { type: "genre_variety"; min_genres: number; count: number };

export interface UserChallenge {
  id: number;
  user_id: string;
  challenge_id: number;
  period_start: string;
  progress: number;
  completed_at: string | null;
  rewarded_at: string | null;
}

// ─── API response types ────────────────────────────────────────────────────────

export interface StreakBonus {
  streak_days: number;
  pts_bonus: number;
  xp_bonus: number;
}

export interface StreakResult {
  current_streak: number;
  streak_bonus: StreakBonus[];
}

export interface AwardResult {
  tx_id: number | null;
  leveled_up: boolean;
  old_level: number;
  new_level: number;
  unlocks: string[];
  total_xp: number;
  points: number;
  tickets: number;
  // Field dari award_currency_with_cap
  points_awarded: number; // jumlah points aktual yang diberikan (setelah cap)
  points_capped: boolean; // true jika dipotong karena daily cap
}

export interface CompletedChallenge {
  challenge_id: number;
  uc_id: number;
  title: string;
  type: ChallengeType;
  xp_reward: number;
  pts_reward: number;
  ticket_reward: number;
}

export interface AchievementProgress {
  unlocked: boolean;
  already_unlocked?: boolean;
  key: string;
  name: string;
  xp_reward: number;
  pts_reward: number;
  progress: number;
  target: number;
}

// ─── Media context ────────────────────────────────────────────────────────────
// Digunakan untuk membedakan movie vs TV series di seluruh sistem progression.

export type MediaType = "movie" | "tv";

// Standar struktur meta yang dikirim dari frontend ke API route.
// Semua field opsional — isi sesuai konteks aksi.
export interface AwardMeta {
  media_type?: MediaType;
  movie_id?: number;
  series_id?: number;
  genre_ids?: number[]; // TMDB genre ids — untuk genre achievement + challenge condition
  tmdb_id?: number;
  // Untuk hidden_gem condition
  vote_avg?: number;
  vote_count?: number;
  // Untuk release_before condition
  release_year?: number;
  // Extra fields
  [key: string]: unknown;
}

// ─── API request bodies ────────────────────────────────────────────────────────

export interface AwardRequestBody {
  source: XpSource;
  // ref_id: ID utama dari entitas yang di-act (movie_id atau series_id)
  // Tidak wajib — beberapa aksi (battle, trivia) tidak punya ref media spesifik
  ref_id?: number;
  meta?: AwardMeta;
}

// ─── Enriched types untuk UI ───────────────────────────────────────────────────

export interface ProgressionWithLevel extends UserProgression {
  rank_name: string;
  xp_for_current_level: number; // XP threshold level saat ini
  xp_for_next_level: number; // XP threshold level berikutnya (0 jika max)
  xp_progress: number; // XP yang sudah dikumpulkan dalam level ini
  xp_needed: number; // Sisa XP untuk level berikutnya
  progress_percent: number; // 0–100 untuk progress bar
  is_max_level: boolean;
}

export interface ChallengeWithProgress extends Challenge {
  user_challenge: UserChallenge | null;
  period_start: string;
  progress: number;
  is_completed: boolean;
  is_claimed: boolean;
}

// Response dari get_active_challenges DB function
export interface ActiveChallengesResponse {
  challenges: ChallengeWithProgress[];
  period_start: string;
}

// Grouped per feature untuk UI
export interface ChallengesByFeature {
  swipe: ChallengeWithProgress[];
  battle: ChallengeWithProgress[];
  trivia: ChallengeWithProgress[];
}

// Context yang dikirim ke award() untuk evaluasi condition challenge
export interface SwipeAwardContext {
  media_type: MediaType;
  movie_id?: number;
  series_id?: number;
  genre_ids?: number[]; // TMDB genre ids
  vote_avg?: number; // untuk hidden_gem condition
  vote_count?: number; // untuk hidden_gem condition
  release_year?: number; // untuk release_before condition
  genre_variety_keys?: string; // untuk genre_variety — dihandle di app layer
}

export interface AchievementWithProgress extends Achievement {
  user_achievement: UserAchievement | null;
  progress: number;
  is_unlocked: boolean;
  // Secret achievement: sembunyikan name/description sampai unlock
  display_name: string;
  display_description: string;
}
