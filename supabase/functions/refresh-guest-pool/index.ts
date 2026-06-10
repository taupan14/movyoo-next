// supabase/functions/refresh-guest-pool/index.ts
//
// Worker: Refresh shared guest pool harian.
// Target: 50 item — 25 movie + 25 TV series dari berbagai bucket.
//
// Bucket distribution (guest pool):
//   trending   → 10 movie + 10 TV  (populer saat ini)
//   hidden_gem →  8 movie +  8 TV  (rating tinggi, popularitas rendah)
//   wildcard   →  7 movie +  7 TV  (random berkualitas)
//
// Dipanggil oleh GitHub Actions setiap hari pukul 00:00 UTC.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMetadata } from "../_shared/metadata.ts";
import { PoolInsertRow, PoolMetadata } from "../_shared/types.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Config ───────────────────────────────────────────────────────────────────

const MOVIE_COUNTS = { trending: 10, hidden_gem: 8, wildcard: 7 };
const TV_COUNTS = { trending: 10, hidden_gem: 8, wildcard: 7 };

// Hidden gem: rating tinggi tapi popularitas rendah
const HIDDEN_GEM_MIN_VOTE = 7.0;
const HIDDEN_GEM_MAX_POP = 30;
const HIDDEN_GEM_MIN_VOTES_N = 200; // minimum vote count agar data valid

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Fetch candidates ─────────────────────────────────────────────────────────

async function fetchTrendingMovies(limit: number) {
  const { data } = await supabase
    .from("movie_categories")
    .select(
      "movies(id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, overview_en, overview)",
    )
    .eq("category", "trending")
    .eq("region", "ID")
    .order("sort_order", { ascending: true })
    .limit(limit);

  return (data ?? []).map((r: any) => r.movies).filter(Boolean);
}

async function fetchTrendingTV(limit: number) {
  const { data: catData } = await supabase
    .from("tv_categories")
    .select("series_id")
    .eq("category", "trending")
    .eq("region", "ID")
    .limit(limit);

  const ids = (catData ?? []).map((r: any) => Number(r.series_id));
  if (!ids.length) return [];

  const { data } = await supabase
    .from("tv_series")
    .select(
      "id, name, poster_path, backdrop_path, vote_average, first_air_date, overview_en, overview",
    )
    .in("id", ids);

  return data ?? [];
}

async function fetchHiddenGemMovies(limit: number) {
  const { data } = await supabase
    .from("movies")
    .select(
      "id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, overview_en, overview",
    )
    .gte("vote_average", HIDDEN_GEM_MIN_VOTE)
    .lte("popularity", HIDDEN_GEM_MAX_POP)
    .gte("vote_count", HIDDEN_GEM_MIN_VOTES_N)
    .not("poster_path", "is", null)
    .gt("tmdb_id", 0)
    .order("vote_average", { ascending: false })
    .limit(limit * 3); // ambil lebih, shuffle, potong

  return shuffle(data ?? []).slice(0, limit);
}

async function fetchHiddenGemTV(limit: number) {
  const { data } = await supabase
    .from("tv_series")
    .select(
      "id, name, poster_path, backdrop_path, vote_average, first_air_date, overview_en, overview",
    )
    .gte("vote_average", HIDDEN_GEM_MIN_VOTE)
    .lte("popularity", HIDDEN_GEM_MAX_POP)
    .gte("vote_count", HIDDEN_GEM_MIN_VOTES_N)
    .not("poster_path", "is", null)
    .gt("tmdb_id", 0)
    .order("vote_average", { ascending: false })
    .limit(limit * 3);

  return shuffle(data ?? []).slice(0, limit);
}

async function fetchWildcardMovies(limit: number) {
  // Film berkualitas di luar trending — sort random via popularity range tengah
  const { data } = await supabase
    .from("movies")
    .select(
      "id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, overview_en, overview",
    )
    .gte("vote_average", 6.5)
    .gte("popularity", 10)
    .lte("popularity", 100)
    .not("poster_path", "is", null)
    .gt("tmdb_id", 0)
    .order("vote_count", { ascending: false })
    .limit(limit * 4);

  return shuffle(data ?? []).slice(0, limit);
}

async function fetchWildcardTV(limit: number) {
  const { data } = await supabase
    .from("tv_series")
    .select(
      "id, name, poster_path, backdrop_path, vote_average, first_air_date, overview_en, overview",
    )
    .gte("vote_average", 6.5)
    .gte("popularity", 10)
    .lte("popularity", 100)
    .not("poster_path", "is", null)
    .gt("tmdb_id", 0)
    .order("vote_count", { ascending: false })
    .limit(limit * 4);

  return shuffle(data ?? []).slice(0, limit);
}

// ─── Build pool rows ──────────────────────────────────────────────────────────

