// types/contributor.ts — UPDATED
// Tambahan: MediaSearchResult, ArticleMediaLink, field `media` di form & artikel

export type UserRole = "user" | "contributor" | "admin";

export type ContributorRequestStatus = "pending" | "approved" | "rejected";

export interface ContributorRequest {
  id: number;
  user_id: string;
  status: ContributorRequestStatus;
  reason: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export type NotificationType =
  | "contributor_approved"
  | "contributor_rejected"
  | "article_published"
  | "generic";

export interface AppNotification {
  id: number;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export type ArticleStatus = "draft" | "published";
export type TopicType =
  | "genre"
  | "actor"
  | "director"
  | "studio"
  | "platform"
  | "custom";

export interface ContributorArticle {
  id: number;
  slug: string;
  title: string;
  title_en: string | null;
  excerpt: string | null;
  body: string | null;
  cover_path: string | null;
  lang: "id" | "en";
  status: ArticleStatus;
  source: string;
  meta_title: string | null;
  meta_desc: string | null;
  topic_type: TopicType | null;
  topic_value: string | null;
  view_count: number;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  media?: ArticleMediaLink[]; // ← tambahan: film/series yang ditautkan
}

// ── Movie/TV search & linking ────────────────────────────────────────────────

export interface MediaSearchResult {
  id: number; // id lokal di tabel movies / tv_series
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null; // release_date (movie) atau first_air_date (tv)
  media_type: "movie" | "tv";
}

export interface ArticleMediaLink {
  media_type: "movie" | "tv";
  id: number; // movie_id atau tv_id
  title: string;
  poster_path: string | null;
  release_date: string | null;
  note?: string;
  sort_order: number;
}

// ── Form payload ──────────────────────────────────────────────────────────────

export interface ArticleFormInput {
  title: string;
  title_en?: string;
  excerpt?: string;
  body: string;
  cover_path?: string | null;
  lang: "id" | "en";
  topic_type?: TopicType | "";
  topic_value?: string;
  meta_title?: string;
  meta_desc?: string;
  status: ArticleStatus;
  media?: ArticleMediaLink[]; // ← tambahan
}
