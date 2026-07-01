/**
 * GET /api/articles/[slug]
 *
 * Query params:
 *   lang — 'id' | 'en'  (default: 'id')
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchArticleBySlug, fetchRelatedArticles } from "@/lib/articles-db";

export const revalidate = 300; // 5 menit — artikel jarang berubah

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const { searchParams } = req.nextUrl;
  const lang = searchParams.get("lang") ?? "id";
  const { slug } = params;

  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    const article = await fetchArticleBySlug(slug, lang);

    if (!article) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const related = await fetchRelatedArticles(
      article.id,
      article.topic_type,
      article.topic_value,
      lang,
      4,
    );

    return NextResponse.json(
      { article, related },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    console.error(`[/api/articles/${slug}] Unexpected error:`, err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
