// supabase/functions/generate-user-pool/index.ts
//
// Worker: Generate personal recommendation pool untuk satu user.
// Dipanggil oleh process-reco-jobs — tidak dipanggil langsung.
//
// Hybrid scoring:
//   70% Personal Match  → kandidat dari genre/cast/language yang disukai
//   20% Adjacent        → genre adjacent dari preferensi user
//   10% Wildcard        → film berkualitas acak di luar preferensi
//
// Alur:
//   1. Ambil user_preferences + riwayat swipe (exclude list)
//   2. Build candidate pool per bucket (~500 kandidat)
//   3. Hitung score gabungan (preference score + popularity + vote)
//   4. Simpan top 100 ke user_recommendation_pool

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMetadata } from "../_shared/metadata.ts";
import {
  PoolInsertRow,
  ScoreMap,
  UserPreference,
  MediaType,
  SwipeBucket,
} from "../_shared/types.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Config ───────────────────────────────────────────────────────────────────

const CANDIDATE_LIMIT = 500;
const TOP_N = 100;
const MIN_VOTE_AVERAGE = 6.0;

// Adjacent genre mapping — jika user suka genre X, rekomendasikan genre Y
const ADJACENT_GENRE_MAP: Record<number, number[]> = {
  878: [9648, 53, 10765, 27], // Sci-Fi     → Mystery, Thriller, Sci-Fi&Fantasy, Horror
  28: [12, 53, 80, 10752], // Action     → Adventure, Thriller, Crime, War
  35: [10749, 18, 16, 10402], // Comedy     → Romance, Drama, Animation, Music
  18: [9648, 10749, 36, 10402], // Drama      → Mystery, Romance, History, Music
  27: [9648, 53, 878, 80], // Horror     → Mystery, Thriller, Sci-Fi, Crime
  80: [53, 18, 9648, 28], // Crime      → Thriller, Drama, Mystery, Action
  53: [80, 27, 9648, 878], // Thriller   → Crime, Horror, Mystery, Sci-Fi
  16: [35, 10751, 12, 14], // Animation  → Comedy, Family, Adventure, Fantasy
  14: [12, 878, 16, 10751], // Fantasy    → Adventure, Sci-Fi, Animation, Family
  10749: [18, 35, 10402, 16], // Romance    → Drama, Comedy, Music, Animation
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Top N keys dari ScoreMap, filter score negatif */
function topKeys(map: ScoreMap, n: number): string[] {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k]) => k);
}

/**
 * Hitung score kandidat berdasarkan preference user.
 * Kombinasi: preference score (dari JSONB) + normalized popularity + vote_average.
 */
function computeScore(
  genreIds: number[], // tmdb_genre_id film
  castIds: number[], // person_id cast film
  language: string,
  pref: UserPreference,
): number {
  let score = 0;

  // Genre contribution
  for (const gid of genreIds) {
    score += pref.genre_scores[String(gid)] ?? 0;
  }

  // Cast contribution
  for (const cid of castIds) {
    score += (pref.cast_scores[String(cid)] ?? 0) * 0.5; // bobot lebih kecil
  }

  // Language contribution
  score += (pref.language_scores[language] ?? 0) * 0.3;

  return score;
}

// ─── Fetch exclude list ────────────────────────────────────────────────────────

async function fetchExcludeIds(userId: string): Promise<{
  movieIds: Set<number>;
  seriesIds: Set<number>;
}> {
  // Gabung dari user_swipes + user_liked + pool yang belum served
  const [swipeRes, likedRes, poolRes] = await Promise.allSettled([
    supabase
      .from("user_swipes")
      .select("movie_id, series_id")
      .eq("user_id", userId),
    supabase
      .from("user_liked")
      .select("movie_id, series_id")
      .eq("user_id", userId),
    supabase
      .from("user_recommendation_pool")
      .select("movie_id, series_id")
      .eq("user_id", userId)
      .eq("user_type", "user")
      .eq("served", false),
  ]);

  const movieIds = new Set<number>();
  const seriesIds = new Set<number>();

  for (const res of [swipeRes, likedRes, poolRes]) {
    if (res.status !== "fulfilled") continue;
    for (const row of (res.value as any).data ?? []) {
      if (row.movie_id) movieIds.add(Number(row.movie_id));
      if (row.series_id) seriesIds.add(Number(row.series_id));
    }
  }

  return { movieIds, seriesIds };
}

