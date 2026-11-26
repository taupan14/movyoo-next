// components/ads/AdsProvider.tsx
"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  type AdFlags,
  type DonationTier,
  resolveAdFlags,
} from "@/lib/ads/config";
import type { InitialAdState } from "@/lib/ads/get-ad-flags";

interface AdsContextValue extends AdFlags {
  tier: DonationTier;
  /**
   * Re-fetch tier dari Supabase secara manual. Dipakai setelah user
   * berhasil klaim traktiran di TraktirModal, supaya context update
   * tanpa perlu full page reload.
   */
  refetchTier: () => Promise<void>;
}

const AdsContext = createContext<AdsContextValue | null>(null);

interface AdsProviderProps {
  initialState: InitialAdState;
  children: React.ReactNode;
}

/**
 * Bungkus children dengan ad state yang sudah di-resolve di server
 * (lihat lib/ads/get-ad-flags.ts). Tidak ada fetch saat mount —
 * data sudah tersedia dari SSR, sehingga tidak ada flicker/delay.
 *
 * refetchTier() disediakan untuk kasus client-side update (mis. user
 * baru saja klaim reward dan ingin context ter-update tanpa reload).
 */
export function AdsProvider({ initialState, children }: AdsProviderProps) {
  const [tier, setTier] = useState<DonationTier>(initialState.tier);
  const [flags, setFlags] = useState<AdFlags>(initialState.flags);

  const refetchTier = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setTier(null);
      setFlags(resolveAdFlags(null));
      return;
    }

    const { data } = await supabase
      .from("user_settings")
      .select("donation_tier")
      .eq("user_id", user.id)
      .maybeSingle();

    const newTier = (data?.donation_tier ?? null) as DonationTier;
    setTier(newTier);
    setFlags(resolveAdFlags(newTier));
  }, []);

  return (
    <AdsContext.Provider value={{ tier, ...flags, refetchTier }}>
      {children}
    </AdsContext.Provider>
  );
}

/**
 * Hook pengganti useAdSettings() lama. Sekarang baca dari context,
 * bukan fetch Supabase — instant, tidak ada isLoading.
 */
export function useAdSettings(): AdsContextValue {
  const ctx = useContext(AdsContext);
  if (!ctx) {
    throw new Error(
      "useAdSettings() harus dipanggil di dalam <AdsProvider>. " +
        "Pastikan AdsProvider sudah membungkus komponen ini di layout.tsx.",
    );
  }
  return ctx;
}
