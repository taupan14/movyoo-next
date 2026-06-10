// app/api/collections/route.ts — FILE BARU

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// GET /api/collections — semua collection milik user
export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_collections")
    .select(
      `
      id, name, description, is_public, cover_movie_id, created_at, updated_at,
      movies:cover_movie_id ( poster_path ),
      collection_items ( count )
    `,
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const collections = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    is_public: row.is_public,
    cover_movie_id: row.cover_movie_id,
    cover_poster: row.movies?.poster_path ?? null,
    item_count: row.collection_items?.[0]?.count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json(collections);
}

// POST /api/collections — buat collection baru
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, is_public = false } = await request.json();
  if (!name?.trim())
    return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("user_collections")
    .insert({ user_id: user.id, name: name.trim(), description, is_public })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/collections — edit collection
export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const allowed = ["name", "description", "is_public", "cover_movie_id"];
  const update = Object.fromEntries(
    Object.entries(rest).filter(([k]) => allowed.includes(k)),
  );

  const { data, error } = await supabase
    .from("user_collections")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/collections?id=123
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
    .from("user_collections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
