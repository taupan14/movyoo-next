// app/api/progression/award/route.ts
// POST — Award XP/Points/Tickets ke user berdasarkan aksi yang dilakukan.
// Dipanggil oleh frontend setiap kali user melakukan aksi yang menghasilkan reward.
//
// Body: {
//   source: XpSource,
//   meta?: {
//     media_type?: 'movie' | 'tv',
//     movie_id?: number,      -- wajib jika media_type = 'movie'
//     series_id?: number,     -- wajib jika media_type = 'tv'
//     genre_ids?: number[],   -- untuk trigger genre achievements
//     tmdb_id?: number,
//     ...extra
//   }
// }
// Response: { awards, completed_challenges, achievement_updates, progression }

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { processAward, getUserProgression } from "@/lib/progression";
import type { AwardRequestBody, AwardMeta } from "@/types/progression";

const VALID_SOURCES = [
  "swipe_like",
  "swipe_session_complete",
  "watchlist_add",
  "movie_rate",
  "movie_review",
  "battle_win",
  "trivia_correct",
  "trivia_session_complete",
  "friend_challenge_win",
  "collection_complete",
] as const;

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validasi body
    const body: AwardRequestBody = await request.json();

    if (!body.source) {
      return NextResponse.json(
        { error: "source is required" },
        { status: 400 },
      );
    }

    // Hanya izinkan source yang bisa dipanggil dari frontend
    // admin_grant, daily_challenge, weekly_challenge tidak bisa dipanggil langsung
    if (
      !VALID_SOURCES.includes(body.source as (typeof VALID_SOURCES)[number])
    ) {
      return NextResponse.json(
        { error: `Invalid source: ${body.source}` },
        { status: 400 },
      );
    }

    // 3. Validasi dan normalise meta
    const meta: AwardMeta = body.meta ?? {};

    if (meta.media_type) {
      if (!["movie", "tv"].includes(meta.media_type)) {
        return NextResponse.json(
          { error: "meta.media_type must be 'movie' or 'tv'" },
          { status: 400 },
        );
      }
      if (meta.media_type === "movie" && !meta.movie_id) {
        return NextResponse.json(
          { error: "meta.movie_id is required when media_type is 'movie'" },
          { status: 400 },
        );
      }
      if (meta.media_type === "tv" && !meta.series_id) {
        return NextResponse.json(
          { error: "meta.series_id is required when media_type is 'tv'" },
          { status: 400 },
        );
      }
    }

    // Normalise ref_id: gunakan movie_id atau series_id dari meta
    // supaya xp_transactions.ref_id selalu terisi dengan benar
    const refId =
      body.ref_id ??
      (meta.media_type === "movie"
        ? meta.movie_id
        : meta.media_type === "tv"
          ? meta.series_id
          : undefined);

    // 4. Proses award
    const { awards, completed_challenges, achievement_updates } =
      await processAward(
        supabase,
        user.id,
        body.source,
        undefined,
        refId,
        meta,
      );

    // 5. Ambil progression terbaru untuk dikirim ke frontend
    const progression = await getUserProgression(supabase, user.id);

    return NextResponse.json({
      success: true,
      awards,
      completed_challenges,
      achievement_updates,
      progression,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[POST /api/progression/award]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
