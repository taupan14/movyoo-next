// app/api/collections/[id]/items/route.ts
// POST — Tambah movie/series ke user collection tertentu.
// DELETE — Hapus item dari user collection.
//
// Hanya berlaku untuk user collections (id positif).
// Achievement collections (id negatif) tidak bisa dimodifikasi.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const collectionId = Number(params.id);
  if (!collectionId || collectionId < 0)
    return NextResponse.json(
      { error: "Invalid collection id" },
      { status: 400 },
    );

  // Pastikan collection milik user ini
  const { data: col } = await supabase
    .from("user_collections")
    .select("id")
    .eq("id", collectionId)
    .eq("user_id", user.id)
    .single();

  if (!col)
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );

  const body = await request.json();
  const { media_type, movie_id, series_id } = body;

  if (!media_type || !["movie", "tv"].includes(media_type))
    return NextResponse.json({ error: "Invalid media_type" }, { status: 400 });
  if (media_type === "movie" && !movie_id)
    return NextResponse.json({ error: "movie_id required" }, { status: 400 });
  if (media_type === "tv" && !series_id)
    return NextResponse.json({ error: "series_id required" }, { status: 400 });

  // Cek duplikat
  let dupQuery = supabase
    .from("collection_items")
    .select("id")
    .eq("collection_id", collectionId);

  if (media_type === "movie") dupQuery = dupQuery.eq("movie_id", movie_id);
  else dupQuery = dupQuery.eq("series_id", series_id);

  const { data: existing } = await dupQuery.maybeSingle();
  if (existing)
    return NextResponse.json(
      { error: "Sudah ada di koleksi ini" },
      { status: 409 },
    );

  // Insert item
  const { data, error } = await supabase
    .from("collection_items")
    .insert({
      collection_id: collectionId,
      media_type: media_type,
      movie_id: media_type === "movie" ? Number(movie_id) : null,
      series_id: media_type === "tv" ? Number(series_id) : null,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Update updated_at di collection induk
  await supabase
    .from("user_collections")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", collectionId);

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const collectionId = Number(params.id);
  if (!collectionId || collectionId < 0)
    return NextResponse.json(
      { error: "Invalid collection id" },
      { status: 400 },
    );

  // Pastikan collection milik user ini
  const { data: col } = await supabase
    .from("user_collections")
    .select("id")
    .eq("id", collectionId)
    .eq("user_id", user.id)
    .single();

  if (!col)
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );

  const itemId = request.nextUrl.searchParams.get("item_id");
  if (!itemId)
    return NextResponse.json({ error: "Missing item_id" }, { status: 400 });

  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", itemId)
    .eq("collection_id", collectionId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
