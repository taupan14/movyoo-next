"use client";

/**
 * page-loader.tsx — Singleton approach, no context needed.
 *
 * Cara pakai:
 *   1. <PageLoader /> taruh sekali di layout (bebas, tidak perlu wrap children)
 *   2. import { startLoader } dari file ini, panggil di onClick mana saja
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// ─── Singleton event emitter (tidak butuh React context) ──────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

export function startLoader() {
  listeners.forEach((fn) => fn());
}

function subscribeLoader(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ─── Visual Component ─────────────────────────────────────────────────────────

export function PageLoader() {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [completing, setCompleting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);

  function clearTick() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function begin() {
    if (activeRef.current) return; // sudah berjalan
    activeRef.current = true;
    clearTick();
    setCompleting(false);
    setProgress(0);
    setVisible(true);

    let cur = 0;
    timerRef.current = setInterval(() => {
      cur += Math.random() * 9 + 3; // naik 3–12 per tick
      if (cur >= 82) {
        cur = 82;
        clearTick();
      }
      setProgress(cur);
    }, 100);
  }

  function finish() {
    if (!activeRef.current) return;
    clearTick();
    setCompleting(true);
    setProgress(100);

    setTimeout(() => {
      setVisible(false);
      setCompleting(false);
      setProgress(0);
      activeRef.current = false;
    }, 400);
  }

  // Subscribe ke singleton startLoader()
  useEffect(() => {
    return subscribeLoader(begin);
  }, []);

  // Detect route selesai berubah → finish
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      finish();
    }
  }, [pathname]);

  // Cleanup on unmount
  useEffect(() => () => clearTick(), []);

  if (!visible) return null;

  return (
    <>
      {/* Progress bar */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none"
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            transition: completing
              ? "width 0.35s cubic-bezier(0.4,0,0.2,1)"
              : "width 0.12s linear",
            background:
              "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.6), hsl(var(--primary)))",
            backgroundSize: "200% 100%",
            animation: completing ? "none" : "pgShimmer 1.4s linear infinite",
            boxShadow: "0 0 14px 2px hsl(var(--primary) / 0.55)",
            borderRadius: "0 9999px 9999px 0",
          }}
        />
        {/* Glowing dot di ujung */}
        {!completing && (
          <div
            style={{
              position: "absolute",
              top: "-2px",
              left: `${progress}%`,
              transform: "translateX(-50%)",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "hsl(var(--primary))",
              boxShadow: "0 0 10px 3px hsl(var(--primary) / 0.7)",
              transition: "left 0.12s linear",
            }}
          />
        )}
      </div>

      {/* Overlay ringan */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "hsl(var(--background) / 0.12)",
          backdropFilter: "blur(0.5px)",
          pointerEvents: "none",
          opacity: completing ? 0 : 1,
          transition: "opacity 0.4s ease",
        }}
      />

      <style>{`
        @keyframes pgShimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </>
  );
}
