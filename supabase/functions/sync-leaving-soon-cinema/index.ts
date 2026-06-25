/**
 * Supabase Edge Function: sync-leaving-soon-cinema
 *
 * Fix: deduplicate by movie_id — satu film hanya muncul sekali
 * meskipun tayang di banyak theater.
 * Logic: ambil MAX(show_date) per movie_id, upsert satu baris per film.
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
    Math.max(1, parseInt(url.searchParams.get("threshold_days") ?? "21") || 21),
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
    // ── Query MAX(show_date) per movie_id ─────────────────────────────────
    // Gunakan RPC jika ada, fallback ke application-level aggregate
    let movies: { movie_id: number; last_show_date: string }[] = [];

    const MIN_RUN_DAYS = 14; // Film harus sudah tayang >= 14 hari sebelum masuk leaving soon

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_cinema_leaving_soon",
      {
        p_today: todayStr,
        p_threshold: thresholdStr,
        p_min_run_days: MIN_RUN_DAYS,
      },
    );

    if (!rpcError && rpcData) {
      movies = rpcData;
    } else {
      console.warn("[cinema] RPC fallback:", rpcError?.message);

      // Fallback: estimasi release_date + MIN_RUN_DAYS
      // Ambil film yang sedang tayang hari ini (ada di showtimes H+0)
      // dan release_date + MIN_RUN_DAYS masuk window threshold
      // Fetch film yang tayang hari ini dari cinema_movies (bukan showtimes)
      const { data: cinemaRows, error: cinemaError } = await supabase
        .from("cinema_movies")
        .select("movie_id")
        .eq("show_date", todayStr)
        .not("movie_id", "is", null);

      if (cinemaError) throw new Error(cinemaError.message);

      // Deduplicate movie_id (beda chain: XXI/CGV/Cinepolis)
      const nowPlayingIds = [
        ...new Set((cinemaRows ?? []).map((r: any) => r.movie_id)),
      ];

      if (nowPlayingIds.length > 0) {
        // Fetch release_date dari movies
        const { data: movieRows, error: movieError } = await supabase
          .from("movies")
          .select("id, release_date")
          .in("id", nowPlayingIds)
          .not("release_date", "is", null)
          .lte("release_date", todayStr); // hanya yang sudah rilis

        if (movieError) throw new Error(movieError.message);

        // Hitung estimasi last_show_date = release_date + MIN_RUN_DAYS
        // Filter yang masuk window threshold
        for (const m of movieRows ?? []) {
          const releaseDate = new Date(m.release_date);
          const estimatedLastDay = new Date(releaseDate);
          estimatedLastDay.setDate(estimatedLastDay.getDate() + MIN_RUN_DAYS);
          const estimatedLastDayStr = estimatedLastDay
            .toISOString()
            .slice(0, 10);

          if (
            estimatedLastDayStr >= todayStr &&
            estimatedLastDayStr <= thresholdStr
          ) {
            movies.push({
              movie_id: m.id,
              last_show_date: estimatedLastDayStr,
            });
          }
        }
      }
    }

    // Deduplicate sekali lagi di sini untuk safety
    // (RPC harusnya sudah unik per movie_id, tapi jaga-jaga)
    const uniqueMovieMap = new Map<number, string>();
    for (const m of movies) {
      const existing = uniqueMovieMap.get(m.movie_id);
      if (!existing || m.last_show_date > existing) {
        uniqueMovieMap.set(m.movie_id, m.last_show_date);
      }
    }
    const uniqueMovies = Array.from(uniqueMovieMap.entries()).map(
      ([movie_id, last_show_date]) => ({ movie_id, last_show_date }),
    );

    stats.leaving_soon_found = uniqueMovies.length;
    console.log(`[cinema] ${uniqueMovies.length} unique movies leaving soon`);

    // ── Upsert ke leaving_soon ─────────────────────────────────────────────
    if (uniqueMovies.length > 0 && !dryRun) {
      const movieIds = uniqueMovies.map((m) => m.movie_id);

      // Delete existing cinema rows untuk movie_id yang akan di-insert
      // (menghindari duplikat karena partial index tidak support onConflict di Supabase JS)
      const { error: deleteError } = await supabase
        .from("leaving_soon")
        .delete()
        .eq("platform_slug", PLATFORM_SLUG)
        .eq("region", DB_REGION)
        .eq("content_type", "movie")
        .in("movie_id", movieIds);

      if (deleteError) {
        console.error(
          `[cinema] delete before insert error:`,
          deleteError.message,
        );
      }

      const rows = uniqueMovies.map((m) => ({
        content_type: "movie",
        movie_id: m.movie_id,
        tv_series_id: null,
        platform_slug: PLATFORM_SLUG,
        region: DB_REGION,
        available_until: m.last_show_date,
        announced_at: new Date().toISOString(),
        source: "cinema_showtimes",
      }));

      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase.from("leaving_soon").insert(batch);

        if (error) {
          console.error(`[cinema] insert batch error:`, error.message);
          stats.errors += batch.length;
        } else {
          stats.upserted += batch.length;
        }
      }
    } else if (dryRun) {
      console.log(`[cinema] [DRY] Would upsert ${uniqueMovies.length} rows`);
      stats.upserted = uniqueMovies.length;
    }

    // ── Cleanup: hapus cinema rows yang expired ────────────────────────────
    if (!dryRun) {
      const { count, error } = await supabase
        .from("leaving_soon")
        .delete({ count: "exact" })
        .eq("source", "cinema_showtimes")
        .lt("available_until", todayStr);

      if (error) console.error("[cleanup] cinema error:", error.message);
      else {
        stats.removed_stale = count ?? 0;
        console.log(`[cleanup] Deleted ${count ?? 0} stale cinema rows`);
      }
    }

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
    });
  }
});
