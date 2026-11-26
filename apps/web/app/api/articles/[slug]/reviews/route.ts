/**
 * app/api/articles/[slug]/reviews/route.ts — FIXED
 * Fix 406 error: ganti .single() → .maybeSingle() di semua slug lookup
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  fetchArticleReviews,
  upsertArticleReview,
  deleteArticleReview,
} from "@/lib/article-reviews-db";

function makeSupabase(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},
      },
    },
  );
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const supabase = makeSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: article } = await supabase
    .from("articles")
    .select("id")
    .eq("slug", params.slug)
    .eq("status", "published")
    .maybeSingle(); // ← fix: .single() throw 406 kalau tidak ketemu

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const result = await fetchArticleReviews(article.id, user?.id);
  return NextResponse.json(result);
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const supabase = makeSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { spice, comment, tagged_movie_ids } = body;

  if (!spice || spice < 1 || spice > 5) {
    return NextResponse.json({ error: "spice must be 1–5" }, { status: 400 });
  }

  const { data: article } = await supabase
    .from("articles")
    .select("id")
    .eq("slug", params.slug)
    .eq("status", "published")
    .maybeSingle(); // ← fix

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const result = await upsertArticleReview({
    articleId: article.id,
    userId: user.id,
    spice,
    comment: comment ?? "",
    taggedMovieIds: Array.isArray(tagged_movie_ids) ? tagged_movie_ids : [],
  });

  if (!result) {
    return NextResponse.json(
      { error: "Failed to save review" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const supabase = makeSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: article } = await supabase
    .from("articles")
    .select("id")
    .eq("slug", params.slug)
    .maybeSingle(); // ← fix

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const ok = await deleteArticleReview(article.id, user.id);
  return NextResponse.json({ ok });
}
