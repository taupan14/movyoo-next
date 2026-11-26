// app/robots.ts
import type { MetadataRoute } from "next";

const BASE_URL = "https://movyoo.id"; // ← samakan dengan BASE_URL di layout.tsx

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/profile", "/auth/", "/quiz", "/reward"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
