/**
 * supabase/functions/sync-tv-episodes/index.ts
 *
 * Edge Function — Sync episode data untuk 100 tv_series yang belum punya
 * data di tabel tv_episodes, diurutkan berdasarkan tv_series.id ascending.
 *
 * Deploy:
 *   supabase functions deploy sync-tv-episodes
 *
 * Invoke manual:
 *   supabase functions invoke sync-tv-episodes
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SIZE = 22;
const DELAY_MS = 250; // jeda antar request agar tidak kena rate limit TMDB

// ─── Types ────────────────────────────────────────────────────────────────────

interface TvSeriesRow {
  id: number;
  tmdb_id: number;
  name: string;
  number_of_seasons: number;
}

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

interface SyncResult {
  series_id: number;
  tmdb_id: number;
  name: string;
  seasons_synced: number;
  episodes_synced: number;
  status: "ok" | "skipped" | "error";
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return res.json();
}

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
      series_id: 0, // di-set saat upsert
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
      `[sync] TMDB fetch failed tmdb_id=${tmdbId} season=${seasonNumber}:`,
      (err as Error).message,
    );
    return null;
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!TMDB_API_KEY) {
    return new Response(JSON.stringify({ error: "TMDB_API_KEY not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Optional override limit via POST body: { "limit": 50 }
  let limit = BATCH_SIZE;
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.limit && Number(body.limit) > 0) limit = Number(body.limit);
    } catch {
      // pakai default
    }
  }

  const startedAt = new Date().toISOString();
  console.log(`[sync-tv-episodes] Started at ${startedAt}, limit=${limit}`);

  try {
    // ── Step 1: Ambil series_id yang sudah punya data episode ──────────────────
    const { data: existingRows, error: existingErr } = await supabase
      .from("tv_episodes")
      .select("series_id");

    if (existingErr) {
      throw new Error(`fetch existing episodes: ${existingErr.message}`);
    }

    const existingIds = new Set(
      (existingRows ?? []).map((r: any) => r.series_id as number),
    );

    console.log(
      `[sync-tv-episodes] ${existingIds.size} series already have episode data`,
    );

    // ── Step 2: Ambil tv_series urut id ASC, filter yang belum punya episode ───
    // Ambil buffer lebih besar untuk kompensasi filtering
    const bufferSize = limit + existingIds.size;
    const { data: allSeries, error: seriesErr } = await supabase
      .from("tv_series")
      .select("id, tmdb_id, name, number_of_seasons")
      .gt("number_of_seasons", 0)
      .order("id", { ascending: true })
      .limit(Math.min(bufferSize, 5000));

    if (seriesErr) throw new Error(`fetch tv_series: ${seriesErr.message}`);

    const targets: TvSeriesRow[] = (allSeries ?? [])
      .filter((s: any) => !existingIds.has(s.id))
      .slice(0, limit) as TvSeriesRow[];

    if (targets.length === 0) {
      const msg = "All series already have episode data";
      console.log(`[sync-tv-episodes] ${msg}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: msg,
          processed: 0,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[sync-tv-episodes] Syncing ${targets.length} series...`);

    // ── Step 3: Sync per series ────────────────────────────────────────────────
    const results: SyncResult[] = [];
    let totalEpisodes = 0;

    for (const series of targets) {
      const result: SyncResult = {
        series_id: series.id,
        tmdb_id: series.tmdb_id,
        name: series.name,
        seasons_synced: 0,
        episodes_synced: 0,
        status: "ok",
      };

      try {
        const allEpisodeRows: EpisodeInsertRow[] = [];

        for (let sNum = 1; sNum <= series.number_of_seasons; sNum++) {
          await sleep(DELAY_MS);

          const episodes = await fetchSeasonEpisodes(series.tmdb_id, sNum);
          if (!episodes || episodes.length === 0) continue;

          // Set series_id
          for (const ep of episodes) ep.series_id = series.id;

          allEpisodeRows.push(...episodes);
          result.seasons_synced++;
        }

        if (allEpisodeRows.length === 0) {
          result.status = "skipped";
          console.log(`  ~ [${series.id}] ${series.name} — no episodes found`);
          results.push(result);
          continue;
        }

        // Upsert semua episode sekaligus
        const { error: upsertErr } = await supabase
          .from("tv_episodes")
          .upsert(allEpisodeRows, {
            onConflict: "series_id,season_number,episode_number",
          });

        if (upsertErr) throw new Error(`upsert: ${upsertErr.message}`);

        result.episodes_synced = allEpisodeRows.length;
        totalEpisodes += allEpisodeRows.length;

        console.log(
          `  ✓ [${series.id}] ${series.name} — ${result.seasons_synced} seasons, ${result.episodes_synced} episodes`,
        );
      } catch (err: any) {
        result.status = "error";
        result.error = err.message;
        console.error(`  ✗ [${series.id}] ${series.name}: ${err.message}`);
      }

      results.push(result);
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    const summary = {
      success: true,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      total_series_processed: targets.length,
      total_episodes_inserted: totalEpisodes,
      ok: results.filter((r) => r.status === "ok").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    };

    console.log(
      `[sync-tv-episodes] Done — ${summary.ok} ok, ${summary.skipped} skipped, ${summary.errors} errors, ${totalEpisodes} total episodes`,
    );

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sync-tv-episodes] Fatal error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
