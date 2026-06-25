// app/api/rewards/[slug]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const supabase = await createSupabaseServer();

  const { data: reward, error } = await supabase
    .from("rewards_with_stats")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (error || !reward) {
    return NextResponse.json(
      { error: "Reward tidak ditemukan" },
      { status: 404 },
    );
  }

  const { data: reviews } = await supabase
    .from("reward_reviews")
    .select(
      `
      id,
      rating_level,
      comment,
      is_verified,
      helpful_count,
      created_at,
      profiles:user_id (
        display_name,
        avatar_url,
        username
      )
    `,
    )
    .eq("reward_id", reward.id)
    .order("helpful_count", { ascending: false })
    .limit(5);

  return NextResponse.json({
    ...reward,
    reviews: reviews ?? [],
  });
}
