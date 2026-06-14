// supabase/functions/_shared/generator.ts
//
// Core logic untuk generate personal recommendation pool per user.
// Di-import oleh generate-user-pool/index.ts dan process-reco-jobs/index.ts.
// Tidak mengandung Deno.serve — murni business logic.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMetadata } from "./metadata.ts";
import {
  PoolInsertRow,
  ScoreMap,
  UserPreference,
  MediaType,
  SwipeBucket,
} from "./types.ts";

export const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Config ───────────────────────────────────────────────────────────────────

const CANDIDATE_LIMIT = 500;
const TOP_N = 100;
const MIN_VOTE_AVERAGE = 6.0;

const ADJACENT_GENRE_MAP: Record<number, number[]> = {
  878: [9648, 53, 10765, 27],
  28: [12, 53, 80, 10752],
  35: [10749, 18, 16, 10402],
  18: [9648, 10749, 36, 10402],
  27: [9648, 53, 878, 80],
  80: [53, 18, 9648, 28],
  53: [80, 27, 9648, 878],
  16: [35, 10751, 12, 14],
  14: [12, 878, 16, 10751],
  10749: [18, 35, 10402, 16],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function topKeys(map: ScoreMap, n: number): string[] {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k]) => k);
}

function computeScore(
  genreIds: number[],
  castIds: number[],
  language: string,
  pref: UserPreference,
): number {
  let score = 0;
  for (const gid of genreIds) score += pref.genre_scores[String(gid)] ?? 0;
  for (const cid of castIds)
    score += (pref.cast_scores[String(cid)] ?? 0) * 0.5;
  score += (pref.language_scores[language] ?? 0) * 0.3;
  return score;
}

// ─── Exclude list ─────────────────────────────────────────────────────────────

async function fetchExcludeIds(userId: string): Promise<{
  movieIds: Set<number>;
  seriesIds: Set<number>;
}> {
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

// ─── Candidate types ──────────────────────────────────────────────────────────

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
  genre_ids: number[];
  cast_ids: number[];
}

interface CandidateSeries {
  id: number;
  name: string;
  original_language: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date: string | null;
  overview: string;
  popularity: number;
  genre_ids: number[];
  cast_ids: number[];
}

