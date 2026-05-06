import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

// ─── CONFIG ────────────────────────────────────────────────────────────────
const BATCH_SIZE = 5; // movies processed concurrently per batch
const MOVIES_PER_SOURCE = 20; // max movies per trending/popular/etc source
const DISCOVER_PAGES = 5; // pages fetched per discover run (20 movies/page = 100 movies)
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 500;

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
  fn: (item: T) => Promise<void>,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const results = await Promise.allSettled(batch.map(fn));
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

async function syncMovie(movie: any, platformMap: any): Promise<void> {
  const tmdbId = movie.id;

  const [detail, videos, credits, providers] = await Promise.all([
    tmdbFetch(`/movie/${tmdbId}`, { language: "id-ID" }),
    tmdbFetch(`/movie/${tmdbId}/videos`),
    tmdbFetch(`/movie/${tmdbId}/credits`),
    tmdbFetch(`/movie/${tmdbId}/watch/providers`),
  ]);

  const trailer = videos.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube",
  );

  // ── UPSERT MOVIE ──
  const { data: movieRow, error: movieErr } = await supabase
    .from("movies")
    .upsert(
      {
        tmdb_id: tmdbId,
        title: detail.title,
        original_title: detail.original_title,
        overview: detail.overview,
        tagline: detail.tagline,
        vote_average: detail.vote_average,
        vote_count: detail.vote_count,
        popularity: detail.popularity,
        status: detail.status,
        original_language: detail.original_language,
        poster_path: detail.poster_path,
        backdrop_path: detail.backdrop_path,
        release_date: detail.release_date || null,
        runtime: detail.runtime,
        budget: detail.budget,
        revenue: detail.revenue,
        trailer_key: trailer?.key ?? null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "tmdb_id" },
    )
    .select()
    .single();

  if (movieErr)
    throw new Error(`Movie upsert failed [${tmdbId}]: ${movieErr.message}`);
  const movieId = movieRow.id;

  // ── GENRES ──
  if (detail.genres?.length) {
    for (const g of detail.genres) {
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
        .select()
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
  }

  // ── PRODUCTION COMPANIES ──
  if (detail.production_companies?.length) {
    for (const c of detail.production_companies) {
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
        .select()
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
  }

  // ── PRODUCTION COUNTRIES ──
  if (detail.production_countries?.length) {
    const rows = detail.production_countries.map((c: any) => ({
      movie_id: movieId,
      iso_3166_1: c.iso_3166_1,
      name: c.name,
    }));
    await supabase
      .from("movie_countries")
      .upsert(rows, { onConflict: "movie_id,iso_3166_1" });
  }

  // ── SPOKEN LANGUAGES ──
  if (detail.spoken_languages?.length) {
    const rows = detail.spoken_languages.map((l: any) => ({
      movie_id: movieId,
      iso_639_1: l.iso_639_1,
      name: l.name,
      english_name: l.english_name ?? null,
    }));
    await supabase
      .from("movie_languages")
      .upsert(rows, { onConflict: "movie_id,iso_639_1" });
  }

  // ── PLATFORMS (ID region) ──
  const flatrate = providers.results?.["ID"]?.flatrate ?? [];
  for (const p of flatrate) {
    const platform = platformMap[p.provider_id];
    if (!platform) continue;
    await supabase
      .from("movie_platforms")
      .upsert(
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
  const cast = credits.cast?.slice(0, 10) ?? [];
  for (const c of cast) {
    await supabase.from("movie_cast").upsert(
      {
        movie_id: movieId,
        person_id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path,
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
  const crew = (credits.crew ?? []).filter((c: any) =>
    CREW_JOBS.includes(c.job),
  );
  for (const c of crew) {
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

// ─── DISCOVER SYNC (bank data semua film) ──────────────────────────────────
// Iterates through TMDB discover pages sorted by popularity descending.
// Tracks the last synced page in sync_state table so each run continues
// from where it left off — no duplicate work, no full re-scan.

async function syncDiscover(
  platformMap: any,
): Promise<{ succeeded: number; failed: number }> {
  // Load last synced page from state table
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
        "vote_count.gte": "50", // filter noise / film tanpa vote
      });
    } catch (err) {
      console.error(`[discover] Failed to fetch page ${page}:`, err.message);
      break;
    }

    if (!data.results?.length) {
      console.log(`[discover] No results on page ${page}, stopping.`);
      break;
    }

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

    // Reset to page 1 when we reach the last available page
    if (page >= data.total_pages) {
      lastCompletedPage = 0;
      console.log(
        `[discover] Reached last page (${data.total_pages}), resetting to page 1 next run.`,
      );
      break;
    }

    await sleep(300); // jeda antar halaman
  }

  // Persist progress
  await supabase
    .from("sync_state")
    .upsert(
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

  // "discover" = bank data semua film (paginated, stateful)
  const CURATED_SOURCES: Record<string, string> = {
    trending: "/trending/movie/day",
    popular: "/movie/popular",
    top_rated: "/movie/top_rated",
    upcoming: "/movie/upcoming",
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
      // ── Bank data mode: paginated discover ──
      const { succeeded, failed } = await syncDiscover(platformMap);
      totalSucceeded = succeeded;
      totalFailed = failed;
    } else {
      // ── Curated sources mode ──
      const sourcesToRun = sourceParam
        ? { [sourceParam]: CURATED_SOURCES[sourceParam] }
        : CURATED_SOURCES;

      for (const [name, path] of Object.entries(sourcesToRun)) {
        console.log(`[sync] Starting source: ${name}`);

        let sourceData: any;
        try {
          sourceData = await tmdbFetch(path);
        } catch (err) {
          console.error(`[sync] Failed to fetch source ${name}:`, err.message);
          totalFailed += MOVIES_PER_SOURCE;
          continue;
        }

        const movies: any[] =
          sourceData.results?.slice(0, MOVIES_PER_SOURCE) ?? [];
        const { succeeded, failed } = await runInBatches(
          movies,
          BATCH_SIZE,
          (movie) => syncMovie(movie, platformMap),
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
