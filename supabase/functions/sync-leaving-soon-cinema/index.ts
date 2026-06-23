/**
 * Supabase Edge Function: sync-leaving-soon-cinema
 *
 * Derive data "leaving soon" untuk bioskop dari tabel cinema_movies + showtimes.
 * Logic: film dianggap "leaving soon" jika MAX(show_date) jatuh dalam 7 hari ke depan.
 *
 * Flow:
 *   1. Query MAX(show_date) per movie_id dari tabel showtimes
 *   2. Filter yang last_show_date antara hari ini s/d 7 hari ke depan
 *   3. Upsert ke leaving_soon dengan:
 *      - content_type = 'movie'
 *      - platform_slug = 'cinema'
 *      - available_until = MAX(show_date) per film
 *   4. Hapus baris cinema yang filmnya sudah tidak tayang (tidak ada di showtimes aktif)
 *
 * Query params:
 *   ?dry_run=true      — log saja, tidak write ke DB
 *   ?threshold_days=7  — ambil film yang last show dalam N hari ke depan (default: 7)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DB_REGION = "ID";
const PLATFORM_SLUG = "cinema";

serve(async (req) => {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const thresholdDays = Math.min(
    30,
    Math.max(1, parseInt(url.searchParams.get("threshold_days") ?? "7") || 7),
  );

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const logId = crypto.randomUUID();

  // WIB timezone
  const nowWIB = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayStr = nowWIB.toISOString().slice(0, 10);
  const thresholdDate = new Date(nowWIB);
  thresholdDate.setDate(thresholdDate.getDate() + thresholdDays);
  const thresholdStr = thresholdDate.toISOString().slice(0, 10);

  await supabase.from("sync_logs").insert({
    id: logId,
    sync_type: "leaving_soon_cinema",
    status: "running",
    started_at: new Date().toISOString(),
  });

  const stats = {
    leaving_soon_found: 0,
    upserted: 0,
    removed_stale: 0,
    errors: 0,
  };

  try {
    // ── 1. Query MAX(show_date) per movie_id yang masih aktif di showtimes ──
    // Film yang last show-nya antara hari ini s/d threshold = "leaving soon"
    // Film yang last show-nya sudah lewat hari ini = expired (hapus dari leaving_soon)
    const { data: leavingSoonMovies, error: queryError } = await supabase.rpc(
      "get_cinema_leaving_soon",
      {
        p_today: todayStr,
        p_threshold: thresholdStr,
      },
    );

    if (queryError) {
      // Fallback: jika RPC belum ada, pakai query manual
      console.warn(
        "[cinema] RPC not found, using fallback query:",
        queryError.message,
      );

      // Fallback query via raw SQL tidak tersedia di Supabase JS client,
      // gunakan pendekatan alternatif dengan aggregate di application layer
      const { data: showtimeAgg, error: showtimeError } = await supabase
        .from("showtimes")
        .select("movie_id, show_date")
        .not("movie_id", "is", null)
        .gte("show_date", todayStr)
        .lte("show_date", thresholdStr)
        .order("show_date", { ascending: false });

      if (showtimeError) throw new Error(showtimeError.message);

      // Aggregate di application layer: ambil MAX(show_date) per movie_id
      const maxShowDateMap = new Map<number, string>();
      for (const row of showtimeAgg ?? []) {
        const existing = maxShowDateMap.get(row.movie_id);
        if (!existing || row.show_date > existing) {
          maxShowDateMap.set(row.movie_id, row.show_date);
        }
      }

      // Convert ke format yang sama dengan RPC result
      const derived = Array.from(maxShowDateMap.entries()).map(
        ([movie_id, last_show_date]) => ({
          movie_id,
          last_show_date,
        }),
      );

      await processLeavingSoonCinema(
        derived,
        supabase,
        dryRun,
        todayStr,
        stats,
      );
    } else {
      await processLeavingSoonCinema(
        leavingSoonMovies ?? [],
        supabase,
        dryRun,
        todayStr,
        stats,
      );
    }

    // ── 4. Cleanup cinema rows yang filmnya sudah tidak tayang ──────────────
    stats.removed_stale = await cleanupStaleCinema(supabase, todayStr, dryRun);

    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: "leaving_soon_cinema",
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
      sync_type: "leaving_soon_cinema",
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function processLeavingSoonCinema(
  movies: { movie_id: number; last_show_date: string }[],
  supabase: any,
  dryRun: boolean,
  todayStr: string,
  stats: { leaving_soon_found: number; upserted: number; errors: number },
) {
  stats.leaving_soon_found = movies.length;
  console.log(`[cinema] ${movies.length} movies leaving soon in cinema`);

  if (movies.length === 0) return;

  const rows = movies.map((m) => ({
    content_type: "movie",
    movie_id: m.movie_id,
    tv_series_id: null,
    platform_slug: PLATFORM_SLUG,
    region: DB_REGION,
    available_until: m.last_show_date,
    announced_at: new Date().toISOString(),
    source: "cinema_showtimes",
  }));

  if (dryRun) {
    console.log(`[cinema] [DRY] Would upsert ${rows.length} cinema rows`);
    stats.upserted = rows.length;
    return;
  }

  // Upsert dalam batch 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from("leaving_soon").upsert(batch, {
      onConflict: "content_type,movie_id,tv_series_id,platform_slug,region",
      ignoreDuplicates: false,
    });

    if (error) {
      console.error(`[cinema] upsert batch error:`, error.message);
      stats.errors += batch.length;
    } else {
      stats.upserted += batch.length;
      console.log(`[cinema] Upserted ${batch.length} rows`);
    }
  }
}

async function cleanupStaleCinema(
  supabase: any,
  todayStr: string,
  dryRun: boolean,
): Promise<number> {
  // Hapus baris cinema yang available_until sudah lewat hari ini
  if (dryRun) {
    const { count } = await supabase
      .from("leaving_soon")
      .select("id", { count: "exact", head: true })
      .eq("source", "cinema_showtimes")
      .lt("available_until", todayStr);
    console.log(`[cleanup] [DRY] Would delete ${count ?? 0} stale cinema rows`);
    return count ?? 0;
  }

  const { count, error } = await supabase
    .from("leaving_soon")
    .delete({ count: "exact" })
    .eq("source", "cinema_showtimes")
    .lt("available_until", todayStr);

  if (error) {
    console.error("[cleanup] cinema stale error:", error.message);
    return 0;
  }

  console.log(`[cleanup] Deleted ${count ?? 0} stale cinema rows`);
  return count ?? 0;
}
