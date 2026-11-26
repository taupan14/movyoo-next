/**
 * lib/tv-db.ts
 *
 * Fungsi untuk mengambil data TV Series dan Pemeran Populer dari Supabase.
 * Dipanggil oleh /api/movies/home route handler.
 */

import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TvSeries {
  id: number;
  tmdb_id: number;
  name: string;
  original_name?: string;
  overview?: string;
  overview_en?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date?: string;
  popularity?: number;
  number_of_seasons?: number;
}

export interface PopularCastMember {
  person_id: number;
  name: string;
  profile_path: string | null;
  total_appearances: number;
  avg_popularity: number;
  known_for: string;
  titles: string[];
}

export interface HomeTvData {
  onAirSeries: TvSeries[];
  popularSeries: TvSeries[];
  trendingSeries: TvSeries[];
  popularCast: PopularCastMember[];
}

export interface TvExploreItem {
  id: number;
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date?: string;
  popularity?: number;
  overview?: string;
  number_of_seasons?: number;
  genre_ids?: number[]; // tmdb_genre_id[]
  trailer?: string | null; // YouTube video id
}

export interface TvExploreParams {
  lang: string;
  platforms: string[]; // [] = all, atau array slug platform
  genreIds: number[]; // [] = all, atau array tmdb_genre_id
  sort: string; // 'on_the_air' | 'popular' | 'trending' | 'top_rated'
  page: number;
  limit: number;
  search?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  networkId?: number | null;
  voteMin?: number | null;
  voteMax?: number | null;
  originalLanguage?: string;
}

export interface TvExploreResult {
  series: TvExploreItem[];
  total: number;
  page: number;
  totalPages: number;
}

const MIN_VOTES = 100;
// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickOverview(
  row: { overview: string | null; overview_en: string | null },
  lang: string,
): string {
  if (lang === "id") return row.overview || row.overview_en || "";
  return row.overview_en || row.overview || "";
}

// ─── TV Series by Category ────────────────────────────────────────────────────

async function fetchTvByCategory(
  category: string,
  region: string,
  lang: string,
  limit = 15,
): Promise<TvSeries[]> {
  let query = supabase
    .from("tv_series")
    .select(
      `
      id,
      tmdb_id,
      name,
      original_name,
      overview,
      overview_en,
      poster_path,
      backdrop_path,
      vote_average,
      first_air_date,
      popularity,
      number_of_seasons
    `,
    )
    .gt("tmdb_id", 0);

  // trending & on_the_air
  if (category === "trending" || category === "on_the_air") {
    const { data: categoryRows } = await supabase
      .from("tv_categories")
      .select("series_id")
      .eq("category", category)
      .eq("region", region);

    const ids = (categoryRows ?? []).map((r) => Number(r.series_id));

    if (ids.length === 0) {
      return [];
    }

    query = query.in("id", ids);
  }

  // sort sama persis seperti fetchExploreTvSeries
  switch (category) {
    case "top_rated":
      query = query
        .gte("vote_count", MIN_VOTES)
        .order("vote_average", { ascending: false })
        .order("vote_count", { ascending: false });
      break;

    case "popular":
      query = query
        .order("vote_count", { ascending: false })
        .order("vote_average", { ascending: false });
      break;
    case "trending":
    case "on_the_air":
    default:
      query = query.order("popularity", { ascending: false });
      break;
  }

  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error(`[tv-db] fetchTvByCategory(${category}):`, error.message);
    return [];
  }

  return (data ?? []).map((s: any) => ({
    id: s.id,
    tmdb_id: s.tmdb_id,
    name: s.name,
    original_name: s.original_name,
    overview: pickOverview(s, lang),
    overview_en: s.overview_en,
    poster_path: s.poster_path,
    backdrop_path: s.backdrop_path,
    vote_average: Number(s.vote_average),
    first_air_date: s.first_air_date,
    popularity: Number(s.popularity),
    number_of_seasons: s.number_of_seasons,
  })) as TvSeries[];
}

