"use client";

import { useEffect, useRef } from "react";
import { ADS_CONFIG } from "@/lib/ads/config";

const POPUNDER_STORAGE_KEY = "movyoo_popunder_last_shown";

/**
 * Interval minimum antar kemunculan popunder.
 *
 * Rekomendasi:
 * - 24 jam  (86_400_000) → standar, tidak terlalu agresif
 * - 12 jam  (43_200_000) → lebih sering, masih acceptable
 * - 48 jam (172_800_000) → paling ramah UX
 */
const POPUNDER_INTERVAL_MS = 1 * 60 * 60 * 1000; // 24 jam

function shouldShowPopunder(): boolean {
  try {
    const lastShown = localStorage.getItem(POPUNDER_STORAGE_KEY);
    if (!lastShown) return true;

    const elapsed = Date.now() - parseInt(lastShown, 10);
    return elapsed >= POPUNDER_INTERVAL_MS;
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
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    if (!ADS_CONFIG.enabled || !ADS_CONFIG.scripts.popunder) return;
    if (!shouldShowPopunder()) return;

    injected.current = true;
    markPopunderShown();

    const script = document.createElement("script");
    script.src = ADS_CONFIG.scripts.popunder;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.head.appendChild(script);
  }, []);

  return null;
}