// ─── Fetch candidates per bucket ──────────────────────────────────────────────

interface CandidateMovie {
  id: number;
  title: string;
  original_title: string;
  original_language: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string | null;
  overview: string;
  popularity: number;
  genre_ids: number[]; // tmdb_genre_id[]
  cast_ids: number[]; // person_id[]
}

interface CandidateSeries {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date: string | null;
  overview: string;
  popularity: number;
  original_language: string;
  genre_ids: number[];
  cast_ids: number[];
}

async function fetchPersonalMovies(
  topGenreIds: number[],
  excludeIds: Set<number>,
  limit: number,
): Promise<CandidateMovie[]> {
  if (!topGenreIds.length) return [];

  // Ambil internal genre id dari tmdb_genre_id
  const { data: genreRows } = await supabase
    .from("genres")
    .select("id, tmdb_genre_id")
    .in("tmdb_genre_id", topGenreIds);

  const internalIds = (genreRows ?? []).map((r: any) => r.id);
  if (!internalIds.length) return [];

  // Ambil movie_ids yang match genre (OR — cukup ada salah satu genre)
  const { data: mgRows } = await supabase
    .from("movie_genres")
    .select("movie_id")
    .in("genre_id", internalIds)
    .limit(2000);

  const candidateIds = [
    ...new Set((mgRows ?? []).map((r: any) => Number(r.movie_id))),
  ].filter((id) => !excludeIds.has(id));

  if (!candidateIds.length) return [];

  const { data: movies } = await supabase
    .from("movies")
    .select(
      `
      id, title, original_title, original_language,
      poster_path, backdrop_path, vote_average,
      release_date, overview_en, overview, popularity,
      movie_genres(genres(tmdb_genre_id)),
      movie_cast(person_id, cast_order)
    `,
    )
    .in("id", candidateIds.slice(0, 500))
    .gte("vote_average", MIN_VOTE_AVERAGE)
    .not("poster_path", "is", null)
    .gt("tmdb_id", 0)
    .order("popularity", { ascending: false })
    .limit(limit);

  return (movies ?? []).map((m: any) => ({
    id: m.id,
    title: m.original_language === "id" ? m.original_title || m.title : m.title,
    original_title: m.original_title,
    original_language: m.original_language,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average),
    release_date: m.release_date,
    overview: m.overview_en || m.overview || "",
    popularity: Number(m.popularity),
    genre_ids: (m.movie_genres ?? [])
      .map((mg: any) => Number(mg.genres?.tmdb_genre_id))
      .filter(Boolean),
    cast_ids: (m.movie_cast ?? [])
      .sort((a: any, b: any) => (a.cast_order ?? 99) - (b.cast_order ?? 99))
      .map((c: any) => Number(c.person_id))
      .filter(Boolean)
      .slice(0, 10),
  }));
}

