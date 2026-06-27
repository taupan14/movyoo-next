"use client";

import { useEffect, useRef } from "react";
import { ADS_CONFIG } from "@/lib/ads/config";

/**
 * Social Bar Ad dari Adsterra.
 *
 * Adsterra Social Bar inject elemen floating ke <body> secara langsung.
 * Masalah umum dengan layout Movyoo:
 *  - Desktop: sidebar kiri fixed z-50 → Social Bar tertimpa
 *  - Mobile:  bottom nav fixed z-50 h-16 → Social Bar tertutup nav bawah
 *             top bar  fixed z-50 h-14 → Social Bar tertutup nav atas
 *
 * Solusi: inject script via <head>, lalu pasang MutationObserver untuk
 * mendeteksi elemen Social Bar saat Adsterra selesai inject, kemudian
 * override z-index dan offset posisinya via inline style.
 */

// Offset agar Social Bar tidak tertutup nav
const MOBILE_BOTTOM_OFFSET = 64; // h-16 = 64px (bottom nav mobile)
const DESKTOP_LEFT_OFFSET = 72; // w-[72px] (sidebar desktop)

export default function SocialBarAd() {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    if (!ADS_CONFIG.enabled || !ADS_CONFIG.scripts.socialBar) return;

    injected.current = true;

    // 1. Inject script Adsterra ke <head>
    const script = document.createElement("script");
    script.src = ADS_CONFIG.scripts.socialBar;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.head.appendChild(script);

    // 2. Observe DOM — tunggu Adsterra selesai inject elemen Social Bar-nya
    const observer = new MutationObserver(() => {
      // Adsterra Social Bar biasanya inject div/iframe dengan style position:fixed
      // Selector ini cukup broad untuk menangkap berbagai varian inject-nya
      const bars = document.querySelectorAll<HTMLElement>(
        'body > div[id*="adsterra"], body > div[class*="social"], body > div[style*="position: fixed"], body > div[style*="position:fixed"]',
      );

      bars.forEach((el) => {
        const style = window.getComputedStyle(el);

        // Hanya proses elemen yang benar-benar fixed (Social Bar Adsterra)
        if (style.position !== "fixed") return;

        // Naikkan z-index di atas nav (z-50 = 50)
        el.style.zIndex = "9999";

        const isDesktop = window.innerWidth >= 1024; // lg breakpoint

        if (isDesktop) {
          // Desktop: geser ke kanan agar tidak tertimpa sidebar kiri
          if (
            style.left === "0px" ||
            parseInt(style.left) < DESKTOP_LEFT_OFFSET
          ) {
            el.style.left = `${DESKTOP_LEFT_OFFSET}px`;
          }
        } else {
          // Mobile: geser ke atas agar tidak tertimpa bottom nav
          if (
            style.bottom === "0px" ||
            parseInt(style.bottom) < MOBILE_BOTTOM_OFFSET
          ) {
            el.style.bottom = `${MOBILE_BOTTOM_OFFSET}px`;
          }
        }
      });

      // Hentikan observer setelah elemen ditemukan dan dipatch
      if (bars.length > 0) observer.disconnect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });

    // Cleanup observer jika component unmount (edge case)
    return () => observer.disconnect();
  }, []);

  return null;
}
