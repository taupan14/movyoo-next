import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Collection {
  id: number;
  key: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
}

interface MovieRow {
  id: number;
  title: string;
  original_title: string | null;
  release_date: string | null;
}

interface TvSeriesRow {
  id: number;
  name: string;
  original_name: string | null;
  first_air_date: string | null;
}

// Target table: collection_movies (sistem), bukan collection_items (user)
interface CollectionMovieInsert {
  collection_id: number;
  media_type: "movie" | "tv";
  movie_id?: number;
  series_id?: number;
  sort_order: number;
}

interface CollectionResult {
  collection_id: number;
  collection_key: string;
  collection_name: string;
  inserted: number;
  skipped: number;
  not_found: string[];
  match_strategy: string;
  error?: string;
}

// ─── Pagination fetch helper ──────────────────────────────────────────────────
// Supabase default limit = 1000. Fetch semua rows dengan pagination.

async function fetchAll<T>(
  table: string,
  select: string,
  filters: Record<string, string> = {},
): Promise<T[]> {
  const PAGE = 1000;
  let offset = 0;
  const all: T[] = [];

  while (true) {
    let q = supabase
      .from(table)
      .select(select)
      .range(offset, offset + PAGE - 1);
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val);
    }

    const { data, error } = await q;
    if (error) throw new Error(`fetch ${table}: ${error.message}`);

    const rows = (data ?? []) as T[];
    all.push(...rows);

    if (rows.length < PAGE) break; // ultima pagina
    offset += PAGE;
  }

  return all;
}

// ─── Title-based matchers ─────────────────────────────────────────────────────

const TITLE_PATTERNS: Record<string, RegExp> = {
  star_wars: /\bstar\s+wars\b/i,

  harry_potter:
    /\bharry\s+potter\b|\bfantastic\s+beasts\b|\bwizarding\s+world\b/i,

  mcu: /\bavengers\b|\biron\s+man\b|\bcaptain\s+america\b|\bblack\s+panther\b|\bthor\b|\bguardians\s+of\s+the\s+galaxy\b|\bdoctor\s+strange\b|\bant[\s-]man\b|\bblack\s+widow\b|\bshang[\s-]chi\b|\betemals\b|\bspider[\s-]man\b|\bwandavision\b|\bhawkeye\b|\bms\.?\s+marvel\b|\bshe[\s-]hulk\b|\bmoon\s+knight\b|\bsecret\s+invasion\b|\bloki\b|\bthe\s+marvels\b/i,

  dc: /\bsuperman\b|\bbatman\b|\bwonder\s+woman\b|\baquaman\b|\bsuicide\s+squad\b|\bbirds\s+of\s+prey\b|\bshazam\b|\bblack\s+adam\b|\bthe\s+flash\b|\bblue\s+beetle\b|\bjoker\b|\bpeacemaker\b|\bgreen\s+lantern\b/i,
};

const DIRECTOR_KEYS: Record<string, string> = {
  nolan: "Christopher Nolan",
  spielberg: "Steven Spielberg",
  miyazaki: "Hayao Miyazaki",
  scorsese: "Martin Scorsese",
  kubrick: "Stanley Kubrick",
};

const GENRE_KEYS: Record<string, { genreSlug: string; lang?: string }> = {
  // kosong — Ghibli dipindah ke COMPANY_KEYS
};

// Match berdasarkan production_companies.id (dari tabel movie_companies)
const COMPANY_KEYS: Record<string, number> = {
  ghibli: 65, // Studio Ghibli
};

