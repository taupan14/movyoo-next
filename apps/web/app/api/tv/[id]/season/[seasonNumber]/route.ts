/**
 * app/api/tv/[id]/season/[seasonNumber]/route.ts
 *
 * GET — Episodes per season, hanya dari tabel tv_episodes di Supabase.
 * Data diisi via Edge Function sync-tv-episodes.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function pickOverview(
  row: { overview: string | null; overview_en: string | null },
  lang: string,
): string {
  if (lang === "id") return row.overview || row.overview_en || "";
  return row.overview_en || row.overview || "";
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; seasonNumber: string } },
) {
  const tmdbId = parseInt(params.id, 10);
  const seasonNumber = parseInt(params.seasonNumber, 10);

  // console.log("[tv-season] tmdb_id:", tmdbId, "season:", seasonNumber);

  if (isNaN(tmdbId) || isNaN(seasonNumber)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const lang = req.nextUrl.searchParams.get("lang") ?? "en";

  try {
    // 1. Resolve internal series_id dari tmdb_id
    const { data: seriesRow, error: seriesErr } = await supabase
      .from("tv_series")
      .select("id")
      .eq("tmdb_id", tmdbId)
      .single();

    if (seriesErr || !seriesRow) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // console.log("[tv-season] series_id:", seriesRow.id);
    // 2. Fetch episodes dari tv_episodes
    const { data: episodes, error: epErr } = await supabase
      .from("tv_episodes")
      .select(
        "episode_number, name, overview, overview_en, still_path, air_date, runtime",
      )
      .eq("series_id", seriesRow.id)
      .eq("season_number", seasonNumber)
      .order("episode_number", { ascending: true });

    if (epErr) {
      console.error("[tv-season] query error:", epErr.message);
      return NextResponse.json(
        { error: "Failed to fetch episodes" },
        { status: 500 },
      );
    }

    const mapped = (episodes ?? []).map((ep: any) => ({
      episode_number: ep.episode_number,
      name: ep.name,
      overview: pickOverview(ep, lang),
      still_path: ep.still_path ?? null,
      air_date: ep.air_date ?? null,
      runtime: ep.runtime ?? null,
    }));

    return NextResponse.json(
      { episodes: mapped },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      },
    );
  } catch (err) {
    console.error("[tv-season] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
