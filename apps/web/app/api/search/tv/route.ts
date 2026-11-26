// app/api/search/tv/route.ts — FILE BARU
// GET /api/search/tv?q=... → cari series di tabel lokal (bukan TMDB langsung)

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
    .from("tv_series")
    .select(
      "id, tmdb_id, name, original_name, poster_path, first_air_date, popularity",
    )
    .or(`name.ilike.%${q}%,original_name.ilike.%${q}%`)
    .order("popularity", { ascending: false })
    .limit(10);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  const results = (data ?? []).map((t) => ({
    id: t.id,
    tmdb_id: t.tmdb_id,
    title: t.name,
    poster_path: t.poster_path,
    release_date: t.first_air_date,
    media_type: "tv" as const,
  }));

  return NextResponse.json({ results });
}