const AWARDS_KEYS = ["oscar_bp", "palme_dor"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchTitle(
  pattern: RegExp,
  a: string | null,
  b: string | null,
): boolean {
  return pattern.test(a ?? "") || pattern.test(b ?? "");
}

// ─── Director: fetch matching IDs from crew tables ────────────────────────────

async function fetchMovieIdsByDirector(
  directorName: string,
): Promise<Set<number>> {
  const lower = directorName.toLowerCase();

  const rows = await fetchAll<{ movie_id: number; name: string }>(
    "movie_crew",
    "movie_id, name",
    { job: "Director" },
  );

  const ids = new Set<number>();
  for (const row of rows) {
    if ((row.name ?? "").toLowerCase().includes(lower)) {
      ids.add(Number(row.movie_id)); // eksplisit Number() untuk pastikan tipe
    }
  }
  console.log(
    `[crew] "${directorName}" → ${ids.size} movie_ids dari ${rows.length} directors`,
  );
  return ids;
}

async function fetchTvIdsByDirector(
  directorName: string,
): Promise<Set<number>> {
  const lower = directorName.toLowerCase();

  const rows = await fetchAll<{ series_id: number | string; name: string }>(
    "tv_crew",
    "series_id, name",
    { job: "Director" },
  );

  const ids = new Set<number>();
  for (const row of rows) {
    if ((row.name ?? "").toLowerCase().includes(lower)) {
      ids.add(Number(row.series_id));
    }
  }
  return ids;
}

// ─── Genre: fetch matching IDs ────────────────────────────────────────────────

async function fetchMovieIdsByGenre(
  genreSlug: string,
  lang?: string,
): Promise<Set<number>> {
  const { data: genreData, error: genreErr } = await supabase
    .from("genres")
    .select("id")
    .eq("slug", genreSlug)
    .single();

  if (genreErr || !genreData)
    throw new Error(`genre not found for slug="${genreSlug}"`);

  const rows = await fetchAll<{
    movie_id: number;
    movies: { id: number; original_language: string };
  }>("movie_genres", "movie_id, movies!inner(id, original_language)", {
    genre_id: String(genreData.id),
  });

  const ids = new Set<number>();
  for (const row of rows) {
    if (lang && row.movies?.original_language !== lang) continue;
    ids.add(Number(row.movie_id));
  }
  return ids;
}

async function fetchTvIdsByGenre(
  genreSlug: string,
  lang?: string,
): Promise<Set<number>> {
  const { data: genreData, error: genreErr } = await supabase
    .from("genres")
    .select("id")
    .eq("slug", genreSlug)
    .single();

  if (genreErr || !genreData)
    throw new Error(`genre not found for slug="${genreSlug}"`);

  const rows = await fetchAll<{
    series_id: number | string;
    tv_series: { id: number; original_language: string };
  }>("tv_genres", "series_id, tv_series!inner(id, original_language)", {
    genre_id: String(genreData.id),
  });

  const ids = new Set<number>();
  for (const row of rows) {
    if (lang && row.tv_series?.original_language !== lang) continue;
    ids.add(Number(row.series_id));
  }
  return ids;
}

// ─── Company: fetch movie IDs via movie_companies ────────────────────────────

async function fetchMovieIdsByCompany(companyId: number): Promise<Set<number>> {
  const rows = await fetchAll<{ movie_id: number }>(
    "movie_companies",
    "movie_id",
    { company_id: String(companyId) },
  );
  const ids = new Set<number>(rows.map((r) => Number(r.movie_id)));
  console.log(`[company] id=${companyId} → ${ids.size} movies`);
  return ids;
}

// ─── Process one collection ───────────────────────────────────────────────────

async function processCollection(
  collection: Collection,
  movies: MovieRow[],
  tvSeries: TvSeriesRow[],
): Promise<CollectionResult> {
  const result: CollectionResult = {
    collection_id: collection.id,
    collection_key: collection.key,
    collection_name: collection.name,
    inserted: 0,
    skipped: 0,
    not_found: [],
    match_strategy: "unknown",
  };

  let matchedMovieIds: number[] = [];
  let matchedTvIds: number[] = [];

  try {
    // ── 1. Director ─────────────────────────────────────────────────────────
    if (DIRECTOR_KEYS[collection.key]) {
      const directorName = DIRECTOR_KEYS[collection.key];
      result.match_strategy = `director: "${directorName}" via crew tables`;

      const [movieCrewIds, tvCrewIds] = await Promise.all([
        fetchMovieIdsByDirector(directorName),
        fetchTvIdsByDirector(directorName),
      ]);

      // Pastikan compare Number vs Number
      matchedMovieIds = movies
        .filter((m) => movieCrewIds.has(Number(m.id)))
        .map((m) => Number(m.id));

      matchedTvIds = tvSeries
        .filter((t) => tvCrewIds.has(Number(t.id)))
        .map((t) => Number(t.id));

      console.log(
        `[match] "${directorName}" → movies=${matchedMovieIds.length}/${movies.length}, tv=${matchedTvIds.length}/${tvSeries.length}`,
      );
    }

    // ── 2. Title pattern ────────────────────────────────────────────────────
    else if (TITLE_PATTERNS[collection.key]) {
      const pattern = TITLE_PATTERNS[collection.key];
      result.match_strategy = `title pattern: ${pattern}`;

      matchedMovieIds = movies
        .filter((m) => matchTitle(pattern, m.title, m.original_title))
        .map((m) => Number(m.id));

      matchedTvIds = tvSeries
        .filter((t) => matchTitle(pattern, t.name, t.original_name))
        .map((t) => Number(t.id));
    }

    // ── 3. Genre ────────────────────────────────────────────────────────────
    else if (GENRE_KEYS[collection.key]) {
      const { genreSlug, lang } = GENRE_KEYS[collection.key];
      result.match_strategy = `genre: "${genreSlug}"${lang ? ` + lang=${lang}` : ""}`;

      const [movieGenreIds, tvGenreIds] = await Promise.all([
        fetchMovieIdsByGenre(genreSlug, lang),
        fetchTvIdsByGenre(genreSlug, lang),
      ]);

      matchedMovieIds = movies
        .filter((m) => movieGenreIds.has(Number(m.id)))
        .map((m) => Number(m.id));

      matchedTvIds = tvSeries
        .filter((t) => tvGenreIds.has(Number(t.id)))
        .map((t) => Number(t.id));
    }

    // ── 4. Company (e.g. Studio Ghibli) ────────────────────────────────────
    else if (COMPANY_KEYS[collection.key] !== undefined) {
      const companyId = COMPANY_KEYS[collection.key];
      result.match_strategy = `production company id=${companyId} via movie_companies`;

      const movieCompanyIds = await fetchMovieIdsByCompany(companyId);
      // TV series tidak punya tabel tv_companies, skip
      matchedMovieIds = movies
        .filter((m) => movieCompanyIds.has(Number(m.id)))
        .map((m) => Number(m.id));
      matchedTvIds = [];
    }

    // ── 5. Awards ───────────────────────────────────────────────────────────
    else if (AWARDS_KEYS.includes(collection.key)) {
      result.match_strategy = "manual — no auto-match available";
      result.not_found.push(
        `Collection "${collection.name}" memerlukan data manual. ` +
          `Insert ke collection_items secara manual dengan movie_id atau series_id yang sesuai.`,
      );
      return result;
    }

    // ── 6. Unknown ──────────────────────────────────────────────────────────
    else {
      result.match_strategy = "no config";
      result.error = `No matcher config for key="${collection.key}"`;
      return result;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }

  console.log(
    `[sync] "${collection.name}" → matched movies=${matchedMovieIds.length}, tv=${matchedTvIds.length}`,
  );

  if (matchedMovieIds.length === 0 && matchedTvIds.length === 0) {
    result.not_found.push(`No movies or TV series matched.`);
    return result;
  }

  // ── Check existing items di collection_movies ─────────────────────────────
  const { data: existingItems } = await supabase
    .from("collection_movies")
    .select("media_type, movie_id, series_id")
    .eq("collection_id", collection.id);

  const existingMovieIds = new Set<number>(
    (existingItems ?? [])
      .filter((e) => e.media_type === "movie" && e.movie_id != null)
      .map((e) => Number(e.movie_id)),
  );
  const existingSeriesIds = new Set<number>(
    (existingItems ?? [])
      .filter((e) => e.media_type === "tv" && e.series_id != null)
      .map((e) => Number(e.series_id)),
  );

  // ── Prepare insert rows ───────────────────────────────────────────────────
  const toInsert: CollectionMovieInsert[] = [];
  let sortOrder = existingItems?.length ?? 0;

  for (const id of matchedMovieIds) {
    if (existingMovieIds.has(id)) {
      result.skipped++;
      continue;
    }
    toInsert.push({
      collection_id: Number(collection.id),
      media_type: "movie",
      movie_id: id,
      sort_order: sortOrder++,
    });
  }

  for (const id of matchedTvIds) {
    if (existingSeriesIds.has(id)) {
      result.skipped++;
      continue;
    }
    toInsert.push({
      collection_id: Number(collection.id),
      media_type: "tv",
      series_id: id,
      sort_order: sortOrder++,
    });
  }

  if (toInsert.length === 0) {
    console.log(`[sync] "${collection.name}" → semua sudah ada, skip`);
    return result;
  }

  // ── Batch insert ke collection_movies ─────────────────────────────────────
  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const { error: insertErr } = await supabase
      .from("collection_movies")
      .insert(chunk);

    if (insertErr) {
      result.error = `insert batch offset=${i}: ${insertErr.message}`;
      console.error(
        `[sync] "${collection.name}" insert error:`,
        JSON.stringify(chunk[0]),
      );
      return result;
    }

    result.inserted += chunk.length;
  }

  console.log(
    `[sync] "${collection.name}" → inserted=${result.inserted}, skipped=${result.skipped}`,
  );
  return result;
}

// ─── Edge Function Handler ────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let filterKeys: string[] | null = null;
  let dryRun = false;

  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.keys) && body.keys.length > 0)
        filterKeys = body.keys;
      if (body?.dry_run === true) dryRun = true;
    } catch {
      /* ignore */
    }
  }

  try {
    let query = supabase
      .from("collections")
      .select("id, key, name, type, description, is_active")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (filterKeys?.length) query = query.in("key", filterKeys);

    const { data: collections, error: colErr } = await query;
    if (colErr) {
      return new Response(
        JSON.stringify({ success: false, error: colErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!collections?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active collections found",
          processed: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (dryRun) {
      const plan = (collections as Collection[]).map((col) => ({
        collection_id: col.id,
        collection_key: col.key,
        collection_name: col.name,
        will_use: DIRECTOR_KEYS[col.key]
          ? `director: "${DIRECTOR_KEYS[col.key]}" via movie_crew/tv_crew`
          : TITLE_PATTERNS[col.key]
            ? `title pattern`
            : GENRE_KEYS[col.key]
              ? `genre: "${GENRE_KEYS[col.key].genreSlug}"${GENRE_KEYS[col.key].lang ? ` + lang=${GENRE_KEYS[col.key].lang}` : ""}`
              : COMPANY_KEYS[col.key] !== undefined
                ? `production company id=${COMPANY_KEYS[col.key]} via movie_companies`
                : AWARDS_KEYS.includes(col.key)
                  ? `⚠️  manual insert required`
                  : `❌ no config`,
      }));
      return new Response(
        JSON.stringify({ success: true, dry_run: true, plan }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[sync] Starting. collections=${collections.length}`);

    // Pre-fetch semua movies & tv_series dengan pagination
    const [movies, tvSeries] = await Promise.all([
      fetchAll<MovieRow>("movies", "id, title, original_title, release_date"),
      fetchAll<TvSeriesRow>(
        "tv_series",
        "id, name, original_name, first_air_date",
      ),
    ]);

    console.log(
      `[sync] Loaded movies=${movies.length}, tv_series=${tvSeries.length}`,
    );

    const results: CollectionResult[] = [];
    for (const col of collections as Collection[]) {
      const result = await processCollection(col, movies, tvSeries);
      results.push(result);
    }

    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    const totalErrors = results.filter((r) => !!r.error).length;
    const allNotFound = results
      .filter((r) => r.not_found.length > 0)
      .flatMap((r) => r.not_found.map((msg) => `[${r.collection_key}] ${msg}`));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} collection(s)`,
        summary: {
          collections_processed: results.length,
          total_inserted: totalInserted,
          total_skipped: totalSkipped,
          total_errors: totalErrors,
          not_found_count: allNotFound.length,
        },
        not_found: allNotFound,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sync-collection-items] Fatal error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
