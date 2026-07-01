/**
 * GET /api/articles
 *
 * Query params:
 *   lang         — 'id' | 'en' | 'all'  (default: 'id')
 *   topic_type   — 'genre' | 'actor' | 'director' | 'studio' | 'platform' | 'custom'
 *   topic_value  — e.g. 'Action', 'Netflix'  (case-insensitive)
 *   page         — number (default: 1)
 *   limit        — number (default: 20, max: 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchArticleList, type TopicType } from "@/lib/articles-db";

export const revalidate = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const lang = searchParams.get("lang") ?? "id";
  const topic_type = searchParams.get("topic_type") as TopicType | null;
  const topic_value = searchParams.get("topic_value") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(
    50,
    Math.max(1, Number(searchParams.get("limit") ?? "20")),
  );

  try {
    const result = await fetchArticleList({
      lang,
      topic_type: topic_type ?? undefined,
      topic_value,
      page,
      limit,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("[/api/articles] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
