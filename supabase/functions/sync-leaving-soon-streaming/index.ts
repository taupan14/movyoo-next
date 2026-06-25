/**
 * Supabase Edge Function: sync-leaving-soon-streaming
 *
 * Sumber data: Streaming Availability API (movieofthenight.com)
 * Endpoint: GET /changes?change_type=expiring&country=id
 *
 * Opsi B: jika tmdb_id tidak ditemukan di DB, auto-fetch dari TMDB
 * dan insert ke tabel movies sebelum upsert ke leaving_soon.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STREAMING_API_BASE = "https://api.movieofthenight.com/v4";
const TMDB_BASE = "https://api.themoviedb.org/3";
const SYNC_REGION = "sg"; // Singapura — Indonesia tidak didukung API, SG katalognya paling mirip
const DB_REGION = "ID";

const TRACKED_PLATFORMS: Record<string, string> = {
  netflix: "netflix",
  disney: "disney+",
  prime: "prime",
  // hbo-go: dihapus — sudah tidak aktif di Indonesia
  // vidio: dihapus — platform lokal ID, tidak didukung Streaming Availability API
  apple: "apple-tv",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function unixToDateStr(unixTs: number): string {
  return new Date(unixTs * 1000).toISOString().slice(0, 10);
}

async function streamingApiFetch(
  path: string,
  apiKey: string,
  params: Record<string, string> = {},
): Promise<any> {
  const url = new URL(`${STREAMING_API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { "X-API-Key": apiKey } });
  if (res.status === 429) {
    await sleep(2000);
    const retry = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey },
    });
    if (!retry.ok) throw new Error(`Streaming API ${retry.status}`);
    return retry.json();
  }
  if (!res.ok) throw new Error(`Streaming API ${res.status} on ${path}`);
  return res.json();
}

async function tmdbFetch(
  path: string,
  apiKey: string,
  attempt = 1,
): Promise<any> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return res.json();
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(500 * attempt);
    return tmdbFetch(path, apiKey, attempt + 1);
  }
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ExpiringItem {
  tmdbNumId: number;
  showType: "movie" | "series";
  platformSlug: string;
  availableUntil: string;
  announcedAt: string;
}

// ─── FETCH EXPIRING PER PLATFORM ──────────────────────────────────────────────

async function fetchExpiringForPlatform(
  serviceId: string,
  platformSlug: string,
  apiKey: string,
): Promise<ExpiringItem[]> {
  const items: ExpiringItem[] = [];
  let cursor: string | undefined;
  let page = 0;

  while (true) {
    page++;
    const params: Record<string, string> = {
      change_type: "expiring",
      country: SYNC_REGION,
      catalogs: serviceId,
      item_type: "show",
      include_unknown_dates: "false",
      order_direction: "asc",
    };
    if (cursor) params.cursor = cursor;

    let data: any;
    try {
      data = await streamingApiFetch("/changes", apiKey, params);
    } catch (err) {
      console.error(`[${serviceId}] page ${page} error:`, err.message);
      break;
    }

    const changes: any[] = data.changes ?? [];
    const shows: Record<string, any> = data.shows ?? {};

    for (const change of changes) {
      const show = shows[change.showId];
      if (!show || !show.tmdbId || !change.timestamp) continue;

      // tmdbId format dari API: "movie/12345" atau "tv/67890"
      const parts = show.tmdbId.split("/");
      const tmdbNumId = parseInt(parts[1], 10);
      if (!tmdbNumId) continue;

      items.push({
        tmdbNumId,
        showType: show.showType === "series" ? "series" : "movie",
        platformSlug,
        availableUntil: unixToDateStr(change.timestamp),
        announcedAt: new Date().toISOString(),
      });
    }

    console.log(`[${serviceId}] page ${page}: ${changes.length} items`);
    if (!data.hasMore) break;
    cursor = data.nextCursor;
    await sleep(300);
  }

  return items;
}

// ─── AUTO-SYNC MOVIE KE DB JIKA BELUM ADA (OPSI B) ───────────────────────────

async function autoSyncMovieToDB(
  tmdbId: number,
  supabase: any,
  tmdbApiKey: string,
): Promise<number | null> {
  console.log(`[auto-sync] Fetching movie tmdb_id=${tmdbId} from TMDB...`);
  try {
    const [detail, videos] = await Promise.all([
      tmdbFetch(`/movie/${tmdbId}?language=en-US`, tmdbApiKey),
      tmdbFetch(`/movie/${tmdbId}/videos?language=en-US`, tmdbApiKey),
    ]);

    if (!detail || detail.success === false) return null;

    // Ambil trailer youtube key
    const trailer = (videos.results ?? []).find(
      (v: any) => v.type === "Trailer" && v.site === "YouTube",
    );

    // Insert ke tabel movies — tanpa genre_ids (disimpan di movie_genres)
    const { data, error } = await supabase
      .from("movies")
      .upsert(
        {
          tmdb_id: detail.id,
          title: detail.title,
          original_title: detail.original_title,
          original_language: detail.original_language,
          overview: detail.overview,
          overview_en: detail.overview,
          poster_path: detail.poster_path,
          backdrop_path: detail.backdrop_path,
          release_date: detail.release_date || null,
          vote_average: detail.vote_average,
          vote_count: detail.vote_count,
          popularity: detail.popularity,
          runtime: detail.runtime,
          trailer_key: trailer?.key ?? null,
          status: detail.status,
        },
        { onConflict: "tmdb_id", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    if (error) {
      console.error(
        `[auto-sync] Insert movie tmdb_id=${tmdbId} error:`,
        error.message,
      );
      return null;
    }

    const movieDbId = data.id;

    // Insert genre ke movie_genres via tmdb_genre_id → genres.id lookup
    const tmdbGenreIds: number[] = (detail.genres ?? []).map((g: any) => g.id);
    if (tmdbGenreIds.length > 0) {
      const { data: genreRows } = await supabase
        .from("genres")
        .select("id, tmdb_genre_id")
        .in("tmdb_genre_id", tmdbGenreIds);

      if (genreRows && genreRows.length > 0) {
        const genreInserts = genreRows.map((g: any) => ({
          movie_id: movieDbId,
          genre_id: g.id,
        }));
        await supabase.from("movie_genres").upsert(genreInserts, {
          onConflict: "movie_id,genre_id",
          ignoreDuplicates: true,
        });
      }
    }

    console.log(
      `[auto-sync] Inserted movie tmdb_id=${tmdbId} → db id=${movieDbId}`,
    );
    return movieDbId;
  } catch (err) {
    console.error(`[auto-sync] Failed movie tmdb_id=${tmdbId}:`, err.message);
    return null;
  }
}

async function autoSyncTvToDB(
  tmdbId: number,
  supabase: any,
  tmdbApiKey: string,
): Promise<number | null> {
  console.log(`[auto-sync] Fetching tv tmdb_id=${tmdbId} from TMDB...`);
  try {
    const detail = await tmdbFetch(`/tv/${tmdbId}?language=en-US`, tmdbApiKey);
    if (!detail || detail.success === false) return null;

    // Insert ke tabel tv_series — tanpa genre_ids (disimpan di tv_genres)
    const { data, error } = await supabase
      .from("tv_series")
      .upsert(
        {
          tmdb_id: detail.id,
          name: detail.name,
          original_name: detail.original_name,
          original_language: detail.original_language,
          overview: detail.overview,
          overview_en: detail.overview,
          poster_path: detail.poster_path,
          backdrop_path: detail.backdrop_path,
          first_air_date: detail.first_air_date || null,
          vote_average: detail.vote_average,
          vote_count: detail.vote_count,
          popularity: detail.popularity,
          status: detail.status,
          number_of_seasons: detail.number_of_seasons,
          number_of_episodes: detail.number_of_episodes,
        },
        { onConflict: "tmdb_id", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    if (error) {
      console.error(
        `[auto-sync] Insert tv tmdb_id=${tmdbId} error:`,
        error.message,
      );
      return null;
    }

    const tvDbId = data.id;

    // Insert genre ke tv_genres via tmdb_genre_id → genres.id lookup
    const tmdbGenreIds: number[] = (detail.genres ?? []).map((g: any) => g.id);
    if (tmdbGenreIds.length > 0) {
      const { data: genreRows } = await supabase
        .from("genres")
        .select("id, tmdb_genre_id")
        .in("tmdb_genre_id", tmdbGenreIds);

      if (genreRows && genreRows.length > 0) {
        const genreInserts = genreRows.map((g: any) => ({
          series_id: tvDbId,
          genre_id: g.id,
        }));
        await supabase.from("tv_genres").upsert(genreInserts, {
          onConflict: "series_id,genre_id",
          ignoreDuplicates: true,
        });
      }
    }

    console.log(`[auto-sync] Inserted tv tmdb_id=${tmdbId} → db id=${tvDbId}`);
    return tvDbId;
  } catch (err) {
    console.error(`[auto-sync] Failed tv tmdb_id=${tmdbId}:`, err.message);
    return null;
  }
}

// ─── RESOLVE TMDB ID → DB ID (dengan auto-sync fallback) ─────────────────────

async function resolveDbIds(
  items: ExpiringItem[],
  supabase: any,
  tmdbApiKey: string,
): Promise<{
  movieItems: (ExpiringItem & { movieDbId: number })[];
  tvItems: (ExpiringItem & { tvDbId: number })[];
}> {
  const movieTmdbIds = [
    ...new Set(
      items.filter((i) => i.showType === "movie").map((i) => i.tmdbNumId),
    ),
  ];
  const tvTmdbIds = [
    ...new Set(
      items.filter((i) => i.showType === "series").map((i) => i.tmdbNumId),
    ),
  ];

  // Fetch yang sudah ada di DB
  const movieMap = new Map<number, number>();
  if (movieTmdbIds.length > 0) {
    const { data } = await supabase
      .from("movies")
      .select("id, tmdb_id")
      .in("tmdb_id", movieTmdbIds);
    (data ?? []).forEach((m: any) => movieMap.set(m.tmdb_id, m.id));
  }

  const tvMap = new Map<number, number>();
  if (tvTmdbIds.length > 0) {
    const { data } = await supabase
      .from("tv_series")
      .select("id, tmdb_id")
      .in("tmdb_id", tvTmdbIds);
    (data ?? []).forEach((s: any) => tvMap.set(s.tmdb_id, s.id));
  }

  // Auto-sync yang belum ada — batch 3 sekaligus agar tidak terlalu lambat
  const missingMovies = movieTmdbIds.filter((id) => !movieMap.has(id));
  const missingTv = tvTmdbIds.filter((id) => !tvMap.has(id));

  console.log(
    `[resolveDbIds] Missing in DB: ${missingMovies.length} movies, ${missingTv.length} tv`,
  );

  for (let i = 0; i < missingMovies.length; i += 3) {
    const batch = missingMovies.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((id) => autoSyncMovieToDB(id, supabase, tmdbApiKey)),
    );
    batch.forEach((tmdbId, idx) => {
      if (results[idx]) movieMap.set(tmdbId, results[idx]!);
    });
    if (i + 3 < missingMovies.length) await sleep(300);
  }

  for (let i = 0; i < missingTv.length; i += 3) {
    const batch = missingTv.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((id) => autoSyncTvToDB(id, supabase, tmdbApiKey)),
    );
    batch.forEach((tmdbId, idx) => {
      if (results[idx]) tvMap.set(tmdbId, results[idx]!);
    });
    if (i + 3 < missingTv.length) await sleep(300);
  }

  // Build final lists
  const movieItems: (ExpiringItem & { movieDbId: number })[] = [];
  const tvItems: (ExpiringItem & { tvDbId: number })[] = [];

  for (const item of items) {
    if (item.showType === "movie") {
      const dbId = movieMap.get(item.tmdbNumId);
      if (dbId) movieItems.push({ ...item, movieDbId: dbId });
      else
        console.warn(
          `[resolveDbIds] movie tmdb_id=${item.tmdbNumId} still not in DB after auto-sync`,
        );
    } else {
      const dbId = tvMap.get(item.tmdbNumId);
      if (dbId) tvItems.push({ ...item, tvDbId: dbId });
      else
        console.warn(
          `[resolveDbIds] tv tmdb_id=${item.tmdbNumId} still not in DB after auto-sync`,
        );
    }
  }

  return { movieItems, tvItems };
}

// ─── UPSERT KE LEAVING_SOON ───────────────────────────────────────────────────

async function upsertToLeavingSoon(
  movieItems: (ExpiringItem & { movieDbId: number })[],
  tvItems: (ExpiringItem & { tvDbId: number })[],
  supabase: any,
  dryRun: boolean,
): Promise<{ upserted: number; errors: number }> {
  const rows = [
    ...movieItems.map((item) => ({
      content_type: "movie",
      movie_id: item.movieDbId,
      tv_series_id: null,
      platform_slug: item.platformSlug,
      region: DB_REGION,
      available_until: item.availableUntil,
      announced_at: item.announcedAt,
      source: "streaming_availability_api",
    })),
    ...tvItems.map((item) => ({
      content_type: "tv",
      movie_id: null,
      tv_series_id: item.tvDbId,
      platform_slug: item.platformSlug,
      region: DB_REGION,
      available_until: item.availableUntil,
      announced_at: item.announcedAt,
      source: "streaming_availability_api",
    })),
  ];

  if (dryRun) {
    console.log(`[upsert] [DRY] Would upsert ${rows.length} rows`);
    return { upserted: rows.length, errors: 0 };
  }

  let upserted = 0;
  let errors = 0;

  // Pisah movie dan tv karena partial index berbeda
  const movieRows = rows.filter((r: any) => r.content_type === "movie");
  const tvRows = rows.filter((r: any) => r.content_type === "tv");

  // Delete + insert untuk movie (partial index tidak support onConflict di Supabase JS)
  if (movieRows.length > 0) {
    const movieIds = [...new Set(movieRows.map((r: any) => r.movie_id))];
    const platformSlugs = [
      ...new Set(movieRows.map((r: any) => r.platform_slug)),
    ];

    await supabase
      .from("leaving_soon")
      .delete()
      .eq("content_type", "movie")
      .eq("region", DB_REGION)
      .in("movie_id", movieIds)
      .in("platform_slug", platformSlugs);

    for (let i = 0; i < movieRows.length; i += 50) {
      const batch = movieRows.slice(i, i + 50);
      const { error } = await supabase.from("leaving_soon").insert(batch);
      if (error) {
        console.error(`[upsert] movie insert error:`, error.message);
        errors += batch.length;
      } else upserted += batch.length;
    }
  }

  // Delete + insert untuk tv
  if (tvRows.length > 0) {
    const tvIds = [...new Set(tvRows.map((r: any) => r.tv_series_id))];
    const platformSlugs = [...new Set(tvRows.map((r: any) => r.platform_slug))];

    await supabase
      .from("leaving_soon")
      .delete()
      .eq("content_type", "tv")
      .eq("region", DB_REGION)
      .in("tv_series_id", tvIds)
      .in("platform_slug", platformSlugs);

    for (let i = 0; i < tvRows.length; i += 50) {
      const batch = tvRows.slice(i, i + 50);
      const { error } = await supabase.from("leaving_soon").insert(batch);
      if (error) {
        console.error(`[upsert] tv insert error:`, error.message);
        errors += batch.length;
      } else upserted += batch.length;
    }
  }

  return { upserted, errors };
}

// ─── CLEANUP ──────────────────────────────────────────────────────────────────

async function cleanupStaleStreaming(
  supabase: any,
  dryRun: boolean,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  if (dryRun) {
    const { count } = await supabase
      .from("leaving_soon")
      .select("id", { count: "exact", head: true })
      .eq("source", "streaming_availability_api")
      .lt("available_until", today);
    console.log(`[cleanup] [DRY] Would delete ${count ?? 0} expired rows`);
    return count ?? 0;
  }
  const { count, error } = await supabase
    .from("leaving_soon")
    .delete({ count: "exact" })
    .eq("source", "streaming_availability_api")
    .lt("available_until", today);
  if (error) console.error("[cleanup] error:", error.message);
  else console.log(`[cleanup] Deleted ${count ?? 0} expired streaming rows`);
  return count ?? 0;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const platformFilter = url.searchParams.get("platform");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const STREAMING_API_KEY = Deno.env.get("STREAMING_AVAILABILITY_API_KEY")!;
  const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

  if (!STREAMING_API_KEY) {
    return new Response(
      JSON.stringify({ error: "STREAMING_AVAILABILITY_API_KEY not set" }),
      { status: 400 },
    );
  }
  if (!TMDB_API_KEY) {
    return new Response(JSON.stringify({ error: "TMDB_API_KEY not set" }), {
      status: 400,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const logId = crypto.randomUUID();

  await supabase.from("sync_logs").insert({
    id: logId,
    sync_type: "leaving_soon_streaming",
    status: "running",
    started_at: new Date().toISOString(),
  });

  const stats = {
    platforms_synced: 0,
    total_expiring_found: 0,
    auto_synced_to_db: 0,
    matched_in_db: 0,
    upserted: 0,
    errors: 0,
    expired_cleaned: 0,
  };

  try {
    const platformsToSync = platformFilter
      ? Object.entries(TRACKED_PLATFORMS).filter(
          ([, slug]) => slug === platformFilter,
        )
      : Object.entries(TRACKED_PLATFORMS);

    if (platformsToSync.length === 0)
      throw new Error(`Platform '${platformFilter}' not found`);

    // 1. Fetch expiring per platform
    const allItems: ExpiringItem[] = [];
    for (const [serviceId, platformSlug] of platformsToSync) {
      console.log(`[main] Fetching expiring for ${serviceId}...`);
      try {
        const items = await fetchExpiringForPlatform(
          serviceId,
          platformSlug,
          STREAMING_API_KEY,
        );
        allItems.push(...items);
        stats.platforms_synced++;
        console.log(`[main] ${serviceId}: ${items.length} expiring items`);
      } catch (err) {
        console.error(`[main] ${serviceId} failed:`, err.message);
        stats.errors++;
      }
      await sleep(500);
    }

    stats.total_expiring_found = allItems.length;

    // 2. Resolve tmdb_id → db id (dengan auto-sync jika belum ada)
    const beforeMovieCount =
      (
        await supabase
          .from("movies")
          .select("id", { count: "exact", head: true })
      ).count ?? 0;
    const { movieItems, tvItems } = await resolveDbIds(
      allItems,
      supabase,
      TMDB_API_KEY,
    );
    const afterMovieCount =
      (
        await supabase
          .from("movies")
          .select("id", { count: "exact", head: true })
      ).count ?? 0;
    stats.auto_synced_to_db =
      (afterMovieCount as number) - (beforeMovieCount as number);
    stats.matched_in_db = movieItems.length + tvItems.length;

    // 3. Upsert ke leaving_soon
    const { upserted, errors } = await upsertToLeavingSoon(
      movieItems,
      tvItems,
      supabase,
      dryRun,
    );
    stats.upserted = upserted;
    stats.errors += errors;

    // 4. Cleanup expired
    stats.expired_cleaned = await cleanupStaleStreaming(supabase, dryRun);

    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: "leaving_soon_streaming",
      status: stats.errors > 0 ? "partial" : "success",
      movies_processed: stats.upserted,
      error_message: stats.errors > 0 ? `${stats.errors} error(s)` : null,
      finished_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, dry_run: dryRun, stats }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[main] Fatal:", err.message);
    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: "leaving_soon_streaming",
      status: "error",
      error_message: err.message,
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});
