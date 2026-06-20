// app/api/swipe-pick/swipe/route.ts
// POST — Rekam aksi swipe + award XP jika action = 'like'.
//
// Body:
//   mediaType   : 'movie' | 'tv'
//   movieId?    : number   — wajib jika mediaType = 'movie'
//   seriesId?   : number   — wajib jika mediaType = 'tv'
//   action      : 'like' | 'dislike'
//   poolId?     : number
//
// Security:
//   Genre ids, vote_avg, vote_count, release_year TIDAK diambil dari body.
//   Server lookup langsung ke tabel movies / tv_series berdasarkan ID.
//   Frontend tidak bisa inject nilai palsu untuk memanipulasi XP / challenge.
//   XP hanya diberikan untuk action = 'like'.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recordSwipe, SwipeAction, MediaType } from "@/lib/swipe-db";
import { processAward, getUserProgression } from "@/lib/progression";
import type { AwardMeta } from "@/types/progression";

const VALID_ACTIONS: SwipeAction[] = ["like", "dislike"];
const VALID_MEDIA: MediaType[] = ["movie", "tv"];

// ─── Server-side media context lookup ─────────────────────────────────────────
// Fetch genre_ids, vote_avg, vote_count, release_year langsung dari DB.
// Tidak mempercayai nilai yang dikirim frontend.
async function fetchMediaContext(
  client: any,
  mediaType: MediaType,
  movieId?: number,
  seriesId?: number,
): Promise<{
  genre_ids: number[];
  vote_avg: number;
  vote_count: number;
  release_year: number | null;
} | null> {
  if (mediaType === "movie" && movieId) {
    const { data, error } = await client
      .from("movies")
      .select("genre_ids, vote_average, vote_count, release_date")
      .eq("id", movieId)
      .single();

    if (error || !data) return null;

    return {
      genre_ids: data.genre_ids ?? [],
      vote_avg: data.vote_average ?? 0,
      vote_count: data.vote_count ?? 0,
      release_year: data.release_date
        ? new Date(data.release_date).getFullYear()
        : null,
    };
  }

  if (mediaType === "tv" && seriesId) {
    const { data, error } = await client
      .from("tv_series")
      .select("genre_ids, vote_average, vote_count, first_air_date")
      .eq("id", seriesId)
      .single();

    if (error || !data) return null;

    return {
      genre_ids: data.genre_ids ?? [],
      vote_avg: data.vote_average ?? 0,
      vote_count: data.vote_count ?? 0,
      release_year: data.first_air_date
        ? new Date(data.first_air_date).getFullYear()
        : null,
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
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

  // ── Parse & validasi body ──────────────────────────────────────────────────
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

  try {
    // ── Rekam swipe (existing logic) ───────────────────────────────────────
    const result = await recordSwipe({
      client: supabaseServer,
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

    // ── Award XP — hanya untuk 'like', tidak untuk 'dislike' ──────────────
    let xpResult = null;

    if (action === "like") {
      // Lookup context dari DB — bukan dari body request
      const mediaCtx = await fetchMediaContext(
        supabaseServer,
        mediaType,
        movieId ? Number(movieId) : undefined,
        seriesId ? Number(seriesId) : undefined,
      );

      // Bangun meta dari data DB — bukan dari input user
      const meta: AwardMeta = {
        media_type: mediaType,
        movie_id: mediaType === "movie" ? Number(movieId) : undefined,
        series_id: mediaType === "tv" ? Number(seriesId) : undefined,
        genre_ids: mediaCtx?.genre_ids ?? [],
        vote_avg: mediaCtx?.vote_avg ?? 0,
        vote_count: mediaCtx?.vote_count ?? 0,
        release_year: mediaCtx?.release_year ?? null,
      };

      const refId = mediaType === "movie" ? Number(movieId) : Number(seriesId);

      // processAward menangani:
      // 1. Award +1 XP (swipe_like)
      // 2. Update challenge progress (dengan evaluasi tier + condition)
      // 3. Update achievement progress (genre, activity, dsb)
      // 4. Auto-claim reward jika challenge/achievement baru selesai
      // 5. Streak check + bonus
      const {
        awards,
        completed_challenges,
        achievement_updates,
        streak_result,
      } = await processAward(
        supabaseServer,
        user.id,
        "swipe_like",
        undefined,
        refId,
        meta,
      );

      // ── Session complete: award +20 XP +10 Points setiap kelipatan 20 swipe like ──
      // Dihitung server-side dari user_swipes hari ini — tidak bisa dimanipulasi
      const { count: todayLikes } = await supabaseServer
        .from("user_swipes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("action", "like")
        .gte("swiped_at", new Date().toISOString().split("T")[0]);

      if (todayLikes && todayLikes % 20 === 0) {
        const sessionResult = await processAward(
          supabaseServer,
          user.id,
          "swipe_session_complete",
          undefined,
          undefined,
          { media_type: mediaType, session_count: Math.floor(todayLikes / 20) },
        );
        awards.push(...sessionResult.awards);
        completed_challenges.push(...sessionResult.completed_challenges);
        achievement_updates.push(...sessionResult.achievement_updates);
      }

      const progression = await getUserProgression(supabaseServer, user.id);

      xpResult = {
        awards,
        completed_challenges,
        achievement_updates,
        streak_result, // null jika bukan swipe pertama hari ini
        progression,
      };
    }

    return NextResponse.json({
      success: true,
      isLiked: result.isLiked,
      poolLow: result.poolLow,
      // xp_result hanya ada jika action = 'like'
      // null jika dislike — frontend tidak perlu update progression
      xp_result: xpResult,
    });
  } catch (err) {
    console.error("[/api/swipe-pick/swipe] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
