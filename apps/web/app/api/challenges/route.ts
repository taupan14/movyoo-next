// app/api/challenges/route.ts
// GET — List challenge aktif + progress user untuk periode saat ini.
// Menggunakan DB function get_active_challenges yang sudah handle tier unlock logic.
//
// Query params:
//   ?feature=swipe|battle|trivia  (opsional, default: semua)
//   ?type=daily|weekly            (opsional, default: daily)
//
// Response: { challenges: ChallengeWithProgress[], period_start, by_feature }

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import type {
  ChallengeWithProgress,
  ChallengeFeature,
  ChallengeType,
  ChallengesByFeature,
} from "@/types/progression";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const featureFilter = searchParams.get(
      "feature",
    ) as ChallengeFeature | null;
    const typeFilter = (searchParams.get("type") ?? "daily") as ChallengeType;

    if (
      featureFilter &&
      !["swipe", "battle", "trivia"].includes(featureFilter)
    ) {
      return NextResponse.json(
        { error: "feature must be swipe, battle, or trivia" },
        { status: 400 },
      );
    }
    if (!["daily", "weekly"].includes(typeFilter)) {
      return NextResponse.json(
        { error: "type must be daily or weekly" },
        { status: 400 },
      );
    }

    // 2. Panggil DB function yang sudah handle tier unlock logic
    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient.rpc("get_active_challenges", {
      p_user_id: user.id,
      p_feature: featureFilter ?? null,
      p_type: typeFilter,
    });

    if (error) throw new Error(error.message);

    const challenges = (data?.challenges ?? []) as ChallengeWithProgress[];
    const periodStart = data?.period_start ?? "";

    // 3. Group by feature untuk kemudahan konsumsi UI
    const byFeature: ChallengesByFeature = {
      swipe: challenges.filter((c) => c.feature === "swipe"),
      battle: challenges.filter((c) => c.feature === "battle"),
      trivia: challenges.filter((c) => c.feature === "trivia"),
    };

    // 4. Summary stats per feature
    const stats = (["swipe", "battle", "trivia"] as ChallengeFeature[]).reduce(
      (acc, f) => {
        const list = byFeature[f];
        acc[f] = {
          total: list.length,
          completed: list.filter((c) => c.is_completed).length,
          active_tier: list[0]?.tier ?? null,
          all_done: list.length > 0 && list.every((c) => c.is_completed),
        };
        return acc;
      },
      {} as Record<
        ChallengeFeature,
        {
          total: number;
          completed: number;
          active_tier: number | null;
          all_done: boolean;
        }
      >,
    );

    return NextResponse.json({
      challenges,
      by_feature: byFeature,
      period_start: periodStart,
      stats,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[GET /api/challenges]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
