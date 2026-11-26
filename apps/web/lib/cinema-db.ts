/**
 * lib/cinema-db.ts
 * Query layer untuk tabel cinemas, cinema_movies, showtimes, dan movie_categories.
 */

import { supabase } from "./supabase";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface CinemaItem {
  id: string;
  name: string;
  chain: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  google_maps_url: string;
  booking_url: string;
  source: string;
}

export interface ShowtimeItem {
  id: string;
  show_time: string; // "HH:MM:SS"
  format: string;
  studio_id: number | null;
  ticket_price: number | null;
}

export interface NowPlayingMovie {
  movie_id: number | null;
  title: string;
  genre: string;
  duration: string;
  age_rating: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  overview: string | null;
  cinemas: {
    cinema_movie_id: string;
    cinema_id: string;
    name: string;
    chain: string;
    city: string;
    address: string;
    google_maps_url: string;
    booking_url: string;
    format: string;
    showtimes: ShowtimeItem[];
  }[];
}

/**
 * Now playing result per-chain, masing-masing dengan show_date-nya sendiri.
 */
export interface NowPlayingByChain {
  chain: string;
  movies: NowPlayingMovie[];
  show_date_used: string;
  is_fallback: boolean;
}

export interface NowPlayingResult {
  /** Gabungan semua film dari semua chain (untuk backward compat) */
  movies: NowPlayingMovie[];
  show_date_used: string;
  is_fallback: boolean;
  /** Per-chain breakdown dengan tanggal masing-masing */
  byChain: NowPlayingByChain[];
}

export interface ComingSoonMovie {
  movie_id: number | null;
  title: string;
  genre: string;
  duration: string;
  age_rating: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  overview: string | null;
  earliest_show_date: string;
  cinemas: {
    cinema_id: string;
    name: string;
    chain: string;
    city: string;
    show_date: string;
    format: string;
  }[];
}

export interface UpcomingMovie {
  id: number;
  tmdb_id: number | null;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string | null;
  popularity: number;
  overview: string | null;
  trailer_key: string | null;
  genres: { id: any; name: any; slug: any; tmdb_genre_id: any }[];
}

export interface MovieCrewItem {
  person_id: number;
  name: string;
  job: string;
  department: string | null;
  profile_path: string | null;
}

export interface MovieCastItem {
  id: number;
  person_id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
  order_index: number;
}

export interface MovieCompanyItem {
  id: number;
  name: string | null;
  logo_path: string | null;
  origin_country: string | null;
}

