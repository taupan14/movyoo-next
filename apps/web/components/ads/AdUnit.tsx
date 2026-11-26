// components/ads/AdUnit.tsx
"use client";

interface AdUnitProps {
  scriptSrc: string;
  containerId?: string;
  minHeight?: number;
  className?: string;
  once?: boolean; // sudah tidak relevan lagi, tapi dibiarkan agar tidak break props di caller
}

export default function AdUnit({
  scriptSrc,
  containerId = "ad-container",
  minHeight = 0,
  className = "",
}: AdUnitProps) {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev || !scriptSrc) {
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

  // HTML mini yang isinya CUMA script iklan + container-nya.
  // Ini yang akan jadi "isi etalase kaca" — terpisah total dari window utama.
  const adDocument = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="${containerId}"></div>
    <script async data-cfasync="false" src="${scriptSrc}"><\/script>
  </body>
</html>`;

  return (
    <iframe
      srcDoc={adDocument}
      className={className}
      title="Advertisement"
      loading="lazy"
      referrerPolicy="no-referrer"
      // ── INI KUNCINYA ──
      // allow-scripts  : wajib, supaya script iklan bisa jalan & render banner
      // allow-same-origin : supaya Adsterra bisa set cookie/localStorage utk targeting
      // TIDAK ADA allow-top-navigation, allow-popups, allow-popups-to-escape-sandbox
      // → artinya script di dalam iframe ini SECARA TEKNIS TIDAK BISA:
      //   - redirect window.top / halaman utama
      //   - window.open() tab/window baru
      //   - keluar dari sandbox dengan cara apapun
      sandbox="allow-scripts"
      style={{
        width: "100%",
        minHeight,
        border: "none",
        display: "block",
      }}
    />
  );
}
