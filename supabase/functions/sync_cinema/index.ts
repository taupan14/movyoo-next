/**
 * sync_cinema/index.ts
 * Supabase Edge Function — scraping jadwal bioskop dari 21cineplex & CGV
 *
 * Flow:
 * 1. Scrape daftar kota & bioskop dari kedua sumber
 * 2. Scrape jadwal film per bioskop untuk hari ini (+ besok)
 * 3. Match judul film ke tabel `movies` via TMDB Search API
 *    - Jika ada di TMDB → upsert ke movies, simpan movie_id
 *    - Jika tidak ada → insert ke movies dengan tmdb_id = 00XXXX (random 4 digit)
 * 4. Upsert ke cinema_schedules
 * 5. Upsert cinema ke movie_platforms dengan platform_id = 9
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";

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

/** Hasilkan tmdb_id palsu untuk film yang tidak ditemukan di TMDB: format 00XXXX */
function fakeTmdbId(): number {
  return parseInt("00" + String(Math.floor(1000 + Math.random() * 9000)));
}

async function fetchHtml(url: string): Promise<Document | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error(`fetchHtml ${url} → HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, "text/html");
  } catch (e) {
    console.error(`fetchHtml ${url} error:`, e.message);
    return null;
  }
}

// ─── TMDB SEARCH ──────────────────────────────────────────────────────────────

interface TmdbMovieResult {
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

async function searchTmdb(title: string): Promise<TmdbMovieResult | null> {
  try {
    const url = new URL(`${TMDB_BASE}/search/movie`);
    url.searchParams.set("api_key", TMDB_KEY);
    url.searchParams.set("query", title);
    url.searchParams.set("language", "id-ID");
    url.searchParams.set("region", "ID");
    url.searchParams.set("page", "1");

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const results: TmdbMovieResult[] = data.results ?? [];
    if (!results.length) return null;

    // Pilih match terbaik: prioritaskan judul sama persis (case-insensitive)
    const exact = results.find(
      (r) =>
        r.title.toLowerCase() === title.toLowerCase() ||
        r.original_title.toLowerCase() === title.toLowerCase(),
    );
    return exact ?? results[0];
  } catch {
    return null;
  }
}

async function fetchTmdbOverviewEn(tmdbId: number): Promise<string> {
  try {
    const url = new URL(`${TMDB_BASE}/movie/${tmdbId}`);
    url.searchParams.set("api_key", TMDB_KEY);
    url.searchParams.set("language", "en-US");
    const res = await fetch(url.toString());
    if (!res.ok) return "";
    const d = await res.json();
    return d.overview ?? "";
  } catch {
    return "";
  }
}

// ─── UPSERT MOVIE (match atau insert baru) ────────────────────────────────────

const movieCache = new Map<string, number>(); // title → internal movies.id

async function resolveMovie(title: string): Promise<number> {
  const key = title.toLowerCase();
  if (movieCache.has(key)) return movieCache.get(key)!;

  // 1. Cek di database dulu by title (case-insensitive)
  const { data: existing } = await supabase
    .from("movies")
    .select("id")
    .ilike("title", title)
    .limit(1)
    .single();

  if (existing?.id) {
    movieCache.set(key, existing.id);
    return existing.id;
  }

  // 2. Cari di TMDB
  const tmdbResult = await searchTmdb(title);

  if (tmdbResult) {
    // Cek apakah tmdb_id sudah ada
    const { data: byTmdb } = await supabase
      .from("movies")
      .select("id")
      .eq("tmdb_id", tmdbResult.id)
      .single();

    if (byTmdb?.id) {
      movieCache.set(key, byTmdb.id);
      return byTmdb.id;
    }

    // Fetch overview bahasa Inggris
    const overviewEn = await fetchTmdbOverviewEn(tmdbResult.id);

    const { data: inserted, error } = await supabase
      .from("movies")
      .upsert(
        {
          tmdb_id: tmdbResult.id,
          title: tmdbResult.title,
          original_title: tmdbResult.original_title ?? null,
          overview: tmdbResult.overview ?? null,
          overview_en: overviewEn || null,
          vote_average: tmdbResult.vote_average ?? 0,
          vote_count: tmdbResult.vote_count ?? 0,
          popularity: tmdbResult.popularity ?? 0,
          original_language: tmdbResult.original_language ?? null,
          poster_path: tmdbResult.poster_path ?? null,
          backdrop_path: tmdbResult.backdrop_path ?? null,
          release_date: tmdbResult.release_date || null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "tmdb_id" },
      )
      .select("id")
      .single();

    if (error) {
      console.error(`Movie upsert TMDB ${tmdbResult.id}:`, error.message);
    }
    if (inserted?.id) {
      movieCache.set(key, inserted.id);
      return inserted.id;
    }
  }

  // 3. Tidak ditemukan di TMDB → insert dengan fake tmdb_id (format 00XXXX)
  let fakeId = fakeTmdbId();
  // Pastikan tidak collision
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase
      .from("movies")
      .select("id")
      .eq("tmdb_id", fakeId)
      .single();
    if (!clash) break;
    fakeId = fakeTmdbId();
  }

  const { data: fallback, error: fallbackErr } = await supabase
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

  if (fallbackErr) {
    console.error(`Fallback movie insert [${title}]:`, fallbackErr.message);
    return 0;
  }

  movieCache.set(key, fallback.id);
  return fallback.id;
}

// ─── 21CINEPLEX SCRAPER ───────────────────────────────────────────────────────

const XXI_BASE = "https://m.21cineplex.com";

interface CinemaRow {
  id: string;
  name: string;
  chain: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
  booking_url: string | null;
  source: string;
}

interface ScheduleRow {
  cinema_id: string;
  movie_id: number | null;
  title: string;
  show_date: string;
  showtimes: string[];
  formats: string[];
  price_min: number | null;
  price_max: number | null;
  age_rating: string | null;
  source: string;
}

async function scrape21Cities(): Promise<string[]> {
  const doc = await fetchHtml(`${XXI_BASE}/id`);
  if (!doc) return [];

  const cityLinks = doc.querySelectorAll('a[href*="/id/"]');
  const cities: Set<string> = new Set();

  cityLinks.forEach((el) => {
    const href = (el as Element).getAttribute("href") ?? "";
    const match = href.match(/\/id\/([^/]+)/);
    if (match && match[1] && match[1] !== "cinema" && match[1].length > 1) {
      cities.add(match[1]);
    }
  });

  // Fallback: kota-kota utama Indonesia
  if (cities.size === 0) {
    return [
      "jakarta",
      "bandung",
      "surabaya",
      "medan",
      "semarang",
      "yogyakarta",
      "tangerang",
      "bekasi",
      "depok",
      "bogor",
      "makassar",
      "palembang",
      "bali",
      "balikpapan",
      "manado",
    ];
  }

  return Array.from(cities);
}

async function scrape21CinemasByCity(
  citySlug: string,
): Promise<{ cinema: CinemaRow; movies: string[] }[]> {
  const doc = await fetchHtml(`${XXI_BASE}/id/${citySlug}`);
  if (!doc) return [];

  const results: { cinema: CinemaRow; movies: string[] }[] = [];

  // Bioskop biasanya ada di list/card dengan nama dan link
  const cinemaCards = doc.querySelectorAll(
    ".cinema-list-item, .cinema-item, [class*='cinema']",
  );

  cinemaCards.forEach((card) => {
    const el = card as Element;
    const nameEl = el.querySelector("h2, h3, .cinema-name, strong, b");
    const name = nameEl?.textContent?.trim() ?? "";
    if (!name || name.length < 3) return;

    const linkEl = el.querySelector("a");
    const href = linkEl?.getAttribute("href") ?? "";
    const addressEl = el.querySelector(".address, .alamat, p");
    const address = addressEl?.textContent?.trim() ?? "";

    // Ambil daftar film yang tayang
    const movieEls = el.querySelectorAll(".movie-title, .film-title, li");
    const movies: string[] = [];
    movieEls.forEach((m) => {
      const t = (m as Element).textContent?.trim() ?? "";
      if (t && t.length > 2 && t.length < 100) movies.push(t);
    });

    const cinemaId = `xxi-${citySlug}-${slugify(name)}`;
    results.push({
      cinema: {
        id: cinemaId,
        name:
          name.includes("XXI") || name.includes("21") ? name : `${name} XXI`,
        chain: "XXI",
        city: citySlug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        address,
        lat: null,
        lng: null,
        google_maps_url: `https://maps.google.com/?q=${encodeURIComponent(name + " " + citySlug)}`,
        booking_url: href ? `${XXI_BASE}${href}` : `https://21cineplex.com`,
        source: "21cineplex",
      },
      movies,
    });
  });

  // Fallback jika struktur berbeda: ambil semua link yang mengandung nama bioskop
  if (results.length === 0) {
    const allLinks = doc.querySelectorAll("a");
    allLinks.forEach((link) => {
      const el = link as Element;
      const text = el.textContent?.trim() ?? "";
      const href = el.getAttribute("href") ?? "";
      if (
        (text.includes("XXI") || text.includes("21")) &&
        text.length > 4 &&
        text.length < 60 &&
        href.includes("/id/")
      ) {
        const cinemaId = `xxi-${citySlug}-${slugify(text)}`;
        results.push({
          cinema: {
            id: cinemaId,
            name: text,
            chain: "XXI",
            city: citySlug
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            address: "",
            lat: null,
            lng: null,
            google_maps_url: `https://maps.google.com/?q=${encodeURIComponent(text + " " + citySlug)}`,
            booking_url: href.startsWith("http") ? href : `${XXI_BASE}${href}`,
            source: "21cineplex",
          },
          movies: [],
        });
      }
    });
  }

  return results;
}

