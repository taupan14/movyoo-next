// lib/ads/get-ad-flags.ts
// Server-only. Dipanggil dari Server Component (layout.tsx).
// Jangan import file ini dari client component.

import "server-only";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  type AdFlags,
  type DonationTier,
  resolveAdFlags,
} from "@/lib/ads/config";

export interface InitialAdState {
  tier: DonationTier;
  flags: AdFlags;
}

/**
 * Ambil donation_tier user (jika login) dan resolve ke ad flags,
 * dieksekusi sepenuhnya di server menggunakan cookies — tidak ada
 * round-trip tambahan dari browser.
 *
 * Dipakai sekali di RootLayout, hasilnya di-pass sebagai initial value
 * ke AdsProvider.
 */
export async function getInitialAdState(): Promise<InitialAdState> {
  try {
    const supabase = await createSupabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const tier: DonationTier = null;
      return { tier, flags: resolveAdFlags(tier) };
    }

    const { data } = await supabase
      .from("user_settings")
      .select("donation_tier")
      .eq("user_id", user.id)
      .maybeSingle();

    const tier = (data?.donation_tier ?? null) as DonationTier;
    return { tier, flags: resolveAdFlags(tier) };
  } catch (err) {
    // Fail-safe: kalau ada error apapun (network, auth, dsb), default ke
    // non-donor state — ads tetap tampil, tidak mem-block render layout.
    console.error("[get-ad-flags] Gagal fetch ad state:", err);
    const tier: DonationTier = null;
    return { tier, flags: resolveAdFlags(tier) };
  }
}
