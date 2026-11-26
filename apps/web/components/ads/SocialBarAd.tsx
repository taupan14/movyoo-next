// components/ads/SocialBarAd.tsx
"use client";

import { useEffect, useRef } from "react";
import { ADS_CONFIG } from "@/lib/ads/config";
import { useAdSettings } from "@/hooks/use-ad-settings";

const MOBILE_BOTTOM_OFFSET = 64;
const DESKTOP_LEFT_OFFSET = 72;

export default function SocialBarAd() {
  // Data sudah final dari server (AdsProvider) — tidak ada isLoading lagi.
  const { showSocialBar } = useAdSettings();
  const injected = useRef(false);

  useEffect(() => {
    if (!showSocialBar) return;
    if (injected.current) return;
    if (!ADS_CONFIG.scripts.socialBar) return;

    injected.current = true;

    const script = document.createElement("script");
    script.src = ADS_CONFIG.scripts.socialBar;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.head.appendChild(script);

    const observer = new MutationObserver(() => {
      const bars = document.querySelectorAll<HTMLElement>(
        'body > div[id*="adsterra"], body > div[class*="social"], body > div[style*="position: fixed"], body > div[style*="position:fixed"]',
      );

      bars.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.position !== "fixed") return;

        el.style.zIndex = "9999";
        const isDesktop = window.innerWidth >= 1024;

        if (isDesktop) {
          if (
            style.left === "0px" ||
            parseInt(style.left) < DESKTOP_LEFT_OFFSET
          ) {
            el.style.left = `${DESKTOP_LEFT_OFFSET}px`;
          }
        } else {
          if (
            style.bottom === "0px" ||
            parseInt(style.bottom) < MOBILE_BOTTOM_OFFSET
          ) {
            el.style.bottom = `${MOBILE_BOTTOM_OFFSET}px`;
          }
        }
      });

      if (bars.length > 0) observer.disconnect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => observer.disconnect();
  }, [showSocialBar]);

  return null;
}
