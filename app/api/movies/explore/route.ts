/**
 * GET /api/movies/explore
 *
 * Query params:
 *   lang        — 'id' | 'en'          (default: 'id')
 *   platform    — slug platform / 'all' (default: 'all')
 *   genre_id    — tmdb_genre_id integer (optional)
 *   sort        — 'release_date' | 'popular' | 'top_rated' | 'now_playing' | 'coming_soon'
 *   page        — integer              (default: 1)
 *   limit       — integer max 40       (default: 20)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExploreMovies } from "@/lib/movies-db";

export const revalidate = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const lang = searchParams.get("lang") ?? "id";
  const platform = searchParams.get("platform") ?? "all";
  const genreId = searchParams.get("genre_id")
    ? parseInt(searchParams.get("genre_id")!)
    : null;
  const sort = searchParams.get("sort") ?? "release_date";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(
    40,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20")),
  );

  try {
    const data = await fetchExploreMovies({
      lang,
      platform,
      genreId,
      sort,
      page,
      limit,
    });
    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("[/api/movies/explore]", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
