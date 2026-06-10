import { NextRequest, NextResponse } from "next/server";
import { fetchFestivalDetail } from "@/lib/festivals-db";

export const runtime = "edge";
export const revalidate = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const lang = req.nextUrl.searchParams.get("lang") ?? "en";
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  if (!params.slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  if (isNaN(year) || year < 1930 || year > 2100) {
    return NextResponse.json({ error: "year is invalid" }, { status: 400 });
  }

  try {
    const detail = await fetchFestivalDetail(params.slug, year, lang);

    if (!detail) {
      return NextResponse.json(
        { error: "Festival or edition not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(detail, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error(`[/api/festivals/${params.slug}] error:`, err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
