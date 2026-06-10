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

interface UpdatePayload {
  trailer_key?: string;
  overview?: string;
  overview_en?: string;
  synced_at: string;
}

// ─── Query Cleaner ────────────────────────────────────────────────────────────
// Bersihkan title yang datang dari scraper bioskop sebelum dijadikan search query.
// Contoh kotor: "TUMBAL PROYEK HORROR 1h 46m 2026 |D17 | IDN | 2026"
// Hasil bersih: "TUMBAL PROYEK HORROR"

function cleanTitle(raw: string): string {
  return (
    raw
      // Hapus pola durasi: "1h 46m", "2h", "90m", dll
      .replace(/\b\d{1,2}h(\s*\d{1,2}m)?\b/gi, "")
      .replace(/\b\d{2,3}m\b/gi, "")
      // Hapus rating konten: "D17", "R13", "SU", "13+", "17+", dll
      .replace(/\b(D17|R13|SU|A|R|[A-Z]?\d{1,2}\+?)\b/g, "")
      // Hapus kode negara/bahasa: "| IDN |", "| EN |", dll
      .replace(/\|\s*[A-Z]{2,4}\s*/g, "")
      // Hapus pipe yang tersisa
      .replace(/\|/g, "")
      // Hapus tahun 4 digit
      .replace(/\b(19|20)\d{2}\b/g, "")
      // Hapus tanda baca berlebih & spasi ganda
      .replace(/[^\w\s]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
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

async function fetchTrailerFromTMDB(tmdbId: number): Promise<string | null> {
  try {
    const data = await tmdbFetch(`/movie/${tmdbId}/videos`, {
      language: "en-US",
    });
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
    console.warn(`[trailer] TMDB fetch failed for tmdb_id=${tmdbId}:`, err);
    return null;
  }
}

async function fetchOverviewEnFromTMDB(tmdbId: number): Promise<string | null> {
  try {
    const data = await tmdbFetch(`/movie/${tmdbId}`, { language: "en-US" });
    return data.overview || null;
  } catch (err) {
    console.warn(`[overview_en] TMDB fetch failed for tmdb_id=${tmdbId}:`, err);
    return null;
  }
}

// ─── YouTube Data API v3 ──────────────────────────────────────────────────────

async function fetchTrailerFromYouTube(
  title: string,
  releaseDate: string | null,
): Promise<string | null> {
  try {
    // Bersihkan title kotor dari scraper sebelum dijadikan query
    const cleanedTitle = cleanTitle(title);
    const year = releaseDate?.substring(0, 4) ?? "";
    const query = `${cleanedTitle}${year ? ` ${year}` : ""} official trailer`;

    console.log(`[youtube] Searching: "${query}" (original title: "${title}")`);

    const url = new URL(YOUTUBE_SEARCH_URL);
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("q", query);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoCategoryId", "1"); // Film & Animation
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
          {
            role: "user",
            content: text,
          },
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

// ─── Process single movie ─────────────────────────────────────────────────────

async function processMovie(movie: MovieRow): Promise<{
  id: number;
  title: string;
  updated: Partial<UpdatePayload>;
  skipped: boolean;
}> {
  const updates: UpdatePayload = { synced_at: new Date().toISOString() };
  const updatedFields: string[] = [];

  // tmdb_id negatif = data dari source lain (bukan TMDB), skip semua TMDB call
  const isTmdbValid = movie.tmdb_id > 0;

  // ── trailer_key ────────────────────────────────────────────────────────────
  if (!movie.trailer_key) {
    let trailerKey: string | null = null;

    if (isTmdbValid) {
      // Step 1: Coba TMDB dulu (gratis, tidak pakai quota YouTube)
      trailerKey = await fetchTrailerFromTMDB(movie.tmdb_id);
    }

    // Step 2: Fallback ke YouTube Data API jika TMDB kosong atau tmdb_id negatif
    if (!trailerKey) {
      if (isTmdbValid) {
        console.log(
          `[trailer] TMDB empty, fallback to YouTube API for "${movie.title}"`,
        );
      } else {
        console.log(
          `[trailer] tmdb_id negatif, langsung YouTube API for "${movie.title}"`,
        );
      }
      trailerKey = await fetchTrailerFromYouTube(
        movie.title,
        movie.release_date,
      );
    }

    if (trailerKey) {
      updates.trailer_key = trailerKey;
      updatedFields.push("trailer_key");
    }
  }

  // ── overview_en and overview ───────────────────────────────────────────────
  let resolvedOverviewEn = movie.overview_en;
  let resolvedOverview = movie.overview;

  // Case: both empty → fetch English dari TMDB (hanya jika tmdb_id valid)
  if (!resolvedOverviewEn && !resolvedOverview) {
    if (isTmdbValid) {
      console.log(
        `[overview] Both empty for "${movie.title}", fetching from TMDB...`,
      );
      resolvedOverviewEn = await fetchOverviewEnFromTMDB(movie.tmdb_id);
      if (resolvedOverviewEn) {
        updates.overview_en = resolvedOverviewEn;
        updatedFields.push("overview_en");
      }
    } else {
      console.warn(
        `[overview] Both empty & tmdb_id negatif, skip "${movie.title}"`,
      );
    }
  }

  // Case: overview_en empty → translate dari overview (ID → EN)
  if (!resolvedOverviewEn && resolvedOverview) {
    console.log(
      `[overview] Translating overview → overview_en for "${movie.title}"`,
    );
    const translated = await translateWithGroq(resolvedOverview, "English");
    if (translated) {
      resolvedOverviewEn = translated;
      updates.overview_en = translated;
      updatedFields.push("overview_en");
    }
  }

  // Case: overview empty → translate dari overview_en (EN → ID)
  if (!resolvedOverview && resolvedOverviewEn) {
    console.log(
      `[overview] Translating overview_en → overview for "${movie.title}"`,
    );
    const translated = await translateWithGroq(
      resolvedOverviewEn,
      "Indonesian",
    );
    if (translated) {
      updates.overview = translated;
      updatedFields.push("overview");
    }
  }

  // Skip DB update jika tidak ada yang berubah
  if (updatedFields.length === 0) {
    return { id: movie.id, title: movie.title, updated: {}, skipped: true };
  }

  const { error } = await supabase
    .from("movies")
    .update(updates)
    .eq("id", movie.id);

  if (error) throw new Error(`update movie id=${movie.id}: ${error.message}`);

  console.log(`[done] "${movie.title}" → updated: ${updatedFields.join(", ")}`);
  return { id: movie.id, title: movie.title, updated: updates, skipped: false };
}

// ─── Edge Function Handler ────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Optional: override limit via body { "limit": 10 }
  let limit = 100;
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.limit && Number(body.limit) > 0) limit = Number(body.limit);
    } catch {
      // ignore, use default
    }
  }

  try {
    // Fetch movies dengan minimal 1 field kosong, order release_date desc
    const { data: movies, error: fetchError } = await supabase
      .from("movies")
      .select(
        "id, tmdb_id, title, original_title, release_date, trailer_key, overview, overview_en",
      )
      .or("trailer_key.is.null,overview.is.null,overview_en.is.null")
      .order("release_date", { ascending: false })
      .limit(limit);

    if (fetchError) throw new Error(`fetch movies: ${fetchError.message}`);
    if (!movies?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No movies need updating",
          processed: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[enrich-movies] Processing ${movies.length} movies...`);

    // Proses sequential untuk hindari rate limit GROQ & YouTube quota
    const results = [];
    for (const movie of movies as MovieRow[]) {
      try {
        const result = await processMovie(movie);
        results.push(result);
      } catch (err) {
        console.error(`[enrich-movies] Failed for "${movie.title}":`, err);
        results.push({
          id: movie.id,
          title: movie.title,
          error: err instanceof Error ? err.message : String(err),
          skipped: false,
        });
      }
    }

    const updated = results.filter((r) => !r.skipped && !("error" in r)).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => "error" in r).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${movies.length} movies`,
        summary: { updated, skipped, failed },
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[enrich-movies] Fatal error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
