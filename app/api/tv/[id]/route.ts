/**
 * app/api/tv/[id]/route.ts
 *
 * GET  — Detail TV Series by TMDB ID
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
  { params }: { params: { id: string } },
) {
  const tmdbId = parseInt(params.id, 10);
  if (!tmdbId || isNaN(tmdbId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const lang = searchParams.get("lang") ?? "en";
  const region = searchParams.get("region") ?? "ID";

  try {
    // 1. Main series data
    const { data: seriesRow, error: seriesErr } = await supabase
      .from("tv_series")
      .select(
        "id, tmdb_id, name, original_name, overview, overview_en, tagline, " +
          "vote_average, vote_count, popularity, status, type, original_language, " +
          "poster_path, backdrop_path, first_air_date, last_air_date, " +
          "number_of_seasons, number_of_episodes, episode_run_time, in_production, trailer_key",
      )
      .eq("tmdb_id", tmdbId)
      .single();

    if (seriesErr || !seriesRow) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const seriesId = seriesRow.id;

    // 2. Parallel queries
    const [
      genresRes,
      castRes,
      crewRes,
      networksRes,
      platformsRes,
      countriesRes,
      languagesRes,
      similarRes,
    ] = await Promise.allSettled([
      // Genres via join
      supabase
        .from("tv_genres")
        .select("genres(id, name)")
        .eq("series_id", seriesId),

      // Cast (top 20 by order_index)
      supabase
        .from("tv_cast")
        .select("person_id, name, character, profile_path, order_index")
        .eq("series_id", seriesId)
        .order("order_index", { ascending: true })
        .limit(20),

      // Crew
      supabase
        .from("tv_crew")
        .select("person_id, name, job, department, profile_path")
        .eq("series_id", seriesId),

      // Networks via join
      supabase
        .from("tv_series_networks")
        .select("tv_networks(tmdb_network_id, name, logo_path, origin_country)")
        .eq("series_id", seriesId),

      // Platforms (filter by region)
      supabase
        .from("tv_platforms")
        .select("platform_id, type, platforms(name, logo_path, url)")
        .eq("series_id", seriesId)
        .eq("region", region),

      // Countries
      supabase
        .from("tv_countries")
        .select("iso_3166_1, name")
        .eq("series_id", seriesId),

      // Languages
      supabase
        .from("tv_languages")
        .select("iso_639_1, name, english_name")
        .eq("series_id", seriesId),

      // Similar series: find series in same genres, exclude current
      (async () => {
        const genreData = await supabase
          .from("tv_genres")
          .select("genre_id")
          .eq("series_id", seriesId)
          .limit(2);

        const genreIds = (genreData.data ?? []).map((r: any) => r.genre_id);
        if (!genreIds.length) return { data: [] };

        const similarGenreRows = await supabase
          .from("tv_genres")
          .select("series_id")
          .in("genre_id", genreIds)
          .neq("series_id", seriesId)
          .limit(60);

        const ids = [
          ...new Set(
            (similarGenreRows.data ?? []).map((r: any) => r.series_id),
          ),
        ].slice(0, 30);
        if (!ids.length) return { data: [] };

        return supabase
          .from("tv_series")
          .select(
            "id, tmdb_id, name, poster_path, backdrop_path, vote_average, first_air_date, popularity",
          )
          .in("id", ids)
          .not("poster_path", "is", null)
          .order("popularity", { ascending: false })
          .limit(15);
      })(),
    ]);

    // 3. Assemble genres
    const genres =
      genresRes.status === "fulfilled"
        ? (genresRes.value.data ?? []).map((r: any) => r.genres).filter(Boolean)
        : [];

    // 4. Cast
    const cast =
      castRes.status === "fulfilled" ? (castRes.value.data ?? []) : [];

    // 5. Crew
    const crew =
      crewRes.status === "fulfilled" ? (crewRes.value.data ?? []) : [];

    // 6. Networks
    const networks =
      networksRes.status === "fulfilled"
        ? (networksRes.value.data ?? [])
            .map((r: any) => r.tv_networks)
            .filter(Boolean)
        : [];

    // 7. Platforms
    const platforms =
      platformsRes.status === "fulfilled"
        ? (platformsRes.value.data ?? [])
        : [];

    // 8. Countries / languages
    const countries =
      countriesRes.status === "fulfilled"
        ? (countriesRes.value.data ?? [])
        : [];
    const languages =
      languagesRes.status === "fulfilled"
        ? (languagesRes.value.data ?? [])
        : [];

    // 9. Similar
    const similarSeries =
      similarRes.status === "fulfilled"
        ? ((similarRes.value as any).data ?? [])
        : [];

    // 9.1 Episode rows
    const { data: episodeRows } = await supabase
      .from("tv_episodes")
      .select("season_number")
      .eq("series_id", seriesRow.id);

    const episodeCountMap = (episodeRows ?? []).reduce<Record<number, number>>(
      (acc, row) => {
        acc[row.season_number] = (acc[row.season_number] ?? 0) + 1;

        return acc;
      },
      {},
    );

    // 10. Build response
    const series = {
      id: seriesRow.id,
      tmdb_id: seriesRow.tmdb_id,
      name: seriesRow.name,
      original_name: seriesRow.original_name,
      tagline: seriesRow.tagline,
      overview: pickOverview(seriesRow, lang),
      poster_path: seriesRow.poster_path,
      backdrop_path: seriesRow.backdrop_path,
      vote_average: Number(seriesRow.vote_average ?? 0),
      vote_count: seriesRow.vote_count ?? 0,
      popularity: Number(seriesRow.popularity ?? 0),
      status: seriesRow.status,
      type: seriesRow.type,
      original_language: seriesRow.original_language,
      first_air_date: seriesRow.first_air_date,
      last_air_date: seriesRow.last_air_date,
      number_of_seasons: seriesRow.number_of_seasons ?? 0,
      number_of_episodes: seriesRow.number_of_episodes ?? 0,
      episode_run_time: seriesRow.episode_run_time,
      in_production: seriesRow.in_production ?? false,
      trailer_key: seriesRow.trailer_key,
      genres,
      cast,
      crew,
      networks,
      platforms,
      countries,
      languages,
      seasons: Array.from(
        { length: seriesRow.number_of_seasons ?? 0 },
        (_, i) => ({
          season_number: i + 1,
          name: `Season ${i + 1}`,
          episode_count: episodeCountMap[i + 1] ?? 0,
        }),
      ),
      similarSeries,
    };

    return NextResponse.json(
      { series },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    console.error("[/api/tv/[id]] GET error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
