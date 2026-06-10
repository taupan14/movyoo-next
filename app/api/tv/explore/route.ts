/**
 * GET /api/tv/explore
 *
 * Query params:
 *   lang       — 'id' | 'en'
 *   platform   — bisa multiple: platform=netflix&platform=disney  (atau 'all')
 *   genre_id   — bisa multiple: genre_id=10765&genre_id=18
 *   sort       — 'on_the_air' | 'popular' | 'trending' | 'top_rated'
 *   page       — integer (default: 1)
 *   limit      — integer max 40 (default: 20)
 *   search     — string (optional)
 *   year_from  — integer (optional)
 *   year_to    — integer (optional)
 *   network_id — tv_networks.id (optional)
 *   vote_min   — number 0-10 (optional)
 *   vote_max   — number 0-10 (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExploreTvSeries } from "@/lib/tv-db";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // console.log("[/api/tv/explore] Query params:", sp.toString());

  const lang = sp.get("lang") ?? "id";
  const sort = sp.get("sort") ?? "popular";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
  const limit = Math.min(40, Math.max(1, parseInt(sp.get("limit") ?? "20")));

  const platformParam = sp.getAll("platform");
  const platforms =
    platformParam.includes("all") || platformParam.length === 0
      ? []
      : platformParam;

  const genreIdParam = sp.getAll("genre_id").map(Number).filter(Boolean);

  const search = sp.get("search") ?? undefined;
  const yearFrom = sp.get("year_from") ? parseInt(sp.get("year_from")!) : null;
  const yearTo = sp.get("year_to") ? parseInt(sp.get("year_to")!) : null;
  const networkId = sp.get("network_id")
    ? parseInt(sp.get("network_id")!)
    : null;
  const voteMin = sp.get("vote_min") ? parseFloat(sp.get("vote_min")!) : null;
  const voteMax = sp.get("vote_max") ? parseFloat(sp.get("vote_max")!) : null;

  const originalLanguage = sp.get("original_language") ?? undefined;

  try {
    const data = await fetchExploreTvSeries({
      lang,
      platforms,
      genreIds: genreIdParam,
      sort,
      page,
      limit,
      search,
      yearFrom,
      yearTo,
      networkId,
      voteMin,
      voteMax,
      originalLanguage,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[/api/tv/explore]", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
