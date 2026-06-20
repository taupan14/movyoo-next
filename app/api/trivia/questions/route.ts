// app/api/trivia/questions/route.ts
// GET — Mulai sesi trivia baru dan return soal pertama + metadata sesi.
// Query params:
//   mode       : 'daily' | 'practice' | 'category'  (default: practice)
//   difficulty : 'easy' | 'medium' | 'hard'          (opsional)
//   category   : string                               (opsional)
//   count      : number 10–25                         (default: 10)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "practice";
  const difficulty = searchParams.get("difficulty") ?? null;
  const category = searchParams.get("category") ?? null;
  const count = Math.min(
    25,
    Math.max(10, parseInt(searchParams.get("count") ?? "10")),
  );

  const validModes = ["daily", "practice", "category"];
  if (!validModes.includes(mode))
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });

  try {
    // Buat session via DB function
    const { data: sessionData, error: sessionErr } = await supabase.rpc(
      "start_trivia_session",
      {
        p_user_id: user.id,
        p_mode: mode,
        p_difficulty: difficulty,
        p_category: category,
        p_count: count,
      },
    );

    if (sessionErr) throw new Error(sessionErr.message);

    // Error dari dalam function (daily sudah selesai, no questions, dsb)
    if (sessionData?.error) {
      return NextResponse.json(
        { error: sessionData.error, message: sessionData.message },
        { status: 409 },
      );
    }

    const session = sessionData.session;
    const resumed = sessionData.resumed ?? false;

    // Ambil data soal berdasarkan question_ids di session
    const questionIds: number[] = session.question_ids ?? [];
    if (questionIds.length === 0)
      return NextResponse.json(
        { error: "No questions available" },
        { status: 404 },
      );

    const { data: questions, error: qErr } = await supabase
      .from("questions")
      .select(
        "id, type, difficulty, category, question_text, option_a, option_b, option_c, option_d, image_url, movie_id, tmdb_id",
      )
      // Sengaja TIDAK include correct_option — dikirim satu per satu saat jawab
      .in("id", questionIds);

    if (qErr) throw new Error(qErr.message);

    // Urutkan sesuai question_ids di session
    const qMap = new Map((questions ?? []).map((q: any) => [q.id, q]));
    const orderedQuestions = questionIds
      .map((id) => qMap.get(id))
      .filter(Boolean);

    return NextResponse.json({
      session_id: session.id,
      mode: session.mode,
      difficulty: session.difficulty,
      category: session.category,
      total_questions: session.total_questions,
      current_index: session.current_index,
      is_daily: session.is_daily,
      resumed,
      questions: orderedQuestions,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[GET /api/trivia/questions]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
