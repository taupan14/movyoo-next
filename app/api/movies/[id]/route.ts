/**
 * GET /api/movies/[id]
 *
 * Query params:
 *   lang   — 'id' | 'en'  (default: 'en')
 *   region — e.g. 'ID', 'US'  (default: 'ID')
 *
 * Mengembalikan semua data yang dibutuhkan halaman movie detail:
 * - Data film (movies)
 * - Genres (movie_genres → genres)
 * - Cast (movie_cast)
 * - Watch providers (movie_platforms → platforms)
 * - Similar movies (film lain dengan genre yang sama)
 * - Recommendations (film populer dengan genre yang sama)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const revalidate = 300; // cache 5 menit, data detail jarang berubah

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const tmdbId = Number(params.id);
  if (Number.isNaN(tmdbId)) {
    return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const lang = searchParams.get("lang") ?? "en";
  const region = searchParams.get("region") ?? "ID";

  // ── 1. Fetch movie + genres ───────────────────────────────────────────────
  const { data: movieRaw, error: movieErr } = await supabase
    .from("movies")
    .select(
      `
      id, tmdb_id, title, original_title, overview, overview_en,
      tagline, vote_average, vote_count, popularity, status,
      original_language, poster_path, backdrop_path,
      release_date, runtime, budget, revenue, trailer_key,
      movie_genres ( genres ( id, name, slug ) )
    `,
    )
    .eq("tmdb_id", tmdbId)
    .single();

  if (movieErr || !movieRaw) {
    return NextResponse.json({ error: "Movie not found" }, { status: 404 });
  }

  const internalId = movieRaw.id;

  // Genre ids untuk query similar & recommendations
  const genreIds: number[] = (movieRaw.movie_genres ?? [])
    .map((mg: any) => mg.genres?.id)
    .filter(Boolean);

  // ── 2. Fetch cast, platforms, similar, recommendations secara paralel ─────
  const [castRes, platformRes, similarRes, recsRes] = await Promise.all([
    supabase
      .from("movie_cast")
      .select("person_id, name, character, profile_path, order_index")
      .eq("movie_id", internalId)
      .order("order_index", { ascending: true })
      .limit(20),

    supabase
      .from("movie_platforms")
      .select("type, platforms ( id, name, slug, logo_path, tmdb_provider_id )")
      .eq("movie_id", internalId)
      .eq("region", region),

    // Similar & Recommendations: film lain dengan genre yang sama
    genreIds.length > 0
      ? supabase
          .from("movie_genres")
          .select(
            `
            movies (
              id, tmdb_id, title, poster_path, backdrop_path,
              vote_average, release_date, popularity
            )
          `,
          )
          .in("genre_id", genreIds)
          .neq("movie_id", internalId)
          .limit(80)
      : Promise.resolve({ data: [], error: null }),

    genreIds.length > 0
      ? supabase
          .from("movie_genres")
          .select(
            `
            movies (
              id, tmdb_id, title, poster_path, backdrop_path,
              vote_average, release_date, popularity
            )
          `,
          )
          .in("genre_id", genreIds)
          .neq("movie_id", internalId)
          .order("movie_id") // variasi hasil vs similar
          .limit(80)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // ── 3. Shape cast ─────────────────────────────────────────────────────────
  const cast = (castRes.data ?? []).map((c: any) => ({
    id: c.person_id,
    name: c.name,
    character: c.character,
    profile_path: c.profile_path,
    order: c.order_index,
  }));

  // ── 4. Shape watch providers ──────────────────────────────────────────────
  // Format mengikuti struktur TMDB asli supaya UI tidak perlu diubah:
  // watch/providers.results.{region}.flatrate
  const flatrate = (platformRes.data ?? [])
    .filter((p: any) => p.type === "streaming")
    .map((p: any) => ({
      provider_id: p.platforms?.tmdb_provider_id,
      provider_name: p.platforms?.name,
      logo_path: p.platforms?.logo_path,
    }));

  // ── 5. Deduplicate & sort similar / recommendations ───────────────────────
  function deduplicateMovies(rows: any[], limit: number) {
    const seen = new Set<number>();
    const result: any[] = [];
    // Sort by popularity desc
    const sorted = [...rows].sort(
      (a, b) => (b.movies?.popularity ?? 0) - (a.movies?.popularity ?? 0),
    );
    for (const row of sorted) {
      const m = row.movies;
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      result.push({
        id: m.tmdb_id,
        title: m.title,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        vote_average: Number(m.vote_average),
        release_date: m.release_date,
        popularity: Number(m.popularity),
      });
      if (result.length >= limit) break;
    }
    return result;
  }

  const similar = deduplicateMovies(similarRes.data ?? [], 12);
  const recommendations = deduplicateMovies(recsRes.data ?? [], 12);

  // ── 6. Shape genres ───────────────────────────────────────────────────────
  const genres = (movieRaw.movie_genres ?? [])
    .map((mg: any) => mg.genres)
    .filter(Boolean)
    .map((g: any) => ({ id: g.id, name: g.name }));

  // ── 7. Pick overview sesuai lang, dengan fallback ─────────────────────────
  const overview =
    lang === "id"
      ? movieRaw.overview || movieRaw.overview_en || ""
      : movieRaw.overview_en || movieRaw.overview || "";

  // ── 8. Assemble response ──────────────────────────────────────────────────
  const movie = {
    id: movieRaw.tmdb_id,
    title: movieRaw.title,
    original_title: movieRaw.original_title,
    tagline: movieRaw.tagline,
    overview,
    poster_path: movieRaw.poster_path,
    backdrop_path: movieRaw.backdrop_path,
    vote_average: Number(movieRaw.vote_average),
    vote_count: movieRaw.vote_count,
    popularity: Number(movieRaw.popularity),
    runtime: movieRaw.runtime,
    release_date: movieRaw.release_date,
    status: movieRaw.status,
    trailer_key: movieRaw.trailer_key,
    genres,
    credits: { cast },
    "watch/providers": {
      results: {
        [region]: { flatrate },
      },
    },
    similar: { results: similar },
  };

  return NextResponse.json(
    { movie, recommendations },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
