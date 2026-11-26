/**
 * lib/article-reviews-db.ts — FIXED
 * Fix: join ke profiles tidak bisa via foreign key Supabase JS
 * karena user_id → auth.users, bukan profiles langsung.
 * Solusi: fetch reviews dulu, lalu fetch profiles secara terpisah.
 */

import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArticleReview {
  id: number;
  article_id: number;
  user_id: string;
  spice: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  tagged_movie_ids: number[];
  reply_count: number; // ← BARU
  created_at: string;
  updated_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface ReviewsResult {
  reviews: ArticleReview[];
  total: number;
  userReview: ArticleReview | null;
}

export const SPICE_CONFIG: Record<
  number,
  { label: string; emoji: string; color: string }
> = {
  1: { label: "Santai", emoji: "🧊", color: "text-sky-400" },
  2: { label: "Lumayan", emoji: "😌", color: "text-green-400" },
  3: { label: "Seru", emoji: "🔥", color: "text-amber-400" },
  4: { label: "Intense", emoji: "🌶️", color: "text-orange-500" },
  5: { label: "Gila Banget", emoji: "💥", color: "text-red-500" },
};

// ─── Fetch reviews ────────────────────────────────────────────────────────────

export async function fetchArticleReviews(
  articleId: number,
  userId?: string,
): Promise<ReviewsResult> {
  // 1. Fetch reviews tanpa join
  const { data, error, count } = await supabase
    .from("article_reviews")
    .select(
      "id, article_id, user_id, spice, comment, tagged_movie_ids, reply_count, created_at, updated_at",
      { count: "exact" },
    )
    .eq("article_id", articleId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[article-reviews-db] fetchArticleReviews:", error.message);
    return { reviews: [], total: 0, userReview: null };
  }

  if (!data || data.length === 0) {
    return { reviews: [], total: 0, userReview: null };
  }

  // 2. Ambil semua user_id unik lalu fetch profiles terpisah
  const userIds = [...new Set(data.map((r: any) => r.user_id))];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: any) => [
      p.id,
      { display_name: p.display_name, avatar_url: p.avatar_url },
    ]),
  );

  // 3. Gabungkan
  const reviews: ArticleReview[] = data.map((r: any) => ({
    id: r.id,
    article_id: r.article_id,
    user_id: r.user_id,
    spice: r.spice,
    comment: r.comment ?? null,
    tagged_movie_ids: (r.tagged_movie_ids ?? []).map(Number),
    reply_count: r.reply_count ?? 0, // ← BARU
    created_at: r.created_at,
    updated_at: r.updated_at,
    profile: profileMap.get(r.user_id) ?? {
      display_name: null,
      avatar_url: null,
    },
  }));

  const userReview = userId
    ? (reviews.find((r) => r.user_id === userId) ?? null)
    : null;

  return { reviews, total: count ?? reviews.length, userReview };
}

// ─── Upsert review ────────────────────────────────────────────────────────────

export async function upsertArticleReview(params: {
  articleId: number;
  userId: string;
  spice: number;
  comment: string;
  taggedMovieIds: number[];
}): Promise<{ avgSpice: number; reviewCount: number } | null> {
  const { articleId, userId, spice, comment, taggedMovieIds } = params;

  const { data, error } = await supabase.rpc("upsert_article_review", {
    p_article_id: articleId,
    p_user_id: userId,
    p_spice: spice,
    p_comment: comment || null,
    p_tagged_movie_ids: taggedMovieIds.map(Number), // pastikan integer
  });

  if (error) {
    console.error("[article-reviews-db] upsertArticleReview:", error.message);
    return null;
  }

  const row = data?.[0];
  return row
    ? { avgSpice: Number(row.new_avg), reviewCount: Number(row.new_count) }
    : null;
}

// ─── Delete review ────────────────────────────────────────────────────────────

export async function deleteArticleReview(
  articleId: number,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase.rpc("delete_article_review", {
    p_article_id: articleId,
    p_user_id: userId,
  });

  if (error) {
    console.error("[article-reviews-db] deleteArticleReview:", error.message);
    return false;
  }
  return true;
}