async function scrape21Schedules(
  cinemaId: string,
  cinemaBookingUrl: string,
  showDate: string,
): Promise<ScheduleRow[]> {
  const doc = await fetchHtml(cinemaBookingUrl);
  if (!doc) return [];

  const schedules: ScheduleRow[] = [];

  // Cari blok film dengan jadwal
  const movieBlocks = doc.querySelectorAll(
    ".movie-block, .film-item, .schedule-item, [class*='movie'], [class*='film']",
  );

  movieBlocks.forEach((block) => {
    const el = block as Element;
    const titleEl = el.querySelector(
      "h2, h3, h4, .title, .movie-title, strong",
    );
    const title = titleEl?.textContent?.trim() ?? "";
    if (!title || title.length < 2) return;

    // Showtimes
    const timeEls = el.querySelectorAll(".time, .showtime, [class*='time']");
    const showtimes: string[] = [];
    timeEls.forEach((t) => {
      const txt = (t as Element).textContent?.trim() ?? "";
      if (/\d{2}:\d{2}/.test(txt)) showtimes.push(txt.slice(0, 5));
    });

    // Format (2D, 3D, IMAX, dll)
    const formatEl = el.querySelector(".format, [class*='format']");
    const formats = formatEl ? [formatEl.textContent?.trim() ?? "2D"] : ["2D"];

    schedules.push({
      cinema_id: cinemaId,
      movie_id: null, // akan di-resolve nanti
      title,
      show_date: showDate,
      showtimes,
      formats,
      price_min: null,
      price_max: null,
      age_rating: null,
      source: "21cineplex",
    });
  });

  return schedules;
}

