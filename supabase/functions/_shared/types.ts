// supabase/functions/_shared/types.ts
// Shared types untuk semua edge functions Swipe Pick worker.

export type MediaType = "movie" | "tv";
export type SwipeBucket =
  | "personal"
  | "adjacent"
  | "wildcard"
  | "trending"
  | "hidden_gem";

export interface PoolMetadata {
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_year: string | null;
  overview: string;
  genres: string[]; // maks 2
  cast: string[]; // maks 3
}

export interface PoolInsertRow {
  user_id: string | null; // null = guest pool
  user_type: "user" | "guest";
  media_type: MediaType;
  movie_id: number | null;
  series_id: number | null;
  score: number;
  bucket: SwipeBucket;
  served: boolean;
  metadata: PoolMetadata;
}

export interface ScoreMap {
  [key: string]: number;
}

export interface UserPreference {
  user_id: string;
  genre_scores: ScoreMap;
  cast_scores: ScoreMap;
  language_scores: ScoreMap;
  total_swipes: number;
}
