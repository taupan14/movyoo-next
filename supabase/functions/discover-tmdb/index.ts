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
const DISCOVER_LIMIT = 50;
const MAX_PAGES_PER_RUN = 10;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 500;
const EPISODE_DELAY_MS = 250;
const BATCH_SLEEP_MS = 200;
const PAGE_SLEEP_MS = 300;

const SYNC_REGION = "ID";

// ─── VALID MODES ────────────────────────────────────────────────────────────
const VALID_MODES = [
  "movie",
  "tv",
  "movie_popular",
  "movie_trending",
  "tv_popular",
  "tv_trending",
  "movie_id",
  "tv_id",
] as const;

type Mode = (typeof VALID_MODES)[number];

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

function getPlatformLandingUrl(platformSlug: string): string {
  const urls: Record<string, string> = {
    netflix: "https://www.netflix.com",
    disney: "https://www.disneyplus.com",
    disneyplus: "https://www.disneyplus.com",
    "disney-plus": "https://www.disneyplus.com",
    "amazon-prime-video": "https://www.primevideo.com",
    "prime-video": "https://www.primevideo.com",
    "apple-tv": "https://tv.apple.com",
    "apple-tv-plus": "https://tv.apple.com",
    "hbo-go": "https://www.hbogoasia.id",
    max: "https://www.max.com",
    catchplay: "https://www.catchplay.com/id",
    vidio: "https://www.vidio.com",
    mola: "https://mola.tv",
    "mola-tv": "https://mola.tv",
    viu: "https://www.viu.com/ott/id",
    wetv: "https://wetv.vip/id",
    iflix: "https://www.iflix.com",
    goplay: "https://www.goplay.co.id",
    govod: "https://www.goplay.co.id",
    mewatch: "https://www.mewatch.sg",
    "youtube-premium": "https://www.youtube.com/premium",
    "google-play-movies": "https://play.google.com/store/movies",
    "microsoft-store": "https://www.microsoft.com/en-us/store/movies-and-tv",
    itunes: "https://www.apple.com/itunes",
    "rakuten-viki": "https://www.viki.com",
    viki: "https://www.viki.com",
  };
  return urls[platformSlug] ?? `https://www.${platformSlug}.com`;
}

async function runInBatches<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<string>,
): Promise<{ succeeded: number; failed: number; titles: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const titles: string[] = [];

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const results = await Promise.allSettled(batch.map((item) => fn(item)));
    results.forEach((r) => {
      if (r.status === "fulfilled") {
        succeeded++;
        if (r.value) titles.push(r.value);
      } else {
        failed++;
        console.error("Batch item failed:", r.reason?.message ?? r.reason);
      }
    });
    if (i + size < items.length) await sleep(BATCH_SLEEP_MS);
  }

  return { succeeded, failed, titles };
}

// ─── TYPES ─────────────────────────────────────────────────────────────────

interface EpisodeInsertRow {
  series_id: number;
  season_number: number;
  episode_number: number;
  name: string;
  overview_en: string | null;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
}

// ─── SEASON/EPISODE HELPER ─────────────────────────────────────────────────

