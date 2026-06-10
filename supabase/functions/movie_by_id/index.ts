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

// ─── Upsert helpers ─────────────────────────────────────────────────────────

async function upsertGenres(genreIds: number[]) {
  // genres table should already be seeded; we just reference genre_id directly
  return genreIds;
}

async function upsertProductionCompanies(
  companies: Array<{
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
  }>,
): Promise<Map<number, number>> {
  /** Returns map: tmdb_company_id -> internal id */
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

// ─── Main sync ──────────────────────────────────────────────────────────────

async function syncMovie(tmdbId: number) {
  // 1. Fetch movie detail (with append_to_response)
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

  // overview field = Indonesian translation (if available), else original
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
    // Lookup internal genres.id by tmdb_genre_id
    const tmdbGenreIds = detail.genres.map((g: { id: number }) => g.id);

    const { data: genreData, error: genreLookupError } = await supabase
      .from("genres")
      .select("id, tmdb_genre_id")
      .in("tmdb_genre_id", tmdbGenreIds);

    if (genreLookupError)
      throw new Error(`genre lookup: ${genreLookupError.message}`);

    // Build map: tmdb_genre_id -> internal genres.id
    const genreMap = new Map(
      (genreData ?? []).map((g) => [g.tmdb_genre_id, g.id]),
    );

    // Warn if any TMDB genre isn't seeded in our genres table yet
    const missingGenres = detail.genres.filter(
      (g: { id: number; name: string }) => !genreMap.has(g.id),
    );
    if (missingGenres.length) {
      console.warn(
        `[sync-movie] genres not found in DB (seed them first):`,
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

    // Keep top 20 cast members to avoid bloat
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

    // Only key crew roles to keep data lean
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

    // Collect all provider entries across types
    const providerEntries: Array<{
      tmdb_provider_id: number;
      type: string;
    }> = [];

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
      // Look up internal platform IDs by tmdb_provider_id
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
  // Allow only POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let tmdbId: number;

  try {
    const body = await req.json();
    tmdbId = Number(body?.tmdb_id);
    if (!tmdbId || isNaN(tmdbId)) throw new Error("Invalid tmdb_id");
  } catch {
    return new Response(
      JSON.stringify({ error: "Request body must contain a valid tmdb_id" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const result = await syncMovie(tmdbId);
    return new Response(
      JSON.stringify({
        success: true,
        message: `Movie tmdb_id=${tmdbId} synced successfully`,
        data: result,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sync-movie] Error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
