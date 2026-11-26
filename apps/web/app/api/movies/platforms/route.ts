/**
 * GET /api/movies/platforms
 * Mengembalikan semua platform dari tabel platforms
 */
import { NextResponse } from "next/server";
import { fetchPlatforms } from "@/lib/movies-db";

export const revalidate = 3600; // cache 1 jam

export async function GET() {
  try {
    const platforms = await fetchPlatforms();
    return NextResponse.json(platforms, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (err) {
    console.error("[/api/movies/platforms]", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
