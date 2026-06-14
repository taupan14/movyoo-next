// lib/progression/xp-config.ts
// Single source of truth untuk berapa XP/Points yang diberikan per aksi.
// Dipanggil oleh API route sebelum memanggil award_currency.

import type { CurrencyType, XpSource, AwardMeta } from "@/types/progression";

export interface AwardConfig {
  currency: CurrencyType;
  amount: number;
}

// Beberapa aksi memberikan XP + Points sekaligus
export type AwardMap = AwardConfig[];

const XP_CONFIG: Record<XpSource, AwardMap> = {
  swipe_like: [{ currency: "xp", amount: 1 }],
  swipe_session_complete: [{ currency: "xp", amount: 20 }],
  watchlist_add: [{ currency: "xp", amount: 5 }],
  movie_rate: [{ currency: "xp", amount: 10 }],
  movie_review: [
    { currency: "xp", amount: 15 },
    { currency: "points", amount: 5 },
  ],
  daily_challenge: [
    { currency: "xp", amount: 0 }, // jumlah override dari challenge config
    { currency: "points", amount: 0 },
  ],
  weekly_challenge: [
    { currency: "xp", amount: 0 },
    { currency: "points", amount: 0 },
  ],
  battle_win: [
    { currency: "xp", amount: 8 },
    { currency: "points", amount: 3 },
  ],
  trivia_correct: [{ currency: "xp", amount: 5 }],
  trivia_session_complete: [
    { currency: "xp", amount: 15 },
    { currency: "points", amount: 5 },
  ],
  achievement_unlock: [
    { currency: "xp", amount: 0 }, // override dari achievement config
    { currency: "points", amount: 0 },
  ],
  friend_challenge_win: [
    { currency: "xp", amount: 25 },
    { currency: "points", amount: 10 },
  ],
  collection_complete: [
    { currency: "xp", amount: 50 },
    { currency: "points", amount: 50 },
  ],
  admin_grant: [
    { currency: "xp", amount: 0 }, // fully override dari caller
  ],
};

export function getAwardConfig(source: XpSource): AwardMap {
  return XP_CONFIG[source] ?? [];
}

// ─── Achievement triggers ──────────────────────────────────────────────────────
// Achievement yang TIDAK bergantung pada media context (movie vs TV sama saja)
export const STATIC_ACHIEVEMENT_TRIGGERS: Partial<Record<XpSource, string[]>> =
  {
    watchlist_add: ["watchlist_hoarder"],
    movie_review: ["prolific_reviewer"],
    battle_win: ["battle_warrior"],
    trivia_correct: ["trivia_champion"],
    friend_challenge_win: ["friend_challenger"],
  };

// Mapping TMDB genre_id → achievement key untuk genre achievements.
// Berlaku untuk BOTH movie dan TV series — genre_ids dikirim di meta.
export const GENRE_ACHIEVEMENT_MAP: Record<number, string> = {
  878: "scifi_master", // Science Fiction
  27: "horror_survivor", // Horror
  35: "comedy_lover", // Comedy
  16: "anime_enthusiast", // Animation (proxy untuk Anime)
  10749: "romance_dreamer", // Romance
  28: "action_hero", // Action
  10759: "action_hero", // Action & Adventure (TV genre id)
  10765: "scifi_master", // Sci-Fi & Fantasy (TV genre id)
  10768: "horror_survivor", // War & Politics — tidak ideal tapi fallback
};

// ─── Complex achievement checks ───────────────────────────────────────────────
// Flag yang memberi tahu processAward fungsi DB mana yang perlu dipanggil
// selain increment_achievement_progress yang standard.
//
// 'collection'    → check_collection_achievement  (cek like semua film collection)
// 'genre_variety' → check_genre_variety_achievement (cek keragaman genre)
// 'secret'        → check_secret_achievements (midnight, speed, perfect_week, battle)
export interface ComplexAchievementCheck {
  type: "collection" | "genre_variety" | "secret";
}

export const COMPLEX_ACHIEVEMENT_TRIGGERS: Partial<
  Record<XpSource, ComplexAchievementCheck[]>
> = {
  swipe_like: [
    { type: "collection" }, // cek apakah film ini bagian dari collection
    { type: "genre_variety" }, // cek keragaman genre dari history liked
    { type: "secret" }, // midnight_watcher, speed_swiper
  ],
  battle_win: [
    { type: "secret" }, // battle_dominator
  ],
  daily_challenge: [
    { type: "secret" }, // perfect_week
  ],
};

// ─── Resolve achievement keys dari meta ───────────────────────────────────────
// Fungsi ini dipanggil di processAward untuk mendapatkan list achievement
// yang perlu di-increment berdasarkan source + meta (media_type, genre_ids).
export function resolveAchievementKeys(
  source: XpSource,
  meta?: AwardMeta,
): string[] {
  const keys: string[] = [];

  // 1. Static triggers — tidak peduli media type
  const staticKeys = STATIC_ACHIEVEMENT_TRIGGERS[source] ?? [];
  keys.push(...staticKeys);

  // 2. Swipe-based achievements
  if (source === "swipe_like") {
    // Total swipe counter — berlaku untuk movie dan TV series
    keys.push("swipe_master", "swipe_legend");

    // Genre achievements — hanya jika genre_ids tersedia di meta
    if (meta?.genre_ids && Array.isArray(meta.genre_ids)) {
      for (const genreId of meta.genre_ids) {
        const achKey = GENRE_ACHIEVEMENT_MAP[genreId];
        if (achKey && !keys.includes(achKey)) {
          keys.push(achKey);
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(keys)];
}
