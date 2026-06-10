/**
 * POST /api/swipe-pick/swipe
 *
 * Merekam aksi swipe user (like / dislike).
 * Hanya untuk user yang sudah login — guest tidak disimpan ke DB.
 *
 * Request body:
 *   {
 *     mediaType: 'movie' | 'tv',
 *     movieId?:  number,
 *     seriesId?: number,
 *     action:    'like' | 'dislike',
 *     poolId?:   number,
 *   }
 *
 * Response 200:
 *   { success: true, isLiked: boolean, poolLow: boolean }
 *
 * Response 401:
 *   { error: 'Unauthorized' }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recordSwipe, SwipeAction, MediaType } from "@/lib/swipe-db";

const VALID_ACTIONS: SwipeAction[] = ["like", "dislike"];
const VALID_MEDIA: MediaType[] = ["movie", "tv"];

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
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

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse & validasi body ────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { mediaType, movieId, seriesId, action, poolId } = body;

  if (!VALID_MEDIA.includes(mediaType)) {
    return NextResponse.json(
      { error: "mediaType must be 'movie' or 'tv'" },
      { status: 400 },
    );
  }
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "action must be 'like' or 'dislike'" },
      { status: 400 },
    );
  }
  if (mediaType === "movie" && !movieId) {
    return NextResponse.json(
      { error: "movieId required for mediaType 'movie'" },
      { status: 400 },
    );
  }
  if (mediaType === "tv" && !seriesId) {
    return NextResponse.json(
      { error: "seriesId required for mediaType 'tv'" },
      { status: 400 },
    );
  }

  // ── Rekam swipe ──────────────────────────────────────────────────────────
  try {
    const result = await recordSwipe({
      userId: user.id,
      mediaType,
      movieId: movieId ? Number(movieId) : undefined,
      seriesId: seriesId ? Number(seriesId) : undefined,
      action,
      poolId: poolId ? Number(poolId) : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to record swipe" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      isLiked: result.isLiked,
      poolLow: result.poolLow,
    });
  } catch (err) {
    console.error("[/api/swipe-pick/swipe] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
