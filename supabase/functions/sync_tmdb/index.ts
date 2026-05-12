import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

// ─── CONFIG ────────────────────────────────────────────────────────────────
const BATCH_SIZE = 5;
const MOVIES_PER_SOURCE = 20;
const DISCOVER_PAGES = 2;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 500;

// Region yang di-sync untuk movie_categories / tv_categories ranking.
const SYNC_REGION = "ID";

// ─── HELPERS ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
    if (!res.ok) throw new Error(`TMDB error ${res.status} on ${path}`);
    return await res.json();
  } catch (err) {
    if (attempt >= RETRY_LIMIT) throw err;
    await sleep(RETRY_DELAY_MS * attempt);
    return tmdbFetch(path, params, attempt + 1);
  }
}

async function getPlatformMap(): Promise<Record<number, any>> {
  const { data, error } = await supabase.from("platforms").select("*");
  if (error) throw new Error(`Failed to load platforms: ${error.message}`);
  const map: Record<number, any> = {};
  data?.forEach((p) => {
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
    govod: "https://www.goplay.co.id",
    mewatch: "https://www.mewatch.sg",
    "youtube-premium": "https://www.youtube.com/premium",
    "google-play-movies": "https://play.google.com/store/movies",
    "microsoft-store": "https://www.microsoft.com/en-us/store/movies-and-tv",
    itunes: "https://www.apple.com/itunes",
    "rakuten-viki": "https://www.viki.com",
    viki: "https://www.viki.com",
  };

  return urls[platformSlug] ?? `https://www.${platformSlug}.com`;
}

// ─── BATCH RUNNER ──────────────────────────────────────────────────────────

async function runInBatches<T>(
  items: T[],
  size: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const results = await Promise.allSettled(
      batch.map((item, j) => fn(item, i + j)),
    );
    results.forEach((r) => {
      if (r.status === "fulfilled") succeeded++;
      else {
        failed++;
        console.error("Batch item failed:", r.reason?.message ?? r.reason);
      }
    });
    if (i + size < items.length) await sleep(200);
  }

  return { succeeded, failed };
}

// ─── SYNC SINGLE MOVIE ─────────────────────────────────────────────────────

