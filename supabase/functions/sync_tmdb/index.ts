import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

// ─── CONFIG ────────────────────────────────────────────────────────────────
const BATCH_SIZE = 5;
const MOVIES_PER_SOURCE = 20;
const DISCOVER_PAGES = 2;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 500;

// Region yang di-sync untuk movie_categories ranking.
// Tambah entry di sini bila ingin support negara lain.
const SYNC_REGION = "ID";

// ─── HELPERS ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tmdbFetch(
  path: string,
  params: Record<string, string> = {},
  attempt = 1,
): Promise<any> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB error ${res.status} on ${path}`);
    return await res.json();
  } catch (err) {
    if (attempt >= RETRY_LIMIT) throw err;
    await sleep(RETRY_DELAY_MS * attempt);
    return tmdbFetch(path, params, attempt + 1);
  }
}

async function getPlatformMap(): Promise<Record<number, any>> {
  const { data, error } = await supabase.from("platforms").select("*");
  if (error) throw new Error(`Failed to load platforms: ${error.message}`);
  const map: Record<number, any> = {};
  data?.forEach((p) => {
    if (p.tmdb_provider_id) map[p.tmdb_provider_id] = p;
  });
  return map;
}

// ─── BATCH RUNNER ──────────────────────────────────────────────────────────

async function runInBatches<T>(
  items: T[],
  size: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const results = await Promise.allSettled(
      batch.map((item, j) => fn(item, i + j)),
    );
    results.forEach((r) => {
      if (r.status === "fulfilled") succeeded++;
      else {
        failed++;
        console.error("Batch item failed:", r.reason?.message ?? r.reason);
      }
    });
    if (i + size < items.length) await sleep(200);
  }

  return { succeeded, failed };
}

// ─── SYNC SINGLE MOVIE ─────────────────────────────────────────────────────

async function syncMovie(
  movie: any,
  platformMap: any,
  category?: string,
  sortOrder?: number,
): Promise<void> {
  const tmdbId = movie.id;

  // Fetch detail dalam dua bahasa sekaligus.
  // overview (id-ID) -> kolom `overview` (Bahasa Indonesia)
  // overview (en-US) -> kolom `overview_en` (Bahasa Inggris)
  const [detailId, detailEn, videos, credits, providers] = await Promise.all([
    tmdbFetch(`/movie/${tmdbId}`, { language: "id-ID" }),
    tmdbFetch(`/movie/${tmdbId}`, { language: "en-US" }),
    tmdbFetch(`/movie/${tmdbId}/videos`),
    tmdbFetch(`/movie/${tmdbId}/credits`),
    tmdbFetch(`/movie/${tmdbId}/watch/providers`),
  ]);

  const trailer = videos.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube",
  );

  // ── UPSERT MOVIE ──
  // Data non-linguistik diambil dari en-US (lebih lengkap).
  // overview disimpan dalam dua kolom terpisah — tidak ada duplikasi row.
  const { data: movieRow, error: movieErr } = await supabase
    .from("movies")
    .upsert(
      {
        tmdb_id: tmdbId,
        title: detailEn.title,
        original_title: detailEn.original_title,
        overview: detailId.overview ?? null, // Bahasa Indonesia
        overview_en: detailEn.overview ?? null, // Bahasa Inggris
        tagline: detailEn.tagline ?? null,
        vote_average: detailEn.vote_average,
        vote_count: detailEn.vote_count,
        popularity: detailEn.popularity,
        status: detailEn.status,
        original_language: detailEn.original_language,
        poster_path: detailEn.poster_path,
        backdrop_path: detailEn.backdrop_path,
        release_date: detailEn.release_date || null,
        runtime: detailEn.runtime,
        budget: detailEn.budget,
        revenue: detailEn.revenue,
        trailer_key: trailer?.key ?? null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "tmdb_id" },
    )
    .select("id")
    .single();

  if (movieErr)
    throw new Error(`Movie upsert failed [${tmdbId}]: ${movieErr.message}`);

  const movieId = movieRow.id;

  // ── MOVIE CATEGORIES ──
  // PK: (movie_id, category, region) — satu film bisa masuk banyak kategori.
  // sort_order = posisi ranking dari list TMDB (0 = teratas).
  if (category !== undefined && sortOrder !== undefined) {
    const { error: catErr } = await supabase.from("movie_categories").upsert(
      {
        movie_id: movieId,
        category,
        region: SYNC_REGION,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "movie_id,category,region" },
    );

    if (catErr) {
      console.error(
        `movie_categories upsert failed [tmdb:${tmdbId}, cat:${category}]:`,
        catErr.message,
      );
    }
  }

  // ── GENRES ──
  for (const g of detailEn.genres ?? []) {
    const { data: genreRow, error: genreErr } = await supabase
      .from("genres")
      .upsert(
        {
          tmdb_genre_id: g.id,
          name: g.name,
          slug: g.name.toLowerCase().replace(/\s+/g, "-"),
        },
        { onConflict: "tmdb_genre_id" },
      )
      .select("id")
      .single();

    if (genreErr) {
      console.error(`Genre upsert failed [${g.name}]:`, genreErr.message);
      continue;
    }

    await supabase
      .from("movie_genres")
      .upsert(
        { movie_id: movieId, genre_id: genreRow.id },
        { onConflict: "movie_id,genre_id" },
      );
  }

  // ── PRODUCTION COMPANIES ──
  for (const c of detailEn.production_companies ?? []) {
    const { data: companyRow, error: compErr } = await supabase
      .from("production_companies")
      .upsert(
        {
          tmdb_company_id: c.id,
          name: c.name,
          logo_path: c.logo_path ?? null,
          origin_country: c.origin_country ?? null,
        },
        { onConflict: "tmdb_company_id" },
      )
      .select("id")
      .single();

    if (compErr) {
      console.error(`Company upsert failed [${c.name}]:`, compErr.message);
      continue;
    }

    await supabase
      .from("movie_companies")
      .upsert(
        { movie_id: movieId, company_id: companyRow.id },
        { onConflict: "movie_id,company_id" },
      );
  }

  // ── PRODUCTION COUNTRIES ──
  if (detailEn.production_countries?.length) {
    await supabase.from("movie_countries").upsert(
      detailEn.production_countries.map((c: any) => ({
        movie_id: movieId,
        iso_3166_1: c.iso_3166_1,
        name: c.name,
      })),
      { onConflict: "movie_id,iso_3166_1" },
    );
  }

  // ── SPOKEN LANGUAGES ──
  if (detailEn.spoken_languages?.length) {
    await supabase.from("movie_languages").upsert(
      detailEn.spoken_languages.map((l: any) => ({
        movie_id: movieId,
        iso_639_1: l.iso_639_1,
        name: l.name,
        english_name: l.english_name ?? null,
      })),
      { onConflict: "movie_id,iso_639_1" },
    );
  }

  // ── PLATFORMS (region ID) ──
  const flatrate = providers.results?.["ID"]?.flatrate ?? [];
  for (const p of flatrate) {
    const platform = platformMap[p.provider_id];
    if (!platform) continue;
    await supabase.from("movie_platforms").upsert(
      {
        movie_id: movieId,
        platform_id: platform.id,
        region: "ID",
        type: "streaming",
      },
      { onConflict: "movie_id,platform_id,region" },
    );
  }

  // ── CAST (top 10) ──
  for (const c of credits.cast?.slice(0, 10) ?? []) {
    await supabase.from("movie_cast").upsert(
      {
        movie_id: movieId,
        person_id: c.id,
        name: c.name,
        character: c.character ?? null,
        profile_path: c.profile_path ?? null,
        order_index: c.order,
      },
      { onConflict: "movie_id,person_id" },
    );
  }

  // ── CREW (director, writer, producer) ──
  const CREW_JOBS = [
    "Director",
    "Writer",
    "Screenplay",
    "Producer",
    "Executive Producer",
  ];
  for (const c of (credits.crew ?? []).filter((c: any) =>
    CREW_JOBS.includes(c.job),
  )) {
    await supabase.from("movie_crew").upsert(
      {
        movie_id: movieId,
        person_id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        profile_path: c.profile_path ?? null,
      },
      { onConflict: "movie_id,person_id,job" },
    );
  }
}

// ─── DISCOVER SYNC ─────────────────────────────────────────────────────────

async function syncDiscover(
  platformMap: any,
): Promise<{ succeeded: number; failed: number }> {
  const { data: stateRow } = await supabase
    .from("sync_state")
    .select("value")
    .eq("key", "discover_last_page")
    .single();

  const lastPage = parseInt(stateRow?.value ?? "0", 10);
  const startPage = lastPage + 1;

  console.log(`[discover] Starting from page ${startPage}`);

  let totalSucceeded = 0;
  let totalFailed = 0;
  let lastCompletedPage = lastPage;

  for (let page = startPage; page < startPage + DISCOVER_PAGES; page++) {
    let data: any;
    try {
      data = await tmdbFetch("/discover/movie", {
        sort_by: "popularity.desc",
        page: String(page),
        "vote_count.gte": "10",
      });
    } catch (err) {
      console.error(`[discover] Failed to fetch page ${page}:`, err.message);
      break;
    }

    if (!data.results?.length) {
      console.log(`[discover] No results on page ${page}, stopping.`);
      break;
    }

    // Discover = bank data saja, tidak masuk kategori spesifik
    const { succeeded, failed } = await runInBatches(
      data.results,
      BATCH_SIZE,
      (movie) => syncMovie(movie, platformMap),
    );

    totalSucceeded += succeeded;
    totalFailed += failed;
    lastCompletedPage = page;
    console.log(
      `[discover] Page ${page}/${data.total_pages}: ${succeeded} ok, ${failed} failed`,
    );

    if (page >= data.total_pages) {
      lastCompletedPage = 0;
      console.log(`[discover] Reached last page, reset to page 1 on next run.`);
      break;
    }

    await sleep(300);
  }

  await supabase.from("sync_state").upsert(
    {
      key: "discover_last_page",
      value: String(lastCompletedPage),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  return { succeeded: totalSucceeded, failed: totalFailed };
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const sourceParam = url.searchParams.get("source");

  const CURATED_SOURCES: Record<string, { path: string; category: string }> = {
    trending: { path: "/trending/movie/day", category: "trending" },
    popular: { path: "/movie/popular", category: "popular" },
    top_rated: { path: "/movie/top_rated", category: "top_rated" },
    upcoming: { path: "/movie/upcoming", category: "upcoming" },
    now_playing: { path: "/movie/now_playing", category: "now_playing" },
  };

  const ALL_SOURCE_KEYS = [...Object.keys(CURATED_SOURCES), "discover"];

  if (sourceParam && !ALL_SOURCE_KEYS.includes(sourceParam)) {
    return new Response(
      JSON.stringify({
        error: `Unknown source: "${sourceParam}". Valid: ${ALL_SOURCE_KEYS.join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // sync_logs.id adalah TEXT (UUID) setelah migration — tidak lagi serial integer
  const logId = crypto.randomUUID();
  const syncType = sourceParam ?? "daily";

  try {
    await supabase.from("sync_logs").insert({
      id: logId,
      sync_type: syncType,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const platformMap = await getPlatformMap();
    let totalSucceeded = 0;
    let totalFailed = 0;

    if (sourceParam === "discover") {
      const { succeeded, failed } = await syncDiscover(platformMap);
      totalSucceeded = succeeded;
      totalFailed = failed;
    } else {
      const sourcesToRun = sourceParam
        ? { [sourceParam]: CURATED_SOURCES[sourceParam] }
        : CURATED_SOURCES;

      for (const [name, { path, category }] of Object.entries(sourcesToRun)) {
        console.log(`[sync] source: ${name} -> category: ${category}`);

        let sourceData: any;
        try {
          // Pass region ke TMDB supaya hasil now_playing/upcoming relevan
          sourceData = await tmdbFetch(path, { region: SYNC_REGION });
        } catch (err) {
          console.error(`[sync] Failed to fetch ${name}:`, err.message);
          totalFailed += MOVIES_PER_SOURCE;
          continue;
        }

        const movies: any[] =
          sourceData.results?.slice(0, MOVIES_PER_SOURCE) ?? [];

        // index dari runInBatches dipakai langsung sebagai sort_order (0 = rank #1)
        const { succeeded, failed } = await runInBatches(
          movies,
          BATCH_SIZE,
          (movie, index) => syncMovie(movie, platformMap, category, index),
        );

        totalSucceeded += succeeded;
        totalFailed += failed;
        console.log(`[sync] ${name}: ${succeeded} ok, ${failed} failed`);
      }
    }

    const status = totalFailed === 0 ? "success" : "partial";

    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: syncType,
      status,
      movies_processed: totalSucceeded,
      movies_failed: totalFailed,
      finished_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        source: syncType,
        succeeded: totalSucceeded,
        failed: totalFailed,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sync] Fatal error:", err.message);
    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: syncType,
      status: "error",
      error_message: err.message,
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
