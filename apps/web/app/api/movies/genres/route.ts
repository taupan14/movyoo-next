/**
 * GET /api/movies/genres
 * Mengembalikan semua genre dari tabel genres
 */
import { NextResponse } from "next/server";
import { fetchGenresFromDb } from "@/lib/movies-db";

export const revalidate = 3600;

export async function GET() {
  try {
    const genres = await fetchGenresFromDb();
    return NextResponse.json(genres, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (err) {
    console.error("[/api/movies/genres]", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
