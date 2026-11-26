/**
 * movies-db.ts
 * Controller layer: query tabel `movies` + relasi.
 */

import { supabase } from "./supabase";

export interface CachedMovie {
  id: number;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  popularity?: number;
  overview?: string;
  genre_ids?: number[]; // tmdb_genre_id[]
  trailer?: string | null; // YouTube video id
}

export interface PlatformItem {
  id: number;
  slug: string;
  name: string;
  logo_path: string | null;
}

export interface GenreItem {
  id: number; // internal DB id
  tmdb_genre_id: number;
  name: string;
  slug: string;
}

type Category =
  | "trending"
  | "popular"
  | "top_rated"
  | "upcoming"
  | "now_playing";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function pickOverview(
  row: { overview: string | null; overview_en: string | null },
  lang: string,
): string {
  if (lang === "id") return row.overview || row.overview_en || "";
  return row.overview_en || row.overview || "";
}

// ─── HOME ─────────────────────────────────────────────────────────────────────

async function fetchCategory(
  category: Category,
  lang: string,
  region: string,
  ascending: boolean,
  limit = 15,
): Promise<CachedMovie[]> {
  let query = supabase
    .from("movie_categories")
    .select(
      `
    sort_order,
    updated_at,
    movies (
      id, tmdb_id, title, original_title, original_language, poster_path, backdrop_path,
      vote_average, release_date, popularity, overview, overview_en, movie_genres(genres(name))
    )
  `,
    )
    .eq("category", category)
    .eq("region", region)
    .not("movies.poster_path", "is", null);

  if (category === "upcoming") {
    query = query.order("updated_at", { ascending });
  } else {
    query = query.order("sort_order", { ascending });
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    console.error(`[movies-db] fetchCategory(${category}):`, error.message);
    return [];
  }

  // console.log(`[movies-db] fetchCategory(${category}): ${data?.length} items`);
  return (data ?? [])
    .map((row: any) => {
      const m = row.movies;

      if (!m) return null;
      return {
        id: m.id,
        tmdb_id: m.tmdb_id,
        title: m.original_language === "id" ? m.original_title : m.title,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        vote_average: Number(m.vote_average),
        release_date: m.release_date,
        popularity: Number(m.popularity),
        overview: pickOverview(m, lang),
        genres: (m.movie_genres ?? [])
          .map((mg: any) => mg.genres?.name)
          .filter(Boolean) as number[],
      };
    })
    .filter(Boolean) as CachedMovie[];
}

async function fetchCategoryNowPlaying(
  lang: string,
  region: string,
  limit = 20,
  date?: string,
): Promise<CachedMovie[]> {
  // const today = new Date().toISOString().split("T")[0]; // pakai helper WIB yang sudah ada, atau new Date().toISOString().split('T')[0]
  // console.log(`[movies-db] fetchCategory(now_playing): ${today}`);

  const { data, error } = await supabase.rpc("get_latest_movies_21cineplex", {
    p_limit: limit,
    p_date: date, // ← kirim tanggal hari ini
  });
  // hapus .order() — sudah dihandle di SQL

  if (error) {
    console.error(`[cinema-db] fetchCategory(now_playing):`, error.message);
    return [];
  }

  return (data ?? [])
    .map((row: any) => {
      const m = row;
      if (!m) return null;
      return {
        id: m.movie_id,
        tmdb_id: m.tmdb_id,
        title: m.title,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        vote_average: Number(m.vote_average),
        release_date: m.release_date,
        popularity: Number(m.popularity),
        overview: pickOverview(m, lang),
      };
    })
    .filter(Boolean) as CachedMovie[];
}

// Helper dengan fallback mundur tanggal
async function fetchCategoryNowPlayingWithFallback(
  lang: string,
  region: string,
  limit = 20,
  maxFallbackDays = 3, // mundur maksimal 3 hari
): Promise<CachedMovie[]> {
  for (let daysBack = 0; daysBack <= maxFallbackDays; daysBack++) {
    const date = new Date(Date.now() - daysBack * 86400000)
      .toISOString()
      .split("T")[0];

    const result = await fetchCategoryNowPlaying(lang, region, limit, date);

    if (result.length > 0) {
      if (daysBack > 0) {
        console.warn(
          `[cinema-db] nowPlaying fallback to ${date} (-${daysBack}d)`,
        );
      }
      return result;
    }
  }

  return [];
}

