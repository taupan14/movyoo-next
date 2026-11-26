import { NextRequest, NextResponse } from "next/server";
import { fetchFestivalCalendar } from "@/lib/festivals-db-extra";

export const runtime = "edge";
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const now = new Date();
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : now.getFullYear();

  // Ambil tahun sebelumnya + tahun ini + tahun depan supaya festival yang
  // menyeberang pergantian tahun (Des–Jan) tetap kebagian saat navigasi.
  try {
    const data = await fetchFestivalCalendar(year - 1, year + 1);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (err) {
    console.error("[/api/festivals/calendar] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
