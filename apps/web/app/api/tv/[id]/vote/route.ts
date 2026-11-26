/**
 * app/api/tv/[id]/vote/route.ts
 *
 * GET  — Ambil vote counts untuk TV series
 * POST — Submit / remove vote
 *
 * Menggunakan tabel:
 *   tv_votes_mood(series_id, mood, count)
 *   tv_votes_pace(series_id, vote, count)
 *   tv_votes_worth_it(series_id, vote, count)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  // id here is the internal series id (not tmdb_id)
  const seriesId = parseInt(params.id, 10);
  if (isNaN(seriesId))
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    const [worthRes, paceRes, moodRes] = await Promise.all([
      supabase
        .from("tv_votes_worth_it")
        .select("vote, count")
        .eq("series_id", seriesId),
      supabase
        .from("tv_votes_pace")
        .select("vote, count")
        .eq("series_id", seriesId),
      supabase
        .from("tv_votes_mood")
        .select("mood, count")
        .eq("series_id", seriesId),
    ]);

    const worth_it = { yes: 0, skip: 0, fan: 0, total: 0 };
    for (const r of worthRes.data ?? []) {
      const v = r.vote as "yes" | "skip" | "fan";
      if (v in worth_it) {
        worth_it[v] = Number(r.count);
      }
    }
    worth_it.total = worth_it.yes + worth_it.skip + worth_it.fan;

    const pace = { slow: 0, medium: 0, fast: 0, total: 0 };
    for (const r of paceRes.data ?? []) {
      const v = r.vote as "slow" | "medium" | "fast";
      if (v in pace) {
        pace[v] = Number(r.count);
      }
    }
    pace.total = pace.slow + pace.medium + pace.fast;

    const moods: Record<string, number> = {};
    for (const r of moodRes.data ?? []) {
      moods[r.mood] = Number(r.count);
    }

    return NextResponse.json(
      { worth_it, pace, moods },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    console.error("[tv/vote] GET error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const seriesId = parseInt(params.id, 10);
  if (isNaN(seriesId))
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({}));
    const { type, vote, action } = body as {
      type: "worth_it" | "pace" | "mood";
      vote: string;
      action: "add" | "remove";
    };

    if (!type || !vote || !action) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const delta = action === "add" ? 1 : -1;

    if (type === "worth_it") {
      await supabase.rpc("upsert_tv_vote_worth_it", {
        p_series_id: seriesId,
        p_vote: vote,
        p_delta: delta,
      });
    } else if (type === "pace") {
      await supabase.rpc("upsert_tv_vote_pace", {
        p_series_id: seriesId,
        p_vote: vote,
        p_delta: delta,
      });
    } else if (type === "mood") {
      await supabase.rpc("upsert_tv_vote_mood", {
        p_series_id: seriesId,
        p_mood: vote,
        p_delta: delta,
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[tv/vote] POST error:", err);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
