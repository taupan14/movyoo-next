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
  limit = 15,
): Promise<CachedMovie[]> {
  const { data, error } = await supabase
    .from("movie_categories")
    .select(
      `
      sort_order,
      movies (
        id, tmdb_id, title, poster_path, backdrop_path,
        vote_average, release_date, popularity, overview, overview_en
      )
    `,
    )
    .eq("category", category)
    .eq("region", region)
    .order("sort_order", { ascending: true })
    .limit(limit);

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

async function fetchIndonesian(
  lang: string,
  limit = 15,
): Promise<CachedMovie[]> {
  const { data, error } = await supabase
    .from("movies")
    .select(
      "id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en",
    )
    .eq("original_language", "id")
    .order("release_date", { ascending: false })
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
  const [trendingRes, nowPlayingRes, upcomingRes, popularRes, indonesianRes] =
    await Promise.allSettled([
      fetchCategory("trending", lang, region, 25),
      fetchCategory("now_playing", lang, region, 15),
      fetchCategory("upcoming", lang, region, 15),
      fetchCategory("popular", lang, region, 15),
      fetchIndonesian(lang, 25),
    ]);

  return {
    trending: trendingRes.status === "fulfilled" ? trendingRes.value : [],
    nowPlaying: nowPlayingRes.status === "fulfilled" ? nowPlayingRes.value : [],
    upcoming: upcomingRes.status === "fulfilled" ? upcomingRes.value : [],
    popular: popularRes.status === "fulfilled" ? popularRes.value : [],
    indonesianMovies:
      indonesianRes.status === "fulfilled" ? indonesianRes.value : [],
    netflixTrending: [] as CachedMovie[],
    disneyTrending: [] as CachedMovie[],
  };
}

// ─── EXPLORE ──────────────────────────────────────────────────────────────────

export interface ExploreParams {
  lang: string;
  platform: string; // 'all' | platform slug
  genreId: number | null;
  sort: string; // 'release_date' | 'popular' | 'top_rated' | 'now_playing' | 'coming_soon'
  page: number;
  limit: number;
}

export interface ExploreResult {
  movies: CachedMovie[];
  total: number;
  page: number;
  totalPages: number;
}

export async function fetchExploreMovies(
  params: ExploreParams,
): Promise<ExploreResult> {
  const { lang, platform, genreId, sort, page, limit } = params;
  const offset = (page - 1) * limit;

  // ── 1. Tentukan movie_id set dari filter platform ──────────────────────────
  let platformMovieIds: number[] | null = null; // null = tidak difilter

  if (platform !== "all") {
    // Khusus bahasa asli (bukan platform OTT)
    if (platform === "indonesian" || platform === "korean") {
      const langCode = platform === "indonesian" ? "id" : "ko";
      const { data } = await supabase
        .from("movies")
        .select("id")
        .eq("original_language", langCode)
        .limit(500);
      platformMovieIds = (data ?? []).map((r: any) => r.id);
    } else {
      // Platform OTT / Bioskop: join movie_platforms → platforms
      const { data: platRow } = await supabase
        .from("platforms")
        .select("id")
        .eq("slug", platform)
        .single();

      if (platRow?.id) {
        const { data } = await supabase
          .from("movie_platforms")
          .select("movie_id")
          .eq("platform_id", platRow.id)
          .eq("region", "ID")
          .limit(500);
        platformMovieIds = (data ?? []).map((r: any) => r.movie_id);
      } else {
        platformMovieIds = []; // platform tidak ditemukan → kosong
      }
    }
  }

  // ── 2. Tentukan movie_id set dari filter genre ─────────────────────────────
  let genreMovieIds: number[] | null = null;

  if (genreId !== null) {
    // genres.tmdb_genre_id → genres.id → movie_genres.movie_id
    const { data: genreRow } = await supabase
      .from("genres")
      .select("id")
      .eq("tmdb_genre_id", genreId)
      .single();

    if (genreRow?.id) {
      const { data } = await supabase
        .from("movie_genres")
        .select("movie_id")
        .eq("genre_id", genreRow.id)
        .limit(500);
      genreMovieIds = (data ?? []).map((r: any) => r.movie_id);
    } else {
      genreMovieIds = [];
    }
  }

  // ── 3. Intersect id sets ───────────────────────────────────────────────────
  let filteredIds: number[] | null = null;

  if (platformMovieIds !== null && genreMovieIds !== null) {
    const genreSet = new Set(genreMovieIds);
    filteredIds = platformMovieIds.filter((id) => genreSet.has(id));
  } else if (platformMovieIds !== null) {
    filteredIds = platformMovieIds;
  } else if (genreMovieIds !== null) {
    filteredIds = genreMovieIds;
  }

  // ── 4. Build query utama ───────────────────────────────────────────────────
  let query = supabase
    .from("movies")
    .select(
      "id, title, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en",
      { count: "exact" },
    );

  // Filter by id set
  if (filteredIds !== null) {
    if (filteredIds.length === 0) {
      return { movies: [], total: 0, page, totalPages: 0 };
    }
    query = query.in("id", filteredIds);
  }

  // Filter by sort → category tertentu
  if (sort === "now_playing" || sort === "coming_soon") {
    // Ambil dari movie_categories agar konsisten dengan home
    const category = sort === "now_playing" ? "now_playing" : "upcoming";
    const { data: catData } = await supabase
      .from("movie_categories")
      .select("movie_id")
      .eq("category", category)
      .eq("region", "ID")
      .limit(200);
    const catIds = (catData ?? []).map((r: any) => r.movie_id);

    if (filteredIds !== null) {
      // Intersect lagi
      const catSet = new Set(catIds);
      const intersected = filteredIds.filter((id) => catSet.has(id));
      if (intersected.length === 0)
        return { movies: [], total: 0, page, totalPages: 0 };
      query = supabase
        .from("movies")
        .select(
          "id, title, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en",
          { count: "exact" },
        )
        .in("id", intersected);
    } else {
      if (catIds.length === 0)
        return { movies: [], total: 0, page, totalPages: 0 };
      query = supabase
        .from("movies")
        .select(
          "id, title, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en",
          { count: "exact" },
        )
        .in("id", catIds);
    }
  }

  // Sort
  switch (sort) {
    case "top_rated":
      query = query.order("vote_average", { ascending: false });
      break;
    case "popular":
      query = query.order("popularity", { ascending: false });
      break;
    case "release_date":
    case "coming_soon":
      query = query
        .not("release_date", "is", null)
        .order("release_date", { ascending: false });
      break;
    case "now_playing":
    default:
      query = query.order("popularity", { ascending: false });
  }

  // Pagination
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
    title: m.title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average),
    release_date: m.release_date,
    popularity: Number(m.popularity),
    overview: pickOverview(m, lang),
  }));

  return { movies, total, page, totalPages };
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
