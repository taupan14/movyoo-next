// app/api/progression/me/route.ts
// GET — Ambil progression state user saat ini.

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getUserProgression } from "@/lib/progression";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Auto-init jika user belum punya progression — lewat security definer function
    await supabase.rpc("init_user_progression", { p_user_id: user.id });

    const progression = await getUserProgression(supabase, user.id);

    if (!progression) {
      return NextResponse.json(
        { error: "Failed to initialize progression" },
        { status: 500 },
      );
    }

    return NextResponse.json(progression);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[GET /api/progression/me]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
