/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === "development";

// Domain CDN yang digunakan Adsterra untuk serve konten iklan
const ADSTERRA_DOMAINS = [
  "*.adsterra.com",
  "*.effectivecpmnetwork.com",
  "*.highrevenuegate.com",
  "*.profitablegatecpm.com",
  "*.effectiveperformancetracker.com",
  "cdn.storageimagedisplay.com", // Native Banner image CDN (http + https)
  "*.storageimagedisplay.com",
].join(" ");

const nextConfig = {
  async headers() {
    const csp = [
      "default-src 'self'",

      // Scripts: Adsterra inject script dari berbagai subdomain
      `script-src 'self' 'unsafe-inline' ${
        isDev ? "'unsafe-eval'" : ""
      } https: ${ADSTERRA_DOMAINS}`,

      "style-src 'self' 'unsafe-inline' https:",

      // img-src: tambah http: untuk cover CDN Adsterra yang masih pakai http://
      // cdn.storageimagedisplay.com load via http (bukan https)
      `img-src 'self' data: blob: https: http://*.storageimagedisplay.com http://cdn.storageimagedisplay.com`,

      "font-src 'self' data: https:",

      // connect-src: Adsterra buat XHR/fetch ke tracking endpoint
      `connect-src 'self' https: wss: http://*.storageimagedisplay.com ${ADSTERRA_DOMAINS}`,

      // frame-src: Social Bar & Native Banner inject iframe
      "frame-src *",

      "media-src 'self' data: blob: https:",

      "worker-src 'self' blob:",

      "object-src 'none'",

      "base-uri 'self'",

      "form-action 'self'",

      "frame-ancestors 'self'",
    ]
      .map((d) => d.trim())
      .join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
