// types/auth.ts — FILE BARU

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
  role: "user" | "contributor" | "admin";
}

export type MediaType = "movie" | "tv";
export type WatchStatus = "want_to_watch" | "watching" | "watched";

export interface WatchlistItem {
  id: number;
  user_id: string;
  media_type: MediaType;
  movie_id: number | null;
  series_id: number | null;
  tmdb_id: number | null;
  status: WatchStatus;
  remind_when_available: boolean;
  added_at: string;
  updated_at: string;
  // Join data (dari API)
  title?: string;
  poster_path?: string | null;
  vote_average?: number;
  release_date?: string;
}

export interface LikedItem {
  id: number;
  user_id: string;
  media_type: MediaType;
  movie_id: number | null;
  series_id: number | null;
  liked_at: string;
  // Join data
  title?: string;
  poster_path?: string | null;
  vote_average?: number;
}

export interface Collection {
  id: number;
  user_id: string;
  name: string;
  description: string | null;
  cover_movie_id: number | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  item_count?: number;
  cover_poster?: string | null;
  // Koleksi hasil unlock achievement (read-only, tidak bisa edit/hapus)
  is_achievement?: boolean;
  achievement_key?: string | null;
}

export interface CollectionItem {
  id: number;
  collection_id: number;
  media_type: MediaType;
  movie_id: number | null;
  series_id: number | null;
  note: string | null;
  sort_order: number;
  added_at: string;
  // Join data
  title?: string;
  poster_path?: string | null;
}

export interface AuthUser {
  id: string;
  email: string | undefined;
  profile: Profile | null;
}