// ─── CGV SCRAPER ──────────────────────────────────────────────────────────────

const CGV_BASE = "https://www.cgv.id";

async function scrapeCgvCinemas(): Promise<
  { cinema: CinemaRow; movies: string[] }[]
> {
  const doc = await fetchHtml(`${CGV_BASE}/cinemas`);
  if (!doc) return [];

  const results: { cinema: CinemaRow; movies: string[] }[] = [];

  const cinemaItems = doc.querySelectorAll(
    ".cinema-item, .cinema-list li, [class*='cinema-name']",
  );

  cinemaItems.forEach((item) => {
    const el = item as Element;
    const nameEl = el.querySelector("a, h3, h4, strong, span");
    const name = nameEl?.textContent?.trim() ?? el.textContent?.trim() ?? "";
    if (!name || name.length < 3) return;

    const linkEl = el.querySelector("a") ?? (el.tagName === "A" ? el : null);
    const href = linkEl?.getAttribute("href") ?? "";

    // City: coba ambil dari parent atau atribut data
    const cityEl = el.closest("[data-city]") ?? el.querySelector("[data-city]");
    const city =
      cityEl?.getAttribute("data-city") ??
      el.closest("section")?.querySelector("h2")?.textContent?.trim() ??
      "Jakarta";

    const cinemaId = `cgv-${slugify(city)}-${slugify(name)}`;
    results.push({
      cinema: {
        id: cinemaId,
        name: name.includes("CGV") ? name : `CGV ${name}`,
        chain: "CGV",
        city,
        address: "",
        lat: null,
        lng: null,
        google_maps_url: `https://maps.google.com/?q=${encodeURIComponent(name + " " + city)}`,
        booking_url: href.startsWith("http")
          ? href
          : href
            ? `${CGV_BASE}${href}`
            : `${CGV_BASE}/cinemas`,
        source: "cgv",
      },
      movies: [],
    });
  });

  // Fallback: ambil dari JSON-LD atau script tag
  if (results.length === 0) {
    const scripts = doc.querySelectorAll(
      "script[type='application/json'], script#__NEXT_DATA__",
    );
    for (const s of Array.from(scripts)) {
      try {
        const raw = (s as Element).textContent ?? "";
        if (!raw.includes("cinema")) continue;
        const json = JSON.parse(raw);
        const cinemaList =
          json?.props?.pageProps?.cinemas ??
          json?.cinemas ??
          json?.data?.cinemas ??
          [];
        for (const c of cinemaList) {
          const name = c.name ?? c.cinema_name ?? "";
          const city = c.city ?? c.kota ?? "Jakarta";
          if (!name) continue;
          const cinemaId = `cgv-${slugify(city)}-${slugify(name)}`;
          results.push({
            cinema: {
              id: cinemaId,
              name: name.includes("CGV") ? name : `CGV ${name}`,
              chain: "CGV",
              city,
              address: c.address ?? "",
              lat: c.lat ?? c.latitude ?? null,
              lng: c.lng ?? c.longitude ?? null,
              google_maps_url:
                c.maps_url ??
                `https://maps.google.com/?q=${encodeURIComponent(name + " " + city)}`,
              booking_url: c.url ?? `${CGV_BASE}/cinemas`,
              source: "cgv",
            },
            movies: [],
          });
        }
        if (results.length > 0) break;
      } catch {
        /* skip */
      }
    }
  }

  return results;
}

