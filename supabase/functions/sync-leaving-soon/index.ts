/**
 * Supabase Edge Function: sync-leaving-soon
 *
 * Strategi data:
 *   TMDB tidak menyediakan endpoint "leaving soon" secara langsung.
 *   Kita derive data dengan cara:
 *     1. Ambil film/series yang ADA di tabel movies / tv_series (sudah di-sync)
 *     2. Cek watch providers dari TMDB per konten
 *     3. Jika platform terdeteksi di region ID → insert/refresh ke leaving_soon
 *        dengan available_until = (hari ini + TTL per platform)
 *     4. Hapus baris yang platformnya sudah tidak muncul lagi di TMDB providers
 *        (artinya konten sudah expired / dihapus dari platform tersebut)
 *
 *  Query params:
 *    ?type=movie|tv|all   (default: all)
 *    ?limit=N             (default: 50, max: 100) — jumlah konten yang di-cek per run
 *    ?dry_run=true        — log saja, tidak write ke DB
 *
 *  Di-trigger via GitHub Actions sekali sehari.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";
const SYNC_REGION = "ID";
const BATCH_SIZE = 5;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 500;

// ─── TTL PER PLATFORM ──────────────────────────────────────────────────────
// Karena TMDB tidak expose tanggal "leaving", kita set TTL estimasi per platform.
// TTL ini berarti: "refresh/perpanjang available_until menjadi hari_ini + TTL_HARI"
// Jika di run berikutnya konten masih tersedia → available_until diperbarui (diperpanjang).
// Jika konten sudah tidak ada di providers → baris dihapus otomatis.
const PLATFORM_TTL_DAYS: Record<number, number> = {
  8: 30, // Netflix       — konten biasanya tersedia stabil, TTL 30 hari
  337: 30, // Disney+
  122: 30, // Disney+ Hotstar
  9: 30, // Amazon Prime Video
  384: 21, // HBO Go
  31: 21, // HBO Go Asia
  350: 30, // Apple TV+
  489: 14, // Vidio         — library berubah lebih sering
  576: 14, // Catchplay
  119: 30, // Amazon Prime (alt ID)
};

// tmdb_provider_id → platform_slug (sesuai kolom platform_slug di platforms table)
const PROVIDER_SLUG: Record<number, string> = {
  8: "netflix",
  337: "disney+",
  122: "disney+",
  9: "prime",
  384: "hbo-go",
  31: "hbo-go",
  350: "apple-tv",
  489: "vidio",
  576: "catchplay",
  119: "prime",
};

// Provider ID yang kita track (whitelist)
const TRACKED_PROVIDER_IDS = new Set(
  Object.keys(PLATFORM_TTL_DAYS).map(Number),
);

// ─── HELPERS ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

async function tmdbFetch(
  path: string,
  apiKey: string,
  params: Record<string, string> = {},
  attempt = 1,
): Promise<any> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
    return await res.json();
  } catch (err) {
    if (attempt >= RETRY_LIMIT) throw err;
    await sleep(RETRY_DELAY_MS * attempt);
    return tmdbFetch(path, apiKey, params, attempt + 1);
  }
}

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
        console.error("[batch]", r.reason?.message ?? r.reason);
      }
    });
    if (i + size < items.length) await sleep(300);
  }

  return { succeeded, failed };
}

// ─── CORE: PROCESS SINGLE MOVIE ───────────────────────────────────────────

async function processMovie(
  movie: { id: number; tmdb_id: number },
  supabase: any,
  apiKey: string,
  today: Date,
  dryRun: boolean,
  stats: { upserted: number; removed: number; skipped: number },
): Promise<void> {
  let providers: any;
  try {
    providers = await tmdbFetch(
      `/movie/${movie.tmdb_id}/watch/providers`,
      apiKey,
    );
  } catch {
    stats.skipped++;
    return;
  }

  const flatrate: any[] = providers.results?.[SYNC_REGION]?.flatrate ?? [];

  // Provider ID yang aktif saat ini untuk konten ini
  const activeProviderIds = flatrate
    .map((p: any) => p.provider_id)
    .filter((id: number) => TRACKED_PROVIDER_IDS.has(id));

  // ── Upsert baris untuk setiap provider aktif ──
  for (const providerId of activeProviderIds) {
    const slug = PROVIDER_SLUG[providerId];
    if (!slug) continue;

    const ttl = PLATFORM_TTL_DAYS[providerId] ?? 30;
    const availableUntil = addDays(today, ttl);

    if (!dryRun) {
      const { error } = await supabase.from("leaving_soon").upsert(
        {
          content_type: "movie",
          movie_id: movie.id,
          tv_series_id: null,
          platform_slug: slug,
          region: SYNC_REGION,
          available_until: availableUntil,
          source: "tmdb_provider_sync",
          announced_at: new Date().toISOString(),
        },
        {
          onConflict: "content_type,movie_id,platform_slug,region",
          ignoreDuplicates: false, // selalu update available_until
        },
      );
      if (error) {
        console.error(
          `[movie] upsert error movie_id=${movie.id} provider=${slug}:`,
          error.message,
        );
      }
    }

    stats.upserted++;
    console.log(
      `[movie] ${dryRun ? "[DRY] " : ""}upsert movie_id=${movie.id} platform=${slug} until=${availableUntil}`,
    );
  }

  // ── Hapus baris lama jika platform sudah tidak tersedia ──
  if (!dryRun && activeProviderIds.length < TRACKED_PROVIDER_IDS.size) {
    const activeSlugs = activeProviderIds
      .map((id) => PROVIDER_SLUG[id])
      .filter(Boolean);

    // Hapus leaving_soon baris untuk movie ini yang platform-nya tidak lagi aktif
    const { error, count } = await supabase
      .from("leaving_soon")
      .delete({ count: "exact" })
      .eq("content_type", "movie")
      .eq("movie_id", movie.id)
      .eq("region", SYNC_REGION)
      .not(
        "platform_slug",
        "in",
        `(${activeSlugs.map((s) => `"${s}"`).join(",")})`,
      );

    if (error) {
      console.warn(
        `[movie] delete stale error movie_id=${movie.id}:`,
        error.message,
      );
    } else if (count && count > 0) {
      stats.removed += count;
      console.log(
        `[movie] removed ${count} stale platform(s) for movie_id=${movie.id}`,
      );
    }
  }
}

// ─── CORE: PROCESS SINGLE TV SERIES ──────────────────────────────────────

async function processSeries(
  series: { id: number; tmdb_id: number },
  supabase: any,
  apiKey: string,
  today: Date,
  dryRun: boolean,
  stats: { upserted: number; removed: number; skipped: number },
): Promise<void> {
  let providers: any;
  try {
    providers = await tmdbFetch(
      `/tv/${series.tmdb_id}/watch/providers`,
      apiKey,
    );
  } catch {
    stats.skipped++;
    return;
  }

  const flatrate: any[] = providers.results?.[SYNC_REGION]?.flatrate ?? [];

  const activeProviderIds = flatrate
    .map((p: any) => p.provider_id)
    .filter((id: number) => TRACKED_PROVIDER_IDS.has(id));

  for (const providerId of activeProviderIds) {
    const slug = PROVIDER_SLUG[providerId];
    if (!slug) continue;

    const ttl = PLATFORM_TTL_DAYS[providerId] ?? 30;
    const availableUntil = addDays(today, ttl);

    if (!dryRun) {
      const { error } = await supabase.from("leaving_soon").upsert(
        {
          content_type: "tv",
          movie_id: null,
          tv_series_id: series.id,
          platform_slug: slug,
          region: SYNC_REGION,
          available_until: availableUntil,
          source: "tmdb_provider_sync",
          announced_at: new Date().toISOString(),
        },
        {
          onConflict: "content_type,tv_series_id,platform_slug,region",
          ignoreDuplicates: false,
        },
      );
      if (error) {
        console.error(
          `[tv] upsert error series_id=${series.id} provider=${slug}:`,
          error.message,
        );
      }
    }

    stats.upserted++;
    console.log(
      `[tv] ${dryRun ? "[DRY] " : ""}upsert series_id=${series.id} platform=${slug} until=${availableUntil}`,
    );
  }

  if (!dryRun && activeProviderIds.length < TRACKED_PROVIDER_IDS.size) {
    const activeSlugs = activeProviderIds
      .map((id) => PROVIDER_SLUG[id])
      .filter(Boolean);

    const { error, count } = await supabase
      .from("leaving_soon")
      .delete({ count: "exact" })
      .eq("content_type", "tv")
      .eq("tv_series_id", series.id)
      .eq("region", SYNC_REGION)
      .not(
        "platform_slug",
        "in",
        `(${activeSlugs.map((s) => `"${s}"`).join(",")})`,
      );

    if (error) {
      console.warn(
        `[tv] delete stale error series_id=${series.id}:`,
        error.message,
      );
    } else if (count && count > 0) {
      stats.removed += count;
      console.log(
        `[tv] removed ${count} stale platform(s) for series_id=${series.id}`,
      );
    }
  }
}

// ─── CLEANUP: hapus baris expired (available_until sudah lewat) ───────────

async function cleanupExpired(supabase: any, dryRun: boolean): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  if (dryRun) {
    const { count } = await supabase
      .from("leaving_soon")
      .select("id", { count: "exact", head: true })
      .lt("available_until", today);
    console.log(`[cleanup] [DRY] Would delete ${count ?? 0} expired rows`);
    return count ?? 0;
  }

  const { error, count } = await supabase
    .from("leaving_soon")
    .delete({ count: "exact" })
    .lt("available_until", today);

  if (error) {
    console.error("[cleanup] Failed to delete expired rows:", error.message);
    return 0;
  }

  console.log(`[cleanup] Deleted ${count ?? 0} expired rows`);
  return count ?? 0;
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type") ?? "all";
  const limitParam = Math.min(
    100,
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
  );
  const dryRun = url.searchParams.get("dry_run") === "true";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

  if (!TMDB_API_KEY) {
    return new Response(
      JSON.stringify({ error: "TMDB_API_KEY env var not set" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logId = crypto.randomUUID();
  const syncType = `leaving_soon_${typeParam}`;

  await supabase.from("sync_logs").insert({
    id: logId,
    sync_type: syncType,
    status: "running",
    started_at: new Date().toISOString(),
  });

  const stats = { upserted: 0, removed: 0, skipped: 0, expired_cleaned: 0 };

  try {
    // ── 1. Cleanup expired dulu ──────────────────────────────────────────
    stats.expired_cleaned = await cleanupExpired(supabase, dryRun);

    // ── 2. Sync Movies ───────────────────────────────────────────────────
    if (typeParam === "all" || typeParam === "movie") {
      // Prioritaskan film yang populer / vote_count tinggi agar TTL provider-nya paling relevan
      const { data: movies, error } = await supabase
        .from("movies")
        .select("id, tmdb_id")
        .gt("vote_count", 50)
        .order("popularity", { ascending: false })
        .limit(limitParam);

      if (error) {
        console.error("[main] Failed to load movies:", error.message);
      } else {
        console.log(`[main] Processing ${movies?.length ?? 0} movies...`);
        await runInBatches(movies ?? [], BATCH_SIZE, (movie) =>
          processMovie(movie, supabase, TMDB_API_KEY, today, dryRun, stats),
        );
      }
    }

    // ── 3. Sync TV Series ────────────────────────────────────────────────
    if (typeParam === "all" || typeParam === "tv") {
      // tv_series table — sesuaikan kolom jika berbeda
      const { data: series, error } = await supabase
        .from("tv_series")
        .select("id, tmdb_id")
        .gt("vote_count", 50)
        .order("popularity", { ascending: false })
        .limit(limitParam);

      if (error) {
        // Graceful: tv_series mungkin belum ada datanya
        console.warn(
          "[main] Failed to load tv_series (might be empty):",
          error.message,
        );
      } else {
        console.log(`[main] Processing ${series?.length ?? 0} tv series...`);
        await runInBatches(series ?? [], BATCH_SIZE, (s) =>
          processSeries(s, supabase, TMDB_API_KEY, today, dryRun, stats),
        );
      }
    }

    // ── 4. Log result ─────────────────────────────────────────────────────
    const status = stats.skipped > stats.upserted ? "partial" : "success";

    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: syncType,
      status,
      movies_processed: stats.upserted,
      error_message:
        stats.skipped > 0 ? `${stats.skipped} item(s) skipped` : null,
      finished_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        type: typeParam,
        stats,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[main] Fatal:", err.message);
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
