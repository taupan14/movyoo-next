// app/api/watchlist/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// GET /api/watchlist?status=want_to_watch&media_type=movie
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const mediaType = searchParams.get("media_type");

  let query = supabase
    .from("user_watchlist")
    .select(
      `
      id, media_type, status, remind_when_available, added_at, updated_at,
      movie_id, series_id,
      movies ( id, tmdb_id, title, poster_path, vote_average, release_date ),
      tv_series ( id, tmdb_id, name, poster_path, vote_average, first_air_date )
    `,
    )
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (mediaType) query = query.eq("media_type", mediaType);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    media_type: row.media_type,
    status: row.status,
    remind_when_available: row.remind_when_available,
    added_at: row.added_at,
    updated_at: row.updated_at,
    movie_id: row.movie_id,
    series_id: row.series_id,
    tmdb_id: row.movies?.tmdb_id ?? row.tv_series?.tmdb_id ?? null,
    title: row.movies?.title ?? row.tv_series?.name ?? "",
    poster_path: row.movies?.poster_path ?? row.tv_series?.poster_path ?? null,
    vote_average: Number(
      row.movies?.vote_average ?? row.tv_series?.vote_average ?? 0,
    ),
    release_date:
      row.movies?.release_date ?? row.tv_series?.first_air_date ?? null,
  }));

  return NextResponse.json(items);
}

// POST /api/watchlist — tambah item
// Menggunakan check-then-insert/update alih-alih upsert agar tidak bergantung
// pada named unique index di PostgREST (yang kadang tidak dikenali dari constraint saja).
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { media_type, movie_id, series_id, status = "want_to_watch" } = body;

  if (
    !media_type ||
    (media_type === "movie" && !movie_id) ||
    (media_type === "tv" && !series_id)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // ── 1. Cek apakah sudah ada ──────────────────────────────────────────────
  let existingQuery = supabase
    .from("user_watchlist")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("media_type", media_type);

  if (media_type === "movie") {
    existingQuery = existingQuery.eq("movie_id", movie_id);
  } else {
    existingQuery = existingQuery.eq("series_id", series_id);
  }

  const { data: existing, error: checkError } =
    await existingQuery.maybeSingle();

  if (checkError) {
    return NextResponse.json({ error: checkError.message }, { status: 500 });
  }

  // ── 2a. Sudah ada → UPDATE status saja ───────────────────────────────────
  if (existing) {
    const { data, error } = await supabase
      .from("user_watchlist")
      .update({ status })
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 200 }); // 200 = updated, bukan created
  }

  // ── 2b. Belum ada → INSERT baru ───────────────────────────────────────────
  const { data, error } = await supabase
    .from("user_watchlist")
    .insert({
      user_id: user.id,
      media_type,
      movie_id: media_type === "movie" ? movie_id : null,
      series_id: media_type === "tv" ? series_id : null,
      status,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/watchlist — update status / remind
export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, status, remind_when_available } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (status !== undefined) update.status = status;
  if (remind_when_available !== undefined)
    update.remind_when_available = remind_when_available;

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_watchlist")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/watchlist?id=123
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("user_watchlist")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
