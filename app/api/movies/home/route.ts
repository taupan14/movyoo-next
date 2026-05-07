/**
 * GET /api/movies/home
 *
 * Query params:
 *   lang   — 'id' | 'en'  (default: 'en')
 *   region — e.g. 'ID', 'US'  (default: 'ID')
 *
 * Controller antara HomeClient dan Supabase.
 * Data diisi oleh cron job sync_tmdb — tidak ada request ke TMDB di sini.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchHomeMovies } from "@/lib/movies-db";

export const revalidate = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lang = searchParams.get("lang") ?? "en";
  const region = searchParams.get("region") ?? "ID";

  try {
    const data = await fetchHomeMovies(lang, region);
    return NextResponse.json(data, {
      status: 200,
      headers: {
        // Browser cache 30 detik, CDN/edge 60 detik, stale ok sampai 2 menit
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("[/api/movies/home] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
