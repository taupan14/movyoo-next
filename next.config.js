/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === "development";

// Domain CDN yang digunakan Adsterra untuk serve konten iklan
// Catatan: Adsterra sering rotate CDN domain pihak ketiga (mis. redgarto.com,
// dan domain serupa lainnya) untuk serve script/img/style. Karena domain ini
// tidak stabil dan tidak terdaftar resmi, kita allow http: + https: generik
// di connect-src / img-src / style-src alih-alih whitelist domain satu-satu.
// const ADSTERRA_NATIVE_DOMAINS = [
//   "*.highperformanceformat.com",
//   "*.profitablecpmrate.com",
//   "*.effectivecpmnetwork.com",
//   "*.highrevenuegate.com",
//   "*.profitablegatecpm.com",
// ].join(" ");

const GOOGLE_ADSENSE_DOMAINS = [
  "https://pagead2.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://www.google.com",
  "https://www.googletagservices.com",
  "https://adservice.google.com",
  "https://*.google.com",
  "https://*.googlesyndication.com",
  "https://*.doubleclick.net",
  "https://*.googleadservices.com",
  "https://*.adtrafficquality.google",
].join(" ");

const nextConfig = {
  async headers() {
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} ${GOOGLE_ADSENSE_DOMAINS}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://image.tmdb.org https://xlfchtwebtehpuiaqush.supabase.co https://nos.jkt-1.neo.id https://cms2.cinepolis.co.id https://upload.wikimedia.org https://encrypted-tbn0.gstatic.com https://cdn.festivalfilm.id https://img.youtube.com https://placehold.co ${GOOGLE_ADSENSE_DOMAINS}`,
      "font-src 'self' data:",
      `connect-src 'self' https://xlfchtwebtehpuiaqush.supabase.co wss://xlfchtwebtehpuiaqush.supabase.co ${GOOGLE_ADSENSE_DOMAINS}`,
      `frame-src 'self' https://www.youtube-nocookie.com ${GOOGLE_ADSENSE_DOMAINS}`,
      "media-src 'self' https://nos.jkt-1.neo.id",
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
