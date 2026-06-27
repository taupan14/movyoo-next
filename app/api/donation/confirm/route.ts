/**
 * POST /api/donation/confirm
 *
 * Dipanggil dari frontend ketika user sudah login dan mengklaim donasi.
 *
 * Dua skenario:
 *
 * A) Email akun Movyoo = email Saweria
 *    → Webhook sudah catat donasi, tinggal link ke user_id
 *    → Function claim_donation_by_user() akan match by email
 *
 * B) Email berbeda, atau donasi sebelum punya akun Movyoo
 *    → Honor system: user klaim manual
 *    → Tetap dicatat, verified = FALSE
 *
 * Body (opsional): { donor_name?: string, saweria_ref?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Kamu harus login untuk mengklaim reward ini." },
        { status: 401 },
      );
    }

    // Coba claim donasi yang masuk via webhook (match by email)
    const { data, error } = await supabase.rpc("claim_donation_by_user", {
      p_user_id: user.id,
      p_email: user.email ?? "",
    });

    if (error) {
      console.error("[/api/donation/confirm] RPC error:", error);
      return NextResponse.json(
        { error: "Gagal memproses klaim. Coba lagi." },
        { status: 500 },
      );
    }

    const result = data as {
      status: "ok" | "not_found";
      donation_id: number | null;
    };

    if (result.status === "not_found") {
      // Tidak ada donasi terverifikasi dengan email ini
      // Fallback: honor system — langsung catat sebagai unverified
      const body = await req.json().catch(() => ({}));
      const { error: fallbackError } = await supabase.rpc("confirm_donation", {
        p_user_id: user.id,
        p_donor_name: body.donor_name ?? user.email,
        p_amount: null,
        p_note: "Manual claim — belum terverifikasi webhook",
        p_saweria_ref: null,
      });

      if (fallbackError) {
        return NextResponse.json(
          { error: "Gagal menyimpan klaim." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        verified: false,
        message: "Klaim diterima. Donasi akan diverifikasi oleh tim kami.",
      });
    }

    return NextResponse.json({
      success: true,
      verified: true,
      message: "Donasi terverifikasi! Iklan telah dimatikan.",
    });
  } catch (err) {
    console.error("[/api/donation/confirm] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
