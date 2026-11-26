// app/api/contributor/articles/[id]/route.ts — UPDATED
// GET   → sertakan media (article_movies + article_tv) untuk prefill form edit
// PATCH → kalau body.media dikirim, hapus link lama & insert ulang (replace penuh)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { moderateText, moderationMessage } from "@/lib/moderation";
import type { ArticleFormInput, ArticleMediaLink } from "@/types/contributor";

async function saveMediaLinks(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  articleId: number,
  media: ArticleFormInput["media"],
) {
  if (!media) return;

  // Replace penuh: hapus semua link lama, insert ulang sesuai urutan baru
  await supabase.from("article_movies").delete().eq("article_id", articleId);
  await supabase.from("article_tv").delete().eq("article_id", articleId);

  const movieRows = media
    .filter((m) => m.media_type === "movie")
    .map((m) => ({
      article_id: articleId,
      movie_id: m.id,
      sort_order: m.sort_order,
      note: m.note?.trim() || null,
    }));

  const tvRows = media
    .filter((m) => m.media_type === "tv")
    .map((m) => ({
      article_id: articleId,
      tv_id: m.id,
      sort_order: m.sort_order,
      note: m.note?.trim() || null,
    }));

  if (movieRows.length) {
    await supabase.from("article_movies").insert(movieRows);
  }
  if (tvRows.length) {
    await supabase.from("article_tv").insert(tvRows);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("articles")
    .select(
      `
      *,
      article_movies (
        movie_id, sort_order, note,
        movies ( id, title, poster_path, release_date )
      ),
      article_tv (
        tv_id, sort_order, note,
        tv_series ( id, name, poster_path, first_air_date )
      )
      `,
    )
    .eq("id", params.id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data)
    return NextResponse.json(
      { error: "Artikel tidak ditemukan" },
      { status: 404 },
    );

  const movieMedia: ArticleMediaLink[] = (data.article_movies ?? []).map(
    (am: any) => ({
      media_type: "movie" as const,
      id: am.movie_id,
      title: am.movies?.title ?? "",
      poster_path: am.movies?.poster_path ?? null,
      release_date: am.movies?.release_date ?? null,
      note: am.note ?? "",
      sort_order: am.sort_order,
    }),
  );

  const tvMedia: ArticleMediaLink[] = (data.article_tv ?? []).map(
    (at: any) => ({
      media_type: "tv" as const,
      id: at.tv_id,
      title: at.tv_series?.name ?? "",
      poster_path: at.tv_series?.poster_path ?? null,
      release_date: at.tv_series?.first_air_date ?? null,
      note: at.note ?? "",
      sort_order: at.sort_order,
    }),
  );

  const media = [...movieMedia, ...tvMedia].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  const { article_movies, article_tv, ...articleFields } = data as any;

  return NextResponse.json({ article: { ...articleFields, media } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pastikan artikel ini memang miliknya
  const { data: existing } = await supabase
    .from("articles")
    .select("id, author_id, status, published_at")
    .eq("id", params.id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (!existing)
    return NextResponse.json(
      { error: "Artikel tidak ditemukan" },
      { status: 404 },
    );

  const body = (await req.json()) as Partial<ArticleFormInput>;
  const wantsPublish = body.status === "published";

  if (wantsPublish) {
    const modResult = moderateText(
      body.title,
      body.title_en,
      body.excerpt,
      body.body,
      body.meta_title,
      body.meta_desc,
    );
    if (!modResult.passed) {
      return NextResponse.json(
        { error: moderationMessage(modResult), flagged: modResult.flagged },
        { status: 422 },
      );
    }
  }

  const { data, error } = await supabase
    .from("articles")
    .update({
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.title_en !== undefined
        ? { title_en: body.title_en?.trim() || null }
        : {}),
      ...(body.excerpt !== undefined
        ? { excerpt: body.excerpt?.trim() || null }
        : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.cover_path !== undefined
        ? { cover_path: body.cover_path || null }
        : {}),
      ...(body.lang !== undefined ? { lang: body.lang } : {}),
      ...(body.meta_title !== undefined
        ? { meta_title: body.meta_title?.trim() || null }
        : {}),
      ...(body.meta_desc !== undefined
        ? { meta_desc: body.meta_desc?.trim() || null }
        : {}),
      ...(body.topic_type !== undefined
        ? { topic_type: body.topic_type || null }
        : {}),
      ...(body.topic_value !== undefined
        ? { topic_value: body.topic_value?.trim() || null }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(wantsPublish && !existing.published_at
        ? { published_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", params.id)
    .eq("author_id", user.id)
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  try {
    await saveMediaLinks(supabase, Number(params.id), body.media);
  } catch (linkError) {
    console.error(
      "[contributor/articles PATCH] gagal sync media link:",
      linkError,
    );
  }

  return NextResponse.json({ article: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("articles")
    .delete()
    .eq("id", params.id)
    .eq("author_id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
