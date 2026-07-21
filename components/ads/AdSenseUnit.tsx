"use client";

import { useEffect, useRef } from "react";
import { useAdSettings } from "@/components/ads/AdsProvider";

interface AdSenseUnitProps {
  slot: string;
  format?: string;
  className?: string;
  minHeight?: number;
}

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

export default function AdSenseUnit({
  slot,
  format = "auto",
  className = "",
  minHeight = 0,
}: AdSenseUnitProps) {
  const pushed = useRef(false);
  const { showAdsense } = useAdSettings();

  useEffect(() => {
    if (!showAdsense || !ADSENSE_CLIENT_ID || pushed.current) return;
    try {
      // @ts-expect-error - adsbygoogle di-inject oleh script eksternal
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch (err) {
      console.error("AdSense error:", err);
    }
  }, [showAdsense]);

  if (!showAdsense || !ADSENSE_CLIENT_ID) return null;

  return (
    <ins
      className={`adsbygoogle ${className}`}
      style={{ display: "block", minHeight }}
      data-ad-client={ADSENSE_CLIENT_ID}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
