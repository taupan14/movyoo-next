import { NextRequest, NextResponse } from "next/server";
import {
  fetchFestivalsForHome,
  fetchOscarContenders,
} from "@/lib/festivals-db";

export const runtime = "edge";
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") ?? "en";

  try {
    const [festivalsData, oscarContenders] = await Promise.all([
      fetchFestivalsForHome(),
      fetchOscarContenders(lang, 15),
    ]);

    return NextResponse.json(
      { festivals: festivalsData, oscarContenders },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    console.error("[/api/festivals] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
