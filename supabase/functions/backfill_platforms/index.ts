/**
 * backfill_platforms.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time backfill: mengisi movie_platforms untuk film yang belum punya data
 * streaming platform (region ID).
 *
 * Karena Edge Function limit ~150 detik, gunakan query param ?limit=&offset=
 * untuk memproses secara bertahap. Jalankan bash loop di bawah ini:
 *
 *   URL="https://<project>.supabase.co/functions/v1/backfill_platforms"
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

// ─── PLATFORM URL HELPER ────────────────────────────────────────────────────

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

// ─── AMBIL MOVIE YANG BELUM ADA DI movie_platforms (dengan pagination) ───────

async function getMoviesWithoutPlatforms(
  limit: number,
  offset: number,
): Promise<{
  movies: { id: number; tmdb_id: number; title: string }[];
  total: number;
}> {
  const { data: existing, error: existErr } = await supabase
    .from("movie_platforms")
    .select("movie_id")
    .eq("region", "ID");

  if (existErr)
    throw new Error(`Failed to fetch existing platforms: ${existErr.message}`);

  const existingIds = new Set((existing ?? []).map((r: any) => r.movie_id));

  const { data: allMovies, error: movErr } = await supabase
    .from("movies")
    .select("id, tmdb_id, title")
    .order("id", { ascending: true });

  if (movErr) throw new Error(`Failed to fetch movies: ${movErr.message}`);

  const missing = (allMovies ?? []).filter((m: any) => !existingIds.has(m.id));
  const page = missing.slice(offset, offset + limit);

  return { movies: page, total: missing.length };
}

// ─── BACKFILL SATU MOVIE ──────────────────────────────────────────────────────

async function backfillMoviePlatforms(
  movie: { id: number; tmdb_id: number; title: string },
  platformMap: Record<number, { id: number; name: string }>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  let providers: any;
  try {
    providers = await tmdbFetch(`/movie/${movie.tmdb_id}/watch/providers`);
  } catch (err) {
    console.error(
      `[backfill] TMDB fetch failed [tmdb:${movie.tmdb_id} "${movie.title}"]:`,
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
    console.log(`[backfill] No ID providers — "${movie.title}"`);
    return { inserted: 0, skipped: 0 };
  }

  for (const { items, type: platformType } of platformSources) {
    for (const p of items) {
      let platform = platformMap[p.provider_id];

      // Auto-upsert platform baru by slug
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
            `[backfill] Platform upsert failed [${p.provider_name}]:`,
            platErr.message,
          );
          skipped++;
          continue;
        }

        platformMap[p.provider_id] = newPlatform;
        platform = newPlatform;
        console.log(
          `[backfill] Platform upserted: ${p.provider_name} (type=${platformType})`,
        );
      }

      // Upsert dengan unique constraint (movie_id, platform_id, region, type)
      const { error: upsertErr } = await supabase
        .from("movie_platforms")
        .upsert(
          {
            movie_id: movie.id,
            platform_id: platform.id,
            region: "ID",
            type: platformType,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "movie_id,platform_id,region,type" },
        );

      if (upsertErr) {
        console.error(
          `[backfill] Upsert failed [movie:${movie.id}, platform:${platform.name}, type:${platformType}]:`,
          upsertErr.message,
        );
      } else {
        console.log(
          `[backfill] + "${movie.title}" -> ${platform.name} (${platformType})`,
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

  console.log(`[backfill] Starting: limit=${limit} offset=${offset}`);
  const startedAt = Date.now();

  try {
    const platformMap = await getPlatformMap();
    const { movies, total } = await getMoviesWithoutPlatforms(limit, offset);

    console.log(
      `[backfill] Total missing: ${total}, processing ${movies.length} from offset ${offset}`,
    );

    if (!movies.length) {
      return new Response(
        JSON.stringify({
          done: true,
          message: "Semua film sudah punya platform data.",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalProcessed = 0;

    for (let i = 0; i < movies.length; i += PARALLEL_SIZE) {
      const batch = movies.slice(i, i + PARALLEL_SIZE);

      const results = await Promise.allSettled(
        batch.map((movie) => backfillMoviePlatforms(movie, platformMap)),
      );

      results.forEach((r, j) => {
        totalProcessed++;
        if (r.status === "fulfilled") {
          totalInserted += r.value.inserted;
          totalSkipped += r.value.skipped;
        } else {
          console.error(
            `[backfill] Failed: "${batch[j].title}"`,
            r.reason?.message,
          );
        }
      });

      if (i + PARALLEL_SIZE < movies.length) await sleep(DELAY_BETWEEN_MS);
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    const nextOffset = offset + movies.length;
    const done = movies.length < limit; // batch lebih kecil dari limit = sudah habis

    const summary = {
      done,
      offset,
      next_offset: nextOffset,
      total_missing: total,
      movies_processed: totalProcessed,
      platforms_inserted: totalInserted,
      platforms_skipped: totalSkipped,
      elapsed_seconds: elapsedSec,
    };

    console.log("[backfill] Batch done:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[backfill] Fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