async function syncMovie(
  movie: any,
  platformMap: any,
  category?: string,
  sortOrder?: number,
): Promise<void> {
  const tmdbId = movie.id;

  // ── FIX #1: Validasi tmdb_id — skip entry dengan ID tidak valid (negatif / nol)
  // TMDB terkadang mengembalikan placeholder entry dengan ID negatif pada list endpoint.
  // Entry ini tidak memiliki data valid dan akan menyebabkan data kotor di DB.
  if (!tmdbId || tmdbId <= 0) {
    console.warn(
      `[syncMovie] Skipping invalid tmdb_id=${tmdbId} (title="${movie.title ?? "unknown"}")`,
    );
    return;
  }

  // ── FIX #2: Fetch data lengkap dari TMDB DULU sebelum upsert ke DB.
  // List endpoint hanya mengembalikan data partial (tanpa genres, cast, crew, dll).
  // Kita harus memastikan detail film valid dan lengkap sebelum disimpan.
  // Jika fetch gagal (misalnya ID tidak ditemukan di TMDB), batalkan proses film ini.
  let detailId: any, detailEn: any, videos: any, credits: any, providers: any;
  try {
    [detailId, detailEn, videos, credits, providers] = await Promise.all([
      tmdbFetch(`/movie/${tmdbId}`, { language: "id-ID" }),
      tmdbFetch(`/movie/${tmdbId}`, { language: "en-US" }),
      tmdbFetch(`/movie/${tmdbId}/videos`),
      tmdbFetch(`/movie/${tmdbId}/credits`),
      tmdbFetch(`/movie/${tmdbId}/watch/providers`),
    ]);
  } catch (err) {
    console.error(
      `[syncMovie] Failed to fetch detail for tmdb_id=${tmdbId}: ${err.message}. Skipping.`,
    );
    return;
  }

  // Validasi data detail yang diterima — title kosong berarti data tidak valid
  if (!detailEn.title || detailEn.id !== tmdbId) {
    console.warn(
      `[syncMovie] Invalid or empty detail returned for tmdb_id=${tmdbId}. Skipping.`,
    );
    return;
  }

  const trailer = videos.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube",
  );

  // ── FIX #3: Cek duplikat case-insensitive sebelum insert
  // TMDB kadang mengembalikan entri duplikat dengan ID berbeda namun title yang sama
  // (misalnya beda case: "AVENGERS" vs "Avengers").
  // PENGECUALIAN: Jika release_date berbeda tahun → kemungkinan remake, biarkan masuk sebagai film baru.
  const normalizedTitle = detailEn.title.trim().toLowerCase();
  const incomingYear = detailEn.release_date
    ? new Date(detailEn.release_date).getFullYear()
    : null;

  const { data: existingByTitle } = await supabase
    .from("movies")
    .select("id, tmdb_id, title, release_date")
    .ilike("title", normalizedTitle) // case-insensitive LIKE
    .neq("tmdb_id", tmdbId) // bukan film yang sama berdasarkan tmdb_id
    .maybeSingle();

  if (existingByTitle) {
    const existingYear = existingByTitle.release_date
      ? new Date(existingByTitle.release_date).getFullYear()
      : null;

    const isSameYear =
      incomingYear !== null &&
      existingYear !== null &&
      incomingYear === existingYear;

    const isUnknownYear = incomingYear === null || existingYear === null;

    if (isSameYear || isUnknownYear) {
      // Tahun sama (atau salah satu tidak diketahui) → anggap duplikat, skip insert
      console.warn(
        `[syncMovie] Duplicate detected: tmdb_id=${tmdbId} title="${detailEn.title}" (${incomingYear ?? "?"}) ` +
          `matches existing movie id=${existingByTitle.id} tmdb_id=${existingByTitle.tmdb_id} ` +
          `title="${existingByTitle.title}" (${existingYear ?? "?"}) — skipping, updating category only.`,
      );
      if (category !== undefined && sortOrder !== undefined) {
        const { error: catErr } = await supabase
          .from("movie_categories")
          .upsert(
            {
              movie_id: existingByTitle.id,
              category,
              region: SYNC_REGION,
              sort_order: sortOrder,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "movie_id,category,region" },
          );
        if (catErr) {
          console.error(
            `movie_categories upsert failed [existing movie id:${existingByTitle.id}, cat:${category}]:`,
            catErr.message,
          );
        }
      }
      return;
    }

    // Tahun berbeda → kemungkinan remake, lanjut insert sebagai film baru
    console.log(
      `[syncMovie] Same title but different year: tmdb_id=${tmdbId} "${detailEn.title}" (${incomingYear}) ` +
        `vs existing tmdb_id=${existingByTitle.tmdb_id} (${existingYear}) — treating as remake, proceeding.`,
    );
  }

  // ── UPSERT MOVIE ──
  // Semua data dijamin lengkap dari fetch di atas sebelum sampai sini.
  const { data: movieRow, error: movieErr } = await supabase
    .from("movies")
    .upsert(
      {
        tmdb_id: tmdbId,
        title: detailEn.title,
        original_title: detailEn.original_title,
        overview: detailId.overview ?? null, // Bahasa Indonesia
        overview_en: detailEn.overview ?? null, // Bahasa Inggris
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

  if (movieErr)
    throw new Error(`Movie upsert failed [${tmdbId}]: ${movieErr.message}`);

  const movieId = movieRow.id;

  // ── MOVIE CATEGORIES ──
  if (category !== undefined && sortOrder !== undefined) {
    const { error: catErr } = await supabase.from("movie_categories").upsert(
      {
        movie_id: movieId,
        category,
        region: SYNC_REGION,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "movie_id,category,region" },
    );

    if (catErr) {
      console.error(
        `movie_categories upsert failed [tmdb:${tmdbId}, cat:${category}]:`,
        catErr.message,
      );
    }
  }

  // ── GENRES ──
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
      console.error(`Genre upsert failed [${g.name}]:`, genreErr.message);
      continue;
    }

    await supabase
      .from("movie_genres")
      .upsert(
        { movie_id: movieId, genre_id: genreRow.id },
        { onConflict: "movie_id,genre_id" },
      );
  }

  // ── PRODUCTION COMPANIES ──
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
      console.error(`Company upsert failed [${c.name}]:`, compErr.message);
      continue;
    }

    await supabase
      .from("movie_companies")
      .upsert(
        { movie_id: movieId, company_id: companyRow.id },
        { onConflict: "movie_id,company_id" },
      );
  }

  // ── PRODUCTION COUNTRIES ──
  if (detailEn.production_countries?.length) {
    await supabase.from("movie_countries").upsert(
      detailEn.production_countries.map((c: any) => ({
        movie_id: movieId,
        iso_3166_1: c.iso_3166_1,
        name: c.name,
      })),
      { onConflict: "movie_id,iso_3166_1" },
    );
  }

  // ── SPOKEN LANGUAGES ──
  if (detailEn.spoken_languages?.length) {
    await supabase.from("movie_languages").upsert(
      detailEn.spoken_languages.map((l: any) => ({
        movie_id: movieId,
        iso_639_1: l.iso_639_1,
        name: l.name,
        english_name: l.english_name ?? null,
      })),
      { onConflict: "movie_id,iso_639_1" },
    );
  }

  // ── PLATFORMS (region ID) ──
  const platformSources = [
    { items: providers.results?.["ID"]?.flatrate ?? [], type: "streaming" },
    { items: providers.results?.["ID"]?.rent ?? [], type: "rent" },
    { items: providers.results?.["ID"]?.buy ?? [], type: "buy" },
  ];

  for (const { items, type: platformType } of platformSources) {
    for (const p of items) {
      let platform = platformMap[p.provider_id];

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
            `[platforms] Auto-upsert failed [${p.provider_name}]:`,
            platErr.message,
          );
          continue;
        }

        platformMap[p.provider_id] = newPlatform;
        platform = newPlatform;
        console.log(
          `[platforms] Platform upserted: ${p.provider_name} (type=${platformType})`,
        );
      }

      const { error: upsertErr } = await supabase
        .from("movie_platforms")
        .upsert(
          {
            movie_id: movieId,
            platform_id: platform.id,
            region: "ID",
            type: platformType,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "movie_id,platform_id,region,type" },
        );

      if (upsertErr)
        console.error(
          `[platforms] Upsert failed [movie:${movieId}, platform:${platform.name}, type:${platformType}]:`,
          upsertErr.message,
        );
      else
        console.log(
          `[platforms] OK: movie=${movieId} → ${platform.name} (${platformType})`,
        );
    }
  }

  // ── CAST (top 10) ──
  if (credits.cast?.length) {
    await supabase.from("movie_cast").delete().eq("movie_id", movieId);

    const castRows = credits.cast.slice(0, 10).map((c: any) => ({
      movie_id: movieId,
      person_id: c.id,
      name: c.name,
      character: c.character ?? null,
      profile_path: c.profile_path ?? null,
      order_index: c.order,
    }));

    if (castRows.length) {
      const { error: castErr } = await supabase
        .from("movie_cast")
        .insert(castRows);
      if (castErr)
        console.error(
          `[cast] Insert failed [movie:${movieId}]:`,
          castErr.message,
        );
    }
  }

  // ── CREW (director, writer, producer) ──
  const CREW_JOBS = [
    "Director",
    "Writer",
    "Screenplay",
    "Producer",
    "Executive Producer",
  ];
  for (const c of (credits.crew ?? []).filter((c: any) =>
    CREW_JOBS.includes(c.job),
  )) {
    await supabase.from("movie_crew").upsert(
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
  }
}

