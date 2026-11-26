// app/api/movies/[id]/vote/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // service role client
import { createSupabaseServer } from "@/lib/supabase-server";
import { processAward } from "@/lib/progression";
import type { AwardMeta } from "@/types/progression";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const tmdbId = Number(params.id);
  if (Number.isNaN(tmdbId))
    return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });

  // Resolve tmdb_id → internal id
  const { data: movieRow } = await supabase
    .from("movies")
    .select("id")
    .eq("tmdb_id", tmdbId)
    .single();

  if (!movieRow)
    return NextResponse.json({ error: "Movie not found" }, { status: 404 });

  const movieId = movieRow.id;

  const [wiRes, paceRes, moodRes] = await Promise.all([
    supabase
      .from("movie_votes_worth_it")
      .select("vote, count")
      .eq("movie_id", movieId),
    supabase
      .from("movie_votes_pace")
      .select("vote, count")
      .eq("movie_id", movieId),
    supabase
      .from("movie_votes_mood")
      .select("mood, count")
      .eq("movie_id", movieId),
  ]);

  const worth_it = { yes: 0, skip: 0, fan: 0, total: 0 };
  for (const row of wiRes.data ?? []) {
    if (row.vote === "yes") worth_it.yes = Number(row.count);
    if (row.vote === "skip") worth_it.skip = Number(row.count);
    if (row.vote === "fan") worth_it.fan = Number(row.count);
  }
  worth_it.total = worth_it.yes + worth_it.skip + worth_it.fan;

  const pace = { slow: 0, medium: 0, fast: 0, total: 0 };
  for (const row of paceRes.data ?? []) {
    if (row.vote === "slow") pace.slow = Number(row.count);
    if (row.vote === "medium") pace.medium = Number(row.count);
    if (row.vote === "fast") pace.fast = Number(row.count);
  }
  pace.total = pace.slow + pace.medium + pace.fast;

  const moods: Record<string, number> = {};
  for (const row of moodRes.data ?? []) {
    moods[row.mood] = Number(row.count);
  }

  return NextResponse.json({ worth_it, pace, moods });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const tmdbId = Number(params.id);
  if (Number.isNaN(tmdbId))
    return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });

  const body = await req.json();
  const { type, vote, action } = body;

  if (!type || !vote || !action)
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  // ── Resolve tmdb_id → internal id ────────────────────────────────────────
  const { data: movieRow, error: movieErr } = await supabase
    .from("movies")
    .select("id")
    .eq("tmdb_id", tmdbId)
    .single();

  if (movieErr || !movieRow)
    return NextResponse.json({ error: "Movie not found" }, { status: 404 });

  const movieId = movieRow.id;
  if (Number.isNaN(movieId))
    return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });

  const fnMap: Record<string, Record<string, string>> = {
    worth_it: {
      add: "increment_vote_worth_it",
      remove: "decrement_vote_worth_it",
    },
    pace: {
      add: "increment_vote_pace",
      remove: "decrement_vote_pace",
    },
    mood: {
      add: "increment_vote_mood",
      remove: "decrement_vote_mood",
    },
  };

  const fn = fnMap[type]?.[action];
  if (!fn)
    return NextResponse.json({ error: "Unknown vote type" }, { status: 400 });

  const rpcParams =
    type === "mood"
      ? { p_movie_id: movieId, p_mood: vote }
      : { p_movie_id: movieId, p_vote: vote };

  const { error } = await supabase.rpc(fn, rpcParams);

  if (error) {
    console.error("[vote] rpc error:", fn, rpcParams, error);
    return NextResponse.json(
      { error: error.message, details: error.details, hint: error.hint },
      { status: 500 },
    );
  }

  // ── +XP: hanya untuk action='add', hanya pertama kali vote film ini ──────
  // Cek dari auth user — fire and forget
  if (action === "add") {
    createSupabaseServer()
      .then(async (authClient) => {
        const {
          data: { user },
        } = await authClient.auth.getUser();
        if (!user) return;

        // Cek apakah user sudah pernah vote film ini sebelumnya
        // dengan melihat xp_transactions untuk movie_review + ref_id ini
        const { data: prevVote } = await authClient
          .from("xp_transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("source", "movie_review")
          .eq("ref_id", movieId)
          .maybeSingle();

        // Sudah pernah vote film ini → tidak dapat XP lagi
        if (prevVote) return;

        const meta: AwardMeta = {
          media_type: "movie",
          movie_id: movieId,
          tmdb_id: tmdbId,
          vote_type: type,
        };

        await processAward(
          authClient,
          user.id,
          "movie_review",
          undefined,
          movieId,
          meta,
        );
      })
      .catch((err) => console.error("[vote] processAward:", err));
  }

  return NextResponse.json({ ok: true });
}
