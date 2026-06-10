/**
 * lib/hidden-gems-db.ts
 *
 * Query layer untuk "Weekly Hidden Gems":
 *  - Film & TV series dengan vote_average >= 7.5, vote_count >= 100,
 *    popularity <= 30
 *  - Jika user login: diutamakan genre yang paling banyak ada di watchlist
 *  - Jika tidak login: diurutkan berdasarkan skor gem tertinggi
 *  - Seed mingguan deterministik (tidak acak sepenuhnya setiap request)
 */

import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HiddenGem {
  id: number;
  tmdb_id: number;
  title: string; // movie: title | tv: name
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  overview: string;
  release_date?: string; // movie only
  first_air_date?: string; // tv only
  genre_ids: number[]; // tmdb_genre_id[]
  media_type: "movie" | "tv";
  gem_score: number; // skor internal: vote_avg * log(vote_count) / popularity
}

export interface HiddenGemsResult {
  movies: HiddenGem[];
  series: HiddenGem[];
  topGenreId: number | null; // genre yg dipakai untuk personalisation (null = global)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POPULARITY_THRESHOLD = 30;
const MIN_VOTE_AVERAGE = 7.5;
const MIN_VOTE_COUNT = 100;
const POOL_LIMIT = 80; // ambil lebih banyak, lalu filter & urutkan di JS
const RESULT_LIMIT = 12; // tampilkan N per tipe

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickOverview(
  row: { overview: string | null; overview_en: string | null },
  lang: string,
): string {
  if (lang === "id") return row.overview || row.overview_en || "";
  return row.overview_en || row.overview || "";
}

/**
 * Gem score: makin tinggi vote_average, makin banyak vote_count,
 * makin rendah popularity → makin "tersembunyi" tapi berkualitas.
 *
 * Formula: vote_average × ln(vote_count + 1) / ln(popularity + 2)
 */
function calcGemScore(
  vote_average: number,
  vote_count: number,
  popularity: number,
): number {
  return (vote_average * Math.log(vote_count + 1)) / Math.log(popularity + 2);
}

/**
 * Seed deterministik mingguan.
 * Mengembalikan angka integer dari ISO week number × tahun,
 * dipakai untuk shuffle yang konsisten selama 1 minggu penuh.
 */
function weekSeed(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7,
  );
  return now.getFullYear() * 100 + week;
}

/** Shuffle deterministik (LCG) berdasarkan seed */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Genre Detection ──────────────────────────────────────────────────────────

/**
 * Cari genre paling banyak muncul di watchlist user.
 * Join: watchlist → movies → movie_genres → genres
 * Return: tmdb_genre_id yang paling sering, atau null jika watchlist kosong.
 */
export async function detectTopGenreFromWatchlist(
  userId: string,
): Promise<number | null> {
  // 1. Ambil movie_id dari watchlist user (media_type = movie)
  const { data: watchlistItems, error: wErr } = await supabase
    .from("watchlist")
    .select("movie_id")
    .eq("user_id", userId)
    .eq("media_type", "movie")
    .not("movie_id", "is", null)
    .limit(100);

  if (wErr || !watchlistItems?.length) return null;

  const movieIds = watchlistItems.map((w: any) => w.movie_id as number);

  // 2. Ambil genre_id (internal) dari movie_genres
  const { data: movieGenres, error: gErr } = await supabase
    .from("movie_genres")
    .select("genre_id")
    .in("movie_id", movieIds);

  if (gErr || !movieGenres?.length) return null;

  // 3. Hitung frekuensi genre_id
  const freq = new Map<number, number>();
  for (const row of movieGenres as any[]) {
    freq.set(row.genre_id, (freq.get(row.genre_id) ?? 0) + 1);
  }

  // 4. Cari genre_id dengan frekuensi tertinggi
  const topInternalId = Array.from(freq.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];
  if (!topInternalId) return null;

  // 5. Konversi ke tmdb_genre_id
  const { data: genreRow } = await supabase
    .from("genres")
    .select("tmdb_genre_id")
    .eq("id", topInternalId)
    .single();

  return (genreRow as any)?.tmdb_genre_id ?? null;
}

// ─── Movie Hidden Gems ────────────────────────────────────────────────────────

async function fetchHiddenGemMovies(
  lang: string,
  topGenreTmdbId: number | null,
): Promise<HiddenGem[]> {
  let query = supabase
    .from("movies")
    .select(
      `id, tmdb_id, title, poster_path, backdrop_path,
       vote_average, vote_count, popularity,
       overview, overview_en, release_date`,
    )
    .gte("vote_average", MIN_VOTE_AVERAGE)
    .gte("vote_count", MIN_VOTE_COUNT)
    .lte("popularity", POPULARITY_THRESHOLD)
    .not("poster_path", "is", null)
    .order("vote_average", { ascending: false })
    .limit(POOL_LIMIT);

  const { data: movies, error } = await query;

  if (error) {
    console.error("[hidden-gems-db] fetchHiddenGemMovies:", error.message);
    return [];
  }

  if (!movies?.length) return [];

  // Ambil genre untuk semua film ini sekaligus
  const movieIds = movies.map((m: any) => m.id);
  const { data: genreLinks } = await supabase
    .from("movie_genres")
    .select("movie_id, genres(tmdb_genre_id)")
    .in("movie_id", movieIds);

  // Build map: movie_id → tmdb_genre_id[]
  const genreMap = new Map<number, number[]>();
  for (const link of (genreLinks ?? []) as any[]) {
    const gid = link.genres?.tmdb_genre_id;
    if (!gid) continue;
    const arr = genreMap.get(link.movie_id) ?? [];
    arr.push(gid);
    genreMap.set(link.movie_id, arr);
  }

  const gems: HiddenGem[] = movies.map((m: any) => ({
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average),
    vote_count: Number(m.vote_count),
    popularity: Number(m.popularity),
    overview: pickOverview(m, lang),
    release_date: m.release_date,
    genre_ids: genreMap.get(m.id) ?? [],
    media_type: "movie" as const,
    gem_score: calcGemScore(
      Number(m.vote_average),
      Number(m.vote_count),
      Number(m.popularity),
    ),
  }));

  return rankAndSlice(gems, topGenreTmdbId);
}