async function fetchIndonesian(
  category: string,
  lang: string,
  limit = 15,
): Promise<CachedMovie[]> {
  let query = supabase
    .from("movies")
    .select(
      `
      id,
      tmdb_id,
      title,
      original_title,
      original_language,
      poster_path,
      backdrop_path,
      vote_average,
      vote_count,
      release_date,
      popularity,
      overview,
      overview_en
      `,
    )
    .eq("original_language", "id")
    .gt("tmdb_id", 0)
    .not("poster_path", "is", null);

  switch (category) {
    case "top_rated":
      query = query
        .or("original_language.neq.id,vote_average.lt.9")
        .order("vote_average", { ascending: false });
      break;
    case "popularity":
      query = query.order("vote_count", { ascending: false });
      break;
    default:
      query = query.order("release_date", { ascending: false });
      break;
  }

  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error("[movies-db] fetchIndonesian:", error.message);
    return [];
  }

  return (data ?? []).map((m: any) => ({
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.original_language === "id" ? m.original_title || m.title : m.title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average),
    vote_count: Number(m.vote_count),
    release_date: m.release_date,
    popularity: Number(m.popularity),
    overview: pickOverview(m, lang),
  }));
}

async function fetchRecommended(
  lang: string,
  limit = 15,
): Promise<CachedMovie[]> {
  const { data, error } = await supabase
    .from("movies")
    .select(
      "id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, budget, revenue, popularity, overview, overview_en",
    )
    .order("revenue", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[movies-db] fetchIndonesian:", error.message);
    return [];
  }

  return (data ?? []).map((m: any) => ({
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average),
    release_date: m.release_date,
    popularity: Number(m.popularity),
    overview: pickOverview(m, lang),
  }));
}

export async function fetchHomeMovies(lang: string, region: string) {
  const [
    trendingRes,
    nowPlayingRes,
    upcomingRes,
    popularRes,
    indonesianRes,
    indonesianPopRes,
  ] = await Promise.allSettled([
    fetchCategory("trending", lang, region, true, 10),
    fetchCategoryNowPlayingWithFallback(lang, region, 20),
    fetchCategory("upcoming", lang, region, false, 20),
    // fetchRecommended(lang, 20),
    fetchCategory("popular", lang, region, true, 20),
    fetchIndonesian("release_date", lang, 20),
    fetchIndonesian("popularity", lang, 15),
  ]);

  return {
    trending: trendingRes.status === "fulfilled" ? trendingRes.value : [],
    nowPlaying: nowPlayingRes.status === "fulfilled" ? nowPlayingRes.value : [],
    upcoming: upcomingRes.status === "fulfilled" ? upcomingRes.value : [],
    bestSeller: popularRes.status === "fulfilled" ? popularRes.value : [],
    indonesianMovies:
      indonesianRes.status === "fulfilled" ? indonesianRes.value : [],
    indonesianPopularMovies:
      indonesianPopRes.status === "fulfilled" ? indonesianPopRes.value : [],
    // netflixTrending: [] as CachedMovie[],
    // disneyTrending: [] as CachedMovie[],
  };
}

// ─── EXPLORE ──────────────────────────────────────────────────────────────────

export interface ExploreParams {
  lang: string;
  platforms: string[]; // [] = all, atau array slug platform
  genreIds: number[]; // [] = all, atau array tmdb_genre_id
  sort: string; // 'release_date' | 'popular' | 'top_rated'
  page: number;
  limit: number;
  search?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  companyId?: number | null;
  voteMin?: number | null;
  voteMax?: number | null;
  originalLanguage?: string;
}

