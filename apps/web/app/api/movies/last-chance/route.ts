/**
 * GET /api/movies/last-chance
 *
 * Query params:
 *   lang        — 'id' | 'en'              (default: 'en')
 *   region      — e.g. 'ID', 'US'          (default: 'ID')
 *   type        — 'movie' | 'tv' | 'all'   (default: 'all')
 *   platform    — platform slug, opsional
 *   max_days    — integer, default 30
 *   limit       — integer, default 50
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchLeavingSoon } from "@/lib/leaving-soon-db";

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const lang = searchParams.get("lang") ?? "en";
  const region = searchParams.get("region") ?? "ID";
  const type = searchParams.get("type") ?? "all";
  const platform = searchParams.get("platform") ?? undefined;
  const maxDays = Math.min(
    90,
    Math.max(1, parseInt(searchParams.get("max_days") ?? "45") || 45),
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50") || 50),
  );

  const validTypes = ["movie", "tv", "all"] as const;
  const contentType = validTypes.includes(type as any)
    ? (type as "movie" | "tv" | "all")
    : "all";

  try {
    const result = await fetchLeavingSoon({
      lang,
      region,
      contentType,
      platform,
      maxDays,
      limit,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("[/api/movies/last-chance] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
