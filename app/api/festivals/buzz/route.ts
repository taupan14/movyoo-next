import { NextRequest, NextResponse } from "next/server";
import { fetchFestivalBuzzFeed } from "@/lib/festivals-db-extra";

export const runtime = "edge";
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const festivalSlug = req.nextUrl.searchParams.get("festival") ?? undefined;
  const source = req.nextUrl.searchParams.get("source") ?? undefined;

  try {
    const data = await fetchFestivalBuzzFeed(page, limit, {
      festivalSlug,
      source,
    });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("[/api/festivals/buzz] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
