// app/api/trivia/daily/route.ts
// GET — Status daily trivia user hari ini.
// Response: { completed, session_id?, score?, correct_count?, total_questions?,
//             xp_earned?, pts_earned?, tickets_earned?, available_at }

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

  const today = new Date().toISOString().split("T")[0];

  try {
    // Cek apakah ada daily session hari ini
    const { data: session } = await supabase
      .from("trivia_sessions")
      .select(
        "id, is_completed, score, correct_count, total_questions, xp_earned, pts_earned, tickets_earned, started_at, completed_at",
      )
      .eq("user_id", user.id)
      .eq("is_daily", true)
      .eq("daily_date", today)
      .maybeSingle();

    // Hitung waktu reset berikutnya (tengah malam WIB = 17:00 UTC)
    const now = new Date();
    const nextReset = new Date();
    nextReset.setUTCHours(17, 0, 0, 0);
    if (now.getUTCHours() >= 17) {
      nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    }

    if (!session) {
      return NextResponse.json({
        completed: false,
        started: false,
        session_id: null,
        next_reset_at: nextReset.toISOString(),
      });
    }

    return NextResponse.json({
      completed: session.is_completed,
      started: true,
      session_id: session.id,
      score: session.score,
      correct_count: session.correct_count,
      total_questions: session.total_questions,
      xp_earned: session.xp_earned,
      pts_earned: session.pts_earned,
      tickets_earned: session.tickets_earned,
      started_at: session.started_at,
      completed_at: session.completed_at,
      next_reset_at: nextReset.toISOString(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[GET /api/trivia/daily]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
