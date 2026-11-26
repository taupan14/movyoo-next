/**
 * GET /api/movies/explore
 *
 * Query params:
 *   lang         — 'id' | 'en'
 *   platform     — bisa multiple: platform=netflix&platform=disney  (atau 'all')
 *   genre_id     — bisa multiple: genre_id=28&genre_id=12
 *   sort         — 'release_date' | 'popular' | 'top_rated'
 *   page         — integer (default: 1)
 *   limit        — integer max 40 (default: 20)
 *   search       — string (optional)
 *   year_from    — integer (optional)
 *   year_to      — integer (optional)
 *   company_id   — production_companies.id (optional)
 *   vote_min     — number 0-10 (optional)
 *   vote_max     — number 0-10 (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExploreMovies } from "@/lib/movies-db";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const lang = sp.get("lang") ?? "id";
  const sort = sp.get("sort") ?? "release_date";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
  const limit = Math.min(40, Math.max(1, parseInt(sp.get("limit") ?? "20")));

  // Multi-value params
  const platformParam = sp.getAll("platform");
  const platforms =
    platformParam.includes("all") || platformParam.length === 0
      ? []
      : platformParam;

  const genreIdParam = sp.getAll("genre_id").map(Number).filter(Boolean);

  const search = sp.get("search") ?? undefined;
  const yearFrom = sp.get("year_from") ? parseInt(sp.get("year_from")!) : null;
  const yearTo = sp.get("year_to") ? parseInt(sp.get("year_to")!) : null;
  const companyId = sp.get("company_id")
    ? parseInt(sp.get("company_id")!)
    : null;
  const voteMin = sp.get("vote_min") ? parseFloat(sp.get("vote_min")!) : null;
  const voteMax = sp.get("vote_max") ? parseFloat(sp.get("vote_max")!) : null;
  const originalLanguage = sp.get("original_language") ?? undefined;

  try {
    const data = await fetchExploreMovies({
      lang,
      platforms,
      genreIds: genreIdParam,
      sort,
      page,
      limit,
      search,
      yearFrom,
      yearTo,
      companyId,
      voteMin,
      voteMax,
      originalLanguage,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[/api/movies/explore]", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
