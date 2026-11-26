// app/api/search/movies/route.ts — FILE BARU
// GET /api/search/movies?q=... → cari film di tabel lokal (bukan TMDB langsung)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const { data, error } = await supabase
    .from("movies")
    .select(
      "id, tmdb_id, title, original_title, poster_path, release_date, popularity",
    )
    .or(`title.ilike.%${q}%,original_title.ilike.%${q}%`)
    .order("popularity", { ascending: false })
    .limit(10);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  const results = (data ?? []).map((m) => ({
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.title,
    poster_path: m.poster_path,
    release_date: m.release_date,
    media_type: "movie" as const,
  }));

  return NextResponse.json({ results });
}