interface ScoredCandidate {
  mediaType: MediaType;
  movieId?: number;
  seriesId?: number;
  bucket: SwipeBucket;
  finalScore: number;
  raw: CandidateMovie | CandidateSeries;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchPersonalMovies(
  topGenreIds: number[],
  excludeIds: Set<number>,
  limit: number,
): Promise<CandidateMovie[]> {
  if (!topGenreIds.length) return [];

  const { data: genreRows } = await supabase
    .from("genres")
    .select("id, tmdb_genre_id")
    .in("tmdb_genre_id", topGenreIds);
  const internalIds = (genreRows ?? []).map((r: any) => r.id);
  if (!internalIds.length) return [];

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
      "id, tmdb_id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, overview_en, overview, popularity, movie_genres(genres(tmdb_genre_id)), movie_cast(person_id, cast_order)",
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
      "id, tmdb_id, name, original_language, poster_path, backdrop_path, vote_average, first_air_date, overview_en, overview, popularity, tv_genres(genres(tmdb_genre_id)), tv_cast(person_id, cast_order)",
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
    original_language: s.original_language,
    poster_path: s.poster_path,
    backdrop_path: s.backdrop_path,
    vote_average: Number(s.vote_average),
    first_air_date: s.first_air_date,
    overview: s.overview_en || s.overview || "",
    popularity: Number(s.popularity),
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
        "id, tmdb_id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, overview_en, overview, popularity, movie_genres(genres(tmdb_genre_id)), movie_cast(person_id, cast_order)",
      )
      .gte("vote_average", 7.0)
      .not("poster_path", "is", null)
      .gt("tmdb_id", 0)
      .order("vote_count", { ascending: false })
      .limit(200),
    supabase
      .from("tv_series")
      .select(
        "id, tmdb_id, name, original_language, poster_path, backdrop_path, vote_average, first_air_date, overview_en, overview, popularity, tv_genres(genres(tmdb_genre_id)), tv_cast(person_id, cast_order)",
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

  return {
    movies: shuffle(
      rawMovies
        .filter((m: any) => !excludeMovieIds.has(m.id))
        .map((m: any) => ({
          id: m.id,
          title:
            m.original_language === "id"
              ? m.original_title || m.title
              : m.title,
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
    ).slice(0, 15),
    series: shuffle(
      rawSeries
        .filter((s: any) => !excludeSeriesIds.has(s.id))
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          original_language: s.original_language,
          poster_path: s.poster_path,
          backdrop_path: s.backdrop_path,
          vote_average: Number(s.vote_average),
          first_air_date: s.first_air_date,
          overview: s.overview_en || s.overview || "",
          popularity: Number(s.popularity),
          genre_ids: (s.tv_genres ?? [])
            .map((tg: any) => Number(tg.genres?.tmdb_genre_id))
            .filter(Boolean),
          cast_ids: (s.tv_cast ?? [])
            .map((c: any) => Number(c.person_id))
            .filter(Boolean)
            .slice(0, 10),
        })),
    ).slice(0, 15),
  };
}

// ─── Score + bucket ───────────────────────────────────────────────────────────

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
    const finalScore =
      computeScore(m.genre_ids, m.cast_ids, m.original_language, pref) +
      (Math.log1p(m.popularity) / 10) * 0.5 +
      ((m.vote_average - 6) / 4) * 0.3;
    const isPersonal = m.genre_ids.some((g) => topUserGenreIds.includes(g));
    const isAdjacent =
      !isPersonal && m.genre_ids.some((g) => adjacentGenreIds.has(g));
    scored.push({
      mediaType: "movie",
      movieId: m.id,
      bucket: isPersonal ? "personal" : isAdjacent ? "adjacent" : "wildcard",
      finalScore,
      raw: m,
    });
  }

  for (const s of series) {
    const finalScore =
      computeScore(s.genre_ids, s.cast_ids, s.original_language, pref) +
      (Math.log1p(s.popularity) / 10) * 0.5 +
      ((s.vote_average - 6) / 4) * 0.3;
    const isPersonal = s.genre_ids.some((g) => topUserGenreIds.includes(g));
    const isAdjacent =
      !isPersonal && s.genre_ids.some((g) => adjacentGenreIds.has(g));
    scored.push({
      mediaType: "tv",
      seriesId: s.id,
      bucket: isPersonal ? "personal" : isAdjacent ? "adjacent" : "wildcard",
      finalScore,
      raw: s,
    });
  }

  return scored.sort((a, b) => b.finalScore - a.finalScore);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateUserPool(
  userId: string,
): Promise<{ inserted: number; error?: string }> {
  console.log(`[generator] Generating for user ${userId}`);

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

  const topGenreIds = topKeys(pref.genre_scores, 5).map(Number);
  const adjacentIds = [
    ...new Set(topGenreIds.flatMap((gid) => ADJACENT_GENRE_MAP[gid] ?? [])),
  ].filter((g) => !topGenreIds.includes(g));
  const allGenreIds = [...topGenreIds, ...adjacentIds];
  const personalLimit = Math.ceil(CANDIDATE_LIMIT * 0.7);

  const { movieIds: excludeMovies, seriesIds: excludeSeries } =
    await fetchExcludeIds(userId);

  const [personalMovies, personalSeries, wildcardData] = await Promise.all([
    fetchPersonalMovies(allGenreIds, excludeMovies, personalLimit),
    fetchPersonalTV(allGenreIds, excludeSeries, personalLimit),
    fetchWildcard(excludeMovies, excludeSeries),
  ]);

  console.log(
    `[generator] Candidates — movies: ${personalMovies.length}, tv: ${personalSeries.length}, wildcard: ${wildcardData.movies.length + wildcardData.series.length}`,
  );

  const scored = scoreAndBucket(
    [...personalMovies, ...wildcardData.movies],
    [...personalSeries, ...wildcardData.series],
    pref,
    topGenreIds,
  );
  const topMovies = scored.filter((c) => c.mediaType === "movie").slice(0, 60);
  const topSeries = scored.filter((c) => c.mediaType === "tv").slice(0, 60);

  const interleaved: ScoredCandidate[] = [];
  const maxLen = Math.max(topMovies.length, topSeries.length);
  for (let i = 0; i < maxLen && interleaved.length < TOP_N; i++) {
    if (i < topMovies.length) interleaved.push(topMovies[i]);
    if (interleaved.length < TOP_N && i < topSeries.length)
      interleaved.push(topSeries[i]);
  }

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
        tmdb_id: raw.tmdb_id,
        overview: raw.overview,
        overview_en: raw.overview_en,
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

  await supabase
    .from("user_recommendation_pool")
    .delete()
    .eq("user_id", userId)
    .eq("user_type", "user")
    .eq("served", false);

  let inserted = 0;
  const BATCH = 25;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("user_recommendation_pool")
      .insert(rows.slice(i, i + BATCH));
    if (error) console.error(`[generator] Insert batch error:`, error.message);
    else inserted += Math.min(BATCH, rows.length - i);
  }

  console.log(
    `[generator] Done for ${userId}. Inserted ${inserted}/${rows.length}`,
  );
  return { inserted };
}