export interface MovieDetailFull {
  id: number;
  tmdb_id: number | null;
  title: string;
  original_title: string | null;
  overview: string | null;
  overview_en: string | null;
  tagline: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  vote_count: number | null;
  runtime: number | null;
  release_date: string | null;
  status: string | null;
  trailer_key: string | null;
  cast: MovieCastItem[];
  crew: MovieCrewItem[];
  companies: MovieCompanyItem[];
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Tanggal hari ini dalam format "YYYY-MM-DD" berdasarkan timezone WIB (UTC+7).
 */
function todayWIB(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split("T")[0];
}

/**
 * Kurangi tanggal "YYYY-MM-DD" dengan sejumlah hari.
 */
function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

function pickOverview(
  m: { overview?: string | null; overview_en?: string | null } | null,
  lang: string,
): string | null {
  if (!m) return null;
  if (lang === "id") return m.overview || m.overview_en || null;
  return m.overview_en || m.overview || null;
}

// ─── CITIES ───────────────────────────────────────────────────────────────────

export async function fetchCinemaCities(): Promise<string[]> {
  const { data, error } = await supabase
    .from("cinemas")
    .select("city")
    .order("city", { ascending: true });

  if (error) {
    console.error("[cinema-db] fetchCinemaCities:", error.message);
    return [];
  }

  const unique = Array.from(
    new Set((data ?? []).map((r: any) => r.city as string).filter(Boolean)),
  );
  return unique.sort();
}

// ─── CINEMAS ──────────────────────────────────────────────────────────────────

export async function fetchCinemas(params: {
  city?: string;
  chain?: string;
}): Promise<CinemaItem[]> {
  let query = supabase
    .from("cinemas")
    .select(
      "id, name, chain, city, address, lat, lng, google_maps_url, booking_url, source",
    )
    .order("name", { ascending: true });

  if (params.city) query = query.eq("city", params.city);
  if (params.chain) query = query.eq("chain", params.chain);

  const { data, error } = await query;

  if (error) {
    console.error("[cinema-db] fetchCinemas:", error.message);
    return [];
  }

  return data ?? [];
}

// ─── NOW PLAYING ──────────────────────────────────────────────────────────────

/**
 * Query cinema_movies untuk tanggal tertentu + cinemaIds yang sudah difilter.
 */
async function queryCinemaMovies(cinemaIds: string[], date: string) {
  const { data, error } = await supabase
    .from("cinema_movies")
    .select(
      `
      id,
      cinema_id,
      movie_id,
      title,
      genre,
      duration,
      age_rating,
      format,
      show_date,
      movies!cinema_movies_movie_id_fkey (
        poster_path,
        backdrop_path,
        vote_average,
        overview,
        overview_en
      )
    `,
    )
    .in("cinema_id", cinemaIds)
    .eq("show_date", date)
    .order("title", { ascending: true });

  if (error) {
    console.error("[cinema-db] queryCinemaMovies:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Cari show_date terbaru yang memiliki data, mundur dari `fromDate`.
 * Maksimal mundur `maxDays` hari.
 */
async function findLatestDateWithData(
  cinemaIds: string[],
  fromDate: string,
  maxDays = 30,
): Promise<{ date: string; isFallback: boolean } | null> {
  for (let i = 0; i <= maxDays; i++) {
    const date = subtractDays(fromDate, i);
    const { data } = await supabase
      .from("cinema_movies")
      .select("id")
      .in("cinema_id", cinemaIds)
      .eq("show_date", date)
      .limit(1);

    if ((data ?? []).length > 0) {
      return { date, isFallback: i > 0 };
    }
  }
  return null;
}

/**
 * Build NowPlayingMovie[] dari list cinema_movies + showtimes.
 */
async function buildNowPlayingMovies(
  cmList: any[],
  cinemaMap: Map<string, any>,
  dateToUse: string,
  lang: string,
): Promise<NowPlayingMovie[]> {
  if (cmList.length === 0) return [];

  const cmIds = cmList.map((cm: any) => cm.id as string);

  const { data: stData, error: stError } = await supabase
    .from("showtimes")
    .select("id, cinema_movie_id, show_time, format, studio_id, ticket_price")
    .in("cinema_movie_id", cmIds)
    .eq("show_date", dateToUse)
    .order("show_time", { ascending: true });

  if (stError) {
    console.error("[cinema-db] nowPlaying – showtimes:", stError.message);
  }

  const showtimeMap = new Map<string, ShowtimeItem[]>();
  for (const st of stData ?? []) {
    const key = (st as any).cinema_movie_id as string;
    if (!showtimeMap.has(key)) showtimeMap.set(key, []);
    showtimeMap.get(key)!.push({
      id: (st as any).id,
      show_time: (st as any).show_time,
      format: (st as any).format,
      studio_id: (st as any).studio_id,
      ticket_price: (st as any).ticket_price,
    });
  }

  const grouped = new Map<string, NowPlayingMovie>();

  for (const cm of cmList) {
    const movie = (cm as any).movies as any;
    const groupKey =
      (cm as any).movie_id != null
        ? `mid_${(cm as any).movie_id}`
        : `ttl_${(cm as any).title}`;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        movie_id: (cm as any).movie_id,
        title: (cm as any).title,
        genre: (cm as any).genre ?? "",
        duration: (cm as any).duration ?? "",
        age_rating: (cm as any).age_rating ?? "",
        poster_path: movie?.poster_path ?? null,
        backdrop_path: movie?.backdrop_path ?? null,
        vote_average:
          movie?.vote_average != null ? Number(movie.vote_average) : null,
        overview: pickOverview(movie, lang),
        cinemas: [],
      });
    }

    const cinema = cinemaMap.get((cm as any).cinema_id);
    const showtimes = showtimeMap.get((cm as any).id) ?? [];

    grouped.get(groupKey)!.cinemas.push({
      cinema_movie_id: (cm as any).id,
      cinema_id: (cm as any).cinema_id,
      name: cinema?.name ?? "",
      chain: cinema?.chain ?? "",
      city: cinema?.city ?? "",
      address: cinema?.address ?? "",
      google_maps_url: cinema?.google_maps_url ?? "",
      booking_url: cinema?.booking_url ?? "",
      format: (cm as any).format ?? "2D",
      showtimes,
    });
  }

  return Array.from(grouped.values());
}

/**
 * Ambil now playing per-chain dengan fallback mundur hari per hari secara independen.
 * Setiap chain dicari tanggal terbarunyanya sendiri.
 */
export async function fetchNowPlayingGrouped(params: {
  city: string;
  chain?: string;
  show_date?: string;
  lang?: string;
}): Promise<NowPlayingResult> {
  const { city, chain, show_date, lang = "en" } = params;
  const today = show_date ?? todayWIB();

  // ── Step 1: ambil semua cinemas di kota ini ──────────────────────────
  const { data: allCinemaData, error: allCinemaError } = await supabase
    .from("cinemas")
    .select("id, name, chain, city, address, google_maps_url, booking_url")
    .eq("city", city);

  if (allCinemaError) {
    console.error("[cinema-db] nowPlaying – cinemas:", allCinemaError.message);
    return {
      movies: [],
      show_date_used: today,
      is_fallback: false,
      byChain: [],
    };
  }

  const allCinemaList = allCinemaData ?? [];
  if (allCinemaList.length === 0) {
    return {
      movies: [],
      show_date_used: today,
      is_fallback: false,
      byChain: [],
    };
  }

  // ── Step 2: tentukan chain yang akan diproses ────────────────────────
  const chainsToProcess = chain
    ? [chain]
    : Array.from(new Set(allCinemaList.map((c: any) => c.chain as string)));

  // ── Step 3: proses tiap chain secara independen ──────────────────────
  const byChainResults: NowPlayingByChain[] = [];
  const allMoviesMap = new Map<string, NowPlayingMovie>();

  for (const currentChain of chainsToProcess) {
    const chainCinemas = allCinemaList.filter(
      (c: any) => c.chain === currentChain,
    );
    if (chainCinemas.length === 0) continue;

    const chainCinemaIds = chainCinemas.map((c: any) => c.id as string);
    const chainCinemaMap = new Map<string, any>(
      chainCinemas.map((c: any) => [c.id, c]),
    );

    // Cari tanggal terbaru yang ada datanya untuk chain ini
    const found = await findLatestDateWithData(chainCinemaIds, today);

    if (!found) {
      byChainResults.push({
        chain: currentChain,
        movies: [],
        show_date_used: today,
        is_fallback: false,
      });
      continue;
    }

    const cmList = await queryCinemaMovies(chainCinemaIds, found.date);
    const movies = await buildNowPlayingMovies(
      cmList,
      chainCinemaMap,
      found.date,
      lang,
    );

    byChainResults.push({
      chain: currentChain,
      movies,
      show_date_used: found.date,
      is_fallback: found.isFallback,
    });

    // Gabungkan ke allMoviesMap (prioritas chain aktif jika ada filter)
    for (const mov of movies) {
      const key =
        mov.movie_id != null ? `mid_${mov.movie_id}` : `ttl_${mov.title}`;
      if (!allMoviesMap.has(key)) {
        allMoviesMap.set(key, { ...mov, cinemas: [...mov.cinemas] });
      } else {
        // merge cinemas
        allMoviesMap.get(key)!.cinemas.push(...mov.cinemas);
      }
    }
  }

  // Tentukan show_date_used & is_fallback untuk top-level (pakai chain pertama yang ada data)
  const firstWithData = byChainResults.find((r) => r.movies.length > 0);
  const topDate = firstWithData?.show_date_used ?? today;
  const topFallback = firstWithData?.is_fallback ?? false;

  return {
    movies: Array.from(allMoviesMap.values()),
    show_date_used: topDate,
    is_fallback: topFallback,
    byChain: byChainResults,
  };
}

// ─── COMING SOON ──────────────────────────────────────────────────────────────

export async function fetchComingSoonGrouped(params: {
  city: string;
  chain?: string;
  lang?: string;
  limit?: number;
}): Promise<ComingSoonMovie[]> {
  const { city, chain, lang = "en", limit = 20 } = params;
  const today = todayWIB();

  let cinemaQuery = supabase
    .from("cinemas")
    .select("id, name, chain, city")
    .eq("city", city);

  if (chain) cinemaQuery = cinemaQuery.eq("chain", chain);

  const { data: cinemaData, error: cinemaError } = await cinemaQuery;

  if (cinemaError) {
    console.error("[cinema-db] comingSoon – cinemas:", cinemaError.message);
    return [];
  }

  const cinemaList = cinemaData ?? [];
  if (cinemaList.length === 0) return [];

  const cinemaIds = cinemaList.map((c: any) => c.id as string);
  const cinemaMap = new Map<string, any>(cinemaList.map((c: any) => [c.id, c]));

  const { data: cmData, error: cmError } = await supabase
    .from("cinema_movies")
    .select(
      `
      id,
      cinema_id,
      movie_id,
      title,
      genre,
      duration,
      age_rating,
      format,
      show_date,
      movies!cinema_movies_movie_id_fkey (
        poster_path,
        backdrop_path,
        vote_average,
        overview,
        overview_en
      )
    `,
    )
    .in("cinema_id", cinemaIds)
    .gt("show_date", today)
    .order("show_date", { ascending: true })
    .order("title", { ascending: true });

  if (cmError) {
    console.error("[cinema-db] comingSoon – cinema_movies:", cmError.message);
    return [];
  }

  const cmList = cmData ?? [];
  if (cmList.length === 0) return [];

  const grouped = new Map<string, ComingSoonMovie>();

  for (const cm of cmList) {
    const movie = (cm as any).movies as any;
    const groupKey =
      (cm as any).movie_id != null
        ? `mid_${(cm as any).movie_id}`
        : `ttl_${(cm as any).title}`;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        movie_id: (cm as any).movie_id,
        title: (cm as any).title,
        genre: (cm as any).genre ?? "",
        duration: (cm as any).duration ?? "",
        age_rating: (cm as any).age_rating ?? "",
        poster_path: movie?.poster_path ?? null,
        backdrop_path: movie?.backdrop_path ?? null,
        vote_average:
          movie?.vote_average != null ? Number(movie.vote_average) : null,
        overview: pickOverview(movie, lang),
        earliest_show_date: (cm as any).show_date,
        cinemas: [],
      });
    }

    const cinema = cinemaMap.get((cm as any).cinema_id);
    grouped.get(groupKey)!.cinemas.push({
      cinema_id: (cm as any).cinema_id,
      name: cinema?.name ?? "",
      chain: cinema?.chain ?? "",
      city: cinema?.city ?? "",
      show_date: (cm as any).show_date,
      format: (cm as any).format ?? "2D",
    });
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.earliest_show_date.localeCompare(b.earliest_show_date))
    .slice(0, limit);
}