async function fetchPersonalTV(
  topGenreIds: number[],
  excludeIds: Set<number>,
  limit: number,
): Promise<CandidateSeries[]> {
  if (!topGenreIds.length) return [];

  const { data: genreRows } = await supabase
    .from("genres")
    .select("id, tmdb_genre_id")
    .in("tmdb_genre_id", topGenreIds);

  const internalIds = (genreRows ?? []).map((r: any) => r.id);
  if (!internalIds.length) return [];

  const { data: tgRows } = await supabase
    .from("tv_genres")
    .select("series_id")
    .in("genre_id", internalIds)
    .limit(2000);

  const candidateIds = [
    ...new Set((tgRows ?? []).map((r: any) => Number(r.series_id))),
  ].filter((id) => !excludeIds.has(id));

  if (!candidateIds.length) return [];

  const { data: series } = await supabase
    .from("tv_series")
    .select(
      `
      id, name, original_language,
      poster_path, backdrop_path, vote_average,
      first_air_date, overview_en, overview, popularity,
      tv_genres(genres(tmdb_genre_id)),
      tv_cast(person_id, cast_order)
    `,
    )
    .in("id", candidateIds.slice(0, 500))
    .gte("vote_average", MIN_VOTE_AVERAGE)
    .not("poster_path", "is", null)
    .gt("tmdb_id", 0)
    .order("popularity", { ascending: false })
    .limit(limit);

  return (series ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    poster_path: s.poster_path,
    backdrop_path: s.backdrop_path,
    vote_average: Number(s.vote_average),
    first_air_date: s.first_air_date,
    overview: s.overview_en || s.overview || "",
    popularity: Number(s.popularity),
    original_language: s.original_language,
    genre_ids: (s.tv_genres ?? [])
      .map((tg: any) => Number(tg.genres?.tmdb_genre_id))
      .filter(Boolean),
    cast_ids: (s.tv_cast ?? [])
      .sort((a: any, b: any) => (a.cast_order ?? 99) - (b.cast_order ?? 99))
      .map((c: any) => Number(c.person_id))
      .filter(Boolean)
      .slice(0, 10),
  }));
}

async function fetchWildcard(
  excludeMovieIds: Set<number>,
  excludeSeriesIds: Set<number>,
): Promise<{ movies: CandidateMovie[]; series: CandidateSeries[] }> {
  const [movieRes, tvRes] = await Promise.allSettled([
    supabase
      .from("movies")
      .select(
        `
        id, title, original_title, original_language,
        poster_path, backdrop_path, vote_average,
        release_date, overview_en, overview, popularity,
        movie_genres(genres(tmdb_genre_id)),
        movie_cast(person_id, cast_order)
      `,
      )
      .gte("vote_average", 7.0)
      .not("poster_path", "is", null)
      .gt("tmdb_id", 0)
      .order("vote_count", { ascending: false })
      .limit(200),

    supabase
      .from("tv_series")
      .select(
        `
        id, name, original_language,
        poster_path, backdrop_path, vote_average,
        first_air_date, overview_en, overview, popularity,
        tv_genres(genres(tmdb_genre_id)),
        tv_cast(person_id, cast_order)
      `,
      )
      .gte("vote_average", 7.0)
      .not("poster_path", "is", null)
      .gt("tmdb_id", 0)
      .order("vote_count", { ascending: false })
      .limit(200),
  ]);

  const rawMovies =
    movieRes.status === "fulfilled" ? ((movieRes.value as any).data ?? []) : [];
  const rawSeries =
    tvRes.status === "fulfilled" ? ((tvRes.value as any).data ?? []) : [];

  const movies = shuffle(
    rawMovies
      .filter((m: any) => !excludeMovieIds.has(m.id))
      .map((m: any) => ({
        id: m.id,
        title:
          m.original_language === "id" ? m.original_title || m.title : m.title,
        original_title: m.original_title,
        original_language: m.original_language,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        vote_average: Number(m.vote_average),
        release_date: m.release_date,
        overview: m.overview_en || m.overview || "",
        popularity: Number(m.popularity),
        genre_ids: (m.movie_genres ?? [])
          .map((mg: any) => Number(mg.genres?.tmdb_genre_id))
          .filter(Boolean),
        cast_ids: (m.movie_cast ?? [])
          .map((c: any) => Number(c.person_id))
          .filter(Boolean)
          .slice(0, 10),
      })),
  ).slice(0, 15);

  const series = shuffle(
    rawSeries
      .filter((s: any) => !excludeSeriesIds.has(s.id))
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        poster_path: s.poster_path,
        backdrop_path: s.backdrop_path,
        vote_average: Number(s.vote_average),
        first_air_date: s.first_air_date,
        overview: s.overview_en || s.overview || "",
        popularity: Number(s.popularity),
        original_language: s.original_language,
        genre_ids: (s.tv_genres ?? [])
          .map((tg: any) => Number(tg.genres?.tmdb_genre_id))
          .filter(Boolean),
        cast_ids: (s.tv_cast ?? [])
          .map((c: any) => Number(c.person_id))
          .filter(Boolean)
          .slice(0, 10),
      })),
  ).slice(0, 15);

  return { movies, series };
}

