import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY")!;

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Types ───────────────────────────────────────────────────────────────────

interface MovieRow {
  id: number;
  tmdb_id: number;
  title: string;
  original_title: string | null;
  release_date: string | null;
  trailer_key: string | null;
  overview: string | null;
  overview_en: string | null;
}

interface TvSeriesRow {
  id: number;
  tmdb_id: number;
  name: string;
  original_name: string | null;
  first_air_date: string | null;
  trailer_key: string | null;
  overview: string | null;
  overview_en: string | null;
}

interface UpdatePayload {
  trailer_key?: string;
  overview?: string;
  overview_en?: string;
  synced_at: string;
}

interface NormalizedRow {
  id: number;
  tmdb_id: number;
  title: string;
  release_date: string | null;
  trailer_key: string | null;
  overview: string | null;
  overview_en: string | null;
}

interface ProcessResult {
  id: number;
  title: string;
  updated: Partial<UpdatePayload>;
  skipped: boolean;
  error?: string;
}

type MediaType = "movie" | "tv";

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeMovie(m: MovieRow): NormalizedRow {
  return {
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.title,
    release_date: m.release_date,
    trailer_key: m.trailer_key,
    overview: m.overview,
    overview_en: m.overview_en,
  };
}

function normalizeTv(t: TvSeriesRow): NormalizedRow {
  return {
    id: t.id,
    tmdb_id: t.tmdb_id,
    title: t.name,
    release_date: t.first_air_date,
    trailer_key: t.trailer_key,
    overview: t.overview,
    overview_en: t.overview_en,
  };
}

// ─── Query Cleaner ────────────────────────────────────────────────────────────

function cleanTitle(raw: string): string {
  return raw
    .replace(/\b\d{1,2}h(\s*\d{1,2}m)?\b/gi, "")
    .replace(/\b\d{2,3}m\b/gi, "")
    .replace(/\b(D17|R13|SU|A|R|[A-Z]?\d{1,2}\+?)\b/g, "")
    .replace(/\|\s*[A-Z]{2,4}\s*/g, "")
    .replace(/\|/g, "")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── TMDB Helpers ────────────────────────────────────────────────────────────

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return res.json();
}

async function fetchTrailerFromTMDB(
  tmdbId: number,
  mediaType: MediaType,
): Promise<string | null> {
  try {
    const path =
      mediaType === "tv" ? `/tv/${tmdbId}/videos` : `/movie/${tmdbId}/videos`;

    const data = await tmdbFetch(path, { language: "en-US" });
    const videos: Array<{ type: string; site: string; key: string }> =
      data.results ?? [];

    const found =
      videos.find(
        (v) => v.site === "YouTube" && v.type === "Official Trailer",
      ) ??
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
      videos.find((v) => v.site === "YouTube" && v.type === "Teaser") ??
      videos.find((v) => v.site === "YouTube");

    return found?.key ?? null;
  } catch (err) {
    console.warn(
      `[trailer] TMDB fetch failed for ${mediaType} tmdb_id=${tmdbId}:`,
      err,
    );
    return null;
  }
}

async function fetchOverviewEnFromTMDB(
  tmdbId: number,
  mediaType: MediaType,
): Promise<string | null> {
  try {
    const path = mediaType === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const data = await tmdbFetch(path, { language: "en-US" });
    return data.overview || null;
  } catch (err) {
    console.warn(
      `[overview_en] TMDB fetch failed for ${mediaType} tmdb_id=${tmdbId}:`,
      err,
    );
    return null;
  }
}

// ─── YouTube Data API v3 ──────────────────────────────────────────────────────