// ─── UPCOMING (from cinema_movies, show_date > today) ────────────────────────

/**
 * Ambil film yang belum/akan tayang berdasarkan cinema_movies.show_date > hari ini.
 * Dikelompokkan per film (grouped by movie_id / title), independent dari chain.
 */
export async function fetchUpcomingMovies(params: {
  city: string;
  lang?: string;
  limit?: number;
}): Promise<UpcomingMovie[]> {
  const { city, lang = "en", limit = 15 } = params;
  const today = todayWIB();

  const { data, error } = await supabase
    .from("movies")
    .select(
      `
    id,
    tmdb_id,
    title,
    poster_path,
    backdrop_path,
    vote_average,
    release_date,
    popularity,
    overview,
    overview_en,
    trailer_key,

    movie_genres (
      genres (
        id,
        name,
        slug,
        tmdb_genre_id
      )
    )
  `,
    )
    .gt("release_date", today)
    .order("release_date", { ascending: true });

  if (error) {
    console.error("[cinema-db] fetchUpcomingMovies:", error.message);
    return [];
  }

  const seen = new Map<string, UpcomingMovie>();

  for (const movie of data ?? []) {
    const groupKey =
      movie.tmdb_id != null ? `tmdb_${movie.tmdb_id}` : `movie_${movie.id}`;

    if (!seen.has(groupKey)) {
      seen.set(groupKey, {
        id: movie.id,
        tmdb_id: movie.tmdb_id,
        title: movie.title,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        vote_average:
          movie.vote_average != null ? Number(movie.vote_average) : 0,
        release_date: movie.release_date,
        popularity: movie.popularity != null ? Number(movie.popularity) : 0,
        overview:
          lang === "en" ? movie.overview_en || movie.overview : movie.overview,
        trailer_key: movie.trailer_key,

        genres:
          movie.movie_genres?.map((mg: any) => ({
            id: mg.genres?.id,
            name: mg.genres?.name,
            slug: mg.genres?.slug,
            tmdb_genre_id: mg.genres?.tmdb_genre_id,
          })) ?? [],
      });
    }
  }

  return Array.from(seen.values()).slice(0, limit);
}

