/**
 * sync_movie_by_title/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Edge Function: sinkronisasi satu film spesifik berdasarkan judul ke TMDB.
 *
 * Tabel yang disinkronisasi:
 *   movies, movie_cast, movie_categories, movie_companies, movie_countries,
 *   movie_crew, movie_genres, movie_languages, movie_platforms
 *
 * Request (POST, JSON body):
 *   { "title": "Inception" }                          ← cari & sync film pertama
 *   { "title": "Inception", "year": 2010 }            ← filter tahun (lebih akurat)
 *   { "title": "Inception", "tmdb_id": 27205 }        ← langsung pakai tmdb_id (paling akurat)
 *   { "title": "Inception", "confirm": true }          ← skip konfirmasi, langsung sync
 *
 * Flow:
 *   1. Jika tmdb_id disuplai → langsung sync
 *   2. Jika tidak → search TMDB by title (+ year jika ada)
 *   3. Jika confirm=false (default) → return kandidat dulu untuk dikonfirmasi
 *   4. Jika confirm=true → sync film pertama dari hasil search
 *
 * Invoke:
 *   curl -X POST "https://<project>.supabase.co/functions/v1/sync_movie_by_title" \
 *        -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
 *        -H "Content-Type: application/json" \
 *        -d '{"title":"Inception","year":2010,"confirm":true}'
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 500;
const SYNC_REGION = "ID";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
    return await res.json();
  } catch (err) {
    if (attempt >= RETRY_LIMIT) throw err;
    await sleep(RETRY_DELAY_MS * attempt);
    return tmdbFetch(path, params, attempt + 1);
  }
}

// ─── PLATFORM HELPERS ────────────────────────────────────────────────────────

async function getPlatformMap(): Promise<Record<number, any>> {
  const { data, error } = await supabase.from("platforms").select("*");
  if (error) throw new Error(`Failed to load platforms: ${error.message}`);
  const map: Record<number, any> = {};
  data?.forEach((p: any) => {
    if (p.tmdb_provider_id) map[p.tmdb_provider_id] = p;
  });
  return map;
}

function getPlatformLandingUrl(slug: string): string {
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
  return urls[slug] ?? `https://www.${slug}.com`;
}

// ─── SEARCH TMDB ─────────────────────────────────────────────────────────────

async function searchTmdb(
  title: string,
  year?: number,
): Promise<
  { tmdb_id: number; title: string; release_date: string; overview: string }[]
> {
  const params: Record<string, string> = {
    query: title,
    language: "en-US",
    include_adult: "false",
  };
  if (year) params.primary_release_year = String(year);

  const data = await tmdbFetch("/search/movie", params);

  return (data.results ?? []).slice(0, 5).map((r: any) => ({
    tmdb_id: r.id,
    title: r.title,
    original_title: r.original_title,
    release_date: r.release_date ?? "",
    overview: r.overview ?? "",
    popularity: r.popularity,
  }));
}

// ─── CORE SYNC FUNCTION ───────────────────────────────────────────────────────

async function syncMovieById(
  tmdbId: number,
  platformMap: Record<number, any>,
): Promise<{
  movie_id: number;
  title: string;
  tables_updated: string[];
}> {
  console.log(`[sync] Fetching TMDB data for tmdb_id=${tmdbId}...`);

  // Fetch semua data sekaligus (paralel)
  const [detailId, detailEn, videos, credits, providers] = await Promise.all([
    tmdbFetch(`/movie/${tmdbId}`, { language: "id-ID" }),
    tmdbFetch(`/movie/${tmdbId}`, { language: "en-US" }),
    tmdbFetch(`/movie/${tmdbId}/videos`),
    tmdbFetch(`/movie/${tmdbId}/credits`),
    tmdbFetch(`/movie/${tmdbId}/watch/providers`),
  ]);

  const tablesUpdated: string[] = [];

  // ── MOVIES ──
  const trailer = videos.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube",
  );

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

  if (movieErr) throw new Error(`movies upsert failed: ${movieErr.message}`);
  const movieId = movieRow.id;
  tablesUpdated.push("movies");
  console.log(`[sync] movies OK — id=${movieId}, title="${detailEn.title}"`);

  // ── MOVIE_GENRES ──
  let genresOk = 0;
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
      console.error(
        `[sync] genre upsert failed [${g.name}]:`,
        genreErr.message,
      );
      continue;
    }

    await supabase
      .from("movie_genres")
      .upsert(
        { movie_id: movieId, genre_id: genreRow.id },
        { onConflict: "movie_id,genre_id" },
      );
    genresOk++;
  }
  if (genresOk > 0) tablesUpdated.push("movie_genres");
  console.log(`[sync] movie_genres OK — ${genresOk} genres`);

  // ── MOVIE_COMPANIES ──
  let companiesOk = 0;
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
      console.error(
        `[sync] company upsert failed [${c.name}]:`,
        compErr.message,
      );
      continue;
    }

    await supabase
      .from("movie_companies")
      .upsert(
        { movie_id: movieId, company_id: companyRow.id },
        { onConflict: "movie_id,company_id" },
      );
    companiesOk++;
  }
  if (companiesOk > 0) tablesUpdated.push("movie_companies");
  console.log(`[sync] movie_companies OK — ${companiesOk} companies`);

  // ── MOVIE_COUNTRIES ──
  if (detailEn.production_countries?.length) {
    const { error: countryErr } = await supabase.from("movie_countries").upsert(
      detailEn.production_countries.map((c: any) => ({
        movie_id: movieId,
        iso_3166_1: c.iso_3166_1,
        name: c.name,
      })),
      { onConflict: "movie_id,iso_3166_1" },
    );
    if (countryErr)
      console.error(`[sync] movie_countries failed:`, countryErr.message);
    else tablesUpdated.push("movie_countries");
    console.log(
      `[sync] movie_countries OK — ${detailEn.production_countries.length} countries`,
    );
  }

  // ── MOVIE_LANGUAGES ──
  if (detailEn.spoken_languages?.length) {
    const { error: langErr } = await supabase.from("movie_languages").upsert(
      detailEn.spoken_languages.map((l: any) => ({
        movie_id: movieId,
        iso_639_1: l.iso_639_1,
        name: l.name,
        english_name: l.english_name ?? null,
      })),
      { onConflict: "movie_id,iso_639_1" },
    );
    if (langErr)
      console.error(`[sync] movie_languages failed:`, langErr.message);
    else tablesUpdated.push("movie_languages");
    console.log(
      `[sync] movie_languages OK — ${detailEn.spoken_languages.length} languages`,
    );
  }

  // ── MOVIE_PLATFORMS ──
  // flatrate (streaming) + rent + buy, region ID
  const platformSources = [
    {
      items: providers.results?.[SYNC_REGION]?.flatrate ?? [],
      type: "streaming",
    },
    { items: providers.results?.[SYNC_REGION]?.rent ?? [], type: "rent" },
    { items: providers.results?.[SYNC_REGION]?.buy ?? [], type: "buy" },
  ];

  let platformsOk = 0;
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
            `[sync] platform upsert failed [${p.provider_name}]:`,
            platErr.message,
          );
          continue;
        }
        platformMap[p.provider_id] = newPlatform;
        platform = newPlatform;
        console.log(`[sync] new platform added: ${p.provider_name}`);
      }

      const { error: mpErr } = await supabase.from("movie_platforms").upsert(
        {
          movie_id: movieId,
          platform_id: platform.id,
          region: SYNC_REGION,
          type: platformType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "movie_id,platform_id,region,type" },
      );

      if (mpErr)
        console.error(
          `[sync] movie_platforms failed [${platform.name}/${platformType}]:`,
          mpErr.message,
        );
      else platformsOk++;
    }
  }
  if (platformsOk > 0) tablesUpdated.push("movie_platforms");
  console.log(
    `[sync] movie_platforms OK — ${platformsOk} entries (streaming+rent+buy)`,
  );

  // ── MOVIE_CAST (top 15, delete-then-insert) ──
  if (credits.cast?.length) {
    await supabase.from("movie_cast").delete().eq("movie_id", movieId);

    const castRows = credits.cast.slice(0, 15).map((c: any) => ({
      movie_id: movieId,
      person_id: c.id,
      name: c.name,
      character: c.character ?? null,
      profile_path: c.profile_path ?? null,
      order_index: c.order,
    }));

    const { error: castErr } = await supabase
      .from("movie_cast")
      .insert(castRows);
    if (castErr)
      console.error(`[sync] movie_cast insert failed:`, castErr.message);
    else tablesUpdated.push("movie_cast");
    console.log(`[sync] movie_cast OK — ${castRows.length} cast members`);
  }

  // ── MOVIE_CREW (director, writer, screenplay, producer) ──
  const CREW_JOBS = [
    "Director",
    "Writer",
    "Screenplay",
    "Producer",
    "Executive Producer",
  ];
  const crewFiltered = (credits.crew ?? []).filter((c: any) =>
    CREW_JOBS.includes(c.job),
  );
  let crewOk = 0;
  for (const c of crewFiltered) {
    const { error: crewErr } = await supabase.from("movie_crew").upsert(
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
    if (crewErr)
      console.error(
        `[sync] movie_crew failed [${c.name}/${c.job}]:`,
        crewErr.message,
      );
    else crewOk++;
  }
  if (crewOk > 0) tablesUpdated.push("movie_crew");
  console.log(`[sync] movie_crew OK — ${crewOk} crew members`);

  // ── MOVIE_CATEGORIES ──
  // Untuk manual sync, tidak ada konteks kategori ranking (trending/popular/dll).
  // Cek apakah film ini sudah punya kategori di DB — jika ada, biarkan.
  // Jika belum ada sama sekali, insert "manual_sync" sebagai marker.
  const { data: existingCats } = await supabase
    .from("movie_categories")
    .select("category")
    .eq("movie_id", movieId)
    .eq("region", SYNC_REGION);

  if (!existingCats?.length) {
    const { error: catErr } = await supabase.from("movie_categories").upsert(
      {
        movie_id: movieId,
        category: "manual_sync",
        region: SYNC_REGION,
        sort_order: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "movie_id,category,region" },
    );
    if (catErr)
      console.error(`[sync] movie_categories failed:`, catErr.message);
    else {
      tablesUpdated.push("movie_categories");
      console.log(`[sync] movie_categories OK — marked as "manual_sync"`);
    }
  } else {
    tablesUpdated.push("movie_categories");
    console.log(
      `[sync] movie_categories OK — already has categories: ${existingCats.map((c: any) => c.category).join(", ")}`,
    );
  }

  return {
    movie_id: movieId,
    title: detailEn.title,
    tables_updated: tablesUpdated,
  };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const { title, year, tmdb_id, confirm = false } = body;

  if (!title || typeof title !== "string") {
    return jsonResponse(
      {
        error: 'Field "title" wajib diisi.',
        example: { title: "Inception", year: 2010, confirm: true },
      },
      400,
    );
  }

  console.log(
    `[handler] Request: title="${title}" year=${year ?? "-"} tmdb_id=${tmdb_id ?? "-"} confirm=${confirm}`,
  );

  try {
    const platformMap = await getPlatformMap();

    // ── Mode 1: tmdb_id langsung disuplai → sync langsung tanpa search ──
    if (tmdb_id && typeof tmdb_id === "number") {
      console.log(`[handler] Direct sync by tmdb_id=${tmdb_id}`);
      const startedAt = Date.now();
      const result = await syncMovieById(tmdb_id, platformMap);

      return jsonResponse({
        success: true,
        mode: "direct_tmdb_id",
        elapsed_seconds: ((Date.now() - startedAt) / 1000).toFixed(1),
        ...result,
      });
    }

    // ── Mode 2: Search by title ──
    console.log(
      `[handler] Searching TMDB: "${title}" ${year ? `(${year})` : ""}`,
    );
    const candidates = await searchTmdb(title, year);

    if (!candidates.length) {
      return jsonResponse(
        {
          success: false,
          error: `Tidak ditemukan film dengan judul "${title}" di TMDB.`,
          suggestion:
            "Coba gunakan judul asli (original title) atau tambahkan parameter year.",
        },
        404,
      );
    }

    // ── Mode 2a: confirm=false → kembalikan kandidat untuk dikonfirmasi ──
    if (!confirm) {
      return jsonResponse({
        success: false,
        action_required:
          "Pilih film yang dimaksud, lalu kirim ulang dengan confirm:true dan tmdb_id yang sesuai.",
        candidates: candidates.map((c, i) => ({
          rank: i + 1,
          ...c,
        })),
        next_step: {
          description: "Gunakan tmdb_id dari kandidat yang benar:",
          example: {
            title,
            tmdb_id: candidates[0].tmdb_id,
            confirm: true,
          },
        },
      });
    }

    // ── Mode 2b: confirm=true → sync kandidat pertama ──
    const target = candidates[0];
    console.log(
      `[handler] Auto-selecting top result: "${target.title}" (tmdb_id=${target.tmdb_id})`,
    );

    const startedAt = Date.now();
    const result = await syncMovieById(target.tmdb_id, platformMap);

    return jsonResponse({
      success: true,
      mode: "search_and_sync",
      elapsed_seconds: ((Date.now() - startedAt) / 1000).toFixed(1),
      search_query: { title, year: year ?? null },
      selected_candidate: target,
      ...result,
    });
  } catch (err) {
    console.error("[handler] Fatal:", err.message);
    return jsonResponse({ error: err.message }, 500);
  }
});
