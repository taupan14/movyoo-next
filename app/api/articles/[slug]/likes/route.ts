import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

async function getArticleId(supabase: any, slug: string) {
  const { data } = await supabase
    .from("articles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id as number | undefined;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const supabase = makeSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const articleId = await getArticleId(supabase, params.slug);
  if (!articleId) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const { data: article } = await supabase
    .from("articles")
    .select("like_count")
    .eq("id", articleId)
    .single();

  let liked = false;
  if (user) {
    const { data } = await supabase
      .from("article_likes")
      .select("id")
      .eq("article_id", articleId)
      .eq("user_id", user.id)
      .maybeSingle();
    liked = !!data;
  }

  return NextResponse.json({ likeCount: article?.like_count ?? 0, liked });
}

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

  const articleId = await getArticleId(supabase, params.slug);
  if (!articleId) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("article_likes")
    .select("id")
    .eq("article_id", articleId)
    .eq("user_id", user.id)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    await supabase.from("article_likes").delete().eq("id", existing.id);
    liked = false;
  } else {
    await supabase
      .from("article_likes")
      .insert({ article_id: articleId, user_id: user.id });
    liked = true;
  }

  const { count } = await supabase
    .from("article_likes")
    .select("*", { count: "exact", head: true })
    .eq("article_id", articleId);

  await supabase
    .from("articles")
    .update({ like_count: count ?? 0 })
    .eq("id", articleId);

  return NextResponse.json({ likeCount: count ?? 0, liked });
}