export interface ExploreResult {
  movies: CachedMovie[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── PLATFORMS ────────────────────────────────────────────────────────────────

export async function fetchPlatforms(): Promise<PlatformItem[]> {
  const { data, error } = await supabase
    .from("platforms")
    .select("id, slug, name, logo_path")
    .order("name", { ascending: true });

  if (error) {
    console.error("[movies-db] fetchPlatforms:", error.message);
    return [];
  }
  return data ?? [];
}

// ─── GENRES ───────────────────────────────────────────────────────────────────

export async function fetchGenresFromDb(): Promise<GenreItem[]> {
  const { data, error } = await supabase
    .from("genres")
    .select("id, tmdb_genre_id, name, slug")
    .order("name", { ascending: true });

  if (error) {
    console.error("[movies-db] fetchGenresFromDb:", error.message);
    return [];
  }
  return data ?? [];
}

// ─── TAMBAHKAN ke movies-db.ts ────────────────────────────────────────────────
// Paste fungsi ini di bagian bawah file movies-db.ts yang sudah ada

export interface MoodMoviesParams {
  lang: string;
  region: string;
  genreIds: number[];
  page: number;
  limit: number;
}

export interface MoodMoviesResult {
  movies: CachedMovie[];
  page: number;
  totalPages: number;
  total: number;
}

export async function fetchMoodMoviesPaginated(
  params: MoodMoviesParams,
): Promise<MoodMoviesResult> {
  const { lang, genreIds, page, limit } = params;
  const offset = (page - 1) * limit;

  // Ambil movie_id yang memiliki genre sesuai mood
  const { data: genreRows } = await supabase
    .from("genres")
    .select("id")
    .in("tmdb_genre_id", genreIds);

  const genreDbIds = (genreRows ?? []).map((r: any) => r.id);

  if (!genreDbIds.length) {
    return { movies: [], page, totalPages: 0, total: 0 };
  }

  // Ambil movie_ids yang match dengan genre tersebut
  const { data: movieGenreRows } = await supabase
    .from("movie_genres")
    .select("movie_id")
    .in("genre_id", genreDbIds)
    .limit(2000);

  const movieIds = [
    ...new Set((movieGenreRows ?? []).map((r: any) => r.movie_id)),
  ];

  if (!movieIds.length) {
    return { movies: [], page, totalPages: 0, total: 0 };
  }

  // Query utama dengan pagination
  const { data, error, count } = await supabase
    .from("movies")
    .select(
      "id, tmdb_id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en",
      { count: "exact" },
    )
    .in("id", movieIds)
    .not("poster_path", "is", null)
    .order("popularity", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[movies-db] fetchMoodMoviesPaginated:", error.message);
    return { movies: [], page, totalPages: 0, total: 0 };
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  const movies: CachedMovie[] = (data ?? []).map((m: any) => ({
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.original_language === "id" ? m.original_title : m.title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average),
    release_date: m.release_date,
    popularity: Number(m.popularity),
    overview: pickOverview(m, lang),
  }));

  return { movies, page, totalPages, total };
}

// ─── TAMBAHAN untuk movies-db.ts ─────────────────────────────────────────────

export async function fetchExploreMovies(
  params: ExploreParams,
): Promise<ExploreResult> {
  const {
    lang,
    platforms,
    genreIds,
    sort,
    page,
    limit,
    search,
    yearFrom,
    yearTo,
    companyId,
    voteMin,
    voteMax,
    originalLanguage,
  } = params;
  const offset = (page - 1) * limit;

  // ── 1. Platform filter → union movie_id dari semua platform yang dipilih ──
  //    Multi platform = OR logic
  let platformMovieIds: number[] | null = null;

  if (platforms.length > 0) {
    const { data: platRows } = await supabase
      .from("platforms")
      .select("id")
      .in("slug", platforms);

    const platIds = (platRows ?? []).map((r: any) => r.id);

    if (platIds.length > 0) {
      const { data } = await supabase
        .from("movie_platforms")
        .select("movie_id")
        .in("platform_id", platIds)
        .eq("region", "ID")
        .limit(5000);
      const set = new Set((data ?? []).map((r: any) => r.movie_id));
      platformMovieIds = Array.from(set);
    } else {
      platformMovieIds = [];
    }
  }

  // ── 2. Genre filter → intersect movie_id dari semua genre yang dipilih ───
  //    Multi genre = AND logic (film harus punya semua genre)
  let genreMovieIds: number[] | null = null;

  if (genreIds.length > 0) {
    const { data: genreRows } = await supabase
      .from("genres")
      .select("id")
      .in("tmdb_genre_id", genreIds);

    const internalGenreIds = (genreRows ?? []).map((r: any) => r.id);

    if (internalGenreIds.length > 0) {
      const perGenre = await Promise.all(
        internalGenreIds.map((gid) =>
          supabase
            .from("movie_genres")
            .select("movie_id")
            .eq("genre_id", gid)
            .limit(5000)
            .then(
              (res) => new Set((res.data ?? []).map((r: any) => r.movie_id)),
            ),
        ),
      );

      let intersection = perGenre[0];
      for (let i = 1; i < perGenre.length; i++) {
        intersection = new Set(
          [...intersection].filter((id) => perGenre[i].has(id)),
        );
      }
      genreMovieIds = Array.from(intersection);
    } else {
      genreMovieIds = [];
    }
  }

  // ── 3. Company filter → set of movie_ids ────────────────────────────────
  let companyMovieIds: number[] | null = null;
  if (companyId !== null && companyId !== undefined) {
    const { data } = await supabase
      .from("movie_companies")
      .select("movie_id")
      .eq("company_id", companyId)
      .limit(5000);
    companyMovieIds = (data ?? []).map((r: any) => r.movie_id);
  }

  // ── 4. Intersect semua id sets ───────────────────────────────────────────
  const idSets = [platformMovieIds, genreMovieIds, companyMovieIds].filter(
    (s): s is number[] => s !== null,
  );

  let filteredIds: number[] | null = null;
  if (idSets.length > 0) {
    filteredIds = idSets.reduce((acc, cur) => {
      const curSet = new Set(cur);
      return acc.filter((id) => curSet.has(id));
    });
  }

  if (filteredIds !== null && filteredIds.length === 0) {
    return { movies: [], total: 0, page, totalPages: 0 };
  }

  // ── 5. Build main query ──────────────────────────────────────────────────
  let query = supabase
    .from("movies")
    .select(
      "id, tmdb_id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en, trailer_key, movie_genres(genres(tmdb_genre_id))",
      { count: "exact" },
    )
    // Poin 1: hanya tampilkan data dengan tmdb_id valid (> 0)
    .gt("tmdb_id", 0)
    .not("poster_path", "is", null);

  if (filteredIds !== null) {
    query = query.in("id", filteredIds);
  }

  // Search
  if (search && search.trim().length > 0) {
    const q = search.trim();
    query = query.or(`title.ilike.%${q}%,original_title.ilike.%${q}%`);
  }

  // Year range
  if (yearFrom) {
    query = query.gte("release_date", `${yearFrom}-01-01`);
  }
  if (yearTo) {
    query = query.lte("release_date", `${yearTo}-12-31`);
  }

  // Vote average range
  if (voteMin !== null && voteMin !== undefined) {
    query = query.gte("vote_average", voteMin);
  }
  if (voteMax !== null && voteMax !== undefined) {
    query = query.lte("vote_average", voteMax);
  }

  // Original language filter
  if (originalLanguage) {
    query = query.eq("original_language", originalLanguage);
  }

  // Sort
  switch (sort) {
    case "top_rated":
      query = query
        .or("original_language.neq.id,vote_average.lt.9")
        .order("vote_average", { ascending: false });
      break;
    case "popular":
      query = query.order("vote_count", { ascending: false });
      break;
    default:
      query = query.order("release_date", { ascending: false });
      break;
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[movies-db] fetchExploreMovies:", error.message);
    return { movies: [], total: 0, page, totalPages: 0 };
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  const movies: CachedMovie[] = (data ?? []).map((m: any) => ({
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.original_language === "id" ? m.original_title || m.title : m.title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average),
    release_date: m.release_date,
    popularity: Number(m.popularity),
    overview: pickOverview(m, lang),
    genre_ids: (m.movie_genres ?? [])
      .map((mg: any) => mg.genres?.tmdb_genre_id)
      .filter(Boolean) as number[],
    trailer: m.trailer_key ?? null,
  }));

  return { movies, total, page, totalPages };
}
