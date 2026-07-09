// app/api/contributor/articles/[id]/route.ts — FILE BARU
// GET / PATCH / DELETE untuk satu artikel milik kontributor (dibatasi author_id)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { moderateText, moderationMessage } from "@/lib/moderation";
import type { ArticleFormInput } from "@/types/contributor";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", params.id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Artikel tidak ditemukan" }, { status: 404 });

  return NextResponse.json({ article: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pastikan artikel ini memang miliknya
  const { data: existing } = await supabase
    .from("articles")
    .select("id, author_id, status, published_at")
    .eq("id", params.id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (!existing)
    return NextResponse.json({ error: "Artikel tidak ditemukan" }, { status: 404 });

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
      ...(body.title_en !== undefined ? { title_en: body.title_en?.trim() || null } : {}),
      ...(body.excerpt !== undefined ? { excerpt: body.excerpt?.trim() || null } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.cover_path !== undefined ? { cover_path: body.cover_path || null } : {}),
      ...(body.lang !== undefined ? { lang: body.lang } : {}),
      ...(body.meta_title !== undefined ? { meta_title: body.meta_title?.trim() || null } : {}),
      ...(body.meta_desc !== undefined ? { meta_desc: body.meta_desc?.trim() || null } : {}),
      ...(body.topic_type !== undefined ? { topic_type: body.topic_type || null } : {}),
      ...(body.topic_value !== undefined ? { topic_value: body.topic_value?.trim() || null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(wantsPublish && !existing.published_at
        ? { published_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", params.id)
    .eq("author_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("articles")
    .delete()
    .eq("id", params.id)
    .eq("author_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
