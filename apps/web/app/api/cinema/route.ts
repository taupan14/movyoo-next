/**
 * GET /api/cinema
 *
 * Query params:
 *   city       — nama kota, wajib untuk endpoint "movies" & "cinemas"
 *   chain      — opsional, filter chain (XXI | CGV | Cinepolis)
 *   show_date  — opsional, "YYYY-MM-DD" (default: hari ini WIB)
 *   lang       — "id" | "en" (default: "en")
 *   type       — "cities" | "cinemas" | "movies" | "upcoming" | "cinema_showtimes" (default: "movies")
 *   cinema_id  — wajib untuk type="cinema_showtimes"
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchCinemaCities,
  fetchCinemas,
  fetchNowPlayingGrouped,
  fetchComingSoonGrouped,
  fetchUpcomingMovies,
  fetchMovieDetail,
  fetchCinemaDetailWithShowtimes,
} from "@/lib/cinema-db";

export const revalidate = 120;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const type = searchParams.get("type") ?? "movies";
  const city = searchParams.get("city") ?? "";
  const chain = searchParams.get("chain") ?? "";
  const show_date = searchParams.get("show_date") ?? "";
  const lang = searchParams.get("lang") ?? "en";
  const movie_id_raw = searchParams.get("movie_id") ?? "";

  try {
    // ── 0. Movie detail ───────────────────────────────────────────────────────
    if (type === "movie_detail") {
      const movieId = parseInt(movie_id_raw, 10);
      if (!movieId || isNaN(movieId)) {
        return NextResponse.json(
          { error: "movie_id is required" },
          { status: 400 },
        );
      }
      const detail = await fetchMovieDetail(movieId, lang);
      if (!detail) {
        return NextResponse.json({ error: "Movie not found" }, { status: 404 });
      }

      //   console.log(detail);
      return NextResponse.json(
        { detail },
        {
          status: 200,
          headers: {
            "Cache-Control":
              "public, s-maxage=3600, stale-while-revalidate=7200",
          },
        },
      );
    }

    // ── 1. Distinct cities ────────────────────────────────────────────────────
    if (type === "cities") {
      const cities = await fetchCinemaCities();
      return NextResponse.json(
        { cities },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        },
      );
    }

    // ── 2. Cinema list ────────────────────────────────────────────────────────
    if (type === "cinemas") {
      if (!city) {
        return NextResponse.json(
          { error: "city is required" },
          { status: 400 },
        );
      }
      const cinemas = await fetchCinemas({ city, chain: chain || undefined });
      return NextResponse.json(
        { cinemas },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
          },
        },
      );
    }

    // ── 2b. Cinema detail + showtimes (untuk modal) ──────────────────────────
    if (type === "cinema_showtimes") {
      const cinema_id = searchParams.get("cinema_id") ?? "";
      if (!cinema_id) {
        return NextResponse.json(
          { error: "cinema_id is required" },
          { status: 400 },
        );
      }
      const result = await fetchCinemaDetailWithShowtimes({
        cinemaId: cinema_id,
        show_date: show_date || undefined,
      });

      if (!result.cinema) {
        return NextResponse.json(
          { error: "Cinema not found" },
          { status: 404 },
        );
      }

      return NextResponse.json(result, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
        },
      });
    }

    // ── 3. Upcoming movies (from cinema_movies, show_date > today) ────────────
    if (type === "upcoming") {
      //   console.log("upcoming");
      if (!city) {
        return NextResponse.json(
          { error: "city is required" },
          { status: 400 },
        );
      }
      const upcomingMovies = await fetchUpcomingMovies({
        city,
        lang,
        limit: 20,
      });
      //   console.log("upcomingMovies", upcomingMovies);
      return NextResponse.json(
        { upcomingMovies },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        },
      );
    }

    // ── 4. Now playing + Coming soon ─────────────────────────────────────────
    if (!city) {
      return NextResponse.json({ error: "city is required" }, { status: 400 });
    }

    const [nowPlayingResult, comingSoon] = await Promise.all([
      fetchNowPlayingGrouped({
        city,
        chain: chain || undefined,
        show_date: show_date || undefined,
        lang,
      }),
      fetchComingSoonGrouped({
        city,
        chain: chain || undefined,
        lang,
        limit: 20,
      }),
    ]);

    // console.log("nowPlayingResult", nowPlayingResult);
    // console.log("comingSoon", comingSoon);

    return NextResponse.json(
      {
        nowPlaying: nowPlayingResult.movies,
        nowPlayingByChain: nowPlayingResult.byChain,
        show_date_used: nowPlayingResult.show_date_used,
        is_fallback: nowPlayingResult.is_fallback,
        comingSoon,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    console.error("[/api/cinema] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
