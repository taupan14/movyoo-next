/**
 * backfill_platforms_meta.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time script: sinkronisasi logo_path dan url di tabel platforms.
 *
 * Yang dilakukan:
 * 1. Fetch semua provider dari TMDB /watch/providers/movie?region=ID
 * 2. Match by tmdb_provider_id → update logo_path jika null atau berbeda
 * 3. Update url (landing page) untuk semua platform
 * 4. Skip platform tanpa tmdb_provider_id (e.g. Bioskop)
 * 5. Log detail setiap perubahan
 *
 * Deploy & invoke sekali:
 *   supabase functions deploy backfill_platforms_meta
 *   curl -X POST "https://<project>.supabase.co/functions/v1/backfill_platforms_meta" \
 *        -H "Authorization: Bearer <SERVICE_ROLE_KEY>" --max-time 60
 *
 * Setelah selesai:
 *   supabase functions delete backfill_platforms_meta
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

// ─── PLATFORM URL MAP ─────────────────────────────────────────────────────────
// Prioritas: URL spesifik Indonesia jika ada, fallback global.
// Key = tmdb_provider_id untuk match yang akurat (tidak bergantung slug).

const PLATFORM_URLS: Record<number, string> = {
  2: "https://tv.apple.com", // Apple TV Store
  350: "https://tv.apple.com", // Apple TV+
  2623: "https://www.artiflix.com", // Artiflix
  159: "https://www.catchplay.com/id", // Catchplay+
  2703: "https://www.chilling.dk", // Chilling
  283: "https://www.crunchyroll.com", // Crunchyroll
  692: "https://www.cultpix.com", // Cultpix
  122: "https://www.disneyplus.com", // Disney+ (ID provider 122)
  337: "https://www.disneyplus.com", // Disney+ (global 337)
  569: "https://docalliance.com", // DocAlliance Films
  701: "https://www.filmboxlive.com", // FilmBox+
  3: "https://play.google.com/store/movies", // Google Play Movies
  1899: "https://www.max.com", // HBO Max / Max
  160: "https://www.iflix.com", // iflix
  576: "https://www.klikfilm.com", // KlikFilm
  483: "https://maxstream.id", // MAX Stream
  11: "https://mubi.com", // MUBI
  8: "https://www.netflix.com", // Netflix
  175: "https://www.netflix.com/kids", // Netflix Kids
  119: "https://www.primevideo.com", // Prime Video
  489: "https://www.vidio.com", // Vidio
  158: "https://www.viu.com/ott/id", // Viu
};

// ─── FETCH TMDB PROVIDER LIST ─────────────────────────────────────────────────

async function fetchTmdbProviders(): Promise<
  Map<number, { logo_path: string; provider_name: string }>
> {
  // Fetch region ID untuk dapat provider yang relevan
  const url = new URL(`${TMDB_BASE}/watch/providers/movie`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("watch_region", "ID");
  url.searchParams.set("language", "en-US");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB providers fetch failed: ${res.status}`);

  const data = await res.json();
  const map = new Map<number, { logo_path: string; provider_name: string }>();

  for (const p of data.results ?? []) {
    map.set(p.provider_id, {
      logo_path: p.logo_path,
      provider_name: p.provider_name,
    });
  }

  // Jika ada provider di DB kita yang tidak muncul di region=ID,
  // fetch juga tanpa filter region sebagai fallback
  if (map.size < 20) {
    const url2 = new URL(`${TMDB_BASE}/watch/providers/movie`);
    url2.searchParams.set("api_key", TMDB_API_KEY);
    const res2 = await fetch(url2.toString());
    if (res2.ok) {
      const data2 = await res2.json();
      for (const p of data2.results ?? []) {
        if (!map.has(p.provider_id)) {
          map.set(p.provider_id, {
            logo_path: p.logo_path,
            provider_name: p.provider_name,
          });
        }
      }
    }
  }

  return map;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

serve(async () => {
  console.log("[meta] Starting platforms meta backfill...");
  const startedAt = Date.now();

  try {
    // 1. Ambil semua platforms dari DB
    const { data: platforms, error: dbErr } = await supabase
      .from("platforms")
      .select("id, slug, name, logo_path, tmdb_provider_id, url")
      .order("id");

    if (dbErr) throw new Error(`Failed to fetch platforms: ${dbErr.message}`);
    console.log(`[meta] Found ${platforms?.length ?? 0} platforms in DB`);

    // 2. Fetch provider list dari TMDB
    const tmdbMap = await fetchTmdbProviders();
    console.log(`[meta] Fetched ${tmdbMap.size} providers from TMDB`);

    // 3. Proses setiap platform
    const results = {
      logo_updated: 0,
      logo_skipped_same: 0,
      url_updated: 0,
      url_skipped_same: 0,
      no_tmdb_id: 0,
      not_found_in_tmdb: 0,
      errors: 0,
    };

    for (const platform of platforms ?? []) {
      // Skip platform tanpa tmdb_provider_id
      if (!platform.tmdb_provider_id) {
        console.log(
          `[meta] SKIP (no tmdb_id): ${platform.name} (slug=${platform.slug})`,
        );
        results.no_tmdb_id++;
        continue;
      }

      const tmdb = tmdbMap.get(platform.tmdb_provider_id);
      const updates: Record<string, string | null> = {};

      // ── Logo path ──
      if (!tmdb) {
        console.log(
          `[meta] NOT FOUND in TMDB: ${platform.name} (tmdb_provider_id=${platform.tmdb_provider_id})`,
        );
        results.not_found_in_tmdb++;
      } else {
        const newLogo = tmdb.logo_path ?? null;
        if (newLogo && newLogo !== platform.logo_path) {
          updates.logo_path = newLogo;
          console.log(
            `[meta] Logo UPDATE: ${platform.name} → ${newLogo} (was: ${platform.logo_path ?? "null"})`,
          );
          results.logo_updated++;
        } else if (platform.logo_path) {
          results.logo_skipped_same++;
        } else {
          console.log(
            `[meta] Logo TMDB null: ${platform.name} (tmdb_provider_id=${platform.tmdb_provider_id})`,
          );
        }
      }

      // ── URL ──
      const newUrl = PLATFORM_URLS[platform.tmdb_provider_id] ?? null;
      if (newUrl && newUrl !== platform.url) {
        updates.url = newUrl;
        console.log(
          `[meta] URL UPDATE: ${platform.name} → ${newUrl} (was: ${platform.url ?? "null"})`,
        );
        results.url_updated++;
      } else if (platform.url) {
        results.url_skipped_same++;
      }

      // ── Commit update ke DB ──
      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from("platforms")
          .update(updates)
          .eq("id", platform.id);

        if (updErr) {
          console.error(
            `[meta] Update failed [${platform.name}]:`,
            updErr.message,
          );
          results.errors++;
        }
      }
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    const summary = {
      success: true,
      elapsed_seconds: elapsedSec,
      tmdb_providers_fetched: tmdbMap.size,
      platforms_in_db: platforms?.length ?? 0,
      logo_updated: results.logo_updated,
      logo_skipped_already_correct: results.logo_skipped_same,
      url_updated: results.url_updated,
      url_skipped_already_correct: results.url_skipped_same,
      skipped_no_tmdb_id: results.no_tmdb_id,
      not_found_in_tmdb: results.not_found_in_tmdb,
      errors: results.errors,
    };

    console.log("[meta] Done:", JSON.stringify(summary, null, 2));

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[meta] Fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