// ─── SYNC SINGLE TV SERIES ─────────────────────────────────────────────────

async function syncSeries(
  series: any,
  platformMap: any,
  category?: string,
  sortOrder?: number,
): Promise<void> {
  const tmdbId = series.id;

  // Validasi tmdb_id — skip entry dengan ID tidak valid (negatif / nol)
  if (!tmdbId || tmdbId <= 0) {
    console.warn(
      `[syncSeries] Skipping invalid tmdb_id=${tmdbId} (name="${series.name ?? "unknown"}")`,
    );
    return;
  }

  // Fetch data lengkap dari TMDB sebelum upsert ke DB.
  // TV series menggunakan endpoint /tv/{id} (bukan /movie/{id})
  // credits TV series ada di /tv/{id}/credits (bukan /movie/{id}/credits)
  let detailId: any, detailEn: any, videos: any, credits: any, providers: any;
  try {
    [detailId, detailEn, videos, credits, providers] = await Promise.all([
      tmdbFetch(`/tv/${tmdbId}`, { language: "id-ID" }),
      tmdbFetch(`/tv/${tmdbId}`, { language: "en-US" }),
      tmdbFetch(`/tv/${tmdbId}/videos`),
      tmdbFetch(`/tv/${tmdbId}/credits`),
      tmdbFetch(`/tv/${tmdbId}/watch/providers`),
    ]);
  } catch (err) {
    console.error(
      `[syncSeries] Failed to fetch detail for tmdb_id=${tmdbId}: ${err.message}. Skipping.`,
    );
    return;
  }

  // Validasi: TV series pakai field "name", bukan "title"
  if (!detailEn.name || detailEn.id !== tmdbId) {
    console.warn(
      `[syncSeries] Invalid or empty detail returned for tmdb_id=${tmdbId}. Skipping.`,
    );
    return;
  }

  const trailer = videos.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube",
  );

  // Cek duplikat case-insensitive sebelum insert
  // PENGECUALIAN: Jika first_air_date berbeda tahun → kemungkinan reboot/remake
  const normalizedName = detailEn.name.trim().toLowerCase();
  const incomingYear = detailEn.first_air_date
    ? new Date(detailEn.first_air_date).getFullYear()
    : null;

  const { data: existingByName } = await supabase
    .from("tv_series")
    .select("id, tmdb_id, name, first_air_date")
    .ilike("name", normalizedName)
    .neq("tmdb_id", tmdbId)
    .maybeSingle();

  if (existingByName) {
    const existingYear = existingByName.first_air_date
      ? new Date(existingByName.first_air_date).getFullYear()
      : null;

    const isSameYear =
      incomingYear !== null &&
      existingYear !== null &&
      incomingYear === existingYear;

    const isUnknownYear = incomingYear === null || existingYear === null;

    if (isSameYear || isUnknownYear) {
      console.warn(
        `[syncSeries] Duplicate detected: tmdb_id=${tmdbId} name="${detailEn.name}" (${incomingYear ?? "?"}) ` +
          `matches existing series id=${existingByName.id} tmdb_id=${existingByName.tmdb_id} ` +
          `name="${existingByName.name}" (${existingYear ?? "?"}) — skipping, updating category only.`,
      );
      if (category !== undefined && sortOrder !== undefined) {
        const { error: catErr } = await supabase.from("tv_categories").upsert(
          {
            series_id: existingByName.id,
            category,
            region: SYNC_REGION,
            sort_order: sortOrder,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "series_id,category,region" },
        );
        if (catErr) {
          console.error(
            `tv_categories upsert failed [existing series id:${existingByName.id}, cat:${category}]:`,
            catErr.message,
          );
        }
      }
      return;
    }

    // Tahun berbeda → kemungkinan reboot, lanjut insert sebagai series baru
    console.log(
      `[syncSeries] Same name but different year: tmdb_id=${tmdbId} "${detailEn.name}" (${incomingYear}) ` +
        `vs existing tmdb_id=${existingByName.tmdb_id} (${existingYear}) — treating as reboot, proceeding.`,
    );
  }

  // episode_run_time di TMDB adalah array, ambil nilai pertama
  const episodeRunTime = detailEn.episode_run_time?.[0] ?? null;

  // ── UPSERT TV SERIES ──
  const { data: seriesRow, error: seriesErr } = await supabase
    .from("tv_series")
    .upsert(
      {
        tmdb_id: tmdbId,
        name: detailEn.name,
        original_name: detailEn.original_name,
        overview: detailId.overview ?? null, // Bahasa Indonesia
        overview_en: detailEn.overview ?? null, // Bahasa Inggris
        tagline: detailEn.tagline ?? null,
        vote_average: detailEn.vote_average,
        vote_count: detailEn.vote_count,
        popularity: detailEn.popularity,
        status: detailEn.status,
        type: detailEn.type ?? null,
        original_language: detailEn.original_language,
        poster_path: detailEn.poster_path,
        backdrop_path: detailEn.backdrop_path,
        first_air_date: detailEn.first_air_date || null,
        last_air_date: detailEn.last_air_date || null,
        number_of_seasons: detailEn.number_of_seasons ?? 0,
        number_of_episodes: detailEn.number_of_episodes ?? 0,
        episode_run_time: episodeRunTime,
        in_production: detailEn.in_production ?? false,
        trailer_key: trailer?.key ?? null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "tmdb_id" },
    )
    .select("id")
    .single();

  if (seriesErr)
    throw new Error(
      `TV series upsert failed [${tmdbId}]: ${seriesErr.message}`,
    );

  const seriesId = seriesRow.id;

  // ── TV CATEGORIES ──
  if (category !== undefined && sortOrder !== undefined) {
    const { error: catErr } = await supabase.from("tv_categories").upsert(
      {
        series_id: seriesId,
        category,
        region: SYNC_REGION,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "series_id,category,region" },
    );

    if (catErr) {
      console.error(
        `tv_categories upsert failed [tmdb:${tmdbId}, cat:${category}]:`,
        catErr.message,
      );
    }
  }

  // ── GENRES ──
  // Reuse tabel genres yang sama dengan movie (genre TMDB untuk TV & movie overlap)
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
      console.error(`Genre upsert failed [${g.name}]:`, genreErr.message);
      continue;
    }

    await supabase
      .from("tv_genres")
      .upsert(
        { series_id: seriesId, genre_id: genreRow.id },
        { onConflict: "series_id,genre_id" },
      );
  }

  // ── NETWORKS ──
  // Networks adalah unik untuk TV series (HBO, Netflix Original, dll)
  for (const n of detailEn.networks ?? []) {
    const { data: networkRow, error: netErr } = await supabase
      .from("tv_networks")
      .upsert(
        {
          tmdb_network_id: n.id,
          name: n.name,
          logo_path: n.logo_path ?? null,
          origin_country: n.origin_country ?? null,
        },
        { onConflict: "tmdb_network_id" },
      )
      .select("id")
      .single();

    if (netErr) {
      console.error(`Network upsert failed [${n.name}]:`, netErr.message);
      continue;
    }

    await supabase
      .from("tv_series_networks")
      .upsert(
        { series_id: seriesId, network_id: networkRow.id },
        { onConflict: "series_id,network_id" },
      );
  }

  // ── PRODUCTION COUNTRIES ──
  if (detailEn.production_countries?.length) {
    await supabase.from("tv_countries").upsert(
      detailEn.production_countries.map((c: any) => ({
        series_id: seriesId,
        iso_3166_1: c.iso_3166_1,
        name: c.name,
      })),
      { onConflict: "series_id,iso_3166_1" },
    );
  }

  // ── SPOKEN LANGUAGES ──
  if (detailEn.spoken_languages?.length) {
    await supabase.from("tv_languages").upsert(
      detailEn.spoken_languages.map((l: any) => ({
        series_id: seriesId,
        iso_639_1: l.iso_639_1,
        name: l.name,
        english_name: l.english_name ?? null,
      })),
      { onConflict: "series_id,iso_639_1" },
    );
  }

  // ── PLATFORMS (region ID) ──
  // Reuse tabel platforms yang sama dengan movie
  const platformSources = [
    { items: providers.results?.["ID"]?.flatrate ?? [], type: "streaming" },
    { items: providers.results?.["ID"]?.rent ?? [], type: "rent" },
    { items: providers.results?.["ID"]?.buy ?? [], type: "buy" },
  ];

  for (const { items, type: platformType } of platformSources) {
    for (const p of items) {
      let platform = platformMap[p.provider_id];

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
            `[platforms] Auto-upsert failed [${p.provider_name}]:`,
            platErr.message,
          );
          continue;
        }

        platformMap[p.provider_id] = newPlatform;
        platform = newPlatform;
        console.log(
          `[platforms] Platform upserted: ${p.provider_name} (type=${platformType})`,
        );
      }

      const { error: upsertErr } = await supabase.from("tv_platforms").upsert(
        {
          series_id: seriesId,
          platform_id: platform.id,
          region: "ID",
          type: platformType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "series_id,platform_id,region,type" },
      );

      if (upsertErr)
        console.error(
          `[platforms] Upsert failed [series:${seriesId}, platform:${platform.name}, type:${platformType}]:`,
          upsertErr.message,
        );
      else
        console.log(
          `[platforms] OK: series=${seriesId} → ${platform.name} (${platformType})`,
        );
    }
  }

  // ── CAST (top 10) ──
  // TV series credits menggunakan field "cast" yang sama dengan movie
  if (credits.cast?.length) {
    await supabase.from("tv_cast").delete().eq("series_id", seriesId);

    const castRows = credits.cast.slice(0, 10).map((c: any) => ({
      series_id: seriesId,
      person_id: c.id,
      name: c.name,
      character: c.character ?? null,
      profile_path: c.profile_path ?? null,
      order_index: c.order,
    }));

    if (castRows.length) {
      const { error: castErr } = await supabase
        .from("tv_cast")
        .insert(castRows);
      if (castErr)
        console.error(
          `[cast] Insert failed [series:${seriesId}]:`,
          castErr.message,
        );
    }
  }

  // ── CREW ──
  // Untuk TV series, "Director" biasanya per-episode sehingga jarang muncul di
  // top-level credits. "Creator" dicatat via created_by di detail, tapi di credits
  // kita tetap ambil job yang relevan bila ada.
  const CREW_JOBS = [
    "Director",
    "Writer",
    "Screenplay",
    "Producer",
    "Executive Producer",
  ];
  for (const c of (credits.crew ?? []).filter((c: any) =>
    CREW_JOBS.includes(c.job),
  )) {
    await supabase.from("tv_crew").upsert(
      {
        series_id: seriesId,
        person_id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        profile_path: c.profile_path ?? null,
      },
      { onConflict: "series_id,person_id,job" },
    );
  }

  // ── CREATED BY ──
  // Field created_by adalah unik untuk TV series — tidak ada di movie.
  // Kita simpan ke tv_crew dengan job = "Creator".
  for (const creator of detailEn.created_by ?? []) {
    await supabase.from("tv_crew").upsert(
      {
        series_id: seriesId,
        person_id: creator.id,
        name: creator.name,
        job: "Creator",
        department: "Writing",
        profile_path: creator.profile_path ?? null,
      },
      { onConflict: "series_id,person_id,job" },
    );
  }
}

