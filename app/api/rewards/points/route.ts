// app/api/rewards/points/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_progression")
    .select("points, lucky_tickets, level, xp")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    // user_progression mungkin belum ada jika user baru
    return NextResponse.json({ points: 0, lucky_tickets: 0, level: 1, xp: 0 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
