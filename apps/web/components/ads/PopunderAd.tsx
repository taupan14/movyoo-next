// components/ads/PopunderAd.tsx
"use client";

import { useEffect, useRef } from "react";
import { ADS_CONFIG } from "@/lib/ads/config";
import { useAdSettings } from "@/hooks/use-ad-settings";

const POPUNDER_STORAGE_KEY = "movyoo_popunder_last_shown";
const POPUNDER_INTERVAL_MS = 5 * 60 * 60 * 1000; // 24 jam

function shouldShowPopunder(): boolean {
  try {
    const lastShown = localStorage.getItem(POPUNDER_STORAGE_KEY);
    if (!lastShown) return true;
    return Date.now() - parseInt(lastShown, 10) >= POPUNDER_INTERVAL_MS;
  } catch {
    return false;
  }
}

function markPopunderShown(): void {
  try {
    localStorage.setItem(POPUNDER_STORAGE_KEY, String(Date.now()));
  } catch {
    // silent fail
  }
}

export default function PopunderAd() {
  // Data sudah final dari server (AdsProvider) — tidak ada isLoading lagi.
  const { showPopunder } = useAdSettings();
  const injected = useRef(false);

  useEffect(() => {
    if (!showPopunder) return;
    if (injected.current) return;
    if (!ADS_CONFIG.scripts.popunder) return;
    if (!shouldShowPopunder()) return;

    injected.current = true;
    markPopunderShown();

    const script = document.createElement("script");
    script.src = ADS_CONFIG.scripts.popunder;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.head.appendChild(script);
  }, [showPopunder]);

  return null;
}
