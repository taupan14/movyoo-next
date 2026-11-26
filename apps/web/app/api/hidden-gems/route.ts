/**
 * app/api/hidden-gems/route.ts
 *
 * Edge Function — Weekly Hidden Gems
 *
 * GET /api/hidden-gems?lang=id&region=ID
 *
 * Header Authorization: Bearer <supabase_jwt>  (opsional — untuk personalisasi)
 *
 * Response:
 * {
 *   movies: HiddenGem[],
 *   series: HiddenGem[],
 *   topGenreId: number | null,
 *   personalized: boolean
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchHiddenGems } from "@/lib/hidden-gems-db";

export const runtime = "edge";

// Cache revalidate 1 jam — hidden gems tidak berubah tiap menit
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") ?? "id";

  // ── Cek user dari JWT (opsional) ──────────────────────────────────────────
  let userId: string | null = null;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      // Gunakan supabase anon client untuk verify JWT
      const supabaseAuth = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await supabaseAuth.auth.getUser(token);
      userId = data.user?.id ?? null;
    } catch {
      // Token invalid → tetap lanjut tanpa personalisasi
    }
  }

  try {
    const result = await fetchHiddenGems(lang, userId);

    return NextResponse.json(
      {
        ...result,
        personalized: userId !== null && result.topGenreId !== null,
      },
      {
        headers: {
          // Browser cache 30 menit, CDN cache 1 jam
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
        },
      },
    );
  } catch (e) {
    console.error("[/api/hidden-gems] error:", e);
    return NextResponse.json(
      { movies: [], series: [], topGenreId: null, personalized: false },
      { status: 500 },
    );
  }
}
