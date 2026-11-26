// app/api/contributor/request/route.ts — FILE BARU
//
// GET  → status pengajuan kontributor terbaru milik user + role saat ini
// POST → buat pengajuan baru (body: { reason?: string })

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: profile }, { data: latestRequest }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("contributor_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    role: profile?.role ?? "user",
    latestRequest: latestRequest ?? null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "contributor" || profile?.role === "admin") {
    return NextResponse.json(
      { error: "Kamu sudah menjadi kontributor" },
      { status: 400 },
    );
  }

  const { data: pending } = await supabase
    .from("contributor_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (pending) {
    return NextResponse.json(
      { error: "Kamu sudah punya pengajuan yang sedang direview" },
      { status: 400 },
    );
  }

  let reason: string | undefined;
  try {
    const body = await req.json();
    reason = body?.reason;
  } catch {
    // body kosong tetap boleh
  }

  const { data, error } = await supabase
    .from("contributor_requests")
    .insert({ user_id: user.id, reason: reason?.trim() || null })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}