// ─── DISCOVER MOVIE SYNC ────────────────────────────────────────────────────

async function syncDiscover(
  platformMap: any,
): Promise<{ succeeded: number; failed: number }> {
  const { data: stateRow } = await supabase
    .from("sync_state")
    .select("value")
    .eq("key", "discover_last_page")
    .single();

  const lastPage = parseInt(stateRow?.value ?? "0", 10);
  const startPage = lastPage + 1;

  console.log(`[discover] Starting from page ${startPage}`);

  let totalSucceeded = 0;
  let totalFailed = 0;
  let lastCompletedPage = lastPage;

  for (let page = startPage; page < startPage + DISCOVER_PAGES; page++) {
    let data: any;
    try {
      data = await tmdbFetch("/discover/movie", {
        sort_by: "popularity.desc",
        page: String(page),
        "vote_count.gte": "10",
      });
    } catch (err) {
      console.error(`[discover] Failed to fetch page ${page}:`, err.message);
      break;
    }

    if (!data.results?.length) {
      console.log(`[discover] No results on page ${page}, stopping.`);
      break;
    }

    const { succeeded, failed } = await runInBatches(
      data.results,
      BATCH_SIZE,
      (movie) => syncMovie(movie, platformMap),
    );

    totalSucceeded += succeeded;
    totalFailed += failed;
    lastCompletedPage = page;
    console.log(
      `[discover] Page ${page}/${data.total_pages}: ${succeeded} ok, ${failed} failed`,
    );

    if (page >= data.total_pages) {
      lastCompletedPage = 0;
      console.log(`[discover] Reached last page, reset to page 1 on next run.`);
      break;
    }

    await sleep(300);
  }

  await supabase.from("sync_state").upsert(
    {
      key: "discover_last_page",
      value: String(lastCompletedPage),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  return { succeeded: totalSucceeded, failed: totalFailed };
}

// ─── DISCOVER TV SERIES SYNC ───────────────────────────────────────────────
// Mirror dari syncDiscover() untuk movie, tapi menggunakan:
//   - endpoint /discover/tv
//   - sync_state key: discover_series_last_page
//   - function syncSeries() sebagai processor

async function syncDiscoverSeries(
  platformMap: any,
): Promise<{ succeeded: number; failed: number }> {
  const { data: stateRow } = await supabase
    .from("sync_state")
    .select("value")
    .eq("key", "discover_series_last_page")
    .single();

  const lastPage = parseInt(stateRow?.value ?? "0", 10);
  const startPage = lastPage + 1;

  console.log(`[discover_series] Starting from page ${startPage}`);

  let totalSucceeded = 0;
  let totalFailed = 0;
  let lastCompletedPage = lastPage;

  for (let page = startPage; page < startPage + DISCOVER_PAGES; page++) {
    let data: any;
    try {
      data = await tmdbFetch("/discover/tv", {
        sort_by: "popularity.desc",
        page: String(page),
        "vote_count.gte": "10",
      });
    } catch (err) {
      console.error(
        `[discover_series] Failed to fetch page ${page}:`,
        err.message,
      );
      break;
    }

    if (!data.results?.length) {
      console.log(`[discover_series] No results on page ${page}, stopping.`);
      break;
    }

    const { succeeded, failed } = await runInBatches(
      data.results,
      BATCH_SIZE,
      (series) => syncSeries(series, platformMap),
    );

    totalSucceeded += succeeded;
    totalFailed += failed;
    lastCompletedPage = page;
    console.log(
      `[discover_series] Page ${page}/${data.total_pages}: ${succeeded} ok, ${failed} failed`,
    );

    if (page >= data.total_pages) {
      lastCompletedPage = 0;
      console.log(
        `[discover_series] Reached last page, reset to page 1 on next run.`,
      );
      break;
    }

    await sleep(300);
  }

  await supabase.from("sync_state").upsert(
    {
      key: "discover_series_last_page",
      value: String(lastCompletedPage),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  return { succeeded: totalSucceeded, failed: totalFailed };
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const sourceParam = url.searchParams.get("source");

  // ── Source untuk movie (tidak berubah) ──
  const CURATED_MOVIE_SOURCES: Record<
    string,
    { path: string; category: string }
  > = {
    trending: { path: "/trending/movie/day", category: "trending" },
    popular: { path: "/movie/popular", category: "popular" },
    top_rated: { path: "/movie/top_rated", category: "top_rated" },
    upcoming: { path: "/movie/upcoming", category: "upcoming" },
    now_playing: { path: "/movie/now_playing", category: "now_playing" },
  };

  // ── Source untuk TV series (baru) ──
  const CURATED_SERIES_SOURCES: Record<
    string,
    { path: string; category: string }
  > = {
    trending_tv: { path: "/trending/tv/day", category: "trending" },
    popular_tv: { path: "/tv/popular", category: "popular" },
    top_rated_tv: { path: "/tv/top_rated", category: "top_rated" },
    on_the_air_tv: { path: "/tv/on_the_air", category: "on_the_air" },
  };

  const ALL_SOURCE_KEYS = [
    ...Object.keys(CURATED_MOVIE_SOURCES),
    ...Object.keys(CURATED_SERIES_SOURCES),
    "discover",
    "discover_series",
  ];

  if (sourceParam && !ALL_SOURCE_KEYS.includes(sourceParam)) {
    return new Response(
      JSON.stringify({
        error: `Unknown source: "${sourceParam}". Valid: ${ALL_SOURCE_KEYS.join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const logId = crypto.randomUUID();
  const syncType = sourceParam ?? "daily";

  try {
    await supabase.from("sync_logs").insert({
      id: logId,
      sync_type: syncType,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const platformMap = await getPlatformMap();
    let totalSucceeded = 0;
    let totalFailed = 0;

    // ── Routing berdasarkan source ──
    if (sourceParam === "discover") {
      // Discover movie — tidak berubah
      const { succeeded, failed } = await syncDiscover(platformMap);
      totalSucceeded = succeeded;
      totalFailed = failed;
    } else if (sourceParam === "discover_series") {
      // Discover TV series — baru
      const { succeeded, failed } = await syncDiscoverSeries(platformMap);
      totalSucceeded = succeeded;
      totalFailed = failed;
    } else if (sourceParam && sourceParam in CURATED_SERIES_SOURCES) {
      // Curated TV series (trending_tv, popular_tv, dll) — baru
      const { path, category } = CURATED_SERIES_SOURCES[sourceParam];
      console.log(`[sync] source: ${sourceParam} -> category: ${category}`);

      let sourceData: any;
      try {
        sourceData = await tmdbFetch(path, { region: SYNC_REGION });
      } catch (err) {
        console.error(`[sync] Failed to fetch ${sourceParam}:`, err.message);
        totalFailed += MOVIES_PER_SOURCE;
      }

      if (sourceData) {
        const seriesList: any[] =
          sourceData.results?.slice(0, MOVIES_PER_SOURCE) ?? [];

        const { succeeded, failed } = await runInBatches(
          seriesList,
          BATCH_SIZE,
          (series, index) => syncSeries(series, platformMap, category, index),
        );

        totalSucceeded += succeeded;
        totalFailed += failed;
        console.log(`[sync] ${sourceParam}: ${succeeded} ok, ${failed} failed`);
      }
    } else {
      // Curated movie sources (trending, popular, dll) — tidak berubah
      // Jika sourceParam null → jalankan semua movie sources (daily default)
      const sourcesToRun = sourceParam
        ? { [sourceParam]: CURATED_MOVIE_SOURCES[sourceParam] }
        : CURATED_MOVIE_SOURCES;

      for (const [name, { path, category }] of Object.entries(sourcesToRun)) {
        console.log(`[sync] source: ${name} -> category: ${category}`);

        let sourceData: any;
        try {
          sourceData = await tmdbFetch(path, { region: SYNC_REGION });
        } catch (err) {
          console.error(`[sync] Failed to fetch ${name}:`, err.message);
          totalFailed += MOVIES_PER_SOURCE;
          continue;
        }

        const movies: any[] =
          sourceData.results?.slice(0, MOVIES_PER_SOURCE) ?? [];

        const { succeeded, failed } = await runInBatches(
          movies,
          BATCH_SIZE,
          (movie, index) => syncMovie(movie, platformMap, category, index),
        );

        totalSucceeded += succeeded;
        totalFailed += failed;
        console.log(`[sync] ${name}: ${succeeded} ok, ${failed} failed`);
      }
    }

    const status = totalFailed === 0 ? "success" : "partial";

    await supabase.from("sync_logs").upsert({
      id: logId,
      sync_type: syncType,
      status,
      movies_processed: totalSucceeded,
      error_message: totalFailed > 0 ? `${totalFailed} item(s) failed` : null,
      finished_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        source: syncType,
        succeeded: totalSucceeded,
        failed: totalFailed,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sync] Fatal error:", err.message);
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
