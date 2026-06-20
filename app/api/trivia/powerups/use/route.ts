// app/api/trivia/powerups/use/route.ts
// POST — Gunakan powerup untuk soal saat ini.
// Body: { type: 'fifty_fifty' | 'extra_time' | 'skip' | 'double_points', question_id? }
// Security: validasi dan pengurangan quota dilakukan server-side via DB function.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, question_id } = body;

  const validTypes = ["fifty_fifty", "extra_time", "skip", "double_points"];
  if (!type || !validTypes.includes(type))
    return NextResponse.json(
      { error: `type must be one of: ${validTypes.join(", ")}` },
      { status: 400 },
    );

  try {
    // Gunakan powerup via DB function (validasi quota + mark used)
    const { data: result, error: puErr } = await supabase.rpc("use_powerup", {
      p_user_id: user.id,
      p_type: type,
    });

    if (puErr) throw new Error(puErr.message);
    if (result?.error)
      return NextResponse.json(
        { error: result.message ?? result.error },
        { status: 400 },
      );

    // Untuk 50:50 — return dua opsi salah yang dieliminasi
    let eliminated: string[] = [];
    if (type === "fifty_fifty" && question_id) {
      const { data: question } = await supabase
        .from("questions")
        .select("option_a, option_b, option_c, option_d, correct_option")
        .eq("id", Number(question_id))
        .single();

      if (question) {
        const allOptions = ["A", "B", "C", "D"];
        const wrongOptions = allOptions.filter(
          (o) => o !== question.correct_option,
        );
        // Pilih 2 yang dieliminasi secara random
        eliminated = wrongOptions.sort(() => Math.random() - 0.5).slice(0, 2);
      }
    }

    return NextResponse.json({
      success: true,
      type,
      eliminated, // hanya terisi untuk fifty_fifty
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[POST /api/trivia/powerups/use]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
