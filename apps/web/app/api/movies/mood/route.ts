/**
 * app/api/movies/mood/route.ts
 *
 * GET  — Film berdasarkan mood + pagination
 * POST — Simpan mood history (opsional, tidak blocking)
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";

// ─── Mood → TMDB genre IDs ─────────────────────────────────────────────────────
const MOOD_GENRE_MAP: Record<string, number[]> = {
  ketawa: [35],
  tegang: [53, 27, 28],
  nangis: [18, 10749],
  santai: [16, 10751, 12],
  mikir: [878, 9648, 99],
  berat: [18, 36, 10752],
};

const VALID_MOODS = Object.keys(MOOD_GENRE_MAP);

// ─── Inline DB function (tidak import dari movies-db agar tidak circular) ──────

function pickOverview(
  row: { overview: string | null; overview_en: string | null },
  lang: string,
): string {
  if (lang === "id") return row.overview || row.overview_en || "";
  return row.overview_en || row.overview || "";
}

async function fetchMoodMoviesPaginated(params: {
  lang: string;
  genreIds: number[];
  page: number;
  limit: number;
}) {
  const { lang, genreIds, page, limit } = params;
  const offset = (page - 1) * limit;

  // 1. Cari genre DB ids dari tmdb_genre_id
  const { data: genreRows, error: genreErr } = await supabase
    .from("genres")
    .select("id")
    .in("tmdb_genre_id", genreIds);

  if (genreErr) {
    console.error("[mood] genres query error:", genreErr.message);
    return { movies: [], page, totalPages: 0, total: 0 };
  }

  const genreDbIds = (genreRows ?? []).map((r: any) => r.id);
  if (!genreDbIds.length) return { movies: [], page, totalPages: 0, total: 0 };

  // 2. Ambil movie_ids yang punya genre tersebut
  const { data: movieGenreRows, error: mgErr } = await supabase
    .from("movie_genres")
    .select("movie_id")
    .in("genre_id", genreDbIds)
    .limit(3000);

  if (mgErr) {
    console.error("[mood] movie_genres query error:", mgErr.message);
    return { movies: [], page, totalPages: 0, total: 0 };
  }

  // Deduplicate
  const movieIds = [
    ...new Set((movieGenreRows ?? []).map((r: any) => r.movie_id)),
  ];
  if (!movieIds.length) return { movies: [], page, totalPages: 0, total: 0 };

  // 3. Query movies dengan pagination
  const { data, error, count } = await supabase
    .from("movies")
    .select(
      "id, tmdb_id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en",
      { count: "exact" },
    )
    .in("id", movieIds)
    .not("poster_path", "is", null)
    .not("tmdb_id", "is", null)
    .order("popularity", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[mood] movies query error:", error.message);
    return { movies: [], page, totalPages: 0, total: 0 };
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  // 4. Fetch genre names untuk movies di halaman ini
  const pageMovieIds = (data ?? []).map((m: any) => m.id);
  const { data: mgData } = await supabase
    .from("movie_genres")
    .select("movie_id, genres(name)")
    .in("movie_id", pageMovieIds);

  // Build map: movie_id → genre names[]
  const genreMap = new Map<number, string[]>();
  for (const row of (mgData ?? []) as any[]) {
    const mid = row.movie_id as number;
    const name = row.genres?.name as string | undefined;
    if (!name) continue;
    if (!genreMap.has(mid)) genreMap.set(mid, []);
    genreMap.get(mid)!.push(name);
  }

  const movies = (data ?? []).map((m: any) => ({
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.original_language === "id" ? m.original_title || m.title : m.title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average ?? 0),
    release_date: m.release_date ?? null,
    popularity: Number(m.popularity ?? 0),
    overview: pickOverview(m, lang),
    genres: genreMap.get(m.id) ?? [],
  }));

  return { movies, page, totalPages, total };
}

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mood = searchParams.get("mood") ?? "";
  const lang = searchParams.get("lang") ?? "en";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    40,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
  );

  if (!VALID_MOODS.includes(mood)) {
    return NextResponse.json(
      { error: `Invalid mood. Valid: ${VALID_MOODS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const genreIds = MOOD_GENRE_MAP[mood];
    const result = await fetchMoodMoviesPaginated({
      lang,
      genreIds,
      page,
      limit,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("[/api/movies/mood] GET error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ─── POST — simpan mood history ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    // Belum login → skip simpan, tidak error
    if (!user) {
      return NextResponse.json({ success: false, reason: "unauthenticated" });
    }

    const body = await req.json().catch(() => ({}));
    const { mood } = body as { mood?: string };

    if (!mood || !VALID_MOODS.includes(mood)) {
      return NextResponse.json({ error: "Invalid mood" }, { status: 400 });
    }

    await supabaseServer
      .from("user_mood_history")
      .insert({ user_id: user.id, mood });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[/api/movies/mood] POST error:", err);
    // Jangan sampai error mood history block UX
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