async function fetchTrailerFromYouTube(
  title: string,
  releaseDate: string | null,
  mediaType: MediaType,
): Promise<string | null> {
  try {
    const cleanedTitle = cleanTitle(title);
    const year = releaseDate?.substring(0, 4) ?? "";
    const suffix =
      mediaType === "tv" ? "official trailer season 1" : "official trailer";
    const query = `${cleanedTitle}${year ? ` ${year}` : ""} ${suffix}`;

    console.log(
      `[youtube] Searching (${mediaType}): "${query}" (original: "${title}")`,
    );

    const url = new URL(YOUTUBE_SEARCH_URL);
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("q", query);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoCategoryId", "1");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("order", "relevance");

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`YouTube API ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const videoId: string | undefined = data.items?.[0]?.id?.videoId;

    if (videoId) {
      console.log(`[youtube] Found: ${videoId} for "${cleanedTitle}"`);
      return videoId;
    }

    console.warn(`[youtube] No results for query: "${query}"`);
    return null;
  } catch (err) {
    console.warn(`[youtube] Search failed:`, (err as Error).message);
    return null;
  }
}

// ─── GROQ Translate ───────────────────────────────────────────────────────────

async function translateWithGroq(
  text: string,
  targetLang: "Indonesian" | "English",
): Promise<string | null> {
  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              `You are a professional movie synopsis translator. ` +
              `Translate the given text to ${targetLang}. ` +
              `Output ONLY the translated text, no explanations, no notes, no quotes.`,
          },
          { role: "user", content: text },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`GROQ ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const translated = data.choices?.[0]?.message?.content?.trim();
    return translated || null;
  } catch (err) {
    console.warn(`[translate] GROQ failed (target=${targetLang}):`, err);
    return null;
  }
}

// ─── Process single item ──────────────────────────────────────────────────────

async function processItem(
  row: NormalizedRow,
  mediaType: MediaType,
): Promise<ProcessResult> {
  const updates: UpdatePayload = { synced_at: new Date().toISOString() };
  const updatedFields: string[] = [];
  const isTmdbValid = row.tmdb_id > 0;
  const table = mediaType === "tv" ? "tv_series" : "movies";

  // ── trailer_key ────────────────────────────────────────────────────────────
  if (!row.trailer_key) {
    let trailerKey: string | null = null;

    if (isTmdbValid) {
      trailerKey = await fetchTrailerFromTMDB(row.tmdb_id, mediaType);
    }

    if (!trailerKey) {
      console.log(
        `[trailer] ${isTmdbValid ? "TMDB empty," : "tmdb_id invalid,"} fallback YouTube for "${row.title}"`,
      );
      trailerKey = await fetchTrailerFromYouTube(
        row.title,
        row.release_date,
        mediaType,
      );
    }

    if (trailerKey) {
      updates.trailer_key = trailerKey;
      updatedFields.push("trailer_key");
    }
  }

  // ── overview_en & overview ─────────────────────────────────────────────────
  let resolvedOverviewEn = row.overview_en;
  let resolvedOverview = row.overview;

  if (!resolvedOverviewEn && !resolvedOverview) {
    if (isTmdbValid) {
      console.log(`[overview] Both empty for "${row.title}", fetching TMDB...`);
      resolvedOverviewEn = await fetchOverviewEnFromTMDB(
        row.tmdb_id,
        mediaType,
      );
      if (resolvedOverviewEn) {
        updates.overview_en = resolvedOverviewEn;
        updatedFields.push("overview_en");
      }
    } else {
      console.warn(
        `[overview] Both empty & tmdb_id invalid, skip "${row.title}"`,
      );
    }
  }

  if (!resolvedOverviewEn && resolvedOverview) {
    console.log(`[overview] Translating ID→EN for "${row.title}"`);
    const translated = await translateWithGroq(resolvedOverview, "English");
    if (translated) {
      resolvedOverviewEn = translated;
      updates.overview_en = translated;
      updatedFields.push("overview_en");
    }
  }

  if (!resolvedOverview && resolvedOverviewEn) {
    console.log(`[overview] Translating EN→ID for "${row.title}"`);
    const translated = await translateWithGroq(
      resolvedOverviewEn,
      "Indonesian",
    );
    if (translated) {
      updates.overview = translated;
      updatedFields.push("overview");
    }
  }

  if (updatedFields.length === 0) {
    return { id: row.id, title: row.title, updated: {}, skipped: true };
  }

  const { error } = await supabase.from(table).update(updates).eq("id", row.id);

  if (error) {
    throw new Error(`update ${table} id=${row.id}: ${error.message}`);
  }

  console.log(
    `[done] [${mediaType}] "${row.title}" → updated: ${updatedFields.join(", ")}`,
  );
  return { id: row.id, title: row.title, updated: updates, skipped: false };
}

