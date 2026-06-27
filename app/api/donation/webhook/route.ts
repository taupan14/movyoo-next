/**
 * POST /api/donation/webhook
 *
 * Endpoint ini didaftarkan di dashboard Saweria:
 *   Saweria Dashboard → Integrations → Webhook → URL
 *
 * Flow otomatis:
 *   Saweria kirim POST → verifikasi signature → simpan ke DB
 *   → jika email cocok dengan akun Movyoo → show_ads = false otomatis
 *
 * Env yang dibutuhkan:
 *   SAWERIA_STREAM_KEY  — Stream Key dari Saweria Dashboard
 *   WEBHOOK_SECRET      — (opsional) secret tambahan untuk extra security
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseService } from "@/lib/supabase-server";

// ─── Saweria Payload Type ─────────────────────────────────────────────────────
interface SaweriaPayload {
  version: string; // "2022.01"
  created_at: string; // ISO timestamp
  id: string; // UUID transaksi — gunakan sebagai idempotency key
  type: "donation";
  amount_raw: number; // nominal sebelum potongan (IDR)
  cut: number; // potongan Saweria
  donator_name: string;
  donator_email: string;
  donator_is_user: boolean; // true jika donator punya akun Saweria
  message: string;
  etc?: {
    amount_to_display?: number;
  };
}

// ─── Verifikasi Signature Saweria ─────────────────────────────────────────────
/**
 * Saweria mengirim header: Saweria-Callback-Signature
 * Value: HMAC-SHA256(rawBody, streamKey) dalam hex
 *
 * Docs: https://gitlab.com/chez14/saweria-webhook-documentation
 */
function verifySignature(rawBody: string, signature: string): boolean {
  const streamKey = process.env.SAWERIA_STREAM_KEY;

  if (!streamKey) {
    console.error("[webhook] SAWERIA_STREAM_KEY tidak di-set!");
    return false;
  }

  if (!signature) return false;

  const expected = createHmac("sha256", streamKey)
    .update(rawBody)
    .digest("hex");

  // timingSafeEqual mencegah timing attack
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(signature, "hex");

    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Baca raw body untuk verifikasi signature
  //    (harus raw string, bukan parsed JSON)
  const rawBody = await req.text();

  // 2. Ambil signature dari header
  const signature =
    req.headers.get("Saweria-Callback-Signature") ??
    req.headers.get("saweria-callback-signature") ??
    "";

  // 3. Verifikasi signature
  if (!verifySignature(rawBody, signature)) {
    console.warn("[webhook] Signature tidak valid — request ditolak");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 4. Parse payload
  let payload: SaweriaPayload;
  try {
    payload = JSON.parse(rawBody) as SaweriaPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 5. Hanya proses type "donation"
  if (payload.type !== "donation") {
    // Saweria mungkin kirim event lain di masa depan — acknowledge saja
    return NextResponse.json({ status: "ignored", type: payload.type });
  }

  // 6. Validasi field wajib
  if (!payload.id || !payload.donator_email || !payload.amount_raw) {
    console.error("[webhook] Payload tidak lengkap:", payload);
    return NextResponse.json({ error: "Incomplete payload" }, { status: 400 });
  }

  console.log(
    `[webhook] Donasi masuk: ${payload.donator_name} (${payload.donator_email}) — Rp ${payload.amount_raw.toLocaleString("id")}`,
  );

  // 7. Proses via Supabase (service role — bypass RLS)
  try {
    const supabase = createSupabaseService();

    const { data, error } = await supabase.rpc("confirm_donation_webhook", {
      p_saweria_id: payload.id,
      p_donator_name: payload.donator_name,
      p_donator_email: payload.donator_email,
      p_amount_raw: payload.amount_raw,
      p_message: payload.message ?? "",
      p_saweria_version: payload.version,
      p_created_at: payload.created_at,
      p_payload: payload, // simpan raw payload untuk audit
    });

    if (error) {
      console.error("[webhook] RPC error:", error);
      // Return 500 agar Saweria bisa retry
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const result = data as {
      status: "ok" | "duplicate";
      matched: boolean;
      user_id: string | null;
    };

    if (result.status === "duplicate") {
      console.log(`[webhook] Duplicate event ${payload.id} — ignored`);
      return NextResponse.json({ status: "duplicate" });
    }

    console.log(
      result.matched
        ? `[webhook] ✅ User ${result.user_id} sekarang bebas iklan`
        : `[webhook] ℹ️ Email ${payload.donator_email} tidak cocok dengan akun manapun — donasi dicatat`,
    );

    // Harus return 2xx agar Saweria tidak retry
    return NextResponse.json({
      status: "ok",
      matched: result.matched,
    });
  } catch (err) {
    console.error("[webhook] Unexpected error:", err);
    // Return 500 → Saweria akan retry otomatis
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Saweria hanya kirim POST — method lain tidak perlu
export async function GET() {
  return NextResponse.json(
    { message: "Saweria webhook endpoint — POST only" },
    { status: 405 },
  );
}
