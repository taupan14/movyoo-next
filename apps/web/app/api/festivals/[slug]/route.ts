import { NextRequest, NextResponse } from "next/server";
import { fetchFestivalDetail } from "@/lib/festivals-db";
import { fetchFestivalTickets } from "@/lib/festivals-db-extra";

// CATATAN: file ini kemungkinan SUDAH ADA di project kamu (dipakai oleh
// FestivalDetailPanel di home page, fetch ke `/api/festivals/${slug}?year=...`).
// Kalau sudah ada, cukup tambahkan panggilan fetchFestivalTickets di bawah
// dan sisipkan `tickets` ke object yang dikembalikan — tidak perlu bikin file baru.

export const runtime = "edge";
export const revalidate = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const year = req.nextUrl.searchParams.get("year");
  const lang = req.nextUrl.searchParams.get("lang") ?? "en";

  if (!year) {
    return NextResponse.json(
      { error: "Missing required 'year' query param" },
      { status: 400 },
    );
  }

  try {
    const detail = await fetchFestivalDetail(params.slug, Number(year), lang);

    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const tickets = await fetchFestivalTickets(detail.edition.id);

    return NextResponse.json(
      { ...detail, tickets },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    console.error(`[/api/festivals/${params.slug}] error:`, err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
