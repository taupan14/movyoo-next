// app/api/trivia/sessions/[id]/answer/route.ts
// POST — Submit jawaban untuk satu soal dalam sesi.
// Body: { question_id, answer: 'A'|'B'|'C'|'D', time_taken_ms?, use_double_points? }
// Response: { correct, correct_option, explanation, xp_earned, pts_earned, score_delta }
//
// Security: correct_option tidak pernah dikirim ke frontend sebelum user menjawab.
// Semua kalkulasi XP/Points dilakukan server-side di DB function.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { processAward } from "@/lib/progression";
import type { AwardMeta } from "@/types/progression";

export async function POST(
  request: NextRequest,
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
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { question_id, answer, time_taken_ms, use_double_points } = body;

  if (!question_id || !answer)
    return NextResponse.json(
      { error: "question_id and answer required" },
      { status: 400 },
    );

  if (!["A", "B", "C", "D"].includes(answer))
    return NextResponse.json(
      { error: "answer must be A, B, C, or D" },
      { status: 400 },
    );

  try {
    // Jika double_points akan dipakai, validasi dulu powerup-nya
    if (use_double_points) {
      const { data: puData } = await supabase.rpc("use_powerup", {
        p_user_id: user.id,
        p_type: "double_points",
      });
      if (puData?.error) {
        return NextResponse.json(
          { error: puData.message ?? "Power-up tidak tersedia" },
          { status: 400 },
        );
      }
    }

    // Submit jawaban via DB function
    const { data: result, error: answerErr } = await supabase.rpc(
      "submit_trivia_answer",
      {
        p_user_id: user.id,
        p_session_id: sessionId,
        p_question_id: Number(question_id),
        p_answer: answer,
        p_time_taken_ms: time_taken_ms ?? null,
        p_double_points: use_double_points ?? false,
      },
    );

    if (answerErr) throw new Error(answerErr.message);
    if (result?.error)
      return NextResponse.json({ error: result.error }, { status: 400 });

    // Award XP dan Points via progression system (dengan daily cap)
    if (result.correct) {
      const meta: AwardMeta = {
        session_id: sessionId,
        question_id: Number(question_id),
        is_trivia: true,
        double_points: use_double_points ?? false,
      };

      // Award trivia_correct untuk setiap jawaban benar
      processAward(
        supabase,
        user.id,
        "trivia_correct",
        undefined,
        undefined,
        meta,
      ).catch((err) => console.error("[trivia/answer] processAward:", err));
    }

    return NextResponse.json({
      correct: result.correct,
      correct_option: result.correct_option,
      explanation: result.explanation,
      xp_earned: result.xp_earned,
      pts_earned: result.pts_earned,
      score_delta: result.score_delta,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[POST /api/trivia/sessions/[id]/answer]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
