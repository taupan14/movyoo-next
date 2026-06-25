/**
 * lib/swipe-db.ts
 *
 * DB layer untuk fitur Swipe Pick.
 * Feed query sepenuhnya dari user_recommendation_pool — zero JOIN ke tabel lain.
 * Semua info display (title, poster, genre, cast, dll) sudah di-embed di kolom
 * `metadata` JSONB oleh background worker saat mengisi pool.
 *
 * Dipanggil oleh:
 *   - GET  /api/swipe-pick        → fetchSwipeFeed() / fetchGuestFeed()
 *   - POST /api/swipe-pick/swipe  → recordSwipe()
 *
 * PENTING: Fungsi yang menulis ke DB (recordSwipe, getPoolCount) menerima
 * `client` (SupabaseClient dengan session user) dari route handler agar
 * RLS berjalan dengan benar. Fungsi read-only (fetchGuestFeed) tetap pakai
 * anon client karena tidak butuh auth context.
 */

import { supabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SwipeAction = "like" | "dislike";
export type MediaType = "movie" | "tv";
export type SwipeBucket =
  | "personal"
  | "adjacent"
  | "wildcard"
  | "trending"
  | "hidden_gem";

/** Struktur JSONB kolom `metadata` yang diisi worker */
export interface PoolMetadata {
  tmdb_id: number | null; // untuk navigasi ke detail page
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_year: string | null;
  overview: string | null; // overview bahasa Indonesia
  overview_en: string | null; // overview bahasa Inggris
  genres: string[]; // maks 2
  cast: string[]; // maks 3
}

/** Shape yang dikirim ke frontend */
export interface SwipeFeedItem {
  pool_id: number;
  media_type: MediaType;
  movie_id?: number;
  series_id?: number;
  bucket: SwipeBucket;
  score: number;
  // — dari metadata —
  tmdb_id: number | null; // untuk navigasi ke /movie/[tmdb_id] atau /tv/[tmdb_id]
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_year: string | null;
  overview: string | null; // overview bahasa Indonesia (null jika belum tersedia)
  overview_en: string | null; // overview bahasa Inggris
  genres: string[];
  cast: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mapping baris pool → SwipeFeedItem. Tidak ada join, metadata sudah inline. */
function rowToFeedItem(row: any): SwipeFeedItem {
  const meta: PoolMetadata = row.metadata ?? {};
  // console.log("rowToFeedItem()", meta);
  return {
    pool_id: Number(row.id),
    media_type: row.media_type as MediaType,
    movie_id: row.movie_id ?? undefined,
    series_id: row.series_id ?? undefined,
    bucket: (row.bucket ?? "trending") as SwipeBucket,
    score: Number(row.score ?? 0),
    // — dari metadata —
    tmdb_id: meta.tmdb_id ?? null,
    title: meta.title ?? "",
    poster_path: meta.poster_path ?? null,
    backdrop_path: meta.backdrop_path ?? null,
    vote_average: meta.vote_average ?? 0,
    release_year: meta.release_year ?? null,
    overview: meta.overview ?? null, // bahasa Indonesia
    overview_en: meta.overview_en ?? null, // bahasa Inggris
    genres: meta.genres ?? [],
    cast: meta.cast ?? [],
  };
}

// ─── SELECT columns (sama untuk semua query) ──────────────────────────────────

const POOL_COLS =
  "id, media_type, movie_id, series_id, bucket, score, metadata";

// ─── 1. FETCH FEED — LOGGED-IN USER ──────────────────────────────────────────

/**
 * Ambil N item dari pool user yang belum served, urut score DESC.
 * Menerima authenticated client agar RLS bisa memfilter by user.
 */
export async function fetchSwipeFeed(
  client: SupabaseClient,
  userId: string,
  limit = 10,
): Promise<SwipeFeedItem[]> {
  const { data, error } = await client
    .from("user_recommendation_pool")
    .select(POOL_COLS)
    .eq("user_id", userId)
    .eq("user_type", "user")
    .eq("served", false)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[swipe-db] fetchSwipeFeed:", error.message);
    return [];
  }

  return (data ?? []).map(rowToFeedItem);
}

// ─── 2. FETCH FEED — GUEST ────────────────────────────────────────────────────

/**
 * Ambil N item dari shared guest pool.
 * Pakai anon client — tidak butuh auth context.
 */
export async function fetchGuestFeed(limit = 10): Promise<SwipeFeedItem[]> {
  const { count } = await supabase
    .from("user_recommendation_pool")
    .select("id", { count: "exact", head: true })
    .eq("user_type", "guest");

  const total = count ?? 0;
  const maxOffset = Math.max(0, total - limit);
  const offset = total > limit ? Math.floor(Math.random() * maxOffset) : 0;

  const { data, error } = await supabase
    .from("user_recommendation_pool")
    .select(POOL_COLS)
    .eq("user_type", "guest")
    .order("score", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[swipe-db] fetchGuestFeed:", error.message);
    return [];
  }

  const items = (data ?? []).map(rowToFeedItem);
  return items.sort(() => Math.random() - 0.5);
}

// ─── 3. GET POOL COUNT ────────────────────────────────────────────────────────

export async function getPoolCount(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await client
    .from("user_recommendation_pool")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("user_type", "user")
    .eq("served", false);

  return count ?? 0;
}

// ─── 4. RECORD SWIPE ──────────────────────────────────────────────────────────

export interface RecordSwipeParams {
  client: SupabaseClient; // authenticated server client dari route handler
  userId: string;
  mediaType: MediaType;
  movieId?: number;
  seriesId?: number;
  action: SwipeAction;
  poolId?: number;
}

export interface RecordSwipeResult {
  success: boolean;
  isLiked: boolean;
  poolLow: boolean;
}

/**
 * Rekam swipe user:
 *   1. Insert user_swipes (update jika duplicate)
 *   2. Jika like → insert user_liked (ignore jika duplicate)
 *   3. Mark pool row served = true
 *   4. Update user_preferences (genre + cast + language scores)
 *   5. Cek sisa pool → return poolLow flag
 */
export async function recordSwipe(
  params: RecordSwipeParams,
): Promise<RecordSwipeResult> {
  const { client, userId, mediaType, movieId, seriesId, action, poolId } =
    params;
  const isLiked = action === "like";

  // ── 4a. Insert user_swipes ────────────────────────────────────────────
  // Supabase JS tidak support onConflict pada partial index (WHERE clause),
  // pakai insert biasa. Jika duplicate (23505) → update action saja.
  const swipeRow = {
    user_id: userId,
    media_type: mediaType,
    movie_id: movieId ?? null,
    series_id: seriesId ?? null,
    action,
    swiped_at: new Date().toISOString(),
  };

  const { error: swipeError } = await client
    .from("user_swipes")
    .insert(swipeRow);

  if (swipeError) {
    if (swipeError.code === "23505") {
      // Duplicate — update action saja
      const updateQuery = movieId
        ? client
            .from("user_swipes")
            .update({ action, swiped_at: swipeRow.swiped_at })
            .eq("user_id", userId)
            .eq("movie_id", movieId)
        : client
            .from("user_swipes")
            .update({ action, swiped_at: swipeRow.swiped_at })
            .eq("user_id", userId)
            .eq("series_id", seriesId!);

      const { error: updateError } = await updateQuery;
      if (updateError) {
        console.error(
          "[swipe-db] recordSwipe — user_swipes update:",
          updateError.message,
        );
        return { success: false, isLiked, poolLow: false };
      }
    } else {
      console.error(
        "[swipe-db] recordSwipe — user_swipes:",
        swipeError.message,
      );
      return { success: false, isLiked, poolLow: false };
    }
  }

  // ── 4b. Insert user_liked jika like ────────────────────────────────────
  if (isLiked) {
    const { error: likedError } = await client.from("user_liked").insert({
      user_id: userId,
      media_type: mediaType,
      movie_id: movieId ?? null,
      series_id: seriesId ?? null,
      liked_at: new Date().toISOString(),
    });

    if (likedError && likedError.code !== "23505") {
      // Non-fatal
      console.error("[swipe-db] recordSwipe — user_liked:", likedError.message);
    }
  }

  // ── 4c. Mark pool row served ───────────────────────────────────────────
  if (poolId && poolId > 0) {
    await client
      .from("user_recommendation_pool")
      .update({ served: true })
      .eq("id", poolId)
      .eq("user_type", "user");
  }

  // ── 4d. Update user_preferences (async, non-blocking) ─────────────────
  // Pakai client yang sama agar RLS terpenuhi
  updatePreferences({
    client,
    userId,
    mediaType,
    movieId,
    seriesId,
    action,
  }).catch((err) => console.error("[swipe-db] updatePreferences:", err));

  // ── 4e. Cek sisa pool ──────────────────────────────────────────────────
  const remaining = await getPoolCount(client, userId);
  const poolLow = remaining < 50;

  if (poolLow) {
    client
      .from("recommendation_jobs")
      .insert({ user_id: userId, trigger_reason: "pool_low" })
      .then(({ error }) => {
        if (error && !error.message.includes("unique")) {
          console.error("[swipe-db] enqueue pool_low job:", error.message);
        }
      });
  }

  return { success: true, isLiked, poolLow };
}

// ─── 5. UPDATE PREFERENCES ────────────────────────────────────────────────────

const SCORE_DELTA: Record<SwipeAction, number> = {
  like: 3,
  dislike: -2,
};

type ScoreMap = Record<string, number>;

function applyDelta(map: ScoreMap, keys: string[], delta: number): ScoreMap {
  const result = { ...map };
  for (const key of keys) {
    const current = result[key] ?? 0;
    result[key] = Math.min(20, Math.max(-10, current + delta));
  }
  return result;
}

async function updatePreferences(params: {
  client: SupabaseClient;
  userId: string;
  mediaType: MediaType;
  movieId?: number;
  seriesId?: number;
  action: SwipeAction;
}): Promise<void> {
  const { client, userId, mediaType, movieId, seriesId, action } = params;
  const delta = SCORE_DELTA[action];

  let genreKeys: string[] = [];
  let castKeys: string[] = [];
  let languageKeys: string[] = [];

  if (mediaType === "movie" && movieId) {
    const [genreRes, castRes, movieRes] = await Promise.allSettled([
      client
        .from("movie_genres")
        .select("genres(tmdb_genre_id)")
        .eq("movie_id", movieId),
      client
        .from("movie_cast")
        .select("person_id")
        .eq("movie_id", movieId)
        .order("cast_order")
        .limit(5),
      client
        .from("movies")
        .select("original_language")
        .eq("id", movieId)
        .single(),
    ]);

    if (genreRes.status === "fulfilled")
      genreKeys = ((genreRes.value as any).data ?? [])
        .map((r: any) => String(r.genres?.tmdb_genre_id))
        .filter(Boolean);

    if (castRes.status === "fulfilled")
      castKeys = ((castRes.value as any).data ?? [])
        .map((r: any) => String(r.person_id))
        .filter(Boolean);

    if (movieRes.status === "fulfilled") {
      const lang = (movieRes.value as any).data?.original_language;
      if (lang) languageKeys = [lang];
    }
  }

  if (mediaType === "tv" && seriesId) {
    const [genreRes, castRes, seriesRes] = await Promise.allSettled([
      client
        .from("tv_genres")
        .select("genres(tmdb_genre_id)")
        .eq("series_id", seriesId),
      client
        .from("tv_cast")
        .select("person_id")
        .eq("series_id", seriesId)
        .order("cast_order")
        .limit(5),
      client
        .from("tv_series")
        .select("original_language")
        .eq("id", seriesId)
        .single(),
    ]);

    if (genreRes.status === "fulfilled")
      genreKeys = ((genreRes.value as any).data ?? [])
        .map((r: any) => String(r.genres?.tmdb_genre_id))
        .filter(Boolean);

    if (castRes.status === "fulfilled")
      castKeys = ((castRes.value as any).data ?? [])
        .map((r: any) => String(r.person_id))
        .filter(Boolean);

    if (seriesRes.status === "fulfilled") {
      const lang = (seriesRes.value as any).data?.original_language;
      if (lang) languageKeys = [lang];
    }
  }

  const { data: prefRow } = await client
    .from("user_preferences")
    .select("genre_scores, cast_scores, language_scores, total_swipes")
    .eq("user_id", userId)
    .single();

  // const current = prefRow ?? {};
  const current = (prefRow ?? {}) as {
    genre_scores?: Record<string, number>;
    cast_scores?: Record<string, number>;
    language_scores?: Record<string, number>;
    total_swipes?: number;
  };

  await client.from("user_preferences").upsert(
    {
      user_id: userId,
      genre_scores: applyDelta(current.genre_scores ?? {}, genreKeys, delta),
      cast_scores: applyDelta(current.cast_scores ?? {}, castKeys, delta),
      language_scores: applyDelta(
        current.language_scores ?? {},
        languageKeys,
        delta,
      ),
      total_swipes: (current.total_swipes ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
