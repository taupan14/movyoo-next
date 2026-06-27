"use client";

import { useEffect, useRef } from "react";

interface AdUnitProps {
  scriptSrc: string;
  containerId?: string; // untuk Native Banner yang butuh div placeholder
  minHeight?: number;
  className?: string;
  /** Cegah inject ulang saat re-render (default: true) */
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

  useEffect(() => {
    if (!containerRef.current || !scriptSrc) return;
    if (once && injectedRef.current) return;

    injectedRef.current = true;
    const container = containerRef.current;

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    container.appendChild(script);

    return () => {
      if (!once) {
        container.innerHTML = "";
        injectedRef.current = false;
      }
    };
  }, [scriptSrc, once]);

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
