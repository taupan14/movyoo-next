// app/api/liked/route.ts — FILE BARU

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_liked")
    .select(
      `
      id, media_type, movie_id, series_id, liked_at,
      movies ( id, title, poster_path, vote_average ),
      tv_series ( id, name, poster_path, vote_average )
    `,
    )
    .eq("user_id", user.id)
    .order("liked_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    media_type: row.media_type,
    movie_id: row.movie_id,
    series_id: row.series_id,
    liked_at: row.liked_at,
    title: row.movies?.title ?? row.tv_series?.name ?? "",
    poster_path: row.movies?.poster_path ?? row.tv_series?.poster_path ?? null,
    vote_average: Number(
      row.movies?.vote_average ?? row.tv_series?.vote_average ?? 0,
    ),
  }));

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { media_type, movie_id, series_id } = await request.json();

  if (
    !media_type ||
    (media_type === "movie" && !movie_id) ||
    (media_type === "tv" && !series_id)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // ── Cek apakah sudah ada ─────────────────────────────────────────────────
  let existingQuery = supabase
    .from("user_liked")
    .select("id")
    .eq("user_id", user.id)
    .eq("media_type", media_type);

  if (media_type === "movie") {
    existingQuery = existingQuery.eq("movie_id", movie_id);
  } else {
    existingQuery = existingQuery.eq("series_id", series_id);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  // Sudah ada → return data existing saja (idempoten)
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  // Belum ada → INSERT
  const { data, error } = await supabase
    .from("user_liked")
    .insert({
      user_id: user.id,
      media_type,
      movie_id: media_type === "movie" ? movie_id : null,
      series_id: media_type === "tv" ? series_id : null,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

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
    .from("user_liked")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
