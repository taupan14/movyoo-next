// lib/progression/index.ts
// Helper functions yang dipanggil oleh API routes.
//
// TIDAK menggunakan service role key.
// Semua write operation lewat security definer DB functions.
// Semua direct read pakai authenticated client yang diteruskan dari API route.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import type {
  XpSource,
  CurrencyType,
  AwardResult,
  CompletedChallenge,
  AchievementProgress,
  ProgressionWithLevel,
  LevelThreshold,
  UserProgression,
  AwardMeta,
  StreakResult,
  StreakBonus,
} from "@/types/progression";
import {
  getAwardConfig,
  resolveAchievementKeys,
  COMPLEX_ACHIEVEMENT_TRIGGERS,
} from "./xp-config";

// ─── Audit operasi DB ─────────────────────────────────────────────────────────
//
// rpc("award_currency")                → security definer ✅ anon ok
// rpc("increment_challenge_progress")  → security definer ✅ anon ok
// rpc("increment_achievement_progress")→ security definer ✅ anon ok
// rpc("mark_challenge_rewarded")       → security definer ✅ anon ok  (baru)
// rpc("mark_achievement_rewarded")     → security definer ✅ anon ok  (baru)
// .from("user_progression").select()   → RLS select own  ✅ anon ok
// .from("level_thresholds").select()   → RLS select all  ✅ anon ok
//
// Kesimpulan: tidak ada yang butuh service role key.

// ─── Anon client — untuk operasi yang tidak butuh auth context ────────────────
// Dipakai ketika tidak ada authenticated client tersedia (jarang).
function getAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      `Missing Supabase env variables.\n` +
        `NEXT_PUBLIC_SUPABASE_URL: ${url ? "✓" : "✗ MISSING"}\n` +
        `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${key ? "✓" : "✗ MISSING"}`,
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Award currency ────────────────────────────────────────────────────────────
// Lewat security definer function — anon key cukup.
// Pakai award_currency_with_cap untuk enforce daily points cap (100 pts/hari).
// XP dan tickets tidak dibatasi.
async function awardOneCurrency(
  client: SupabaseClient,
  userId: string,
  amount: number,
  currency: CurrencyType,
  source: XpSource,
  refId?: number,
  meta?: AwardMeta,
): Promise<AwardResult> {
  const { data, error } = await client.rpc("award_currency_with_cap", {
    p_user_id: userId,
    p_amount: amount,
    p_currency: currency,
    p_source: source,
    p_ref_id: refId ?? null,
    p_meta: meta ?? null,
  });

  if (error)
    throw new Error(`award_currency_with_cap failed: ${error.message}`);
  return data as AwardResult;
}

