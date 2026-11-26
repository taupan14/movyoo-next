// app/api/trivia/sessions/[id]/complete/route.ts
// POST — Selesaikan sesi trivia, hitung bonus, award XP/Points ke progression system.
// Dipanggil setelah semua soal dijawab atau user keluar dari sesi.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { processAward, getUserProgression } from "@/lib/progression";
import type { AwardMeta } from "@/types/progression";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = params.id;

  try {
    // Selesaikan sesi via DB function — hitung bonus perfect score + daily
    const { data: result, error: completeErr } = await supabase.rpc(
      "complete_trivia_session",
      { p_user_id: user.id, p_session_id: sessionId },
    );

    if (completeErr) throw new Error(completeErr.message);
    if (result?.error)
      return NextResponse.json({ error: result.error }, { status: 400 });

    // Award XP + Points via progression system (dengan daily cap)
    const meta: AwardMeta = {
      session_id: sessionId,
      is_trivia: true,
      correct_count: result.correct_count,
      total_questions: result.total,
      is_perfect: result.is_perfect,
      is_daily: result.is_daily,
    };

    // trivia_session_complete = +15 XP +5 pts (dari xp-config)
    // Bonus perfect dan daily sudah dihitung di DB function dan masuk ke
    // xp_earned/pts_earned, kita award via override amount
    const { awards, completed_challenges, achievement_updates, streak_result } =
      await processAward(
        supabase,
        user.id,
        "trivia_session_complete",
        {
          xp: result.bonus_xp,
          points: result.bonus_pts,
        },
        undefined,
        meta,
      );

    // Award lucky tickets jika daily trivia
    if (result.tickets_earned > 0) {
      await supabase.rpc("award_currency_with_cap", {
        p_user_id: user.id,
        p_amount: result.tickets_earned,
        p_currency: "tickets",
        p_source: "trivia_session_complete",
        p_ref_id: null,
        p_meta: meta,
      });
    }

    const progression = await getUserProgression(supabase, user.id);

    return NextResponse.json({
      success: true,
      correct_count: result.correct_count,
      total_questions: result.total,
      score: result.score,
      is_perfect: result.is_perfect,
      xp_earned: result.xp_earned,
      pts_earned: result.pts_earned,
      tickets_earned: result.tickets_earned,
      bonus_xp: result.bonus_xp,
      bonus_pts: result.bonus_pts,
      awards,
      completed_challenges,
      achievement_updates,
      streak_result,
      progression,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[POST /api/trivia/sessions/[id]/complete]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
