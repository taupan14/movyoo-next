// app/api/lucky-draw/route.ts
//
// GET  — Ambil history lucky draw user + jumlah tiket yang dimiliki
// POST — Submit tiket untuk ikut lucky draw bulan ini
//
// Draw period format: 'YYYY-MM' (contoh: '2025-06')
// Tiket diambil dari user_progression.lucky_tickets
// Setiap submit mengurangi tiket dan menambah entry ke lucky_draw_entries

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { processAward } from "@/lib/progression";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── GET /api/lucky-draw ───────────────────────────────────────────────────────
// Response:
//   tickets         : jumlah tiket yang dimiliki saat ini
//   current_period  : periode bulan ini
//   entries_this_month: berapa tiket sudah disubmit bulan ini
//   history         : riwayat semua entry (termasuk yang menang)
export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentPeriod = getCurrentPeriod();

  // Ambil jumlah tiket dari user_progression
  const { data: progression } = await supabase
    .from("user_progression")
    .select("lucky_tickets")
    .eq("user_id", user.id)
    .single();

  // Ambil history lucky draw
  const { data: history, error: historyError } = await supabase
    .from("lucky_draw_entries")
    .select("id, draw_period, tickets_used, entered_at, is_winner, prize")
    .eq("user_id", user.id)
    .order("entered_at", { ascending: false });

  if (historyError)
    return NextResponse.json({ error: historyError.message }, { status: 500 });

  // Hitung total tiket yang sudah disubmit bulan ini
  const entriesThisMonth = (history ?? [])
    .filter((e) => e.draw_period === currentPeriod)
    .reduce((sum, e) => sum + e.tickets_used, 0);

  return NextResponse.json({
    tickets: progression?.lucky_tickets ?? 0,
    current_period: currentPeriod,
    entries_this_month: entriesThisMonth,
    history: history ?? [],
  });
}

// ─── POST /api/lucky-draw ──────────────────────────────────────────────────────
// Body: { tickets_to_use: number }  — minimal 1, maksimal semua tiket yang dimiliki
//
// Flow:
//   1. Validasi jumlah tiket cukup
//   2. Kurangi tiket via award_currency (amount negatif)
//   3. Insert ke lucky_draw_entries
//   4. Return entry baru + sisa tiket
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

  const ticketsToUse = Number(body.tickets_to_use ?? 1);

  if (!Number.isInteger(ticketsToUse) || ticketsToUse < 1) {
    return NextResponse.json(
      { error: "tickets_to_use harus berupa integer minimal 1" },
      { status: 400 },
    );
  }

  const currentPeriod = getCurrentPeriod();

  // ── Cek saldo tiket ─────────────────────────────────────────────────────
  const { data: progression } = await supabase
    .from("user_progression")
    .select("lucky_tickets")
    .eq("user_id", user.id)
    .single();

  const currentTickets = progression?.lucky_tickets ?? 0;

  if (currentTickets < ticketsToUse) {
    return NextResponse.json(
      {
        error: `Tiket tidak cukup. Dimiliki: ${currentTickets}, dibutuhkan: ${ticketsToUse}`,
      },
      { status: 400 },
    );
  }

  try {
    // ── Kurangi tiket via award_currency (amount negatif) ────────────────
    // Lewat security definer function — tetap aman
    const { error: deductError } = await supabase.rpc("award_currency", {
      p_user_id: user.id,
      p_amount: -ticketsToUse, // negatif = kurangi
      p_currency: "tickets",
      p_source: "admin_grant", // source untuk deduction
      p_ref_id: null,
      p_meta: { reason: "lucky_draw_entry", period: currentPeriod },
    });

    if (deductError) {
      return NextResponse.json({ error: deductError.message }, { status: 500 });
    }

    // ── Insert entry ke lucky_draw_entries ───────────────────────────────
    const { data: entry, error: entryError } = await supabase
      .from("lucky_draw_entries")
      .insert({
        user_id: user.id,
        draw_period: currentPeriod,
        tickets_used: ticketsToUse,
        entered_at: new Date().toISOString(),
        is_winner: false,
        prize: null,
      })
      .select()
      .single();

    if (entryError) {
      return NextResponse.json({ error: entryError.message }, { status: 500 });
    }

    // ── Ambil sisa tiket terbaru ─────────────────────────────────────────
    const { data: updatedProgression } = await supabase
      .from("user_progression")
      .select("lucky_tickets")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({
      success: true,
      entry,
      tickets_remaining: updatedProgression?.lucky_tickets ?? 0,
      current_period: currentPeriod,
      message: `Berhasil ikut lucky draw! ${ticketsToUse} tiket digunakan.`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[POST /api/lucky-draw]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