// ─── Main award function ───────────────────────────────────────────────────────
// Menerima authenticated client dari API route (createSupabaseServer).
// Semua operasi DB lewat security definer functions — tidak perlu service role.
export async function processAward(
  client: SupabaseClient,
  userId: string,
  source: XpSource,
  overrideAmounts?: { xp?: number; points?: number; tickets?: number },
  refId?: number,
  meta?: AwardMeta,
): Promise<{
  awards: AwardResult[];
  completed_challenges: CompletedChallenge[];
  achievement_updates: AchievementProgress[];
  streak_result: StreakResult | null;
}> {
  const awards: AwardResult[] = [];
  let streak_result: StreakResult | null = null;

  // 1. Award currency berdasarkan config
  const configs = getAwardConfig(source);
  for (const cfg of configs) {
    let amount = cfg.amount;

    if (overrideAmounts) {
      if (cfg.currency === "xp" && overrideAmounts.xp !== undefined)
        amount = overrideAmounts.xp;
      if (cfg.currency === "points" && overrideAmounts.points !== undefined)
        amount = overrideAmounts.points;
      if (cfg.currency === "tickets" && overrideAmounts.tickets !== undefined)
        amount = overrideAmounts.tickets;
    }

    if (amount === 0) continue;

    const result = await awardOneCurrency(
      client,
      userId,
      amount,
      cfg.currency,
      source,
      refId,
      meta,
    );
    awards.push(result);
  }

  // 2. Update challenge progress
  const { data: challengeData, error: challengeError } = await client.rpc(
    "increment_challenge_progress",
    {
      p_user_id: userId,
      p_action: source,
      p_increment: 1,
      p_meta: meta ?? null,
    },
  );

  if (challengeError) {
    console.error("increment_challenge_progress error:", challengeError);
  }

  const completedChallenges: CompletedChallenge[] =
    challengeData?.completed ?? [];

  // 3. Auto-claim reward untuk challenge yang baru selesai
  for (const completed of completedChallenges) {
    const challengeSource: XpSource =
      completed.type === "daily" ? "daily_challenge" : "weekly_challenge";

    if (completed.xp_reward > 0) {
      await awardOneCurrency(
        client,
        userId,
        completed.xp_reward,
        "xp",
        challengeSource,
        completed.challenge_id,
        { challenge_title: completed.title },
      );
    }
    if (completed.pts_reward > 0) {
      await awardOneCurrency(
        client,
        userId,
        completed.pts_reward,
        "points",
        challengeSource,
        completed.challenge_id,
        { challenge_title: completed.title },
      );
    }
    if (completed.ticket_reward > 0) {
      await awardOneCurrency(
        client,
        userId,
        completed.ticket_reward,
        "tickets",
        challengeSource,
        completed.challenge_id,
        { challenge_title: completed.title },
      );
    }

    // Mark rewarded — lewat security definer function, bukan direct UPDATE
    await client.rpc("mark_challenge_rewarded", {
      p_uc_id: completed.uc_id,
      p_user_id: userId,
    });
  }

  // 4. Update achievement progress
  const achievementKeys = resolveAchievementKeys(source, meta);
  const achievementUpdates: AchievementProgress[] = [];

  for (const key of achievementKeys) {
    const { data: achData, error: achError } = await client.rpc(
      "increment_achievement_progress",
      { p_user_id: userId, p_achievement_key: key, p_increment: 1 },
    );

    if (achError) {
      console.error(`increment_achievement_progress(${key}) error:`, achError);
      continue;
    }

    const achResult = achData as AchievementProgress;
    achievementUpdates.push(achResult);

    if (achResult.unlocked && !achResult.already_unlocked) {
      if (achResult.xp_reward > 0) {
        await awardOneCurrency(
          client,
          userId,
          achResult.xp_reward,
          "xp",
          "achievement_unlock",
          undefined,
          { achievement_key: key, achievement_name: achResult.name },
        );
      }
      if (achResult.pts_reward > 0) {
        await awardOneCurrency(
          client,
          userId,
          achResult.pts_reward,
          "points",
          "achievement_unlock",
          undefined,
          { achievement_key: key, achievement_name: achResult.name },
        );
      }

      // Mark rewarded — lewat security definer function
      await client.rpc("mark_achievement_rewarded", {
        p_user_id: userId,
        p_achievement_key: key,
      });
    }
  }

  // 5. Complex achievement checks (collection, genre_variety, secret)
  const complexChecks = COMPLEX_ACHIEVEMENT_TRIGGERS[source] ?? [];

  for (const check of complexChecks) {
    if (check.type === "collection") {
      // Cek apakah film ini bagian dari collection yang bisa unlock achievement
      const { data: colData, error: colError } = await client.rpc(
        "check_collection_achievement",
        {
          p_user_id: userId,
          p_movie_id: meta?.movie_id ?? null,
          p_series_id: meta?.series_id ?? null,
        },
      );

      if (colError) {
        console.error("check_collection_achievement error:", colError);
      } else {
        const newlyUnlocked = (colData?.collections ??
          []) as AchievementProgress[];
        for (const ach of newlyUnlocked.filter((a) => a.unlocked)) {
          achievementUpdates.push(ach);
          if (ach.xp_reward > 0) {
            await awardOneCurrency(
              client,
              userId,
              ach.xp_reward,
              "xp",
              "achievement_unlock",
              undefined,
              { achievement_key: ach.key },
            );
          }
          if (ach.pts_reward > 0) {
            await awardOneCurrency(
              client,
              userId,
              ach.pts_reward,
              "points",
              "achievement_unlock",
              undefined,
              { achievement_key: ach.key },
            );
          }
          await client.rpc("mark_achievement_rewarded", {
            p_user_id: userId,
            p_achievement_key: ach.key,
          });
        }
      }
    }

    if (check.type === "genre_variety") {
      const { data: gvData, error: gvError } = await client.rpc(
        "check_genre_variety_achievement",
        { p_user_id: userId },
      );

      if (gvError) {
        console.error("check_genre_variety_achievement error:", gvError);
      } else {
        const newlyUnlocked = (gvData?.genre_variety ??
          []) as AchievementProgress[];
        for (const ach of newlyUnlocked.filter((a) => a.unlocked)) {
          achievementUpdates.push(ach);
          if (ach.xp_reward > 0) {
            await awardOneCurrency(
              client,
              userId,
              ach.xp_reward,
              "xp",
              "achievement_unlock",
              undefined,
              { achievement_key: ach.key },
            );
          }
          if (ach.pts_reward > 0) {
            await awardOneCurrency(
              client,
              userId,
              ach.pts_reward,
              "points",
              "achievement_unlock",
              undefined,
              { achievement_key: ach.key },
            );
          }
          await client.rpc("mark_achievement_rewarded", {
            p_user_id: userId,
            p_achievement_key: ach.key,
          });
        }
      }
    }

    if (check.type === "secret") {
      const { data: secData, error: secError } = await client.rpc(
        "check_secret_achievements",
        { p_user_id: userId, p_source: source, p_meta: meta ?? null },
      );

      if (secError) {
        console.error("check_secret_achievements error:", secError);
      } else {
        const newlyUnlocked = (secData?.secret ?? []) as AchievementProgress[];
        for (const ach of newlyUnlocked.filter((a) => a.unlocked)) {
          achievementUpdates.push(ach);
          if (ach.xp_reward > 0) {
            await awardOneCurrency(
              client,
              userId,
              ach.xp_reward,
              "xp",
              "achievement_unlock",
              undefined,
              { achievement_key: ach.key },
            );
          }
          if (ach.pts_reward > 0) {
            await awardOneCurrency(
              client,
              userId,
              ach.pts_reward,
              "points",
              "achievement_unlock",
              undefined,
              { achievement_key: ach.key },
            );
          }
          await client.rpc("mark_achievement_rewarded", {
            p_user_id: userId,
            p_achievement_key: ach.key,
          });
        }
      }
    }
  }

  // 6. Streak check — hanya untuk swipe_like
  // Dihitung server-side dari DB, tidak bisa dimanipulasi frontend
  if (source === "swipe_like") {
    const { data: streakData, error: streakError } = await client.rpc(
      "update_swipe_streak",
      { p_user_id: userId },
    );

    if (streakError) {
      console.error("update_swipe_streak error:", streakError);
    } else {
      streak_result = {
        current_streak: streakData?.current_streak ?? 0,
        streak_bonus: streakData?.streak_bonus ?? [],
      };

      // Award bonus dari streak milestone jika ada
      for (const bonus of streak_result.streak_bonus as StreakBonus[]) {
        if (bonus.xp_bonus > 0) {
          const streakAward = await awardOneCurrency(
            client,
            userId,
            bonus.xp_bonus,
            "xp",
            "admin_grant",
            undefined,
            { reason: "streak_bonus", streak_days: bonus.streak_days },
          );
          awards.push(streakAward);
        }
        if (bonus.pts_bonus > 0) {
          const streakAward = await awardOneCurrency(
            client,
            userId,
            bonus.pts_bonus,
            "points",
            "admin_grant",
            undefined,
            { reason: "streak_bonus", streak_days: bonus.streak_days },
          );
          awards.push(streakAward);
        }
      }
    }
  }

  return {
    awards,
    completed_challenges: completedChallenges,
    achievement_updates: achievementUpdates,
    streak_result,
  };
}

