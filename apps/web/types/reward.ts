// types/reward.ts

export type RewardCategory =
  | "merchandise"
  | "digital"
  | "voucher"
  | "experience"
  | "collectible";

export type RewardStatus =
  | "active"
  | "out_of_stock"
  | "coming_soon"
  | "archived";

export interface RewardImage {
  id: string;
  url: string;
  alt: string | null;
  sort_order: number;
}

export interface RewardReview {
  id: string;
  rating_level: number; // 1–5
  comment: string | null;
  is_verified: boolean;
  helpful_count: number;
  created_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
}

export interface Reward {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: RewardCategory;
  status: RewardStatus;
  points_price: number;
  points_discount: number | null;
  stock: number;
  total_redeemed: number;
  brand: string | null;
  tags: string[];
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;

  // From rewards_with_stats view
  review_count: number;
  avg_raw_rating: number | null;
  hype_score: number | null;
  images: RewardImage[];
}

export interface RewardDetail extends Reward {
  reviews: RewardReview[];
}

// ── Hype Rating System ────────────────────────────────────────
// Rating level 1–5 dipetakan ke icon + label hype
export const HYPE_LEVELS = [
  { level: 1, emoji: "🚀", label: "Just Launched", color: "#94a3b8" }, // slate
  { level: 2, emoji: "⚡", label: "Electrifying", color: "#facc15" }, // yellow
  { level: 3, emoji: "🔥", label: "On Fire", color: "#f97316" }, // orange
  { level: 4, emoji: "💎", label: "Diamond", color: "#38bdf8" }, // sky
  { level: 5, emoji: "👑", label: "Legendary", color: "#a855f7" }, // purple
] as const;

/**
 * Konversi hype_score (0–5 float) → level hype (1–5 int)
 * dengan pembagian bucket yang ekspresif:
 *   0.0 – 1.0 → level 1 (🚀)
 *   1.0 – 2.0 → level 2 (⚡)
 *   2.0 – 3.0 → level 3 (🔥)
 *   3.0 – 4.0 → level 4 (💎)
 *   4.0 – 5.0 → level 5 (👑)
 */
export function getHypeLevel(
  hypeScore: number | null,
): (typeof HYPE_LEVELS)[number] {
  if (!hypeScore || hypeScore === 0) return HYPE_LEVELS[0];
  const idx = Math.min(Math.floor(hypeScore), 4);
  return HYPE_LEVELS[idx];
}

/**
 * Render hype score sebagai string display
 * contoh: 3.74 → "3.7"
 */
export function formatHypeScore(score: number | null): string {
  if (!score) return "–";
  return score.toFixed(1);
}

export const CATEGORY_CONFIG: Record<
  RewardCategory,
  { label: string; emoji: string; color: string }
> = {
  merchandise: {
    label: "Merchandise",
    emoji: "👕",
    color: "bg-black/60 text-white border-0",
  },
  digital: {
    label: "Digital",
    emoji: "✨",
    color: "bg-black/60 text-white border-0",
  },
  voucher: {
    label: "Voucher",
    emoji: "🎟️",
    color: "bg-black/60 text-white border-0",
  },
  experience: {
    label: "Experience",
    emoji: "🎬",
    color: "bg-black/60 text-white border-0",
  },
  collectible: {
    label: "Collectible",
    emoji: "🏆",
    color: "bg-black/60 text-white border-0",
  },
};