async function scrapeCgvSchedules(
  cinemaId: string,
  cinemaUrl: string,
  showDate: string,
): Promise<ScheduleRow[]> {
  const url = cinemaUrl.includes("?")
    ? `${cinemaUrl}&date=${showDate}`
    : `${cinemaUrl}?date=${showDate}`;

  const doc = await fetchHtml(url);
  if (!doc) return [];

  const schedules: ScheduleRow[] = [];

  const movieBlocks = doc.querySelectorAll(
    ".movie-item, .now-playing-item, [class*='movie-schedule'], .schedule-movie",
  );

  movieBlocks.forEach((block) => {
    const el = block as Element;
    const titleEl = el.querySelector(".movie-title, h3, h4, [class*='title']");
    const title = titleEl?.textContent?.trim() ?? "";
    if (!title || title.length < 2) return;

    const ratingEl = el.querySelector("[class*='rating'], .age-rating");
    const age_rating = ratingEl?.textContent?.trim() ?? null;

    const timeEls = el.querySelectorAll(
      "[class*='time'], .showtime-btn, .showtime",
    );
    const showtimes: string[] = [];
    timeEls.forEach((t) => {
      const txt = (t as Element).textContent?.trim() ?? "";
      if (/\d{2}:\d{2}/.test(txt)) showtimes.push(txt.slice(0, 5));
    });

    const formatEls = el.querySelectorAll("[class*='format'], .format-tag");
    const formats: string[] = [];
    formatEls.forEach((f) => {
      const txt = (f as Element).textContent?.trim() ?? "";
      if (txt) formats.push(txt);
    });

    // Harga
    const priceEl = el.querySelector("[class*='price'], .ticket-price");
    let price_min: number | null = null;
    let price_max: number | null = null;
    if (priceEl) {
      const priceText = priceEl.textContent ?? "";
      const prices = priceText
        .match(/\d[\d.]+/g)
        ?.map((p) => parseInt(p.replace(/\./g, "")));
      if (prices?.length) {
        price_min = Math.min(...prices);
        price_max = Math.max(...prices);
      }
    }

    schedules.push({
      cinema_id: cinemaId,
      movie_id: null,
      title,
      show_date: showDate,
      showtimes,
      formats: formats.length ? formats : ["2D"],
      price_min,
      price_max,
      age_rating,
      source: "cgv",
    });
  });

  // Fallback: JSON di dalam page
  if (schedules.length === 0) {
    const scripts = doc.querySelectorAll("script");
    for (const s of Array.from(scripts)) {
      const raw = (s as Element).textContent ?? "";
      if (!raw.includes("showtime") && !raw.includes("schedule")) continue;
      try {
        const jsonMatch = raw.match(/\{[\s\S]+\}/);
        if (!jsonMatch) continue;
        const json = JSON.parse(jsonMatch[0]);
        const movies =
          json?.movies ?? json?.data?.movies ?? json?.schedules ?? [];
        for (const m of movies) {
          const title = m.title ?? m.movie_title ?? m.name ?? "";
          if (!title) continue;
          schedules.push({
            cinema_id: cinemaId,
            movie_id: null,
            title,
            show_date: showDate,
            showtimes: m.times ?? m.showtimes ?? [],
            formats: m.formats ?? ["2D"],
            price_min: m.price_min ?? null,
            price_max: m.price_max ?? null,
            age_rating: m.age_rating ?? null,
            source: "cgv",
          });
        }
        if (schedules.length > 0) break;
      } catch {
        /* skip */
      }
    }
  }

  return schedules;
}