// ─── MOVIE DETAIL (cast, crew, companies, trailer) ────────────────────────────

/**
 * Ambil detail lengkap sebuah film berdasarkan movie_id (internal id, bukan tmdb_id).
 * Includes: cast, crew, production companies, trailer_key dari tabel movies.
 */
export async function fetchMovieDetail(
  movieId: number,
  lang: string = "en",
): Promise<MovieDetailFull | null> {
  // Parallel fetch: movie base + cast + crew + companies
  const [movieRes, castRes, crewRes, companiesRes] = await Promise.all([
    supabase
      .from("movies")
      .select(
        "id, tmdb_id, title, original_title, overview, overview_en, tagline, " +
          "poster_path, backdrop_path, vote_average, vote_count, runtime, " +
          "release_date, status, trailer_key",
      )
      .eq("id", movieId)
      .single(),

    supabase
      .from("movie_cast")
      .select("id, person_id, name, character, profile_path, order_index")
      .eq("movie_id", movieId)
      .order("order_index", { ascending: true })
      .limit(30),

    supabase
      .from("movie_crew")
      .select("person_id, name, job, department, profile_path")
      .eq("movie_id", movieId),

    supabase
      .from("movie_companies")
      .select("production_companies ( id, name, logo_path, origin_country )")
      .eq("movie_id", movieId),
  ]);

  if (movieRes.error || !movieRes.data) {
    console.error(
      "[cinema-db] fetchMovieDetail – movie:",
      movieRes.error?.message,
    );
    return null;
  }

  const m = movieRes.data as any;

  const cast: MovieCastItem[] = (castRes.data ?? []).map((c: any) => ({
    id: c.id,
    person_id: c.person_id,
    name: c.name,
    character: c.character ?? null,
    profile_path: c.profile_path ?? null,
    order_index: c.order_index ?? 0,
  }));

  const crew: MovieCrewItem[] = (crewRes.data ?? []).map((c: any) => ({
    person_id: c.person_id,
    name: c.name ?? "",
    job: c.job,
    department: c.department ?? null,
    profile_path: c.profile_path ?? null,
  }));

  const companies: MovieCompanyItem[] = (companiesRes.data ?? [])
    .map((row: any) => row.production_companies)
    .filter(Boolean)
    .map((pc: any) => ({
      id: pc.id,
      name: pc.name ?? null,
      logo_path: pc.logo_path ?? null,
      origin_country: pc.origin_country ?? null,
    }));

  return {
    id: m.id,
    tmdb_id: m.tmdb_id ?? null,
    title: m.title,
    original_title: m.original_title ?? null,
    overview: pickOverview(m, lang),
    overview_en: m.overview_en ?? null,
    tagline: m.tagline ?? null,
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    vote_average: m.vote_average != null ? Number(m.vote_average) : null,
    vote_count: m.vote_count ?? null,
    runtime: m.runtime ?? null,
    release_date: m.release_date ?? null,
    status: m.status ?? null,
    trailer_key: m.trailer_key ?? null,
    cast,
    crew,
    companies,
  };
}

