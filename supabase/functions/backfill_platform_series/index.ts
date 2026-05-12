/**
 * backfill_series_platforms.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time backfill: mengisi tv_platforms untuk TV series yang belum punya data
 * streaming platform (region ID).
 *
 * Karena Edge Function limit ~150 detik, gunakan query param ?limit=&offset=
 * untuk memproses secara bertahap. Jalankan bash loop di bawah ini:
 *
 *   URL="https://<project>.supabase.co/functions/v1/backfill_series_platforms"
 *   TOKEN="<SERVICE_ROLE_KEY>"
 *   OFFSET=0
 *   while true; do
 *     RESP=$(curl -s -X POST "$URL?limit=30&offset=$OFFSET" \
 *       -H "Authorization: Bearer $TOKEN" --max-time 280)
 *     echo "$RESP"
 *     DONE=$(echo $RESP | grep -o '"done":true')
 *     [ -n "$DONE" ] && echo "Backfill selesai!" && break
 *     NEXT=$(echo $RESP | grep -o '"next_offset":[0-9]*' | grep -o '[0-9]*')
 *     [ -z "$NEXT" ] && echo "Error, berhenti." && break
 *     OFFSET=$NEXT
 *     sleep 2
 *   done
 *
 * Aman dijalankan berkali-kali — idempotent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";
const PARALLEL_SIZE = 3; // fetch TMDB paralel per sub-batch
const DELAY_BETWEEN_MS = 400; // jeda antar sub-batch

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tmdbFetch(path: string, attempt = 1): Promise<any> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
    return await res.json();
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(500 * attempt);
    return tmdbFetch(path, attempt + 1);
  }
}

async function getPlatformMap(): Promise<
  Record<number, { id: number; name: string }>
> {
  const { data, error } = await supabase.from("platforms").select("*");
  if (error) throw new Error(`Failed to load platforms: ${error.message}`);
  const map: Record<number, any> = {};
  data?.forEach((p: any) => {
    if (p.tmdb_provider_id) map[p.tmdb_provider_id] = p;
  });
  return map;
}

// ─── PLATFORM URL HELPER ─────────────────────────────────────────────────────

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
    "youtube-premium": "https://www.youtube.com/premium",
    "google-play-movies": "https://play.google.com/store/movies",
    "microsoft-store": "https://www.microsoft.com/en-us/store/movies-and-tv",
    itunes: "https://www.apple.com/itunes",
    "rakuten-viki": "https://www.viki.com",
    viki: "https://www.viki.com",
  };
  return urls[platformSlug] ?? `https://www.${platformSlug}.com`;
}

// ─── AMBIL TV SERIES YANG BELUM ADA DI tv_platforms (dengan pagination) ──────
// Berbeda dari movie: pakai tabel tv_series & tv_platforms, field id bertipe bigint

async function getSeriesWithoutPlatforms(
  limit: number,
  offset: number,
): Promise<{
  series: { id: bigint; tmdb_id: number; name: string }[];
  total: number;
}> {
  // Ambil semua series_id yang sudah ada di tv_platforms region ID
  const { data: existing, error: existErr } = await supabase
    .from("tv_platforms")
    .select("series_id")
    .eq("region", "ID");

  if (existErr)
    throw new Error(
      `Failed to fetch existing tv_platforms: ${existErr.message}`,
    );

  const existingIds = new Set((existing ?? []).map((r: any) => r.series_id));

  // Ambil semua tv_series, urutkan by id ascending agar offset stabil
  const { data: allSeries, error: serErr } = await supabase
    .from("tv_series")
    .select("id, tmdb_id, name")
    .order("id", { ascending: true });

  if (serErr) throw new Error(`Failed to fetch tv_series: ${serErr.message}`);

  const missing = (allSeries ?? []).filter((s: any) => !existingIds.has(s.id));
  const page = missing.slice(offset, offset + limit);

  return { series: page, total: missing.length };
}

// ─── BACKFILL SATU TV SERIES ──────────────────────────────────────────────────
// Perbedaan utama vs movie:
//   - endpoint TMDB: /tv/{tmdb_id}/watch/providers  (bukan /movie/)
//   - tabel target: tv_platforms                    (bukan movie_platforms)
//   - FK kolom: series_id                           (bukan movie_id)
//   - onConflict: "series_id,platform_id,region"    (sesuai unique constraint)

async function backfillSeriesPlatforms(
  series: { id: bigint; tmdb_id: number; name: string },
  platformMap: Record<number, { id: number; name: string }>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  let providers: any;
  try {
    // TV series gunakan endpoint /tv/ bukan /movie/
    providers = await tmdbFetch(`/tv/${series.tmdb_id}/watch/providers`);
  } catch (err) {
    console.error(
      `[backfill_series] TMDB fetch failed [tmdb:${series.tmdb_id} "${series.name}"]:`,
      err.message,
    );
    return { inserted: 0, skipped: 0 };
  }

  const platformSources = [
    { items: providers.results?.["ID"]?.flatrate ?? [], type: "streaming" },
    { items: providers.results?.["ID"]?.rent ?? [], type: "rent" },
    { items: providers.results?.["ID"]?.buy ?? [], type: "buy" },
  ];

  const hasAny = platformSources.some((s) => s.items.length > 0);
  if (!hasAny) {
    console.log(`[backfill_series] No ID providers — "${series.name}"`);
    return { inserted: 0, skipped: 0 };
  }

  for (const { items, type: platformType } of platformSources) {
    for (const p of items) {
      let platform = platformMap[p.provider_id];

      // Auto-upsert platform baru jika belum ada di tabel platforms
      // Tabel platforms di-share antara movie dan TV series
      if (!platform) {
        const slug = p.provider_name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        const landingUrl = getPlatformLandingUrl(slug);
        const { data: newPlatform, error: platErr } = await supabase
          .from("platforms")
          .upsert(
            {
              slug,
              name: p.provider_name,
              logo_path: p.logo_path ?? null,
              tmdb_provider_id: p.provider_id,
              url: landingUrl,
            },
            { onConflict: "slug" },
          )
          .select("id, name, url")
          .single();

        if (platErr) {
          console.error(
            `[backfill_series] Platform upsert failed [${p.provider_name}]:`,
            platErr.message,
          );
          skipped++;
          continue;
        }

        platformMap[p.provider_id] = newPlatform;
        platform = newPlatform;
        console.log(
          `[backfill_series] Platform upserted: ${p.provider_name} (type=${platformType})`,
        );
      }

      // Upsert ke tv_platforms — onConflict pakai (series_id, platform_id, region)
      // sesuai constraint tv_platforms_series_platform_region_unique
      const { error: upsertErr } = await supabase.from("tv_platforms").upsert(
        {
          series_id: series.id,
          platform_id: platform.id,
          region: "ID",
          type: platformType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "series_id,platform_id,region" },
      );

      if (upsertErr) {
        console.error(
          `[backfill_series] Upsert failed [series:${series.id}, platform:${platform.name}, type:${platformType}]:`,
          upsertErr.message,
        );
        skipped++;
      } else {
        console.log(
          `[backfill_series] + "${series.name}" -> ${platform.name} (${platformType})`,
        );
        inserted++;
      }
    }
  }

  return { inserted, skipped };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 50);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  console.log(`[backfill_series] Starting: limit=${limit} offset=${offset}`);
  const startedAt = Date.now();

  try {
    const platformMap = await getPlatformMap();
    const { series, total } = await getSeriesWithoutPlatforms(limit, offset);

    console.log(
      `[backfill_series] Total missing: ${total}, processing ${series.length} from offset ${offset}`,
    );

    if (!series.length) {
      return new Response(
        JSON.stringify({
          done: true,
          message: "Semua TV series sudah punya platform data.",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalProcessed = 0;

    for (let i = 0; i < series.length; i += PARALLEL_SIZE) {
      const batch = series.slice(i, i + PARALLEL_SIZE);

      const results = await Promise.allSettled(
        batch.map((s) => backfillSeriesPlatforms(s, platformMap)),
      );

      results.forEach((r, j) => {
        totalProcessed++;
        if (r.status === "fulfilled") {
          totalInserted += r.value.inserted;
          totalSkipped += r.value.skipped;
        } else {
          console.error(
            `[backfill_series] Failed: "${batch[j].name}"`,
            r.reason?.message,
          );
        }
      });

      if (i + PARALLEL_SIZE < series.length) await sleep(DELAY_BETWEEN_MS);
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    const nextOffset = offset + series.length;
    const done = series.length < limit; // batch lebih kecil dari limit = sudah habis

    const summary = {
      done,
      offset,
      next_offset: nextOffset,
      total_missing: total,
      series_processed: totalProcessed,
      platforms_inserted: totalInserted,
      platforms_skipped: totalSkipped,
      elapsed_seconds: elapsedSec,
    };

    console.log("[backfill_series] Batch done:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[backfill_series] Fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
