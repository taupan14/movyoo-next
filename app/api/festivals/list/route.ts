import { NextResponse } from "next/server";
import { fetchAllFestivals } from "@/lib/festivals-db-extra";

export const runtime = "edge";
export const revalidate = 3600;

export async function GET() {
  try {
    const data = await fetchAllFestivals();
    // console.log(data);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (err) {
    console.error("[/api/festivals/list] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
