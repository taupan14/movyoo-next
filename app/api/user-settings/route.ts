/**
 * GET  /api/user-settings  — ambil settings user yang sedang login
 * PATCH /api/user-settings — update settings (misal show_ads)
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = createSupabaseServer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pakai security definer function agar RLS tidak block anon key
  const { data, error } = await supabase.rpc("get_user_settings", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("[/api/user-settings] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Kalau belum ada row (user baru), return default
  const settings = data?.[0] ?? { show_ads: true };

  return NextResponse.json(settings);
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { show_ads } = body as { show_ads?: boolean };

  if (typeof show_ads !== "boolean") {
    return NextResponse.json(
      { error: "Field show_ads harus boolean" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, show_ads }, { onConflict: "user_id" });

  if (error) {
    console.error("[/api/user-settings] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, show_ads });
}
