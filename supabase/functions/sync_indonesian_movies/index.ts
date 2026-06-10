import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB error ${res.status} on ${path}`);
  return res.json();
}

function mapProviderType(tmdbType: string): string {
  const map: Record<string, string> = {
    flatrate: "streaming",
    rent: "rent",
    buy: "buy",
    free: "free",
    ads: "ads",
  };
  return map[tmdbType] ?? tmdbType;
}

// ─── Check which tmdb_ids already exist in movies table ─────────────────────

async function filterNewTmdbIds(tmdbIds: number[]): Promise<number[]> {
  if (!tmdbIds.length) return [];

  const { data, error } = await supabase
    .from("movies")
    .select("tmdb_id")
    .in("tmdb_id", tmdbIds);

  if (error) throw new Error(`filterNewTmdbIds: ${error.message}`);

  const existing = new Set((data ?? []).map((r) => r.tmdb_id));
  return tmdbIds.filter((id) => !existing.has(id));
}

// ─── Discover new Indonesian movie IDs, paginating until `limit` new ones ────
// Keeps fetching TMDB pages and filtering against DB until we have `limit`
// IDs that don't yet exist in the movies table, or TMDB runs out of pages.

async function discoverNewIndonesianMovieIds(limit: number): Promise<{
  newIds: number[];
  totalDiscovered: number;
  totalSkipped: number;
  exhausted: boolean; // true = no more TMDB pages left
}> {
  const newIds: number[] = [];
  let page = 1;
  let totalPages = 1;
  let totalDiscovered = 0;
  let totalSkipped = 0;

  while (newIds.length < limit && page <= totalPages) {
    const data = await tmdbFetch("/discover/movie", {
      with_original_language: "id",
      sort_by: "popularity.desc",
      page: String(page),
    });

    totalPages = data.total_pages ?? 1;
    const results: Array<{ id: number }> = data.results ?? [];
    if (!results.length) break;

    const pageIds = results.map((m) => m.id);
    totalDiscovered += pageIds.length;

    // Filter this page's IDs against DB
    const freshIds = await filterNewTmdbIds(pageIds);
    totalSkipped += pageIds.length - freshIds.length;

    for (const id of freshIds) {
      if (newIds.length >= limit) break;
      newIds.push(id);
    }

    page++;
  }

  return {
    newIds,
    totalDiscovered,
    totalSkipped,
    exhausted: page > totalPages,
  };
}

// ─── Upsert helpers ─────────────────────────────────────────────────────────

async function upsertProductionCompanies(
  companies: Array<{
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
  }>,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!companies.length) return map;

  const rows = companies.map((c) => ({
    tmdb_company_id: c.id,
    name: c.name,
    logo_path: c.logo_path ?? null,
    origin_country: c.origin_country ?? null,
  }));

  const { data, error } = await supabase
    .from("production_companies")
    .upsert(rows, { onConflict: "tmdb_company_id" })
    .select("id, tmdb_company_id");

  if (error) throw new Error(`upsertProductionCompanies: ${error.message}`);
  for (const row of data ?? []) map.set(row.tmdb_company_id, row.id);
  return map;
}

// ─── Sync single movie ───────────────────────────────────────────────────────

async function syncMovie(
  tmdbId: number,
): Promise<{ movieId: number; tmdbId: number }> {
  // 1. Fetch movie detail, translations, and watch providers concurrently
  const [detail, translations, watchProviders] = await Promise.all([
    tmdbFetch(`/movie/${tmdbId}`, {
      append_to_response: "videos,credits",
      language: "id-ID",
    }),
    tmdbFetch(`/movie/${tmdbId}/translations`),
    tmdbFetch(`/movie/${tmdbId}/watch/providers`),
  ]);

  // ── Extract trailer key ──────────────────────────────────────────────────
  const trailerKey: string | null =
    detail.videos?.results?.find(
      (v: { type: string; site: string; key: string }) =>
        v.type === "Trailer" && v.site === "YouTube",
    )?.key ?? null;

  // ── Extract English overview from translations ───────────────────────────
  const enTranslation = translations.translations?.find(
    (t: { iso_3166_1: string; iso_639_1: string }) =>
      t.iso_639_1 === "en" && t.iso_3166_1 === "US",
  );
  const overviewEn: string | null =
    enTranslation?.data?.overview ?? detail.overview ?? null;

  const overviewId: string | null = detail.overview || null;

  // ── 2. Upsert movie ──────────────────────────────────────────────────────
  const movieRow = {
    tmdb_id: tmdbId,
    title: detail.title,
    original_title: detail.original_title ?? null,
    overview: overviewId,
    overview_en: overviewEn,
    tagline: detail.tagline ?? null,
    vote_average: detail.vote_average ?? 0,
    vote_count: detail.vote_count ?? 0,
    popularity: detail.popularity ?? 0,
    status: detail.status ?? null,
    original_language: detail.original_language ?? null,
    poster_path: detail.poster_path ?? null,
    backdrop_path: detail.backdrop_path ?? null,
    release_date: detail.release_date || null,
    runtime: detail.runtime ?? null,
    budget: detail.budget ?? 0,
    revenue: detail.revenue ?? 0,
    trailer_key: trailerKey,
    synced_at: new Date().toISOString(),
  };

  const { data: movieData, error: movieError } = await supabase
    .from("movies")
    .upsert(movieRow, { onConflict: "tmdb_id" })
    .select("id")
    .single();

  if (movieError) throw new Error(`upsert movies: ${movieError.message}`);
  const movieId: number = movieData.id;

  // ── 3. Genres ────────────────────────────────────────────────────────────
  if (detail.genres?.length) {
    const tmdbGenreIds = detail.genres.map((g: { id: number }) => g.id);

    const { data: genreData, error: genreLookupError } = await supabase
      .from("genres")
      .select("id, tmdb_genre_id")
      .in("tmdb_genre_id", tmdbGenreIds);

    if (genreLookupError)
      throw new Error(`genre lookup: ${genreLookupError.message}`);

    const genreMap = new Map(
      (genreData ?? []).map((g) => [g.tmdb_genre_id, g.id]),
    );

    const missingGenres = detail.genres.filter(
      (g: { id: number; name: string }) => !genreMap.has(g.id),
    );
    if (missingGenres.length) {
      console.warn(
        `[sync-id-movies] genres not seeded:`,
        missingGenres.map(
          (g: { id: number; name: string }) =>
            `${g.name} (tmdb_genre_id=${g.id})`,
        ),
      );
    }

    const genreRows = detail.genres
      .map((g: { id: number }) => ({
        movie_id: movieId,
        genre_id: genreMap.get(g.id),
      }))
      .filter(
        (r: { genre_id: number | undefined }) => r.genre_id !== undefined,
      );

    if (genreRows.length) {
      await supabase.from("movie_genres").delete().eq("movie_id", movieId);

      const { error: genreError } = await supabase
        .from("movie_genres")
        .upsert(genreRows, { onConflict: "movie_id,genre_id" });

      if (genreError)
        throw new Error(`upsert movie_genres: ${genreError.message}`);
    }
  }

  // ── 4. Production companies ──────────────────────────────────────────────
  if (detail.production_companies?.length) {
    const companyMap = await upsertProductionCompanies(
      detail.production_companies,
    );

    await supabase.from("movie_companies").delete().eq("movie_id", movieId);

    const companyRows = detail.production_companies
      .map((c: { id: number }) => ({
        movie_id: movieId,
        company_id: companyMap.get(c.id),
      }))
      .filter(
        (r: { company_id: number | undefined }) => r.company_id !== undefined,
      );

    if (companyRows.length) {
      const { error: companyError } = await supabase
        .from("movie_companies")
        .upsert(companyRows, { onConflict: "movie_id,company_id" });

      if (companyError)
        throw new Error(`upsert movie_companies: ${companyError.message}`);
    }
  }

  // ── 5. Countries ─────────────────────────────────────────────────────────
  if (detail.production_countries?.length) {
    await supabase.from("movie_countries").delete().eq("movie_id", movieId);

    const countryRows = detail.production_countries.map(
      (c: { iso_3166_1: string; name: string }) => ({
        movie_id: movieId,
        iso_3166_1: c.iso_3166_1,
        name: c.name,
      }),
    );

    const { error: countryError } = await supabase
      .from("movie_countries")
      .upsert(countryRows, { onConflict: "movie_id,iso_3166_1" });

    if (countryError)
      throw new Error(`upsert movie_countries: ${countryError.message}`);
  }

  // ── 6. Languages ─────────────────────────────────────────────────────────
  if (detail.spoken_languages?.length) {
    await supabase.from("movie_languages").delete().eq("movie_id", movieId);

    const langRows = detail.spoken_languages.map(
      (l: { iso_639_1: string; name: string; english_name: string }) => ({
        movie_id: movieId,
        iso_639_1: l.iso_639_1,
        name: l.name ?? null,
        english_name: l.english_name ?? null,
      }),
    );

    const { error: langError } = await supabase
      .from("movie_languages")
      .upsert(langRows, { onConflict: "movie_id,iso_639_1" });

    if (langError)
      throw new Error(`upsert movie_languages: ${langError.message}`);
  }

  // ── 7. Cast ──────────────────────────────────────────────────────────────
  const cast: Array<{
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
  }> = detail.credits?.cast ?? [];

  if (cast.length) {
    await supabase.from("movie_cast").delete().eq("movie_id", movieId);

    const castRows = cast.slice(0, 20).map((c) => ({
      movie_id: movieId,
      person_id: c.id,
      name: c.name,
      character: c.character ?? null,
      profile_path: c.profile_path ?? null,
      department: "Acting",
      order_index: c.order ?? 0,
    }));

    const { error: castError } = await supabase
      .from("movie_cast")
      .upsert(castRows, { onConflict: "movie_id,person_id" });

    if (castError) throw new Error(`upsert movie_cast: ${castError.message}`);
  }

  // ── 8. Crew ──────────────────────────────────────────────────────────────
  const crew: Array<{
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  }> = detail.credits?.crew ?? [];

  if (crew.length) {
    await supabase.from("movie_crew").delete().eq("movie_id", movieId);

    const KEY_JOBS = [
      "Director",
      "Producer",
      "Executive Producer",
      "Screenplay",
      "Writer",
      "Story",
      "Director of Photography",
      "Original Music Composer",
      "Editor",
    ];

    const crewRows = crew
      .filter((c) => KEY_JOBS.includes(c.job))
      .map((c) => ({
        movie_id: movieId,
        person_id: c.id,
        name: c.name,
        job: c.job,
        department: c.department ?? null,
        profile_path: c.profile_path ?? null,
      }));

    if (crewRows.length) {
      const { error: crewError } = await supabase
        .from("movie_crew")
        .upsert(crewRows, { onConflict: "movie_id,person_id,job" });

      if (crewError) throw new Error(`upsert movie_crew: ${crewError.message}`);
    }
  }

  // ── 9. Watch Providers (platforms) ───────────────────────────────────────
  const idProviders = watchProviders.results?.ID;
  if (idProviders) {
    await supabase.from("movie_platforms").delete().eq("movie_id", movieId);

    const providerEntries: Array<{ tmdb_provider_id: number; type: string }> =
      [];
    const providerTypes = ["flatrate", "rent", "buy", "free", "ads"];

    for (const tmdbType of providerTypes) {
      const providers = idProviders[tmdbType] ?? [];
      for (const p of providers) {
        providerEntries.push({
          tmdb_provider_id: p.provider_id,
          type: mapProviderType(tmdbType),
        });
      }
    }

    if (providerEntries.length) {
      const tmdbProviderIds = [
        ...new Set(providerEntries.map((p) => p.tmdb_provider_id)),
      ];

      const { data: platformData, error: platformLookupError } = await supabase
        .from("platforms")
        .select("id, tmdb_provider_id")
        .in("tmdb_provider_id", tmdbProviderIds);

      if (platformLookupError)
        throw new Error(`platform lookup: ${platformLookupError.message}`);

      const platformMap = new Map(
        (platformData ?? []).map((p) => [p.tmdb_provider_id, p.id]),
      );

      const platformRows = providerEntries
        .map((p) => ({
          movie_id: movieId,
          platform_id: platformMap.get(p.tmdb_provider_id),
          region: "ID",
          type: p.type,
          updated_at: new Date().toISOString(),
        }))
        .filter((r) => r.platform_id !== undefined);

      if (platformRows.length) {
        const { error: platformError } = await supabase
          .from("movie_platforms")
          .upsert(platformRows, {
            onConflict: "movie_id,platform_id,region,type",
          });

        if (platformError)
          throw new Error(`upsert movie_platforms: ${platformError.message}`);
      }
    }
  }

  return { movieId, tmdbId };
}

// ─── Edge Function Handler ───────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Parse request body ───────────────────────────────────────────────────
  let limit: number;
  try {
    const body = await req.json();
    limit = Number(body?.limit);
    if (!limit || isNaN(limit) || limit < 1) throw new Error("Invalid limit");
    // Cap at 500 to avoid extreme runtimes
    limit = Math.min(limit, 500);
  } catch {
    return new Response(
      JSON.stringify({
        error:
          'Request body must contain a valid "limit" (e.g. { "limit": 50 })',
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 1. Paginate TMDB until `limit` new IDs found ───────────────────────
  let newIds: number[];
  let totalDiscovered: number;
  let totalSkipped: number;
  let exhausted: boolean;

  try {
    ({ newIds, totalDiscovered, totalSkipped, exhausted } =
      await discoverNewIndonesianMovieIds(limit));

    console.log(
      `[sync-id-movies] Scanned ${totalDiscovered} TMDB entries | ` +
        `${totalSkipped} skipped (exist) | ${newIds.length} new to sync` +
        (exhausted ? " | TMDB pages exhausted" : ""),
    );
  } catch (err) {
    console.error("[sync-id-movies] Discover/filter failed:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!newIds.length) {
    return new Response(
      JSON.stringify({
        success: true,
        message: exhausted
          ? `No new Indonesian movies found. All ${totalDiscovered} TMDB entries already exist in the database.`
          : "No new movies found.",
        synced: 0,
        skipped: totalSkipped,
        errors: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 2. Sync each new movie ───────────────────────────────────────────────
  const results: Array<{ tmdbId: number; movieId: number }> = [];
  const errors: Array<{ tmdbId: number; error: string }> = [];

  for (const tmdbId of newIds) {
    try {
      const result = await syncMovie(tmdbId);
      results.push(result);
      console.log(
        `[sync-id-movies] ✓ tmdb_id=${tmdbId} -> movie_id=${result.movieId}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[sync-id-movies] ✗ tmdb_id=${tmdbId}: ${message}`);
      errors.push({ tmdbId, error: message });
    }
  }

  // ── 3. Return summary ────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      success: true,
      message:
        `Sync complete. ${results.length} synced, ${errors.length} failed, ${totalSkipped} skipped (already exist).` +
        (exhausted && results.length < limit
          ? ` TMDB exhausted before reaching limit of ${limit}.`
          : ""),
      synced: results.length,
      skipped: totalSkipped,
      failed: errors.length,
      errors,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