// ─── Score + bucket assignment ─────────────────────────────────────────────────

interface ScoredCandidate {
  mediaType: MediaType;
  movieId?: number;
  seriesId?: number;
  bucket: SwipeBucket;
  finalScore: number;
  raw: CandidateMovie | CandidateSeries;
}

function scoreAndBucket(
  movies: CandidateMovie[],
  series: CandidateSeries[],
  pref: UserPreference,
  topUserGenreIds: number[],
): ScoredCandidate[] {
  const adjacentGenreIds = new Set<number>(
    topUserGenreIds.flatMap((gid) => ADJACENT_GENRE_MAP[gid] ?? []),
  );

  const scored: ScoredCandidate[] = [];

  for (const m of movies) {
    const prefScore = computeScore(
      m.genre_ids,
      m.cast_ids,
      m.original_language,
      pref,
    );
    const popNorm = Math.log1p(m.popularity) / 10; // normalize log popularity
    const voteNorm = (m.vote_average - 6) / 4; // 6–10 → 0–1
    const finalScore = prefScore + popNorm * 0.5 + voteNorm * 0.3;

    // Bucket assignment
    const isPersonal = m.genre_ids.some((g) => topUserGenreIds.includes(g));
    const isAdjacent =
      !isPersonal && m.genre_ids.some((g) => adjacentGenreIds.has(g));
    const bucket: SwipeBucket = isPersonal
      ? "personal"
      : isAdjacent
        ? "adjacent"
        : "wildcard";

    scored.push({
      mediaType: "movie",
      movieId: m.id,
      bucket,
      finalScore,
      raw: m,
    });
  }

  for (const s of series) {
    const prefScore = computeScore(
      s.genre_ids,
      s.cast_ids,
      s.original_language,
      pref,
    );
    const popNorm = Math.log1p(s.popularity) / 10;
    const voteNorm = (s.vote_average - 6) / 4;
    const finalScore = prefScore + popNorm * 0.5 + voteNorm * 0.3;

    const isPersonal = s.genre_ids.some((g) => topUserGenreIds.includes(g));
    const isAdjacent =
      !isPersonal && s.genre_ids.some((g) => adjacentGenreIds.has(g));
    const bucket: SwipeBucket = isPersonal
      ? "personal"
      : isAdjacent
        ? "adjacent"
        : "wildcard";

    scored.push({
      mediaType: "tv",
      seriesId: s.id,
      bucket,
      finalScore,
      raw: s,
    });
  }

  return scored.sort((a, b) => b.finalScore - a.finalScore);
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateUserPool(userId: string): Promise<{
  inserted: number;
  error?: string;
}> {
  console.log(`[generate-user-pool] Generating for user ${userId}`);

  // 1. Ambil preferences
  const { data: prefData } = await supabase
    .from("user_preferences")
    .select("genre_scores, cast_scores, language_scores, total_swipes")
    .eq("user_id", userId)
    .single();

  const pref: UserPreference = {
    user_id: userId,
    genre_scores: prefData?.genre_scores ?? {},
    cast_scores: prefData?.cast_scores ?? {},
    language_scores: prefData?.language_scores ?? {},
    total_swipes: prefData?.total_swipes ?? 0,
  };

  // 2. Top genre IDs dari preferences (max 5)
  const topGenreIds = topKeys(pref.genre_scores, 5).map(Number);

  // 3. Adjacent genre IDs
  const adjacentGenreIds = [
    ...new Set(topGenreIds.flatMap((gid) => ADJACENT_GENRE_MAP[gid] ?? [])),
  ].filter((gid) => !topGenreIds.includes(gid));

  // 4. Ambil exclude list
  const { movieIds: excludeMovies, seriesIds: excludeSeries } =
    await fetchExcludeIds(userId);

  // 5. Fetch candidates per bucket secara paralel
  const personalLimit = Math.ceil(CANDIDATE_LIMIT * 0.7);
  const adjacentLimit = Math.ceil(CANDIDATE_LIMIT * 0.2);

  const allGenreIds = [...topGenreIds, ...adjacentGenreIds];

  const [personalMovies, personalSeries, wildcardData] = await Promise.all([
    fetchPersonalMovies(allGenreIds, excludeMovies, personalLimit),
    fetchPersonalTV(allGenreIds, excludeSeries, personalLimit),
    fetchWildcard(excludeMovies, excludeSeries),
  ]);

  console.log(
    `[generate-user-pool] Candidates — movies: ${personalMovies.length}, tv: ${personalSeries.length}, wildcard: ${wildcardData.movies.length + wildcardData.series.length}`,
  );

  // 6. Score + bucket assignment
  const allMovies = [...personalMovies, ...wildcardData.movies];
  const allSeries = [...personalSeries, ...wildcardData.series];

  const scored = scoreAndBucket(allMovies, allSeries, pref, topGenreIds);

  // 7. Pilih top 100, pastikan mix movie & TV (maks 60 movie, 60 TV)
  const topMovies = scored.filter((c) => c.mediaType === "movie").slice(0, 60);
  const topSeries = scored.filter((c) => c.mediaType === "tv").slice(0, 60);

  // Interleave movie & TV, ambil top 100
  const interleaved: ScoredCandidate[] = [];
  const maxLen = Math.max(topMovies.length, topSeries.length);
  for (let i = 0; i < maxLen && interleaved.length < TOP_N; i++) {
    if (i < topMovies.length) interleaved.push(topMovies[i]);
    if (interleaved.length < TOP_N && i < topSeries.length)
      interleaved.push(topSeries[i]);
  }

  // 8. Build pool rows dengan metadata embed
  const rows: PoolInsertRow[] = [];
  for (const candidate of interleaved) {
    const raw = candidate.raw as any;

    const metadata = await buildMetadata(
      supabase,
      candidate.mediaType,
      candidate.movieId ?? null,
      candidate.seriesId ?? null,
      {
        title: raw.title ?? raw.name,
        poster_path: raw.poster_path,
        backdrop_path: raw.backdrop_path,
        vote_average: raw.vote_average,
        release_date: raw.release_date,
        first_air_date: raw.first_air_date,
        overview: raw.overview,
      },
    );

    rows.push({
      user_id: userId,
      user_type: "user",
      media_type: candidate.mediaType,
      movie_id: candidate.movieId ?? null,
      series_id: candidate.seriesId ?? null,
      score: Number(candidate.finalScore.toFixed(4)),
      bucket: candidate.bucket,
      served: false,
      metadata,
    });
  }

  // 9. Hapus pool lama user yang belum served
  await supabase
    .from("user_recommendation_pool")
    .delete()
    .eq("user_id", userId)
    .eq("user_type", "user")
    .eq("served", false);

  // 10. Insert pool baru (batch 25)
  const BATCH = 25;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("user_recommendation_pool")
      .insert(batch);

    if (error) {
      console.error(`[generate-user-pool] Insert batch error:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(
    `[generate-user-pool] Done for ${userId}. Inserted ${inserted}/${rows.length}`,
  );
  return { inserted };
}

// ─── HTTP handler (untuk direct call / testing) ───────────────────────────────

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let userId: string;
  try {
    const body = await req.json();
    userId = body.userId;
    if (!userId) throw new Error("userId required");
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await generateUserPool(userId);

  return new Response(JSON.stringify({ success: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
