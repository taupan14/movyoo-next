// app/api/collections/route.ts

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

  // ── 1. User collections ────────────────────────────────────────────────────
  const { data: userCols, error: ucError } = await supabase
    .from("user_collections")
    .select(
      `
    id, name, description, is_public, cover_movie_id, created_at, updated_at,
    movies:cover_movie_id ( poster_path ),
    collection_items (
      id,
      added_at,
      media_type,
      movie_id,
      series_id,
      movie:movie_id (
        title,
        poster_path,
        release_date,
        movie_genres ( genres ( name ) )
      ),
      series:series_id (
        name,
        poster_path,
        first_air_date,
        tv_genres ( genres ( name ) )
      )
    )
  `,
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (ucError)
    return NextResponse.json({ error: ucError.message }, { status: 500 });

  const userCollections = (userCols ?? []).map((row: any) => {
    const allItems: any[] = row.collection_items ?? [];

    const items = allItems
      .map((item) => {
        const isMovie = item.media_type === "movie";

        if (isMovie && item.movie) {
          const genres = (item.movie.movie_genres ?? [])
            .map((mg: any) => mg.genres?.name)
            .filter(Boolean)
            .slice(0, 2);

          return {
            item_id: item.id,
            media_type: "movie",
            movie_id: item.movie_id,
            series_id: null,
            title: item.movie.title,
            poster_path: item.movie.poster_path ?? null,
            release_year: item.movie.release_date
              ? new Date(item.movie.release_date).getFullYear()
              : null,
            genres,
            added_at: item.added_at,
          };
        }

        if (!isMovie && item.series) {
          const genres = (item.series.tv_genres ?? [])
            .map((tg: any) => tg.genres?.name)
            .filter(Boolean)
            .slice(0, 2);

          return {
            item_id: item.id,
            media_type: "tv",
            movie_id: null,
            series_id: item.series_id,
            title: item.series.name,
            poster_path: item.series.poster_path ?? null,
            release_year: item.series.first_air_date
              ? new Date(item.series.first_air_date).getFullYear()
              : null,
            genres,
            added_at: item.added_at,
          };
        }

        return null;
      })
      .filter(Boolean);

    return {
      id: row.id,
      user_id: user.id,
      name: row.name,
      description: row.description,
      is_public: row.is_public,
      cover_movie_id: row.cover_movie_id,
      cover_poster: row.movies?.poster_path ?? null,
      item_count: allItems.length, // ← hitung dari array, bukan count aggregate
      items,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_achievement: false,
      achievement_key: null,
    };
  });

  // ── 2. Achievement collections yang sudah unlock ───────────────────────────
  const { data: unlockedAchs } = await supabase
    .from("user_achievements")
    .select("achievement_key")
    .eq("user_id", user.id)
    .not("unlocked_at", "is", null);

  const unlockedKeys = new Set(
    (unlockedAchs ?? []).map((a: any) => a.achievement_key),
  );

  const { data: achWithCollection } = await supabase
    .from("achievements")
    .select("key, name, description, criteria")
    .not("criteria", "is", null);

  const collectionAchs = (achWithCollection ?? []).filter(
    (a: any) => a.criteria?.collection_key && unlockedKeys.has(a.key),
  );

  let achievementCollections: any[] = [];
  if (collectionAchs.length > 0) {
    const collectionKeys = collectionAchs.map(
      (a: any) => a.criteria.collection_key,
    );
    const { data: masterCols } = await supabase
      .from("collections")
      .select("id, key, name, description, collection_items(count)")
      .in("key", collectionKeys)
      .eq("is_active", true);

    achievementCollections = (masterCols ?? []).map((col: any) => {
      const ach = collectionAchs.find(
        (a: any) => a.criteria.collection_key === col.key,
      );
      return {
        id: -col.id, // negative id untuk membedakan dari user collections
        user_id: user.id,
        name: col.name,
        description: col.description ?? null,
        is_public: true,
        cover_movie_id: null,
        cover_poster: null,
        item_count: col.collection_items?.[0]?.count ?? 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_achievement: true,
        achievement_key: ach?.key ?? null,
        master_collection_id: col.id,
      };
    });
  }

  return NextResponse.json([...userCollections, ...achievementCollections]);
}

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
  if (id < 0)
    return NextResponse.json(
      { error: "Achievement collections tidak dapat diedit" },
      { status: 403 },
    );

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

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (id < 0)
    return NextResponse.json(
      { error: "Achievement collections tidak dapat dihapus" },
      { status: 403 },
    );

  const { error } = await supabase
    .from("user_collections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