// ─── MAIN SYNC ────────────────────────────────────────────────────────────────

serve(async (req) => {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86_400_000)
    .toISOString()
    .split("T")[0];
  const showDates = [today, tomorrow];

  let totalCinemas = 0;
  let totalSchedules = 0;
  let totalErrors = 0;

  console.log(`[sync_cinema] Start — today: ${today}`);

  try {
    // ── 21CINEPLEX ──────────────────────────────────────────────────────────
    console.log("[sync_cinema] Scraping 21cineplex cities...");
    const cities = await scrape21Cities();
    console.log(`[sync_cinema] Found ${cities.length} cities`);

    for (const city of cities.slice(0, 15)) {
      // batasi 15 kota per run
      await sleep(500);
      const cityData = await scrape21CinemasByCity(city);

      for (const { cinema, movies: movieTitles } of cityData) {
        // Upsert cinema
        const { error: cinErr } = await supabase
          .from("cinemas")
          .upsert(
            { ...cinema, scraped_at: new Date().toISOString() },
            { onConflict: "id" },
          );
        if (cinErr) {
          console.error(`Cinema upsert ${cinema.id}:`, cinErr.message);
          totalErrors++;
          continue;
        }
        totalCinemas++;

        // Scrape & upsert schedules
        for (const showDate of showDates) {
          await sleep(300);
          const schedules = await scrape21Schedules(
            cinema.id,
            cinema.booking_url ?? "",
            showDate,
          );

          for (const sched of schedules) {
            const movieId = await resolveMovie(sched.title);
            if (!movieId) {
              totalErrors++;
              continue;
            }

            // Upsert schedule
            const { error: sErr } = await supabase
              .from("cinema_schedules")
              .upsert(
                {
                  ...sched,
                  movie_id: movieId,
                  scraped_at: new Date().toISOString(),
                },
                { onConflict: "cinema_id,title,show_date" },
              );
            if (sErr) {
              console.error(`Schedule upsert:`, sErr.message);
              totalErrors++;
              continue;
            }

            // movie_platforms: tandai film ini tayang di Bioskop
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

            totalSchedules++;
          }
        }
      }
    }

    // ── CGV ─────────────────────────────────────────────────────────────────
    console.log("[sync_cinema] Scraping CGV cinemas...");
    const cgvData = await scrapeCgvCinemas();
    console.log(`[sync_cinema] CGV cinemas found: ${cgvData.length}`);

    for (const { cinema } of cgvData) {
      await sleep(500);
      const { error: cinErr } = await supabase
        .from("cinemas")
        .upsert(
          { ...cinema, scraped_at: new Date().toISOString() },
          { onConflict: "id" },
        );
      if (cinErr) {
        console.error(`CGV cinema upsert ${cinema.id}:`, cinErr.message);
        totalErrors++;
        continue;
      }
      totalCinemas++;

      for (const showDate of showDates) {
        await sleep(400);
        const schedules = await scrapeCgvSchedules(
          cinema.id,
          cinema.booking_url ?? `${CGV_BASE}/cinemas`,
          showDate,
        );

        for (const sched of schedules) {
          const movieId = await resolveMovie(sched.title);
          if (!movieId) {
            totalErrors++;
            continue;
          }

          const { error: sErr } = await supabase
            .from("cinema_schedules")
            .upsert(
              {
                ...sched,
                movie_id: movieId,
                scraped_at: new Date().toISOString(),
              },
              { onConflict: "cinema_id,title,show_date" },
            );
          if (sErr) {
            console.error(`CGV schedule upsert:`, sErr.message);
            totalErrors++;
            continue;
          }

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

          totalSchedules++;
        }
      }
    }

    console.log(
      `[sync_cinema] Done — cinemas: ${totalCinemas}, schedules: ${totalSchedules}, errors: ${totalErrors}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        cinemas: totalCinemas,
        schedules: totalSchedules,
        errors: totalErrors,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sync_cinema] Fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
