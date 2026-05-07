/**
 * sync_cinema/index.ts  — v2
 *
 * 21cineplex: REST API terbuka (tidak perlu auth)
 *   GET /api/theater?type=getCityList
 *   GET /api/theater?type=getTheaterByCityId&city_id=X
 *   GET /api/movies?type=now-playing&city_id=X
 *   GET /api/movies?type=upcoming
 *
 * CGV: POST /en/execute dengan XSRF token (perlu session)
 *   Flow: GET /en/schedule/cinema → ambil XSRF cookie → POST execute
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const TMDB_KEY = Deno.env.get("TMDB_API_KEY")!;
const TMDB_BASE = "https://api.themoviedb.org/3";
const CINEMA_PLATFORM_ID = 9;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function fakeTmdbId(): number {
  // Format 00XXXX: integer antara 1000–9999, prefix "00" hanya konseptual
  // Simpan sebagai integer biasa tapi tandai dengan range khusus
  return 9_000_000 + Math.floor(Math.random() * 999_999);
}

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
  Referer: "https://m.21cineplex.com/",
};

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...BASE_HEADERS, ...(options?.headers ?? {}) },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.error(`fetchJson ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.error(`fetchJson ${url} error:`, e.message);
    return null;
  }
}

// ─── TMDB HELPERS ─────────────────────────────────────────────────────────────

interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
}

async function searchTmdb(title: string): Promise<TmdbMovie | null> {
  try {
    const url = new URL(`${TMDB_BASE}/search/movie`);
    url.searchParams.set("api_key", TMDB_KEY);
    url.searchParams.set("query", title);
    url.searchParams.set("language", "id-ID");
    url.searchParams.set("region", "ID");

    const data = await fetchJson(url.toString());
    if (!data?.results?.length) return null;

    const results: TmdbMovie[] = data.results;
    return (
      results.find(
        (r) =>
          r.title.toLowerCase() === title.toLowerCase() ||
          r.original_title.toLowerCase() === title.toLowerCase(),
      ) ?? results[0]
    );
  } catch {
    return null;
  }
}

async function fetchOverviewEn(tmdbId: number): Promise<string> {
  try {
    const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`;
    const d = await fetchJson(url);
    return d?.overview ?? "";
  } catch {
    return "";
  }
}

// ─── MOVIE RESOLVER ───────────────────────────────────────────────────────────

const movieCache = new Map<string, number>(); // title.lower → internal id

async function resolveMovie(title: string): Promise<number> {
  const key = title.toLowerCase().trim();
  if (movieCache.has(key)) return movieCache.get(key)!;

  // 1. Cek di DB by title
  const { data: existing } = await supabase
    .from("movies")
    .select("id")
    .ilike("title", title)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    movieCache.set(key, existing.id);
    return existing.id;
  }

  // 2. Cari di TMDB
  const tmdb = await searchTmdb(title);
  if (tmdb) {
    const { data: byTmdb } = await supabase
      .from("movies")
      .select("id")
      .eq("tmdb_id", tmdb.id)
      .maybeSingle();

    if (byTmdb?.id) {
      movieCache.set(key, byTmdb.id);
      return byTmdb.id;
    }

    const overviewEn = await fetchOverviewEn(tmdb.id);
    const { data: inserted, error } = await supabase
      .from("movies")
      .upsert(
        {
          tmdb_id: tmdb.id,
          title: tmdb.title,
          original_title: tmdb.original_title ?? null,
          overview: tmdb.overview ?? null,
          overview_en: overviewEn || null,
          vote_average: tmdb.vote_average ?? 0,
          vote_count: tmdb.vote_count ?? 0,
          popularity: tmdb.popularity ?? 0,
          original_language: tmdb.original_language ?? null,
          poster_path: tmdb.poster_path ?? null,
          backdrop_path: tmdb.backdrop_path ?? null,
          release_date: tmdb.release_date || null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "tmdb_id" },
      )
      .select("id")
      .single();

    if (error) console.error(`Movie upsert error [${title}]:`, error.message);
    if (inserted?.id) {
      movieCache.set(key, inserted.id);
      return inserted.id;
    }
  }

  // 3. Tidak ditemukan → insert dengan fake tmdb_id
  let fakeId = fakeTmdbId();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase
      .from("movies")
      .select("id")
      .eq("tmdb_id", fakeId)
      .maybeSingle();
    if (!clash) break;
    fakeId = fakeTmdbId();
  }

  const { data: fallback, error: fe } = await supabase
    .from("movies")
    .insert({
      tmdb_id: fakeId,
      title,
      vote_average: 0,
      vote_count: 0,
      popularity: 0,
      synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (fe) console.error(`Fallback insert [${title}]:`, fe.message);
  const id = fallback?.id ?? 0;
  if (id) movieCache.set(key, id);
  return id;
}

// ─── UPSERT HELPERS ───────────────────────────────────────────────────────────

async function upsertCinema(cinema: Record<string, any>) {
  const { error } = await supabase
    .from("cinemas")
    .upsert(
      { ...cinema, scraped_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) console.error(`Cinema upsert [${cinema.id}]:`, error.message);
  return !error;
}

async function upsertSchedule(sched: Record<string, any>) {
  const { error } = await supabase
    .from("cinema_schedules")
    .upsert(
      { ...sched, scraped_at: new Date().toISOString() },
      { onConflict: "cinema_id,title,show_date" },
    );
  if (error) console.error(`Schedule upsert:`, error.message);
  return !error;
}

async function upsertMoviePlatform(movieId: number) {
  await supabase.from("movie_platforms").upsert(
    {
      movie_id: movieId,
      platform_id: CINEMA_PLATFORM_ID,
      region: "ID",
      type: "cinema",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "movie_id,platform_id,region" },
  );
}

// ─── 21CINEPLEX ───────────────────────────────────────────────────────────────
// API Base: https://m.21cineplex.com/api/

const XXI_API = "https://m.21cineplex.com/api";
const XXI_HEADERS = {
  ...BASE_HEADERS,
  Referer: "https://m.21cineplex.com/id",
};

interface XxiCity {
  city_id: number | string;
  city_name: string;
}

interface XxiTheater {
  theater_id: string;
  theater_name: string;
  city_id: number | string;
  city_name: string;
  address?: string;
  lat?: string | number;
  lng?: string | number;
  google_maps_url?: string;
}

interface XxiMovie {
  movie_id?: string;
  title: string;
  shows?: Array<{
    time?: string;
    show_time?: string;
    format?: string;
    price?: number;
    price_min?: number;
    price_max?: number;
  }>;
  formats?: string[];
  rating?: string;
  duration?: number;
  showtimes?: string[];
}

async function fetch21Cities(): Promise<XxiCity[]> {
  const data = await fetchJson(`${XXI_API}/theater?type=getCityList`, {
    headers: XXI_HEADERS,
  });

  // Response bisa berupa array langsung atau object {data: [...]}
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.cities)) return data.cities;
  if (Array.isArray(data?.result)) return data.result;

  console.error(
    "Unexpected getCityList response:",
    JSON.stringify(data)?.slice(0, 200),
  );
  return [];
}

async function fetch21TheatersByCity(
  cityId: number | string,
): Promise<XxiTheater[]> {
  const data = await fetchJson(
    `${XXI_API}/theater?type=getTheaterByCityId&city_id=${cityId}`,
    { headers: XXI_HEADERS },
  );

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.theaters)) return data.theaters;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

async function fetch21NowPlaying(cityId: number | string): Promise<XxiMovie[]> {
  const data = await fetchJson(
    `${XXI_API}/movies?type=now-playing&city_id=${cityId}`,
    { headers: XXI_HEADERS },
  );

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.movies)) return data.movies;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

async function sync21Cineplex(
  today: string,
  tomorrow: string,
): Promise<{ cinemas: number; schedules: number; errors: number }> {
  let cinemas = 0,
    schedules = 0,
    errors = 0;

  console.log("[21cineplex] Fetching city list...");
  const cities = await fetch21Cities();
  console.log(`[21cineplex] ${cities.length} cities found`);

  // Batasi 20 kota per run agar tidak timeout
  for (const city of cities.slice(0, 20)) {
    await sleep(400);

    const cityId = city.city_id;
    const cityName = city.city_name ?? String(cityId);

    const theaters = await fetch21TheatersByCity(cityId);
    if (!theaters.length) continue;

    // Ambil film yang tayang di kota ini
    await sleep(300);
    const nowPlayingMovies = await fetch21NowPlaying(cityId);

    for (const theater of theaters) {
      const cinemaId = `xxi-${slugify(cityName)}-${slugify(theater.theater_name)}`;

      const ok = await upsertCinema({
        id: cinemaId,
        name: theater.theater_name,
        chain: "XXI",
        city: cityName,
        address: theater.address ?? null,
        lat: theater.lat ? Number(theater.lat) : null,
        lng: theater.lng ? Number(theater.lng) : null,
        google_maps_url:
          theater.google_maps_url ??
          `https://maps.google.com/?q=${encodeURIComponent(theater.theater_name + " " + cityName)}`,
        booking_url: `https://m.21cineplex.com/id/movies/${slugify(cityName)}`,
        source: "21cineplex",
      });

      if (ok) cinemas++;
      else {
        errors++;
        continue;
      }

      // Upsert jadwal dari film yang tayang
      for (const movie of nowPlayingMovies) {
        const title = movie.title;
        if (!title) continue;

        await sleep(100);
        const movieId = await resolveMovie(title);
        if (!movieId) {
          errors++;
          continue;
        }

        // Kumpulkan showtimes
        const showtimes: string[] = [];
        const formats: string[] = [];

        if (Array.isArray(movie.shows)) {
          for (const s of movie.shows) {
            const t = s.time ?? s.show_time ?? "";
            if (/\d{2}:\d{2}/.test(t)) showtimes.push(t.slice(0, 5));
            if (s.format && !formats.includes(s.format)) formats.push(s.format);
          }
        }
        if (Array.isArray(movie.showtimes)) {
          for (const t of movie.showtimes) {
            if (/\d{2}:\d{2}/.test(t) && !showtimes.includes(t.slice(0, 5)))
              showtimes.push(t.slice(0, 5));
          }
        }
        if (Array.isArray(movie.formats)) formats.push(...movie.formats);

        for (const showDate of [today, tomorrow]) {
          const ok2 = await upsertSchedule({
            cinema_id: cinemaId,
            movie_id: movieId,
            title,
            show_date: showDate,
            showtimes: showtimes.length ? showtimes : null,
            formats: formats.length ? formats : ["2D"],
            price_min: null,
            price_max: null,
            age_rating: movie.rating ?? null,
            source: "21cineplex",
          });
          if (ok2) schedules++;
          else errors++;
        }

        await upsertMoviePlatform(movieId);
      }
    }
  }

  return { cinemas, schedules, errors };
}

// ─── CGV ──────────────────────────────────────────────────────────────────────
// CGV pakai POST /en/execute dengan XSRF token
// Flow: 1) GET /en/schedule/cinema → dapatkan cookie XSRF-TOKEN
//       2) POST /en/execute dengan X-XSRF-TOKEN header

const CGV_BASE = "https://www.cgv.id";

async function getCgvSession(): Promise<{
  cookie: string;
  xsrfToken: string;
} | null> {
  try {
    const res = await fetch(`${CGV_BASE}/en/schedule/cinema`, {
      headers: {
        "User-Agent": BASE_HEADERS["User-Agent"],
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "id-ID,id;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.error(`CGV session GET → HTTP ${res.status}`);
      return null;
    }

    // Ambil semua Set-Cookie
    const setCookieHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];

    let xsrfToken = "";
    const cookieParts: string[] = [];

    for (const cookieStr of setCookieHeaders) {
      // Ambil nama=nilai dari setiap cookie
      const firstPart = cookieStr.split(";")[0].trim();
      if (firstPart) cookieParts.push(firstPart);

      // Cari XSRF-TOKEN
      if (cookieStr.includes("XSRF-TOKEN=")) {
        const match = cookieStr.match(/XSRF-TOKEN=([^;]+)/);
        if (match) xsrfToken = decodeURIComponent(match[1]);
      }
    }

    if (!xsrfToken) {
      console.error("CGV: XSRF-TOKEN not found in cookies");
      return null;
    }

    return { cookie: cookieParts.join("; "), xsrfToken };
  } catch (e: any) {
    console.error("CGV session error:", e.message);
    return null;
  }
}

async function cgvExecute(
  session: { cookie: string; xsrfToken: string },
  payload: Record<string, any>,
): Promise<any> {
  try {
    const res = await fetch(`${CGV_BASE}/en/execute`, {
      method: "POST",
      headers: {
        "User-Agent": BASE_HEADERS["User-Agent"],
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "X-XSRF-TOKEN": session.xsrfToken,
        Cookie: session.cookie,
        Referer: `${CGV_BASE}/en/schedule/cinema`,
        Origin: CGV_BASE,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.error(`CGV execute → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.error("CGV execute error:", e.message);
    return null;
  }
}

async function syncCgv(
  today: string,
  tomorrow: string,
): Promise<{ cinemas: number; schedules: number; errors: number }> {
  let cinemas = 0,
    schedules = 0,
    errors = 0;

  console.log("[CGV] Getting session...");
  const session = await getCgvSession();
  if (!session) {
    console.error("[CGV] Could not get session, skipping");
    return { cinemas, schedules, errors };
  }
  console.log("[CGV] Session OK");

  // Ambil daftar kota
  await sleep(500);
  const cityData = await cgvExecute(session, {
    controller: "Schedule",
    action: "getCity",
  });

  const cityList: Array<{ id: string | number; name: string }> =
    cityData?.result ?? cityData?.data ?? cityData?.cities ?? [];

  if (!cityList.length) {
    // Fallback: kota utama CGV
    console.warn("[CGV] No city list, using fallback cities");
    cityList.push(
      { id: "jakarta", name: "Jakarta" },
      { id: "bandung", name: "Bandung" },
      { id: "surabaya", name: "Surabaya" },
      { id: "medan", name: "Medan" },
      { id: "makassar", name: "Makassar" },
      { id: "semarang", name: "Semarang" },
      { id: "bali", name: "Bali" },
    );
  }

  console.log(`[CGV] ${cityList.length} cities`);

  for (const city of cityList.slice(0, 15)) {
    await sleep(600);

    // Ambil daftar bioskop per kota
    const theaterData = await cgvExecute(session, {
      controller: "Schedule",
      action: "getTheater",
      city: city.id,
    });

    const theaters: any[] =
      theaterData?.result ?? theaterData?.data ?? theaterData?.theaters ?? [];

    for (const theater of theaters) {
      const name =
        theater.name ?? theater.theater_name ?? theater.cinema_name ?? "";
      if (!name) continue;

      const cinemaId = `cgv-${slugify(String(city.name))}-${slugify(name)}`;
      const displayName = name.toLowerCase().includes("cgv")
        ? name
        : `CGV ${name}`;

      const ok = await upsertCinema({
        id: cinemaId,
        name: displayName,
        chain: "CGV",
        city: String(city.name),
        address: theater.address ?? null,
        lat: theater.lat ?? theater.latitude ?? null,
        lng: theater.lng ?? theater.longitude ?? null,
        google_maps_url:
          theater.maps_url ??
          `https://maps.google.com/?q=${encodeURIComponent(displayName + " " + city.name)}`,
        booking_url: theater.url ?? `${CGV_BASE}/en/schedule/cinema`,
        source: "cgv",
      });

      if (ok) cinemas++;
      else {
        errors++;
        continue;
      }

      await sleep(400);

      // Ambil jadwal per bioskop per tanggal
      for (const showDate of [today, tomorrow]) {
        const schedData = await cgvExecute(session, {
          controller: "Schedule",
          action: "getSchedule",
          theater_id: theater.id ?? theater.theater_id,
          date: showDate,
        });

        const movieList: any[] =
          schedData?.result ??
          schedData?.data ??
          schedData?.movies ??
          schedData?.schedule ??
          [];

        for (const movie of movieList) {
          const title = movie.title ?? movie.movie_title ?? movie.name ?? "";
          if (!title) continue;

          await sleep(150);
          const movieId = await resolveMovie(title);
          if (!movieId) {
            errors++;
            continue;
          }

          const showtimes: string[] = [];
          const rawTimes =
            movie.times ?? movie.showtimes ?? movie.show_times ?? [];
          for (const t of rawTimes) {
            const timeStr =
              typeof t === "string" ? t : (t.time ?? t.show_time ?? "");
            if (/\d{2}:\d{2}/.test(timeStr))
              showtimes.push(timeStr.slice(0, 5));
          }

          const formats: string[] =
            movie.formats ?? (movie.format ? [movie.format] : ["2D"]);

          let priceMin: number | null = null;
          let priceMax: number | null = null;
          if (movie.price_min) priceMin = Number(movie.price_min);
          if (movie.price_max) priceMax = Number(movie.price_max);
          if (movie.price && !priceMin) {
            priceMin = Number(movie.price);
            priceMax = Number(movie.price);
          }

          const ok2 = await upsertSchedule({
            cinema_id: cinemaId,
            movie_id: movieId,
            title,
            show_date: showDate,
            showtimes: showtimes.length ? showtimes : null,
            formats,
            price_min: priceMin,
            price_max: priceMax,
            age_rating: movie.age_rating ?? movie.rating ?? null,
            source: "cgv",
          });

          if (ok2) schedules++;
          else errors++;

          await upsertMoviePlatform(movieId);
        }
      }
    }
  }

  return { cinemas, schedules, errors };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

serve(async () => {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86_400_000)
    .toISOString()
    .split("T")[0];

  console.log(`[sync_cinema] Start — ${today}`);

  const [xxiResult, cgvResult] = await Promise.allSettled([
    sync21Cineplex(today, tomorrow),
    syncCgv(today, tomorrow),
  ]);

  const xxi =
    xxiResult.status === "fulfilled"
      ? xxiResult.value
      : { cinemas: 0, schedules: 0, errors: 1 };
  const cgv =
    cgvResult.status === "fulfilled"
      ? cgvResult.value
      : { cinemas: 0, schedules: 0, errors: 1 };

  const summary = {
    success: true,
    xxi,
    cgv,
    total: {
      cinemas: xxi.cinemas + cgv.cinemas,
      schedules: xxi.schedules + cgv.schedules,
      errors: xxi.errors + cgv.errors,
    },
  };

  console.log("[sync_cinema] Done:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