async function buildMovieRows(
  movies: any[],
  bucket: PoolInsertRow["bucket"],
  baseScore: number,
): Promise<PoolInsertRow[]> {
  const rows: PoolInsertRow[] = [];

  for (const m of movies) {
    const title =
      m.original_language === "id" ? m.original_title || m.title : m.title;

    const metadata = await buildMetadata(supabase, "movie", m.id, null, {
      title,
      poster_path: m.poster_path,
      backdrop_path: m.backdrop_path,
      vote_average: m.vote_average,
      release_date: m.release_date,
      overview: m.overview_en || m.overview || "",
    });

    rows.push({
      user_id: null,
      user_type: "guest",
      media_type: "movie",
      movie_id: m.id,
      series_id: null,
      score: baseScore + Number(m.vote_average ?? 0) * 0.1,
      bucket,
      served: false,
      metadata,
    });
  }

  return rows;
}

async function buildTvRows(
  series: any[],
  bucket: PoolInsertRow["bucket"],
  baseScore: number,
): Promise<PoolInsertRow[]> {
  const rows: PoolInsertRow[] = [];

  for (const s of series) {
    const metadata = await buildMetadata(supabase, "tv", null, s.id, {
      title: s.name,
      poster_path: s.poster_path,
      backdrop_path: s.backdrop_path,
      vote_average: s.vote_average,
      first_air_date: s.first_air_date,
      overview: s.overview_en || s.overview || "",
    });

    rows.push({
      user_id: null,
      user_type: "guest",
      media_type: "tv",
      movie_id: null,
      series_id: s.id,
      score: baseScore + Number(s.vote_average ?? 0) * 0.1,
      bucket,
      served: false,
      metadata,
    });
  }

  return rows;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Validasi secret agar tidak bisa dipanggil sembarangan
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  console.log("[refresh-guest-pool] Starting...");

  try {
    // 1. Fetch semua kandidat secara paralel
    const [
      trendingMovies,
      trendingTV,
      hiddenGemMovies,
      hiddenGemTV,
      wildcardMovies,
      wildcardTV,
    ] = await Promise.all([
      fetchTrendingMovies(MOVIE_COUNTS.trending),
      fetchTrendingTV(TV_COUNTS.trending),
      fetchHiddenGemMovies(MOVIE_COUNTS.hidden_gem),
      fetchHiddenGemTV(TV_COUNTS.hidden_gem),
      fetchWildcardMovies(MOVIE_COUNTS.wildcard),
      fetchWildcardTV(TV_COUNTS.wildcard),
    ]);

    console.log(
      `[refresh-guest-pool] Candidates: ${
        trendingMovies.length +
        trendingTV.length +
        hiddenGemMovies.length +
        hiddenGemTV.length +
        wildcardMovies.length +
        wildcardTV.length
      } total`,
    );

    // 2. Build pool rows dengan metadata embed (genre + cast)
    const [
      trendingMovieRows,
      trendingTVRows,
      hiddenGemMovieRows,
      hiddenGemTVRows,
      wildcardMovieRows,
      wildcardTVRows,
    ] = await Promise.all([
      buildMovieRows(trendingMovies, "trending", 5.0),
      buildTvRows(trendingTV, "trending", 5.0),
      buildMovieRows(hiddenGemMovies, "hidden_gem", 4.0),
      buildTvRows(hiddenGemTV, "hidden_gem", 4.0),
      buildMovieRows(wildcardMovies, "wildcard", 3.0),
      buildTvRows(wildcardTV, "wildcard", 3.0),
    ]);

    const allRows: PoolInsertRow[] = [
      ...trendingMovieRows,
      ...trendingTVRows,
      ...hiddenGemMovieRows,
      ...hiddenGemTVRows,
      ...wildcardMovieRows,
      ...wildcardTVRows,
    ];

    if (allRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No candidates found" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Hapus guest pool lama
    const { error: deleteError } = await supabase
      .from("user_recommendation_pool")
      .delete()
      .eq("user_type", "guest");

    if (deleteError) {
      throw new Error(`Delete old guest pool failed: ${deleteError.message}`);
    }

    // 4. Insert guest pool baru (batch 25 untuk hindari payload limit)
    const BATCH = 25;
    let inserted = 0;

    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH);
      const { error: insertError } = await supabase
        .from("user_recommendation_pool")
        .insert(batch);

      if (insertError) {
        console.error(
          `[refresh-guest-pool] Insert batch ${i} error:`,
          insertError.message,
        );
      } else {
        inserted += batch.length;
      }
    }

    console.log(
      `[refresh-guest-pool] Done. Inserted ${inserted}/${allRows.length} rows.`,
    );

    return new Response(
      JSON.stringify({ success: true, inserted, total: allRows.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[refresh-guest-pool] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
