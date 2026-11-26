// app/api/achievements/route.ts
// GET — List semua achievement beserta progress user.
//
// Untuk collection achievements, progress dihitung real-time dari
// check_collection_achievement karena hitungannya berdasarkan jumlah
// film yang di-like, bukan counter increment biasa.
//
// Query params: ?category=genre|director|activity|collection|social|secret

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import type {
  Achievement,
  UserAchievement,
  AchievementWithProgress,
  AchievementCategory,
} from "@/types/progression";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get(
      "category",
    ) as AchievementCategory | null;

    if (
      categoryFilter &&
      ![
        "genre",
        "director",
        "activity",
        "collection",
        "social",
        "secret",
      ].includes(categoryFilter)
    ) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // ── 1. Ambil master achievements ─────────────────────────────────────────
    let achQuery = supabase
      .from("achievements")
      .select("*")
      .order("sort_order", { ascending: true });

    if (categoryFilter) achQuery = achQuery.eq("category", categoryFilter);

    const { data: achievements, error: achError } = await achQuery;
    if (achError) throw new Error(achError.message);

    // ── 2. Ambil user_achievements (progress standard) ───────────────────────
    const { data: userAchs, error: uaError } = await supabase
      .from("user_achievements")
      .select("*")
      .eq("user_id", user.id);

    if (uaError) throw new Error(uaError.message);

    const uaMap = new Map<string, UserAchievement>();
    for (const ua of (userAchs ?? []) as UserAchievement[]) {
      uaMap.set(ua.achievement_key, ua);
    }

    // ── 3. Collection achievements: hitung progress real-time ────────────────
    // Ambil semua achievement yang punya criteria collection_key
    const collectionAchs = (achievements as Achievement[]).filter(
      (a) => a.criteria && (a.criteria as any).collection_key,
    );

    // Fetch progress collection dari DB function untuk semua collection sekaligus
    // Caranya: ambil semua liked movies/series user, lalu cek per collection
    const collectionProgressMap = new Map<
      string,
      { progress: number; target: number }
    >();

    if (collectionAchs.length > 0) {
      // Ambil semua item yang user sudah like
      const { data: likedMovies } = await supabase
        .from("user_liked")
        .select("movie_id, series_id, media_type")
        .eq("user_id", user.id);

      // Untuk setiap collection achievement, hitung berapa yang sudah di-like
      for (const ach of collectionAchs) {
        const collectionKey = (ach.criteria as any).collection_key;

        // Ambil semua item dalam collection ini
        const { data: collectionItems } = await supabase
          .from("collection_items")
          .select("movie_id, series_id, collection_id, collections!inner(key)")
          .eq("collections.key", collectionKey);

        if (!collectionItems || collectionItems.length === 0) continue;

        const total = collectionItems.length;
        const likedSet = new Set(
          (likedMovies ?? []).map((l) =>
            l.media_type === "movie"
              ? `movie_${l.movie_id}`
              : `tv_${l.series_id}`,
          ),
        );

        const liked = collectionItems.filter((item) =>
          item.movie_id
            ? likedSet.has(`movie_${item.movie_id}`)
            : likedSet.has(`tv_${item.series_id}`),
        ).length;

        collectionProgressMap.set(ach.key, { progress: liked, target: total });
      }
    }

    // ── 4. Merge semua data ──────────────────────────────────────────────────
    const enriched = (achievements as Achievement[]).map((a) => {
      const ua = uaMap.get(a.key) ?? null;
      const isUnlocked = ua?.unlocked_at != null;

      // Untuk collection achievement: pakai real-time progress
      const collProgress = collectionProgressMap.get(a.key);
      const progress = collProgress
        ? collProgress.progress
        : (ua?.progress ?? 0);
      const target = collProgress ? collProgress.target : a.target;

      // Secret achievement: sembunyikan info sampai unlock
      const displayName = a.is_secret && !isUnlocked ? "???" : a.name;
      const displayDescription =
        a.is_secret && !isUnlocked
          ? "Selesaikan sesuatu yang istimewa untuk mengungkap achievement ini."
          : a.description;

      return {
        ...a,
        target, // override target untuk collection (dinamis)
        user_achievement: ua,
        progress,
        is_unlocked: isUnlocked,
        display_name: displayName,
        display_description: displayDescription,
      } satisfies AchievementWithProgress;
    });

    // ── 5. Stats ─────────────────────────────────────────────────────────────
    const unlockedCount = enriched.filter((a) => a.is_unlocked).length;

    // Group by category untuk UI
    const byCategory = enriched.reduce(
      (acc, a) => {
        if (!acc[a.category]) acc[a.category] = [];
        acc[a.category].push(a);
        return acc;
      },
      {} as Record<AchievementCategory, AchievementWithProgress[]>,
    );

    return NextResponse.json({
      achievements: enriched,
      by_category: byCategory,
      stats: {
        unlocked: unlockedCount,
        total: enriched.length,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[GET /api/achievements]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
