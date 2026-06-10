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
 */

import { supabase } from "./supabase";

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
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_year: string | null;
  overview: string;
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
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_year: string | null;
  overview: string;
  genres: string[];
  cast: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mapping baris pool → SwipeFeedItem. Tidak ada join, metadata sudah inline. */
function rowToFeedItem(row: any): SwipeFeedItem {
  const meta: PoolMetadata = row.metadata ?? {};
  return {
    pool_id: Number(row.id),
    media_type: row.media_type as MediaType,
    movie_id: row.movie_id ?? undefined,
    series_id: row.series_id ?? undefined,
    bucket: (row.bucket ?? "trending") as SwipeBucket,
    score: Number(row.score ?? 0),
    title: meta.title ?? "",
    poster_path: meta.poster_path ?? null,
    backdrop_path: meta.backdrop_path ?? null,
    vote_average: meta.vote_average ?? 0,
    release_year: meta.release_year ?? null,
    overview: meta.overview ?? "",
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
 * Single query — tidak ada join.
 */
export async function fetchSwipeFeed(
  userId: string,
  limit = 10,
): Promise<SwipeFeedItem[]> {
  const { data, error } = await supabase
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
 * Guest pool di-refresh harian oleh worker — berisi 50 item
 * (25 movie + 25 TV) dari berbagai bucket/kategori.
 *
 * `served` tidak di-track untuk guest karena tidak ada session —
 * kita gunakan offset random sederhana agar tiap sesi terasa segar.
 */
export async function fetchGuestFeed(limit = 10): Promise<SwipeFeedItem[]> {
  // Hitung total guest pool dulu untuk random offset
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

  // Shuffle agar urutan tidak selalu sama
  const items = (data ?? []).map(rowToFeedItem);
  return items.sort(() => Math.random() - 0.5);
}

// ─── 3. GET POOL COUNT ────────────────────────────────────────────────────────

export async function getPoolCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("user_recommendation_pool")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("user_type", "user")
    .eq("served", false);

  return count ?? 0;
}

// ─── 4. RECORD SWIPE ──────────────────────────────────────────────────────────

export interface RecordSwipeParams {
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
 *   1. Upsert user_swipes
 *   2. Jika like → upsert user_liked
 *   3. Mark pool row served = true
 *   4. Update user_preferences (genre + cast + language scores)
 *   5. Cek sisa pool → return poolLow flag
 */
export async function recordSwipe(
  params: RecordSwipeParams,
): Promise<RecordSwipeResult> {
  const { userId, mediaType, movieId, seriesId, action, poolId } = params;
  const isLiked = action === "like";

  // ── 4a. Upsert user_swipes ─────────────────────────────────────────────
  const { error: swipeError } = await supabase.from("user_swipes").upsert(
    {
      user_id: userId,
      media_type: mediaType,
      movie_id: movieId ?? null,
      series_id: seriesId ?? null,
      action,
      swiped_at: new Date().toISOString(),
    },
    { onConflict: movieId ? "user_id,movie_id" : "user_id,series_id" },
  );

  if (swipeError) {
    console.error("[swipe-db] recordSwipe — user_swipes:", swipeError.message);
    return { success: false, isLiked, poolLow: false };
  }

  // ── 4b. Upsert user_liked jika like ────────────────────────────────────
  if (isLiked) {
    const { error: likedError } = await supabase.from("user_liked").upsert(
      {
        user_id: userId,
        media_type: mediaType,
        movie_id: movieId ?? null,
        series_id: seriesId ?? null,
        liked_at: new Date().toISOString(),
      },
      {
        onConflict: movieId ? "user_id,movie_id" : "user_id,series_id",
        ignoreDuplicates: true,
      },
    );

    if (likedError) {
      // Non-fatal — swipe sudah tersimpan
      console.error("[swipe-db] recordSwipe — user_liked:", likedError.message);
    }
  }

  // ── 4c. Mark pool row served ───────────────────────────────────────────
  if (poolId && poolId > 0) {
    await supabase
      .from("user_recommendation_pool")
      .update({ served: true })
      .eq("id", poolId)
      .eq("user_type", "user"); // jangan sentuh guest pool
  }

  // ── 4d. Update user_preferences (async, non-blocking) ─────────────────
  updatePreferences({ userId, mediaType, movieId, seriesId, action }).catch(
    (err) => console.error("[swipe-db] updatePreferences:", err),
  );

  // ── 4e. Cek sisa pool ──────────────────────────────────────────────────
  const remaining = await getPoolCount(userId);
  const poolLow = remaining < 50;

  // Enqueue recommendation job jika pool sudah menipis
  if (poolLow) {
    supabase
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
  userId: string;
  mediaType: MediaType;
  movieId?: number;
  seriesId?: number;
  action: SwipeAction;
}): Promise<void> {
  const { userId, mediaType, movieId, seriesId, action } = params;
  const delta = SCORE_DELTA[action];

  // Ambil genre_ids, cast person_ids, dan language dari film/series yang di-swipe
  let genreKeys: string[] = [];
  let castKeys: string[] = [];
  let languageKeys: string[] = [];

  if (mediaType === "movie" && movieId) {
    const [genreRes, castRes, movieRes] = await Promise.allSettled([
      supabase
        .from("movie_genres")
        .select("genres(tmdb_genre_id)")
        .eq("movie_id", movieId),
      supabase
        .from("movie_cast")
        .select("person_id")
        .eq("movie_id", movieId)
        .order("cast_order")
        .limit(5),
      supabase
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
      supabase
        .from("tv_genres")
        .select("genres(tmdb_genre_id)")
        .eq("series_id", seriesId),
      supabase
        .from("tv_cast")
        .select("person_id")
        .eq("series_id", seriesId)
        .order("cast_order")
        .limit(5),
      supabase
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

  // Fetch preference row yang ada, atau buat baru
  const { data: prefRow } = await supabase
    .from("user_preferences")
    .select("genre_scores, cast_scores, language_scores, total_swipes")
    .eq("user_id", userId)
    .single();

  const current = prefRow ?? {};

  await supabase.from("user_preferences").upsert(
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