async function fetchSeasonEpisodes(
  tmdbId: number,
  seasonNumber: number,
): Promise<EpisodeInsertRow[] | null> {
  try {
    const data = await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}`, {
      language: "en-US",
    });
    const episodes: any[] = data.episodes ?? [];
    if (episodes.length === 0) return null;
    return episodes.map((ep) => ({
      series_id: 0,
      season_number: seasonNumber,
      episode_number: ep.episode_number,
      name: ep.name ?? "",
      overview_en: ep.overview || null,
      still_path: ep.still_path ?? null,
      air_date: ep.air_date ?? null,
      runtime: ep.runtime ?? null,
    }));
  } catch (err) {
    console.warn(
      `[discover-tmdb] Season fetch failed tmdb_id=${tmdbId} season=${seasonNumber}:`,
      (err as Error).message,
    );
    return null;
  }
}

// ─── PLATFORM UPSERT HELPER ────────────────────────────────────────────────

async function upsertPlatforms(
  providers: any,
  platformMap: Record<number, any>,
  entityId: number,
  table: "movie_platforms" | "tv_platforms",
  idField: "movie_id" | "series_id",
): Promise<void> {
  const platformSources = [
    { items: providers.results?.["ID"]?.flatrate ?? [], type: "streaming" },
    { items: providers.results?.["ID"]?.rent ?? [], type: "rent" },
    { items: providers.results?.["ID"]?.buy ?? [], type: "buy" },
  ];

  for (const { items, type: platformType } of platformSources) {
    for (const p of items) {
      let platform = platformMap[p.provider_id];

      if (!platform) {
        const slug = p.provider_name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        const { data: newPlatform, error: platErr } = await supabase
          .from("platforms")
          .upsert(
            {
              slug,
              name: p.provider_name,
              logo_path: p.logo_path ?? null,
              tmdb_provider_id: p.provider_id,
              url: getPlatformLandingUrl(slug),
            },
            { onConflict: "slug" },
          )
          .select("id, name, url")
          .single();

        if (platErr) {
          console.error(
            `[platforms] Auto-upsert failed [${p.provider_name}]:`,
            platErr.message,
          );
          continue;
        }
        platformMap[p.provider_id] = newPlatform;
        platform = newPlatform;
      }

      await supabase.from(table).upsert(
        {
          [idField]: entityId,
          platform_id: platform.id,
          region: SYNC_REGION,
          type: platformType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: `${idField},platform_id,region` },
      );
    }
  }
}

// ─── CHECK EXISTING IN BULK ────────────────────────────────────────────────

async function filterNewItems(
  items: any[],
  table: "movies" | "tv_series",
): Promise<any[]> {
  const ids = items.map((i) => i.id).filter((id) => id > 0);
  if (ids.length === 0) return [];

  const { data: existing } = await supabase
    .from(table)
    .select("tmdb_id")
    .in("tmdb_id", ids);

  const existingSet = new Set((existing ?? []).map((r: any) => r.tmdb_id));
  const newItems = items.filter((i) => !existingSet.has(i.id));

  console.log(
    `[discover-tmdb] Page check: ${items.length} items — ${newItems.length} new, ${existingSet.size} already in DB`,
  );

  return newItems;
}

// ─── SYNC SINGLE MOVIE ─────────────────────────────────────────────────────

async function syncMovie(
  movie: any,
  platformMap: Record<number, any>,
): Promise<string> {
  const tmdbId = movie.id;

  let detailId: any, detailEn: any, videos: any, credits: any, providers: any;
  try {
    [detailId, detailEn, videos, credits, providers] = await Promise.all([
      tmdbFetch(`/movie/${tmdbId}`, { language: "id-ID" }),
      tmdbFetch(`/movie/${tmdbId}`, { language: "en-US" }),
      tmdbFetch(`/movie/${tmdbId}/videos`),
      tmdbFetch(`/movie/${tmdbId}/credits`),
      tmdbFetch(`/movie/${tmdbId}/watch/providers`),
    ]);
  } catch (err) {
    console.error(
      `[discover-movie] Failed detail tmdb_id=${tmdbId}: ${(err as Error).message}`,
    );
    throw err;
  }

  if (!detailEn.title || detailEn.id !== tmdbId) {
    console.warn(
      `[discover-movie] Invalid detail tmdb_id=${tmdbId}. Skipping.`,
    );
    return "";
  }

  const trailer = videos.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube",
  );

  // ── UPSERT MOVIE ──
  const { data: movieRow, error: movieErr } = await supabase
    .from("movies")
    .upsert(
      {
        tmdb_id: tmdbId,
        title: detailEn.title,
        original_title: detailEn.original_title,
        overview: detailId.overview ?? null,
        overview_en: detailEn.overview ?? null,
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
      console.error(`Genre upsert [${g.name}]:`, genreErr.message);
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
      console.error(`Company upsert [${c.name}]:`, compErr.message);
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

  // ── PLATFORMS ──
  await upsertPlatforms(
    providers,
    platformMap,
    movieId,
    "movie_platforms",
    "movie_id",
  );

  // ── CAST (top 10) ──
  if (credits.cast?.length) {
    await supabase.from("movie_cast").delete().eq("movie_id", movieId);
    const castRows = credits.cast.slice(0, 10).map((c: any) => ({
      movie_id: movieId,
      person_id: c.id,
      name: c.name,
      character: c.character ?? null,
      profile_path: c.profile_path ?? null,
      order_index: c.order,
    }));
    if (castRows.length) {
      const { error: castErr } = await supabase
        .from("movie_cast")
        .insert(castRows);
      if (castErr)
        console.error(
          `[cast] Insert failed [movie:${movieId}]:`,
          castErr.message,
        );
    }
  }

  // ── CREW ──
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

  console.log(
    `[discover-movie] ✓ tmdb_id=${tmdbId} "${detailEn.title}" saved (db_id=${movieId})`,
  );
  return detailEn.title;
}

// ─── SYNC SINGLE TV SERIES ─────────────────────────────────────────────────

async function syncSeries(
  series: any,
  platformMap: Record<number, any>,
): Promise<string> {
  const tmdbId = series.id;

  let detailId: any, detailEn: any, videos: any, credits: any, providers: any;
  try {
    [detailId, detailEn, videos, credits, providers] = await Promise.all([
      tmdbFetch(`/tv/${tmdbId}`, { language: "id-ID" }),
      tmdbFetch(`/tv/${tmdbId}`, { language: "en-US" }),
      tmdbFetch(`/tv/${tmdbId}/videos`),
      tmdbFetch(`/tv/${tmdbId}/credits`),
      tmdbFetch(`/tv/${tmdbId}/watch/providers`),
    ]);
  } catch (err) {
    console.error(
      `[discover-tv] Failed detail tmdb_id=${tmdbId}: ${(err as Error).message}`,
    );
    throw err;
  }

  if (!detailEn.name || detailEn.id !== tmdbId) {
    console.warn(`[discover-tv] Invalid detail tmdb_id=${tmdbId}. Skipping.`);
    return "";
  }

  const trailer = videos.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube",
  );
  const episodeRunTime = detailEn.episode_run_time?.[0] ?? null;

  // ── UPSERT TV SERIES ──
  const { data: seriesRow, error: seriesErr } = await supabase
    .from("tv_series")
    .upsert(
      {
        tmdb_id: tmdbId,
        name: detailEn.name,
        original_name: detailEn.original_name,
        overview: detailId.overview ?? null,
        overview_en: detailEn.overview ?? null,
        tagline: detailEn.tagline ?? null,
        vote_average: detailEn.vote_average,
        vote_count: detailEn.vote_count,
        popularity: detailEn.popularity,
        status: detailEn.status,
        type: detailEn.type ?? null,
        original_language: detailEn.original_language,
        poster_path: detailEn.poster_path,
        backdrop_path: detailEn.backdrop_path,
        first_air_date: detailEn.first_air_date || null,
        last_air_date: detailEn.last_air_date || null,
        number_of_seasons: detailEn.number_of_seasons ?? 0,
        number_of_episodes: detailEn.number_of_episodes ?? 0,
        episode_run_time: episodeRunTime,
        in_production: detailEn.in_production ?? false,
        trailer_key: trailer?.key ?? null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "tmdb_id" },
    )
    .select("id")
    .single();

  if (seriesErr)
    throw new Error(
      `TV series upsert failed [${tmdbId}]: ${seriesErr.message}`,
    );
  const seriesId = seriesRow.id;

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
      console.error(`Genre upsert [${g.name}]:`, genreErr.message);
      continue;
    }
    await supabase
      .from("tv_genres")
      .upsert(
        { series_id: seriesId, genre_id: genreRow.id },
        { onConflict: "series_id,genre_id" },
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
      console.error(`Company upsert [${c.name}]:`, compErr.message);
      continue;
    }
    await supabase
      .from("tv_companies")
      .upsert(
        { series_id: seriesId, company_id: companyRow.id },
        { onConflict: "series_id,company_id" },
      );
  }

  // ── NETWORKS ──
  for (const n of detailEn.networks ?? []) {
    const { data: networkRow, error: netErr } = await supabase
      .from("tv_networks")
      .upsert(
        {
          tmdb_network_id: n.id,
          name: n.name,
          logo_path: n.logo_path ?? null,
          origin_country: n.origin_country ?? null,
        },
        { onConflict: "tmdb_network_id" },
      )
      .select("id")
      .single();
    if (netErr) {
      console.error(`Network upsert [${n.name}]:`, netErr.message);
      continue;
    }
    await supabase
      .from("tv_series_networks")
      .upsert(
        { series_id: seriesId, network_id: networkRow.id },
        { onConflict: "series_id,network_id" },
      );
  }

  // ── PRODUCTION COUNTRIES ──
  if (detailEn.production_countries?.length) {
    await supabase.from("tv_countries").upsert(
      detailEn.production_countries.map((c: any) => ({
        series_id: seriesId,
        iso_3166_1: c.iso_3166_1,
        name: c.name,
      })),
      { onConflict: "series_id,iso_3166_1" },
    );
  }

  // ── SPOKEN LANGUAGES ──
  if (detailEn.spoken_languages?.length) {
    await supabase.from("tv_languages").upsert(
      detailEn.spoken_languages.map((l: any) => ({
        series_id: seriesId,
        iso_639_1: l.iso_639_1,
        name: l.name,
        english_name: l.english_name ?? null,
      })),
      { onConflict: "series_id,iso_639_1" },
    );
  }

  // ── PLATFORMS ──
  await upsertPlatforms(
    providers,
    platformMap,
    seriesId,
    "tv_platforms",
    "series_id",
  );

  // ── CAST (top 10) ──
  if (credits.cast?.length) {
    await supabase.from("tv_cast").delete().eq("series_id", seriesId);
    const castRows = credits.cast.slice(0, 10).map((c: any) => ({
      series_id: seriesId,
      person_id: c.id,
      name: c.name,
      character: c.character ?? null,
      profile_path: c.profile_path ?? null,
      order_index: c.order,
    }));
    if (castRows.length) {
      const { error: castErr } = await supabase
        .from("tv_cast")
        .insert(castRows);
      if (castErr)
        console.error(
          `[cast] Insert failed [series:${seriesId}]:`,
          castErr.message,
        );
    }
  }

  // ── CREW ──
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
    await supabase.from("tv_crew").upsert(
      {
        series_id: seriesId,
        person_id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        profile_path: c.profile_path ?? null,
      },
      { onConflict: "series_id,person_id,job" },
    );
  }

  // ── CREATED BY ──
  for (const creator of detailEn.created_by ?? []) {
    await supabase.from("tv_crew").upsert(
      {
        series_id: seriesId,
        person_id: creator.id,
        name: creator.name,
        job: "Creator",
        department: "Writing",
        profile_path: creator.profile_path ?? null,
      },
      { onConflict: "series_id,person_id,job" },
    );
  }

  // ── SEASONS & EPISODES ──
  const numberOfSeasons: number = detailEn.number_of_seasons ?? 0;
  if (numberOfSeasons > 0) {
    const allEpisodeRows: EpisodeInsertRow[] = [];
    let seasonsSynced = 0;

    for (let sNum = 1; sNum <= numberOfSeasons; sNum++) {
      await sleep(EPISODE_DELAY_MS);
      const episodes = await fetchSeasonEpisodes(tmdbId, sNum);
      if (!episodes || episodes.length === 0) continue;
      for (const ep of episodes) ep.series_id = seriesId;
      allEpisodeRows.push(...episodes);
      seasonsSynced++;
    }

    if (allEpisodeRows.length > 0) {
      const { error: epErr } = await supabase
        .from("tv_episodes")
        .upsert(allEpisodeRows, {
          onConflict: "series_id,season_number,episode_number",
        });
      if (epErr) {
        console.error(
          `[episodes] Upsert failed [series:${seriesId}]: ${epErr.message}`,
        );
      } else {
        console.log(
          `[episodes] OK: series=${seriesId} — ${seasonsSynced} seasons, ${allEpisodeRows.length} episodes`,
        );
      }
    }
  }

  console.log(
    `[discover-tv] ✓ tmdb_id=${tmdbId} "${detailEn.name}" saved (db_id=${seriesId}, seasons=${numberOfSeasons})`,
  );
  return detailEn.name;
}

// ─── DIRECT SYNC BY TMDB ID(s) ─────────────────────────────────────────────
// Digunakan saat mode=movie_id atau mode=tv_id.
// Query param: tmdb_ids=550,680,27205 (comma-separated, max 50)

async function syncByIds(
  tmdbIds: number[],
  isMovie: boolean,
  platformMap: Record<number, any>,
  logId: string,
  modeParam: Mode,
): Promise<Response> {
  const processFn = isMovie ? syncMovie : syncSeries;
  const label = isMovie ? "movie" : "tv";

  const succeeded: string[] = [];
  const failedIds: string[] = [];

  for (const tmdbId of tmdbIds) {
    try {
      console.log(`[direct-sync] Processing ${label} tmdb_id=${tmdbId}`);
      const title = await processFn({ id: tmdbId }, platformMap);
      if (title) succeeded.push(title);
    } catch (err) {
      console.error(
        `[direct-sync] Failed ${label} tmdb_id=${tmdbId}:`,
        (err as Error).message,
      );
      failedIds.push(String(tmdbId));
    }
  }

  const status =
    failedIds.length === 0
      ? "success"
      : succeeded.length === 0
        ? "error"
        : "partial";

  await supabase.from("sync_logs").upsert({
    id: logId,
    sync_type: `discover_tmdb_${modeParam}`,
    status,
    movies_processed: succeeded.length,
    error_message:
      failedIds.length > 0 ? `Failed IDs: ${failedIds.join(", ")}` : null,
    finished_at: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      success: failedIds.length < tmdbIds.length,
      mode: modeParam,
      requested: tmdbIds.length,
      succeeded: succeeded.length,
      failed: failedIds.length,
      failed_ids: failedIds,
      synced_titles: succeeded,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ─── MAIN DISCOVERY LOOP ───────────────────────────────────────────────────

async function runDiscovery(
  endpoint: string,
  tmdbParams: Record<string, string>,
  stateKey: string,
  table: "movies" | "tv_series",
  processFn: (item: any, platformMap: Record<number, any>) => Promise<string>,
  platformMap: Record<number, any>,
  limit: number,
): Promise<{
  discovered: number;
  skipped: number;
  failed: number;
  pagesScanned: number;
  discovered_titles: string[];
}> {
  const { data: stateRow } = await supabase
    .from("sync_state")
    .select("value")
    .eq("key", stateKey)
    .maybeSingle();

  const lastPage = parseInt(stateRow?.value ?? "0", 10);
  let currentPage = lastPage + 1;

  let discovered = 0;
  let skipped = 0;
  let failed = 0;
  let pagesScanned = 0;
  let lastCompletedPage = lastPage;
  let reachedLastPage = false;
  const discovered_titles: string[] = [];

  console.log(
    `[discover-tmdb] stateKey="${stateKey}" startPage=${currentPage} target=${limit}`,
  );

  while (discovered < limit && pagesScanned < MAX_PAGES_PER_RUN) {
    let pageData: any;
    try {
      pageData = await tmdbFetch(endpoint, {
        ...tmdbParams,
        page: String(currentPage),
      });
    } catch (err) {
      console.error(
        `[discover-tmdb] Failed page ${currentPage}:`,
        (err as Error).message,
      );
      break;
    }

    const results: any[] = pageData.results ?? [];
    const totalPages: number = pageData.total_pages ?? 1;

    if (results.length === 0) {
      console.log(`[discover-tmdb] Empty page ${currentPage}, stopping.`);
      reachedLastPage = true;
      break;
    }

    pagesScanned++;

    const newItems = await filterNewItems(results, table);
    skipped += results.length - newItems.length;

    const toProcess = newItems.slice(0, limit - discovered);

    if (toProcess.length > 0) {
      const {
        succeeded,
        failed: batchFailed,
        titles,
      } = await runInBatches(toProcess, BATCH_SIZE, (item) =>
        processFn(item, platformMap),
      );
      discovered += succeeded;
      failed += batchFailed;
      discovered_titles.push(...titles.filter(Boolean));

      console.log(
        `[discover-tmdb] Page ${currentPage}/${totalPages}: +${succeeded} discovered, ` +
          `${results.length - newItems.length} skipped on page, total discovered=${discovered}/${limit}`,
      );
    } else {
      console.log(
        `[discover-tmdb] Page ${currentPage}/${totalPages}: all ${results.length} items already in DB, continuing...`,
      );
    }

    lastCompletedPage = currentPage;

    if (currentPage >= totalPages) {
      console.log(
        `[discover-tmdb] Reached last TMDB page (${totalPages}), will reset on next run.`,
      );
      reachedLastPage = true;
      break;
    }

    currentPage++;
    if (discovered < limit) await sleep(PAGE_SLEEP_MS);
  }

  const nextStateValue = reachedLastPage ? "0" : String(lastCompletedPage);
  await supabase.from("sync_state").upsert(
    {
      key: stateKey,
      value: nextStateValue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  console.log(
    `[discover-tmdb] Done. discovered=${discovered}, skipped=${skipped}, failed=${failed}, ` +
      `pages=${pagesScanned}, next_page_state=${nextStateValue}`,
  );

  return { discovered, skipped, failed, pagesScanned, discovered_titles };
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const modeParam = (url.searchParams.get("mode") ?? "movie") as Mode;
  const limitParam = parseInt(
    url.searchParams.get("limit") ?? String(DISCOVER_LIMIT),
    10,
  );
  const limit = Math.min(Math.max(limitParam, 1), 200);

  if (!VALID_MODES.includes(modeParam)) {
    return new Response(
      JSON.stringify({
        error: `Invalid mode "${modeParam}". Valid: ${VALID_MODES.join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const logId = crypto.randomUUID();

  try {
    await supabase.from("sync_logs").insert({
      id: logId,
      sync_type: `discover_tmdb_${modeParam}`,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const platformMap = await getPlatformMap();

    // ── Direct sync by specific TMDB ID(s) ──────────────────────────────────
    if (modeParam === "movie_id" || modeParam === "tv_id") {
      const idsParam = url.searchParams.get("tmdb_ids") ?? "";
      const tmdbIds = idsParam
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0)
        .slice(0, 50); // hard cap: 50 IDs per request

      if (tmdbIds.length === 0) {
        return new Response(
          JSON.stringify({
            error:
              "tmdb_ids param is required for this mode. Example: ?mode=movie_id&tmdb_ids=550,680",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      return await syncByIds(
        tmdbIds,
        modeParam === "movie_id",
        platformMap,
        logId,
        modeParam,
      );
    }

    // ── Discovery loop modes ─────────────────────────────────────────────────
    type ModeConfig = {
      endpoint: string;
      params: Record<string, string>;
      stateKey: string;
      table: "movies" | "tv_series";
      processFn: (item: any, pm: Record<number, any>) => Promise<string>;
    };

    const modeConfig: Record<
      Exclude<Mode, "movie_id" | "tv_id">,
      ModeConfig
    > = {
      movie: {
        endpoint: "/discover/movie",
        params: { sort_by: "popularity.desc", "vote_count.gte": "10" },
        stateKey: "discover_tmdb_movie_page",
        table: "movies",
        processFn: syncMovie,
      },
      tv: {
        endpoint: "/discover/tv",
        params: { sort_by: "popularity.desc", "vote_count.gte": "10" },
        stateKey: "discover_tmdb_tv_page",
        table: "tv_series",
        processFn: syncSeries,
      },
      movie_popular: {
        endpoint: "/movie/popular",
        params: { region: SYNC_REGION },
        stateKey: "discover_tmdb_movie_popular_page",
        table: "movies",
        processFn: syncMovie,
      },
      movie_trending: {
        endpoint: "/trending/movie/day",
        params: {},
        stateKey: "discover_tmdb_movie_trending_page",
        table: "movies",
        processFn: syncMovie,
      },
      tv_popular: {
        endpoint: "/tv/popular",
        params: { region: SYNC_REGION },
        stateKey: "discover_tmdb_tv_popular_page",
        table: "tv_series",
        processFn: syncSeries,
      },
      tv_trending: {
        endpoint: "/trending/tv/day",
        params: {},
        stateKey: "discover_tmdb_tv_trending_page",
        table: "tv_series",
        processFn: syncSeries,
      },
    };

    const { endpoint, params, stateKey, table, processFn } =
      modeConfig[modeParam as Exclude<Mode, "movie_id" | "tv_id">];

    const { discovered, skipped, failed, pagesScanned, discovered_titles } =
      await runDiscovery(
        endpoint,
        params,
        stateKey,
        table,
        processFn,
        platformMap,
        limit,
      );

    const status = failed === 0 ? "success" : "partial";

    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: `discover_tmdb_${modeParam}`,
      status,
      movies_processed: discovered,
      error_message: failed > 0 ? `${failed} item(s) failed` : null,
      finished_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        mode: modeParam,
        limit,
        discovered,
        skipped,
        failed,
        pages_scanned: pagesScanned,
        discovered_titles,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[discover-tmdb] Fatal error:", (err as Error).message);
    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: `discover_tmdb_${modeParam}`,
      status: "error",
      error_message: (err as Error).message,
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
