/**
 * Supabase Edge Function: sync-leaving-soon-streaming
 *
 * Sumber data: Streaming Availability API (movieofthenight.com)
 * Endpoint: GET /changes?change_type=expiring&country=id
 *
 * Flow:
 *   1. Fetch expiring content dari Streaming Availability API untuk region ID
 *   2. Per platform (netflix, disney+, prime, hbo, apple) — paginate sampai habis
 *   3. Match ke tabel movies / tv_series via tmdb_id
 *   4. Upsert ke tabel leaving_soon dengan available_until dari field expiresOn
 *   5. Hapus baris lama yang sudah tidak muncul di API (platform sudah remove konten)
 *
 * Query params:
 *   ?dry_run=true   — log saja, tidak write ke DB
 *   ?platform=netflix  — sync satu platform saja (opsional)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STREAMING_API_BASE = "https://api.movieofthenight.com/v4";
const SYNC_REGION = "id"; // Streaming Availability API pakai lowercase ISO
const DB_REGION = "ID"; // DB kita pakai uppercase

// Platform yang di-track: service_id di Streaming Availability API → platform_slug di DB
const TRACKED_PLATFORMS: Record<string, string> = {
  netflix: "netflix",
  disney: "disney+",
  prime: "prime",
  hbo: "hbo-go",
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

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": apiKey },
  });

  if (res.status === 429) {
    // Rate limited — tunggu 2 detik lalu retry sekali
    await sleep(2000);
    const retry = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey },
    });
    if (!retry.ok) throw new Error(`Streaming API ${retry.status} on ${path}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`Streaming API ${res.status} on ${path}`);
  return res.json();
}

// ─── FETCH EXPIRING PER PLATFORM ──────────────────────────────────────────────

interface ExpiringItem {
  tmdbId: string; // format: "movie/12345" atau "tv/67890"
  showType: "movie" | "series";
  platformSlug: string;
  availableUntil: string; // YYYY-MM-DD
  announcedAt: string; // ISO timestamp
}

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
      include_unknown_dates: "false", // hanya yang punya tanggal pasti
      order_direction: "asc",
    };

    if (cursor) params.cursor = cursor;

    let data: any;
    try {
      data = await streamingApiFetch("/changes", apiKey, params);
    } catch (err) {
      console.error(`[${serviceId}] page ${page} fetch error:`, err.message);
      break;
    }

    const changes: any[] = data.changes ?? [];
    const shows: Record<string, any> = data.shows ?? {};

    for (const change of changes) {
      const show = shows[change.showId];
      if (!show) continue;

      // Ambil TMDB id
      const tmdbId = show.tmdbId; // format: "movie/12345" atau "tv/67890"
      if (!tmdbId) continue;

      // Timestamp expiry — skip jika null
      if (!change.timestamp) continue;

      items.push({
        tmdbId,
        showType: show.showType === "series" ? "series" : "movie",
        platformSlug,
        availableUntil: unixToDateStr(change.timestamp),
        announcedAt: new Date().toISOString(),
      });
    }

    console.log(
      `[${serviceId}] page ${page}: ${changes.length} changes fetched`,
    );

    if (!data.hasMore) break;
    cursor = data.nextCursor;

    // Jangan terlalu agresif hit API
    await sleep(300);
  }

  return items;
}

// ─── MATCH TMDB ID KE DB ID ───────────────────────────────────────────────────

async function resolveDbIds(
  items: ExpiringItem[],
  supabase: any,
): Promise<{
  movieItems: (ExpiringItem & { movieDbId: number })[];
  tvItems: (ExpiringItem & { tvDbId: number })[];
}> {
  const movieTmdbIds = items
    .filter((i) => i.showType === "movie")
    .map((i) => parseInt(i.tmdbId.replace("movie/", ""), 10))
    .filter(Boolean);

  const tvTmdbIds = items
    .filter((i) => i.showType === "series")
    .map((i) => parseInt(i.tmdbId.replace("tv/", ""), 10))
    .filter(Boolean);

  // Fetch movies by tmdb_id
  const movieMap = new Map<number, number>(); // tmdb_id → db id
  if (movieTmdbIds.length > 0) {
    const { data, error } = await supabase
      .from("movies")
      .select("id, tmdb_id")
      .in("tmdb_id", movieTmdbIds);

    if (error) {
      console.error("[resolveDbIds] movies:", error.message);
    } else {
      (data ?? []).forEach((m: any) => movieMap.set(m.tmdb_id, m.id));
    }
  }

  // Fetch tv_series by tmdb_id
  const tvMap = new Map<number, number>(); // tmdb_id → db id
  if (tvTmdbIds.length > 0) {
    const { data, error } = await supabase
      .from("tv_series")
      .select("id, tmdb_id")
      .in("tmdb_id", tvTmdbIds);

    if (error) {
      console.warn("[resolveDbIds] tv_series:", error.message);
    } else {
      (data ?? []).forEach((s: any) => tvMap.set(s.tmdb_id, s.id));
    }
  }

  const movieItems: (ExpiringItem & { movieDbId: number })[] = [];
  const tvItems: (ExpiringItem & { tvDbId: number })[] = [];

  for (const item of items) {
    if (item.showType === "movie") {
      const tmdbNumId = parseInt(item.tmdbId.replace("movie/", ""), 10);
      const dbId = movieMap.get(tmdbNumId);
      if (dbId) movieItems.push({ ...item, movieDbId: dbId });
      else
        console.warn(
          `[resolveDbIds] movie tmdb_id=${tmdbNumId} not found in DB`,
        );
    } else {
      const tmdbNumId = parseInt(item.tmdbId.replace("tv/", ""), 10);
      const dbId = tvMap.get(tmdbNumId);
      if (dbId) tvItems.push({ ...item, tvDbId: dbId });
      else
        console.warn(`[resolveDbIds] tv tmdb_id=${tmdbNumId} not found in DB`);
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
  let upserted = 0;
  let errors = 0;

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

  // Upsert dalam batch 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from("leaving_soon").upsert(batch, {
      onConflict: "content_type,movie_id,tv_series_id,platform_slug,region",
      ignoreDuplicates: false, // selalu update available_until & announced_at
    });

    if (error) {
      console.error(`[upsert] batch ${i}-${i + 50} error:`, error.message);
      errors += batch.length;
    } else {
      upserted += batch.length;
    }
  }

  return { upserted, errors };
}

// ─── CLEANUP: hapus baris streaming yang sudah tidak ada di API ───────────────

async function cleanupStaleStreaming(
  freshItems: ExpiringItem[],
  supabase: any,
  dryRun: boolean,
): Promise<number> {
  // Hapus baris lama yang:
  // - source = streaming_availability_api (bukan manual, bukan cinema)
  // - available_until sudah lewat hari ini
  const today = new Date().toISOString().slice(0, 10);

  if (dryRun) {
    const { count } = await supabase
      .from("leaving_soon")
      .select("id", { count: "exact", head: true })
      .eq("source", "streaming_availability_api")
      .lt("available_until", today);
    console.log(
      `[cleanup] [DRY] Would delete ${count ?? 0} expired streaming rows`,
    );
    return count ?? 0;
  }

  const { count, error } = await supabase
    .from("leaving_soon")
    .delete({ count: "exact" })
    .eq("source", "streaming_availability_api")
    .lt("available_until", today);

  if (error) {
    console.error("[cleanup] stale streaming error:", error.message);
    return 0;
  }

  console.log(`[cleanup] Deleted ${count ?? 0} expired streaming rows`);
  return count ?? 0;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const platformFilter = url.searchParams.get("platform"); // opsional, filter satu platform

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const STREAMING_API_KEY = Deno.env.get("STREAMING_AVAILABILITY_API_KEY")!;

  if (!STREAMING_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "STREAMING_AVAILABILITY_API_KEY env var not set",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
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
    matched_in_db: 0,
    upserted: 0,
    errors: 0,
    expired_cleaned: 0,
  };

  try {
    // ── 1. Tentukan platform yang akan di-sync ──────────────────────────────
    const platformsToSync = platformFilter
      ? Object.entries(TRACKED_PLATFORMS).filter(
          ([, slug]) => slug === platformFilter,
        )
      : Object.entries(TRACKED_PLATFORMS);

    if (platformsToSync.length === 0) {
      throw new Error(
        `Platform '${platformFilter}' not found in tracked platforms`,
      );
    }

    // ── 2. Fetch expiring content per platform ──────────────────────────────
    const allItems: ExpiringItem[] = [];

    for (const [serviceId, platformSlug] of platformsToSync) {
      console.log(
        `[main] Fetching expiring for ${serviceId} (${platformSlug})...`,
      );
      try {
        const items = await fetchExpiringForPlatform(
          serviceId,
          platformSlug,
          STREAMING_API_KEY,
        );
        console.log(
          `[main] ${serviceId}: ${items.length} expiring items found`,
        );
        allItems.push(...items);
        stats.platforms_synced++;
      } catch (err) {
        console.error(`[main] Failed to fetch ${serviceId}:`, err.message);
        stats.errors++;
      }

      // Jeda antar platform agar tidak hit rate limit
      await sleep(500);
    }

    stats.total_expiring_found = allItems.length;
    console.log(`[main] Total expiring items found: ${allItems.length}`);

    // ── 3. Resolve TMDB id → DB id ─────────────────────────────────────────
    const { movieItems, tvItems } = await resolveDbIds(allItems, supabase);
    stats.matched_in_db = movieItems.length + tvItems.length;
    console.log(
      `[main] Matched in DB: ${movieItems.length} movies, ${tvItems.length} tv series`,
    );

    // ── 4. Upsert ke leaving_soon ──────────────────────────────────────────
    const { upserted, errors } = await upsertToLeavingSoon(
      movieItems,
      tvItems,
      supabase,
      dryRun,
    );
    stats.upserted = upserted;
    stats.errors += errors;

    // ── 5. Cleanup expired rows ────────────────────────────────────────────
    stats.expired_cleaned = await cleanupStaleStreaming(
      allItems,
      supabase,
      dryRun,
    );

    // ── 6. Log result ──────────────────────────────────────────────────────
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
      headers: { "Content-Type": "application/json" },
    });
  }
});
