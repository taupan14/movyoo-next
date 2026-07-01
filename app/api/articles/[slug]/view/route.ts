/**
 * app/api/articles/[slug]/view/route.ts
 * POST /api/articles/[slug]/view
 * Increment view_count artikel — dipanggil dari client side
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const { slug } = params;

  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("increment_article_view", {
    article_slug: slug,
  });

  if (error) {
    console.error("[/api/articles/view] RPC error:", error.message);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
