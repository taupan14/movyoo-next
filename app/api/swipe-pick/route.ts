/**
 * GET /api/swipe-pick
 *
 * Mengembalikan batch item untuk Swipe Pick feed.
 * Semua data dibaca dari user_recommendation_pool — zero JOIN.
 *
 * Auth:
 *   - Logged-in → pool personal user (user_type='user')
 *   - Guest     → shared guest pool  (user_type='guest')
 *
 * Query params:
 *   lang   — 'id' | 'en'  (default: 'en')
 *   limit  — jumlah item  (default: 10, max: 20)
 *
 * Response:
 *   {
 *     items:    SwipeFeedItem[],
 *     source:   'pool' | 'guest_pool',
 *     poolLeft: number | null,   // null jika guest
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchSwipeFeed, fetchGuestFeed, getPoolCount } from "@/lib/swipe-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 20);

  // ── Auth ────────────────────────────────────────────────────────────────
  const cookieStore = cookies();
  const supabaseServer = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* server component */
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  try {
    // ── Guest → shared guest pool ────────────────────────────────────────
    if (!user) {
      const items = await fetchGuestFeed(limit);
      return NextResponse.json({
        items,
        source: "guest_pool",
        poolLeft: null,
      });
    }

    // ── Logged-in → personal pool ────────────────────────────────────────
    const items = await fetchSwipeFeed(user.id, limit);

    // Pool kosong / belum di-generate → fallback ke guest pool
    if (items.length === 0) {
      const fallback = await fetchGuestFeed(limit);
      return NextResponse.json({
        items: fallback,
        source: "guest_pool",
        poolLeft: 0,
      });
    }

    const poolLeft = await getPoolCount(user.id);

    return NextResponse.json({
      items,
      source: "pool",
      poolLeft,
    });
  } catch (err) {
    console.error("[/api/swipe-pick] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
