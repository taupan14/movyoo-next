// lib/ads/config.ts

export type DonationTier =
  | "nominee"
  | "bronze"
  | "silver"
  | "gold"
  | "hall_of_fame"
  | null;

// ─── Tier metadata (untuk UI) ─────────────────────────────────────────────────
export const DONATION_TIERS = [
  {
    tier: "nominee" as const,
    emoji: "🎬",
    label: "Nominee",
    range: "Rp 5.000 – 50.000",
    minAmount: 5_000,
    benefits: ["Popunder dimatikan"],
    benefitKeys: ["popunder"] as const,
  },
  {
    tier: "bronze" as const,
    emoji: "🥉",
    label: "Bronze Award",
    range: "Rp 55.000 – 150.000",
    minAmount: 55_000,
    benefits: ["Popunder dimatikan", "Social Bar dimatikan"],
    benefitKeys: ["popunder", "socialBar"] as const,
  },
  {
    tier: "silver" as const,
    emoji: "🥈",
    label: "Silver Award",
    range: "Rp 155.000 – 500.000",
    minAmount: 155_000,
    benefits: [
      "Popunder dimatikan",
      "Social Bar dimatikan",
      "Native Banner dimatikan",
      "Semua iklan bebas 🎉",
    ],
    benefitKeys: ["popunder", "socialBar", "nativeBanner"] as const,
  },
  {
    tier: "gold" as const,
    emoji: "🥇",
    label: "Golden Award",
    range: "Rp 505.000 – 999.999",
    minAmount: 505_000,
    benefits: [
      "Semua iklan bebas",
      "Akses gift merchandise (selama tersedia)*",
    ],
    benefitKeys: [
      "popunder",
      "socialBar",
      "nativeBanner",
      "merchandise",
    ] as const,
  },
  {
    tier: "hall_of_fame" as const,
    emoji: "🏆",
    label: "Hall of Fame",
    range: "Rp 1.000.000+",
    minAmount: 1_000_000,
    benefits: [
      "Semua iklan bebas",
      "Prioritas rilis hari pertama merchandise*",
    ],
    benefitKeys: [
      "popunder",
      "socialBar",
      "nativeBanner",
      "merchandise",
      "merchandisePriority",
    ] as const,
  },
] as const;

// ─── Global Ads Kill Switch ────────────────────────────────────────────────────
/**
 * Master switch per jenis iklan.
 * Jika false → iklan jenis tsb TIDAK PERNAH tayang, untuk siapapun
 * (termasuk non-donor), tidak peduli logic tier.
 *
 * Jika true → lanjut ke logic tier (whitelist donatur) seperti biasa.
 *
 * Env vars (.env):
 *   NEXT_PUBLIC_ADS_POPUNDER_ENABLED=true
 *   NEXT_PUBLIC_ADS_SOCIAL_ENABLED=true
 *   NEXT_PUBLIC_ADS_NATIVE_ENABLED=true
 */
export const GLOBAL_ADS_CONFIG = {
  popunder: process.env.NEXT_PUBLIC_ADS_POPUNDER_ENABLED !== "false",
  socialBar: process.env.NEXT_PUBLIC_ADS_SOCIAL_ENABLED !== "false",
  nativeBanner: process.env.NEXT_PUBLIC_ADS_NATIVE_ENABLED !== "false",
  adsense: process.env.NEXT_PUBLIC_ADS_ADSENSE_ENABLED !== "false",
} as const;

// Default ke `true` kalau env var belum di-set (fail-open, ads tetap jalan
// seperti behavior sebelumnya). Set eksplisit "false" untuk mematikan.

// ─── Ads script config ────────────────────────────────────────────────────────
export const ADS_CONFIG = {
  scripts: {
    socialBar: process.env.NEXT_PUBLIC_AD_SOCIAL_BAR_SRC ?? "",
    nativeBanner: process.env.NEXT_PUBLIC_AD_NATIVE_BANNER_SRC ?? "",
    popunder: process.env.NEXT_PUBLIC_AD_POPUNDER_SRC ?? "",
  },
  containerId: {
    nativeBanner: "container-34af5f0d62c250d55045579424f8b61c",
  },
} as const;

// ─── Resolusi tier → ad flags ─────────────────────────────────────────────────
export interface AdFlags {
  showPopunder: boolean;
  showSocialBar: boolean;
  showNativeBanner: boolean;
  showAdsense: boolean;
}

/**
 * Dari donation_tier user, tentukan iklan jenis apa yang tampil
 * SETELAH dicek terhadap global kill switch.
 *
 * Urutan evaluasi:
 *   1. Global switch OFF untuk jenis X → showX = false (mutlak)
 *   2. Global switch ON → tentukan dari tier (whitelist donatur)
 */
export function resolveAdFlags(tier: DonationTier): AdFlags {
  const tierFlags = resolveTierFlags(tier);

  return {
    showPopunder: GLOBAL_ADS_CONFIG.popunder && tierFlags.showPopunder,
    showSocialBar: GLOBAL_ADS_CONFIG.socialBar && tierFlags.showSocialBar,
    showNativeBanner:
      GLOBAL_ADS_CONFIG.nativeBanner && tierFlags.showNativeBanner,
    showAdsense: GLOBAL_ADS_CONFIG.adsense && tierFlags.showAdsense,
  };
}

/**
 * Logic tier murni (tanpa mempertimbangkan global switch).
 * Dipisah agar bisa dites/dipakai terpisah jika perlu.
 */
function resolveTierFlags(tier: DonationTier): AdFlags {
  switch (tier) {
    case "nominee":
    case "bronze":
      return {
        showPopunder: false,
        showSocialBar: false,
        showNativeBanner: false,
        showAdsense: true,
      };
    case "silver":
    case "gold":
    case "hall_of_fame":
      return {
        showPopunder: false,
        showSocialBar: false,
        showNativeBanner: false,
        showAdsense: false,
      };
    default:
      return {
        showPopunder: true,
        showSocialBar: true,
        showNativeBanner: true,
        showAdsense: true,
      };
  }
}