// ─── TV Hidden Gems ───────────────────────────────────────────────────────────

async function fetchHiddenGemSeries(
  lang: string,
  topGenreTmdbId: number | null,
): Promise<HiddenGem[]> {
  const { data: series, error } = await supabase
    .from("tv_series")
    .select(
      `id, tmdb_id, name, poster_path, backdrop_path,
       vote_average, vote_count, popularity,
       overview, overview_en, first_air_date`,
    )
    .gte("vote_average", MIN_VOTE_AVERAGE)
    .gte("vote_count", MIN_VOTE_COUNT)
    .lte("popularity", POPULARITY_THRESHOLD)
    .not("poster_path", "is", null)
    .order("vote_average", { ascending: false })
    .limit(POOL_LIMIT);

  if (error) {
    console.error("[hidden-gems-db] fetchHiddenGemSeries:", error.message);
    return [];
  }

  if (!series?.length) return [];

  // Genre untuk series — asumsi tabel tv_genres & tv_series_genres
  // (sesuaikan nama tabel jika berbeda di project kamu)
  const seriesIds = series.map((s: any) => s.id);
  const { data: genreLinks } = await supabase
    .from("tv_series_genres")
    .select("series_id, genres(tmdb_genre_id)")
    .in("series_id", seriesIds);

  const genreMap = new Map<number, number[]>();
  for (const link of (genreLinks ?? []) as any[]) {
    const gid = link.genres?.tmdb_genre_id;
    if (!gid) continue;
    const arr = genreMap.get(link.series_id) ?? [];
    arr.push(gid);
    genreMap.set(link.series_id, arr);
  }

  const gems: HiddenGem[] = series.map((s: any) => ({
    id: s.id,
    tmdb_id: s.tmdb_id,
    title: s.name,
    poster_path: s.poster_path,
    backdrop_path: s.backdrop_path,
    vote_average: Number(s.vote_average),
    vote_count: Number(s.vote_count),
    popularity: Number(s.popularity),
    overview: pickOverview(s, lang),
    first_air_date: s.first_air_date,
    genre_ids: genreMap.get(s.id) ?? [],
    media_type: "tv" as const,
    gem_score: calcGemScore(
      Number(s.vote_average),
      Number(s.vote_count),
      Number(s.popularity),
    ),
  }));

  return rankAndSlice(gems, topGenreTmdbId);
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

/**
 * Urutan prioritas:
 * 1. Jika ada topGenre → film yang mengandung genre itu naik ke atas
 * 2. Urutkan berdasarkan gem_score DESC
 * 3. Weekly shuffle deterministik di dalam tiap tier → variasi tiap minggu
 */
function rankAndSlice(
  gems: HiddenGem[],
  topGenreTmdbId: number | null,
): HiddenGem[] {
  const seed = weekSeed();

  if (topGenreTmdbId !== null) {
    const preferred = seededShuffle(
      gems.filter((g) => g.genre_ids.includes(topGenreTmdbId)),
      seed,
    );
    const others = seededShuffle(
      gems.filter((g) => !g.genre_ids.includes(topGenreTmdbId)),
      seed + 1,
    );
    return [...preferred, ...others]
      .sort((a, b) => {
        const aHas = a.genre_ids.includes(topGenreTmdbId) ? 1 : 0;
        const bHas = b.genre_ids.includes(topGenreTmdbId) ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas; // preferred first
        return b.gem_score - a.gem_score; // then by score
      })
      .slice(0, RESULT_LIMIT);
  }

  // Tanpa personalisasi: shuffle deterministik dari pool berscor tertinggi
  const topPool = [...gems]
    .sort((a, b) => b.gem_score - a.gem_score)
    .slice(0, 40);
  return seededShuffle(topPool, seed).slice(0, RESULT_LIMIT);
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function fetchHiddenGems(
  lang: string,
  userId: string | null,
): Promise<HiddenGemsResult> {
  // Deteksi top genre (hanya jika login)
  const topGenreId = userId ? await detectTopGenreFromWatchlist(userId) : null;

  const [moviesRes, seriesRes] = await Promise.allSettled([
    fetchHiddenGemMovies(lang, topGenreId),
    fetchHiddenGemSeries(lang, topGenreId),
  ]);

  return {
    movies: moviesRes.status === "fulfilled" ? moviesRes.value : [],
    series: seriesRes.status === "fulfilled" ? seriesRes.value : [],
    topGenreId,
  };
}
