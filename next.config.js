/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === "development";

// Domain CDN yang digunakan Adsterra untuk serve konten iklan
// Catatan: Adsterra sering rotate CDN domain pihak ketiga (mis. redgarto.com,
// dan domain serupa lainnya) untuk serve script/img/style. Karena domain ini
// tidak stabil dan tidak terdaftar resmi, kita allow http: + https: generik
// di connect-src / img-src / style-src alih-alih whitelist domain satu-satu.
const ADSTERRA_DOMAINS = [
  "*.adsterra.com",
  "*.effectivecpmnetwork.com",
  "*.highrevenuegate.com",
  "*.profitablegatecpm.com",
  "*.effectiveperformancetracker.com",
  "cdn.storageimagedisplay.com",
  "*.storageimagedisplay.com",
].join(" ");

const nextConfig = {
  async headers() {
    const csp = [
      "default-src 'self'",

      // Scripts: Adsterra inject script dari berbagai subdomain
      `script-src 'self' 'unsafe-inline' ${
        isDev ? "'unsafe-eval'" : ""
      } https: http: ${ADSTERRA_DOMAINS}`,

      // style-src: ad network kadang load CSS via http:// dari CDN pihak ketiga
      // (mis. Google Fonts mirror, custom CDN) — allow http: generik juga
      "style-src 'self' 'unsafe-inline' https: http:",

      // img-src: ad network sering serve gambar via http:// dari domain rotating
      "img-src 'self' data: blob: https: http:",

      // font-src: sama, beberapa font di-load via http
      "font-src 'self' data: https: http:",

      // connect-src: Adsterra buat XHR/fetch ke tracking endpoint yang domain-nya
      // sering berubah dan kadang masih http:// — allow http: generik
      `connect-src 'self' https: http: wss: ${ADSTERRA_DOMAINS}`,

      // frame-src: Social Bar & Native Banner inject iframe
      "frame-src *",

      "media-src 'self' data: blob: https: http:",

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
