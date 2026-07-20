import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { fetchReviewReplies } from "@/lib/review-replies-db";

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

// ── GET ──────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { reviewId: string } },
) {
  const reviewId = Number(params.reviewId);
  const replies = await fetchReviewReplies(reviewId);
  return NextResponse.json({ replies });
}

// ── POST ─────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { reviewId: string } },
) {
  const supabase = makeSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reviewId = Number(params.reviewId);
  const body = await req.json().catch(() => ({}));
  const content = (body?.content ?? "").trim();
  const parentReplyId: number | null = body?.parent_reply_id ?? null;
  const mentionedUserIds: string[] = Array.isArray(body?.mentioned_user_ids)
    ? body.mentioned_user_ids
    : [];

  if (!content || content.length > 1000) {
    return NextResponse.json({ error: "Balasan tidak valid" }, { status: 400 });
  }

  // article_reviews.article_id → articles(id) adalah FK langsung, aman di-embed
  const { data: review } = await supabase
    .from("article_reviews")
    .select("id, article_id, user_id, reply_count, articles ( slug )")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) {
    return NextResponse.json(
      { error: "Ulasan tidak ditemukan" },
      { status: 404 },
    );
  }

  let parentOwnerId: string | null = null;
  if (parentReplyId) {
    const { data: parentReply } = await supabase
      .from("review_replies")
      .select("id, review_id, user_id")
      .eq("id", parentReplyId)
      .maybeSingle();
    if (!parentReply || parentReply.review_id !== reviewId) {
      return NextResponse.json(
        { error: "Balasan induk tidak valid" },
        { status: 400 },
      );
    }
    parentOwnerId = parentReply.user_id;
  }

  const { data: inserted, error } = await supabase
    .from("review_replies")
    .insert({
      review_id: reviewId,
      user_id: user.id,
      parent_reply_id: parentReplyId,
      content,
      mentioned_user_ids: mentionedUserIds,
    })
    .select(
      "id, review_id, user_id, parent_reply_id, content, mentioned_user_ids, is_deleted, created_at",
    )
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "Gagal mengirim balasan" },
      { status: 400 },
    );
  }

  // Fetch profile pengirim secara terpisah (pola sama seperti review)
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  await supabase
    .from("article_reviews")
    .update({ reply_count: (review.reply_count ?? 0) + 1 })
    .eq("id", reviewId);

  // ── Notifikasi ──
  const slug = (review as any).articles?.slug;
  const notifTargets = new Set<string>();
  if (review.user_id !== user.id) notifTargets.add(review.user_id);
  if (parentOwnerId && parentOwnerId !== user.id)
    notifTargets.add(parentOwnerId);

  const notifRows: any[] = [];
  for (const uid of notifTargets) {
    notifRows.push({
      user_id: uid,
      type: "review_reply",
      title: "Ada balasan baru di ulasan",
      message: content.slice(0, 120),
      link: slug ? `/articles/${slug}#review-${reviewId}` : null,
    });
  }
  for (const mid of mentionedUserIds) {
    if (mid === user.id || notifTargets.has(mid)) continue;
    notifRows.push({
      user_id: mid,
      type: "review_mention",
      title: "Kamu disebut dalam balasan",
      message: content.slice(0, 120),
      link: slug ? `/articles/${slug}#review-${reviewId}` : null,
    });
  }
  if (notifRows.length) await supabase.from("notifications").insert(notifRows);

  return NextResponse.json({
    reply: {
      ...inserted,
      profile: profile ?? { display_name: null, avatar_url: null },
    },
  });
}
