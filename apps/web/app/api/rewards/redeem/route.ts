// app/api/rewards/redeem/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();

  // Cek auth user dari session cookie
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Login terlebih dahulu" },
      { status: 401 },
    );
  }

  const { reward_id } = await req.json();
  if (!reward_id) {
    return NextResponse.json(
      { error: "reward_id diperlukan" },
      { status: 400 },
    );
  }

  // Cek reward & stok
  const { data: reward, error: rewardErr } = await supabase
    .from("rewards")
    .select("id, name, points_price, points_discount, stock, status")
    .eq("id", reward_id)
    .single();

  if (rewardErr || !reward) {
    return NextResponse.json(
      { error: "Reward tidak ditemukan" },
      { status: 404 },
    );
  }

  if (reward.status === "out_of_stock" || reward.stock <= 0) {
    return NextResponse.json({ error: "Stok habis" }, { status: 409 });
  }

  const pointsRequired = reward.points_discount ?? reward.points_price;

  // Cek poin user dari user_progression
  const { data: progression, error: progErr } = await supabase
    .from("user_progression")
    .select("points")
    .eq("user_id", user.id)
    .single();

  if (progErr || !progression) {
    return NextResponse.json(
      { error: "Data progression tidak ditemukan" },
      { status: 404 },
    );
  }

  if (progression.points < pointsRequired) {
    return NextResponse.json(
      {
        error: `Poin tidak cukup. Kamu punya ${progression.points.toLocaleString("id-ID")} pts, butuh ${pointsRequired.toLocaleString("id-ID")} pts.`,
      },
      { status: 402 },
    );
  }

  // Kurangi poin di user_progression + kurangi stok + catat redemption
  const [progRes, stockRes, redeemRes] = await Promise.all([
    supabase
      .from("user_progression")
      .update({ points: progression.points - pointsRequired })
      .eq("user_id", user.id),
    supabase
      .from("rewards")
      .update({ stock: reward.stock - 1 })
      .eq("id", reward_id),
    supabase
      .from("reward_redemptions")
      .insert({
        reward_id,
        user_id: user.id,
        points_spent: pointsRequired,
        status: "pending",
      })
      .select()
      .single(),
  ]);

  if (progRes.error || stockRes.error || redeemRes.error) {
    console.error("[redeem]", progRes.error, stockRes.error, redeemRes.error);
    return NextResponse.json(
      { error: "Gagal melakukan redeem" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    redemption_id: redeemRes.data?.id,
    points_spent: pointsRequired,
    remaining_points: progression.points - pointsRequired,
    message: `Berhasil redeem "${reward.name}"!`,
  });
}