// ─── Get user progression dengan level info ────────────────────────────────────
// Menerima authenticated client dari API route.
export async function getUserProgression(
  client: SupabaseClient,
  userId: string,
): Promise<ProgressionWithLevel | null> {
  const { data: prog, error: progError } = await client
    .from("user_progression")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (progError) {
    if (progError.code === "PGRST116") return null;
    throw new Error(progError.message);
  }

  const { data: thresholds, error: thrError } = await client
    .from("level_thresholds")
    .select("*")
    .order("level", { ascending: true });

  if (thrError) throw new Error(thrError.message);

  return enrichProgression(
    prog as UserProgression,
    thresholds as LevelThreshold[],
  );
}

// ─── Enrich progression dengan level metadata ──────────────────────────────────
export function enrichProgression(
  prog: UserProgression,
  thresholds: LevelThreshold[],
): ProgressionWithLevel {
  const sorted = [...thresholds].sort((a, b) => a.level - b.level);
  const maxLevel = sorted[sorted.length - 1].level;
  const isMaxLevel = prog.level >= maxLevel;

  const currentThreshold = sorted.find((t) => t.level === prog.level);
  const nextThreshold = sorted.find((t) => t.level > prog.level);

  const xpForCurrentLevel = currentThreshold?.xp_required ?? 0;
  const xpForNextLevel = nextThreshold?.xp_required ?? 0;
  const xpProgress = prog.total_xp - xpForCurrentLevel;
  const xpNeeded = isMaxLevel ? 0 : xpForNextLevel - prog.total_xp;
  const progressPercent = isMaxLevel
    ? 100
    : Math.min(
        100,
        Math.floor((xpProgress / (xpForNextLevel - xpForCurrentLevel)) * 100),
      );

  return {
    ...prog,
    rank_name: currentThreshold?.rank_name ?? "Audience",
    xp_for_current_level: xpForCurrentLevel,
    xp_for_next_level: xpForNextLevel,
    xp_progress: xpProgress,
    xp_needed: xpNeeded,
    progress_percent: progressPercent,
    is_max_level: isMaxLevel,
  };
}