// ─── Popular Cast ─────────────────────────────────────────────────────────────

/**
 * Ambil pemeran populer berdasarkan penampilan dalam 6 bulan terakhir.
 *
 * Karena Supabase JS tidak support filter kolom joined table secara langsung,
 * kita ambil dulu movie_id / series_id yang masuk range tanggal,
 * lalu query cast dengan filter .in("movie_id", [...]).
 */
export async function fetchPopularCast(
  limit = 12,
): Promise<PopularCastMember[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateThreshold = sixMonthsAgo.toISOString().split("T")[0];

  // Step 1: ambil movie id yang rilis dalam 6 bulan terakhir
  const { data: recentMovies } = await supabase
    .from("movies")
    .select("id, title, popularity")
    .gte("release_date", dateThreshold)
    .order("popularity", { ascending: false })
    .limit(200);

  // Step 2: ambil series id yang mulai tayang dalam 6 bulan terakhir
  const { data: recentSeries } = await supabase
    .from("tv_series")
    .select("id, name, popularity")
    .gte("first_air_date", dateThreshold)
    .order("popularity", { ascending: false })
    .limit(200);

  const movieIds = (recentMovies ?? []).map((m: any) => m.id);
  const seriesIds = (recentSeries ?? []).map((s: any) => s.id);

  // Buat lookup popularity & title berdasarkan id
  const moviePopMap = new Map<number, { title: string; popularity: number }>(
    (recentMovies ?? []).map((m: any) => [
      m.id,
      { title: m.title, popularity: Number(m.popularity) || 0 },
    ]),
  );
  const seriesPopMap = new Map<number, { title: string; popularity: number }>(
    (recentSeries ?? []).map((s: any) => [
      s.id,
      { title: s.name, popularity: Number(s.popularity) || 0 },
    ]),
  );

  // Step 3: ambil cast dari movie & series yang masuk range
  const [movieCastRes, tvCastRes] = await Promise.allSettled([
    movieIds.length > 0
      ? supabase
          .from("movie_cast")
          .select("person_id, name, profile_path")
          .in("movie_id", movieIds)
          .not("profile_path", "is", null)
      : Promise.resolve({ data: [] }),

    seriesIds.length > 0
      ? supabase
          .from("tv_cast")
          .select("person_id, name, profile_path, series_id")
          .in("series_id", seriesIds)
          .not("profile_path", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  // Step 4: untuk movie cast kita perlu movie_id — query ulang dengan kolom itu
  const [movieCastFullRes] = await Promise.allSettled([
    movieIds.length > 0
      ? supabase
          .from("movie_cast")
          .select("person_id, name, profile_path, movie_id")
          .in("movie_id", movieIds)
          .not("profile_path", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  const movieCastFull =
    movieCastFullRes.status === "fulfilled"
      ? ((movieCastFullRes.value as any).data ?? [])
      : [];
  const tvCast =
    tvCastRes.status === "fulfilled"
      ? ((tvCastRes.value as any).data ?? [])
      : [];

  // Step 5: agregasi per person_id
  const castMap = new Map<
    number,
    {
      person_id: number;
      name: string;
      profile_path: string | null;
      appearances: number;
      total_popularity: number;
      known_for: string;
      titles: Set<string>;
    }
  >();

  const upsert = (
    person_id: number,
    name: string,
    profile_path: string | null,
    title: string,
    popularity: number,
  ) => {
    const existing = castMap.get(person_id);
    if (existing) {
      existing.appearances++;
      existing.total_popularity += popularity;
      existing.titles.add(title);
    } else {
      castMap.set(person_id, {
        person_id,
        name,
        profile_path,
        appearances: 1,
        total_popularity: popularity,
        known_for: title,
        titles: new Set([title]),
      });
    }
  };

  for (const row of movieCastFull as any[]) {
    const info = moviePopMap.get(row.movie_id);
    if (!info) continue;
    upsert(
      row.person_id,
      row.name,
      row.profile_path,
      info.title,
      info.popularity,
    );
  }

  for (const row of tvCast as any[]) {
    const info = seriesPopMap.get(row.series_id);
    if (!info) continue;
    upsert(
      row.person_id,
      row.name,
      row.profile_path,
      info.title,
      info.popularity,
    );
  }

  // Step 6: hitung skor, urutkan, potong
  return Array.from(castMap.values())
    .map((c) => ({
      person_id: c.person_id,
      name: c.name,
      profile_path: c.profile_path,
      total_appearances: c.appearances,
      avg_popularity:
        c.appearances > 0 ? c.total_popularity / c.appearances : 0,
      _score: c.appearances * (c.total_popularity / Math.max(c.appearances, 1)),
      known_for: c.known_for,
      titles: Array.from(c.titles).slice(0, 3),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchHomeTvSeries(
  lang: string,
  region: string,
): Promise<HomeTvData> {
  // Nilai category sesuai data di database: on_the_air, popular, trending
  const [onAirRes, popularRes, trendingRes, castRes] = await Promise.allSettled(
    [
      fetchTvByCategory("on_the_air", region, lang, 15),
      fetchTvByCategory("popular", region, lang, 15),
      fetchTvByCategory("trending", region, lang, 10),
      fetchPopularCast(12),
    ],
  );

  return {
    onAirSeries: onAirRes.status === "fulfilled" ? onAirRes.value : [],
    popularSeries: popularRes.status === "fulfilled" ? popularRes.value : [],
    trendingSeries: trendingRes.status === "fulfilled" ? trendingRes.value : [],
    popularCast: castRes.status === "fulfilled" ? castRes.value : [],
  };
}

export async function fetchExploreTvSeries(
  params: TvExploreParams,
): Promise<TvExploreResult> {
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
    networkId,
    voteMin,
    voteMax,
    originalLanguage,
  } = params;
  const offset = (page - 1) * limit;

  // ── 1. Sort "on_the_air" / "trending" → pakai tv_categories sebagai pre-filter
  //    "popular" / "top_rated" → langsung query tv_series, TIDAK pre-filter by category
  //    Ini fix bug "hanya 38 item" — tv_categories hanya simpan subset kecil
  let categorySeriesIds: number[] | null = null;

  if (sort === "on_the_air" || sort === "trending") {
    const { data: catData } = await supabase
      .from("tv_categories")
      .select("series_id")
      .eq("category", sort)
      .eq("region", "ID")
      .limit(1000);
    categorySeriesIds = (catData ?? []).map((r: any) => Number(r.series_id));
  }

  // ── 2. Platform filter → union series_id dari semua platform yang dipilih ──
  let platformSeriesIds: number[] | null = null;

  if (platforms.length > 0) {
    const { data: platRows } = await supabase
      .from("platforms")
      .select("id")
      .in("slug", platforms);

    const platIds = (platRows ?? []).map((r: any) => r.id);

    if (platIds.length > 0) {
      const { data } = await supabase
        .from("tv_platforms")
        .select("series_id")
        .in("platform_id", platIds)
        .eq("region", "ID")
        .limit(5000);
      // Union (deduplicate) — user pilih multi platform = OR logic
      const set = new Set((data ?? []).map((r: any) => Number(r.series_id)));
      platformSeriesIds = Array.from(set);
    } else {
      platformSeriesIds = [];
    }
  }

  // ── 3. Genre filter → intersect series_id dari semua genre yang dipilih ───
  //    Multi genre = AND logic (harus punya semua genre)
  let genreSeriesIds: number[] | null = null;

  if (genreIds.length > 0) {
    // Ambil internal genre id dari tmdb_genre_id
    const { data: genreRows } = await supabase
      .from("genres")
      .select("id")
      .in("tmdb_genre_id", genreIds);

    const internalGenreIds = (genreRows ?? []).map((r: any) => r.id);

    if (internalGenreIds.length > 0) {
      // Query series untuk setiap genre, lalu intersect
      const perGenre = await Promise.all(
        internalGenreIds.map((gid) =>
          supabase
            .from("tv_genres")
            .select("series_id")
            .eq("genre_id", gid)
            .limit(5000)
            .then(
              (res) =>
                new Set((res.data ?? []).map((r: any) => Number(r.series_id))),
            ),
        ),
      );

      // AND: hanya series yang ada di SEMUA genre
      let intersection = perGenre[0];
      for (let i = 1; i < perGenre.length; i++) {
        intersection = new Set(
          [...intersection].filter((id) => perGenre[i].has(id)),
        );
      }
      genreSeriesIds = Array.from(intersection);
    } else {
      genreSeriesIds = [];
    }
  }

  // ── 4. Network filter → set of series_ids ────────────────────────────────
  let networkSeriesIds: number[] | null = null;

  if (networkId !== null && networkId !== undefined) {
    const { data } = await supabase
      .from("tv_series_networks")
      .select("series_id")
      .eq("network_id", networkId)
      .limit(5000);
    networkSeriesIds = (data ?? []).map((r: any) => Number(r.series_id));
  }

  // ── 5. Intersect semua id sets ─────────────────────────────────────────────
  const idSets = [
    categorySeriesIds,
    platformSeriesIds,
    genreSeriesIds,
    networkSeriesIds,
  ].filter((s): s is number[] => s !== null);

  let filteredIds: number[] | null = null;
  if (idSets.length > 0) {
    filteredIds = idSets.reduce((acc, cur) => {
      const curSet = new Set(cur);
      return acc.filter((id) => curSet.has(id));
    });
  }

  if (filteredIds !== null && filteredIds.length === 0) {
    return { series: [], total: 0, page, totalPages: 0 };
  }

  // ── 6. Build main query ───────────────────────────────────────────────────
  let query = supabase
    .from("tv_series")
    .select(
      "id, tmdb_id, name, original_name, poster_path, backdrop_path, vote_average, first_air_date, popularity, overview, overview_en, number_of_seasons, trailer_key, tv_genres(genres(tmdb_genre_id))",
      { count: "exact" },
    )
    // Poin 1: hanya tampilkan data dengan tmdb_id valid (> 0)
    .gt("tmdb_id", 0);

  if (filteredIds !== null) {
    query = query.in("id", filteredIds);
  }

  // Search
  if (search && search.trim().length > 0) {
    const q = search.trim();
    query = query.or(`name.ilike.%${q}%,original_name.ilike.%${q}%`);
  }

  // Year range
  if (yearFrom) {
    query = query.gte("first_air_date", `${yearFrom}-01-01`);
  }
  if (yearTo) {
    query = query.lte("first_air_date", `${yearTo}-12-31`);
  }

  // Vote range
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
        .gte("vote_count", MIN_VOTES)
        .order("vote_average", { ascending: false })
        .order("vote_count", { ascending: false });
      break;
    case "on_the_air":
    case "trending":
    case "popular":
      query = query
        .order("vote_count", { ascending: false })
        .order("vote_average", { ascending: false });
    default:
      query = query.order("popularity", { ascending: false });
      break;
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[tv-explore-db] fetchExploreTvSeries:", error.message);
    return { series: [], total: 0, page, totalPages: 0 };
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  const series: TvExploreItem[] = (data ?? []).map((s: any) => ({
    id: s.id,
    tmdb_id: s.tmdb_id,
    name: s.name,
    poster_path: s.poster_path,
    backdrop_path: s.backdrop_path,
    vote_average: Number(s.vote_average),
    first_air_date: s.first_air_date,
    popularity: Number(s.popularity),
    overview: pickOverview(s, lang),
    number_of_seasons: s.number_of_seasons,
    genre_ids: (s.tv_genres ?? [])
      .map((tg: any) => tg.genres?.tmdb_genre_id)
      .filter(Boolean) as number[],
    trailer: s.trailer_key ?? null,
  }));

  return { series, total, page, totalPages };
}