// ─── CINEMA DETAIL + SHOWTIMES (untuk modal detail bioskop) ──────────────────

export interface CinemaShowtimeSlot {
  show_time: string; // "HH:MM:SS"
  format: string;
  studio_id: number | null;
  ticket_price: number | null;
}

export interface CinemaMovieShowtimes {
  movie_id: number | null;
  cinema_movie_id: string;
  title: string;
  genre: string;
  duration: string;
  age_rating: string;
  poster_path: string | null;
  showtimes: CinemaShowtimeSlot[];
}

export interface CinemaDetailResult {
  cinema: CinemaItem | null;
  show_date_used: string;
  is_fallback: boolean;
  movies: CinemaMovieShowtimes[];
}

/**
 * Ambil detail lengkap satu bioskop + daftar film & showtime (jam + harga)
 * untuk tanggal tertentu. Fallback mundur ke tanggal terbaru yang ada datanya
 * jika show_date yang diminta kosong (pola sama seperti fetchNowPlayingGrouped).
 */
export async function fetchCinemaDetailWithShowtimes(params: {
  cinemaId: string;
  show_date?: string;
}): Promise<CinemaDetailResult> {
  const { cinemaId, show_date } = params;
  const today = show_date ?? todayWIB();

  const { data: cinemaData, error: cinemaError } = await supabase
    .from("cinemas")
    .select(
      "id, name, chain, city, address, lat, lng, google_maps_url, booking_url, source",
    )
    .eq("id", cinemaId)
    .single();

  if (cinemaError || !cinemaData) {
    console.error(
      "[cinema-db] fetchCinemaDetailWithShowtimes – cinema:",
      cinemaError?.message,
    );
    return {
      cinema: null,
      show_date_used: today,
      is_fallback: false,
      movies: [],
    };
  }

  const found = await findLatestDateWithData([cinemaId], today);

  if (!found) {
    return {
      cinema: cinemaData,
      show_date_used: today,
      is_fallback: false,
      movies: [],
    };
  }

  const cmList = await queryCinemaMovies([cinemaId], found.date);

  if (cmList.length === 0) {
    return {
      cinema: cinemaData,
      show_date_used: found.date,
      is_fallback: found.isFallback,
      movies: [],
    };
  }

  const cmIds = cmList.map((cm: any) => cm.id as string);

  const { data: stData, error: stError } = await supabase
    .from("showtimes")
    .select("cinema_movie_id, show_time, format, studio_id, ticket_price")
    .in("cinema_movie_id", cmIds)
    .eq("show_date", found.date)
    .order("show_time", { ascending: true });

  if (stError) {
    console.error(
      "[cinema-db] fetchCinemaDetailWithShowtimes – showtimes:",
      stError.message,
    );
  }

  const showtimeMap = new Map<string, CinemaShowtimeSlot[]>();
  for (const st of stData ?? []) {
    const key = (st as any).cinema_movie_id as string;
    if (!showtimeMap.has(key)) showtimeMap.set(key, []);
    showtimeMap.get(key)!.push({
      show_time: (st as any).show_time,
      format: (st as any).format,
      studio_id: (st as any).studio_id,
      ticket_price: (st as any).ticket_price,
    });
  }

  const movies: CinemaMovieShowtimes[] = cmList.map((cm: any) => {
    const movie = cm.movies as any;
    return {
      movie_id: cm.movie_id,
      cinema_movie_id: cm.id,
      title: cm.title,
      genre: cm.genre ?? "",
      duration: cm.duration ?? "",
      age_rating: cm.age_rating ?? "",
      poster_path: movie?.poster_path ?? null,
      showtimes: showtimeMap.get(cm.id) ?? [],
    };
  });

  return {
    cinema: cinemaData,
    show_date_used: found.date,
    is_fallback: found.isFallback,
    movies,
  };
}
