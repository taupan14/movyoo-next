// app/api/trivia/powerups/route.ts
// GET — Ambil status powerup user hari ini

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase.rpc("get_or_create_powerups", {
      p_user_id: user.id,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      date: data.date,
      fifty_fifty: {
        used: data.fifty_fifty_used,
        label: "50:50",
        description: "Hapus 2 pilihan salah",
      },
      extra_time: {
        used: data.extra_time_used,
        label: "Extra Time",
        description: "Tambah 10 detik waktu",
      },
      skip: {
        used: data.skip_used,
        label: "Skip",
        description: "Lewati soal ini",
      },
      double_points: {
        used: data.double_points_used,
        label: "Double Points",
        description: "XP & Points ×2 untuk soal ini",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[GET /api/trivia/powerups]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
