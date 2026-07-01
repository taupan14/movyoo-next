"use client";

import { useEffect, useRef } from "react";

interface AdUnitProps {
  scriptSrc: string;
  containerId?: string;
  minHeight?: number;
  className?: string;
  once?: boolean;
}

export default function AdUnit({
  scriptSrc,
  containerId,
  minHeight = 0,
  className = "",
  once = true,
}: AdUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const injectedRef = useRef(false);

  // Adsterra blocks requests from localhost (CORS) — skip in dev
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (isDev) return;
    if (!containerRef.current || !scriptSrc) return;
    if (once && injectedRef.current) return;

    injectedRef.current = true;
    const container = containerRef.current;

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.setAttribute("data-cfasync", "false");

    script.onerror = () => {
      console.warn("[AdUnit] Failed to load ad script:", scriptSrc);
      injectedRef.current = false;
    };

    try {
      container.appendChild(script);
    } catch (err) {
      console.warn("[AdUnit] Ad initialization error:", err);
    }

    return () => {
      if (!once) {
        container.innerHTML = "";
        injectedRef.current = false;
      }
    };
  }, [scriptSrc, once, isDev]);

  // Di dev, render placeholder supaya layout tidak collapse
  if (isDev) {
    return (
      <div
        style={{
          minHeight: minHeight || 60,
          overflow: "hidden",
          background: "rgba(255,255,255,0.05)",
          border: "1px dashed rgba(255,255,255,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "rgba(255,255,255,0.3)",
          borderRadius: 4,
        }}
        aria-label="Ad placeholder (dev only)"
      >
        Ad · dev only
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      id={containerId}
      className={className}
      style={{ minHeight, overflow: "hidden" }}
      aria-label="Advertisement"
    />
  );
}
