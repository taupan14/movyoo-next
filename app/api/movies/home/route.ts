/**
 * GET /api/movies/home
 *
 * Query params:
 *   lang   — 'id' | 'en'  (default: 'en')
 *   region — e.g. 'ID', 'US'  (default: 'ID')
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchHomeMovies } from "@/lib/movies-db";
import { fetchHomeTvSeries } from "@/lib/tv-db";

export const revalidate = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lang = searchParams.get("lang") ?? "en";
  const region = searchParams.get("region") ?? "ID";

  try {
    const [movieData, tvData] = await Promise.all([
      fetchHomeMovies(lang, region),
      fetchHomeTvSeries(lang, region),
    ]);

    return NextResponse.json(
      { ...movieData, ...tvData },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    console.error("[/api/movies/home] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
