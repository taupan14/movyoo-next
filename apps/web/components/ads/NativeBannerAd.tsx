// components/ads/NativeBannerAd.tsx
"use client";

import { ADS_CONFIG } from "@/lib/ads/config";
import { useAdSettings } from "@/hooks/use-ad-settings";
import AdUnit from "./AdUnit";

interface NativeBannerAdProps {
  className?: string;
}

/**
 * Native Banner Ad dari Adsterra.
 * Tier-aware: hanya render jika user bukan Silver/Gold/HoF.
 * Data ad flags sudah final dari server (AdsProvider) — tidak ada
 * loading state / layout shift lagi.
 */
export default function NativeBannerAd({
  className = "",
}: NativeBannerAdProps) {
  const { showNativeBanner } = useAdSettings();

  if (!showNativeBanner || !ADS_CONFIG.scripts.nativeBanner) return null;

  return (
    <div className={`my-6 ${className}`}>
      <p className="text-[10px] text-muted-foreground/60 mb-1.5 px-1 tracking-wide uppercase">
        Sponsored
      </p>
      <AdUnit
        scriptSrc={ADS_CONFIG.scripts.nativeBanner}
        containerId={ADS_CONFIG.containerId.nativeBanner}
        minHeight={90}
        className="w-full rounded-xl overflow-hidden"
      />
    </div>
  );
}
