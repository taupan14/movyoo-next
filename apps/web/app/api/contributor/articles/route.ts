// app/api/contributor/articles/route.ts — UPDATED
// Tambahan: insert ke article_movies / article_tv setelah artikel dibuat

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { moderateText, moderationMessage } from "@/lib/moderation";
import type { ArticleFormInput } from "@/types/contributor";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

async function ensureContributor(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, isContributor: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isContributor =
    profile?.role === "contributor" || profile?.role === "admin";
  return { user, isContributor };
}

async function saveMediaLinks(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  articleId: number,
  media: ArticleFormInput["media"],
) {
  if (!media) return;

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

export async function GET() {
  const supabase = await createSupabaseServer();
  const { user, isContributor } = await ensureContributor(supabase);

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isContributor)
    return NextResponse.json({ error: "Bukan kontributor" }, { status: 403 });

  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ articles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { user, isContributor } = await ensureContributor(supabase);

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isContributor)
    return NextResponse.json({ error: "Bukan kontributor" }, { status: 403 });

  const body = (await req.json()) as ArticleFormInput;

  if (!body.title?.trim() || !body.body?.trim()) {
    return NextResponse.json(
      { error: "Judul dan isi artikel wajib diisi" },
      { status: 400 },
    );
  }

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

  // Generate slug unik
  const baseSlug = slugify(body.title) || `artikel-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const { data: existing } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("articles")
    .insert({
      slug,
      title: body.title.trim(),
      title_en: body.title_en?.trim() || null,
      excerpt: body.excerpt?.trim() || null,
      body: body.body,
      cover_path: body.cover_path || null,
      lang: body.lang || "id",
      status: wantsPublish ? "published" : "draft",
      source: "contributor",
      meta_title: body.meta_title?.trim() || null,
      meta_desc: body.meta_desc?.trim() || null,
      topic_type: body.topic_type || null,
      topic_value: body.topic_value?.trim() || null,
      author_id: user.id,
      published_at: wantsPublish ? now : null,
    })
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  // Tautkan film/series (tidak menggagalkan create artikel kalau ada error kecil di sini)
  try {
    await saveMediaLinks(supabase, data.id, body.media);
  } catch (linkError) {
    console.error(
      "[contributor/articles POST] gagal simpan media link:",
      linkError,
    );
  }

  return NextResponse.json({ article: data }, { status: 201 });
}
