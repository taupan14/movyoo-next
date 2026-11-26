// app/api/trivia/leaderboard/route.ts
// GET — Leaderboard global trivia mingguan.
// Query params: ?week=current|previous (default: current)
//
// Response: { week_start, entries: [{ rank, user_id, display_name, avatar_url,
//              weekly_score, sessions_count, perfect_count }], user_rank? }

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

const LIMIT = 50; // top 50 per minggu

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week") ?? "current";

  // Hitung week_start (Senin ISO)
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + (weekParam === "previous" ? -7 : 0));
  const weekStart = monday.toISOString().split("T")[0];

  try {
    // Ambil top 50 leaderboard minggu ini
    const { data: entries, error: lbErr } = await supabase
      .from("trivia_leaderboard")
      .select("user_id, weekly_score, sessions_count, perfect_count")
      .eq("week_start", weekStart)
      .order("weekly_score", { ascending: false })
      .limit(LIMIT);

    if (lbErr) throw new Error(lbErr.message);

    if (!entries?.length) {
      return NextResponse.json({
        week_start: weekStart,
        entries: [],
        user_rank: null,
      });
    }

    // Ambil profile untuk semua user di leaderboard
    const userIds = entries.map((e: any) => e.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", userIds);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    // Merge + tambah rank
    const ranked = entries.map((e: any, idx: number) => {
      const profile = profileMap.get(e.user_id);
      return {
        rank: idx + 1,
        user_id: e.user_id,
        display_name: profile?.display_name ?? profile?.username ?? "Anonymous",
        avatar_url: profile?.avatar_url ?? null,
        weekly_score: e.weekly_score,
        sessions_count: e.sessions_count,
        perfect_count: e.perfect_count,
        is_current_user: e.user_id === user.id,
      };
    });

    // Rank user saat ini (jika tidak ada di top 50)
    let userRank = ranked.find((e) => e.is_current_user) ?? null;

    if (!userRank) {
      // Hitung rank user di luar top 50
      const { count } = await supabase
        .from("trivia_leaderboard")
        .select("user_id", { count: "exact", head: true })
        .eq("week_start", weekStart)
        .gt(
          "weekly_score",
          (
            await supabase
              .from("trivia_leaderboard")
              .select("weekly_score")
              .eq("user_id", user.id)
              .eq("week_start", weekStart)
              .single()
          ).data?.weekly_score ?? 0,
        );

      const { data: userEntry } = await supabase
        .from("trivia_leaderboard")
        .select("weekly_score, sessions_count, perfect_count")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .single();

      if (userEntry) {
        const profile = profileMap.get(user.id);
        userRank = {
          rank: (count ?? 0) + 1,
          user_id: user.id,
          display_name: profile?.display_name ?? "Kamu",
          avatar_url: profile?.avatar_url ?? null,
          weekly_score: userEntry.weekly_score,
          sessions_count: userEntry.sessions_count,
          perfect_count: userEntry.perfect_count,
          is_current_user: true,
        };
      }
    }

    return NextResponse.json({
      week_start: weekStart,
      entries: ranked,
      user_rank: userRank,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[GET /api/trivia/leaderboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