// ─── Run with pagination ──────────────────────────────────────────────────────

async function runWithPagination(
  mediaType: MediaType,
  limit: number,
): Promise<ProcessResult[]> {
  const table = mediaType === "tv" ? "tv_series" : "movies";
  const selectFields =
    mediaType === "tv"
      ? "id, tmdb_id, name, original_name, first_air_date, trailer_key, overview, overview_en"
      : "id, tmdb_id, title, original_title, release_date, trailer_key, overview, overview_en";
  const orderField = mediaType === "tv" ? "first_air_date" : "release_date";
  const batchSize = 50;

  let processed = 0;
  let offset = 0;
  const results: ProcessResult[] = [];

  while (processed < limit) {
    const toFetch = Math.min(batchSize, limit - processed + offset);
    // Fetch lebih banyak untuk antisipasi item yang akan di-skip
    const fetchCount = Math.min(batchSize, limit * 2);

    const { data, error } = await supabase
      .from(table)
      .select(selectFields)
      .or("trailer_key.is.null,overview.is.null,overview_en.is.null")
      .order(orderField, { ascending: false })
      .range(offset, offset + fetchCount - 1);

    if (error) throw new Error(`fetch ${table}: ${error.message}`);
    if (!data?.length) {
      console.log(`[${mediaType}] No more data at offset=${offset}, stopping.`);
      break;
    }

    console.log(
      `[${mediaType}] Batch offset=${offset}, fetched=${data.length}, processed=${processed}/${limit}`,
    );

    for (const row of data) {
      if (processed >= limit) break;

      const normalized =
        mediaType === "tv"
          ? normalizeTv(row as TvSeriesRow)
          : normalizeMovie(row as MovieRow);

      try {
        const result = await processItem(normalized, mediaType);
        results.push(result);
        if (!result.skipped) processed++;
      } catch (err) {
        console.error(`[${mediaType}] Failed for "${normalized.title}":`, err);
        results.push({
          id: normalized.id,
          title: normalized.title,
          updated: {},
          skipped: false,
          error: err instanceof Error ? err.message : String(err),
        });
        processed++; // failed tetap dihitung agar tidak loop selamanya
      }
    }

    offset += fetchCount;
  }

  console.log(
    `[${mediaType}] Done. processed=${processed}, total results=${results.length}`,
  );
  return results;
}

// ─── Edge Function Handler ────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let limit = 100;
  let media: "movie" | "tv" | "all" = "all";

  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.limit && Number(body.limit) > 0) limit = Number(body.limit);
      if (body?.media === "movie" || body?.media === "tv") media = body.media;
    } catch {
      // ignore, use defaults
    }
  }

  try {
    const movieResults =
      media === "tv" ? [] : await runWithPagination("movie", limit);

    const tvResults =
      media === "movie" ? [] : await runWithPagination("tv", limit);

    const allResults = [...movieResults, ...tvResults];

    if (allResults.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No items need updating",
          processed: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const summarize = (results: ProcessResult[]) => ({
      updated: results.filter((r) => !r.skipped && !r.error).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => !!r.error).length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${allResults.length} item(s) [media=${media}]`,
        summary: {
          movie: summarize(movieResults),
          tv: summarize(tvResults),
        },
        results: {
          movie: movieResults,
          tv: tvResults,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[enrich] Fatal error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
