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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { reviewId: string; replyId: string } },
) {
  const supabase = makeSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: reply } = await supabase
    .from("review_replies")
    .select("id, user_id, review_id")
    .eq("id", params.replyId)
    .maybeSingle();

  if (!reply || reply.user_id !== user.id) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  // ← BARU: cek hasil update + pastikan ada baris yang benar-benar berubah
  const { data: updated, error: updateError } = await supabase
    .from("review_replies")
    .update({ content: "[Balasan dihapus]", is_deleted: true })
    .eq("id", reply.id)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Gagal menghapus balasan" },
      { status: 400 },
    );
  }

  const { data: review } = await supabase
    .from("article_reviews")
    .select("reply_count")
    .eq("id", reply.review_id)
    .single();

  await supabase
    .from("article_reviews")
    .update({ reply_count: Math.max((review?.reply_count ?? 1) - 1, 0) })
    .eq("id", reply.review_id);

  return NextResponse.json({ ok: true });
}
