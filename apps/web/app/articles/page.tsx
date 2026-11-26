/**
 * app/articles/page.tsx  — Server Component
 * Halaman daftar artikel SEO Movyoo
 */

import type { Metadata } from "next";
import { ArticlesClient } from "@/components/articles/articles-client";

export const metadata: Metadata = {
  title: "Artikel Film & Serial — Movyoo",
  description:
    "Rekomendasi film terbaik berdasarkan genre, aktor, sutradara, platform, dan banyak lagi. Panduan nonton terlengkap di Indonesia.",
  alternates: { canonical: "https://movyoo.id/articles" },
  openGraph: {
    title: "Artikel Film & Serial — Movyoo",
    description:
      "Rekomendasi film terbaik berdasarkan genre, aktor, sutradara, platform, dan banyak lagi.",
    url: "https://movyoo.id/articles",
    siteName: "Movyoo",
    type: "website",
  },
};

export default function ArticlesPage() {
  return <ArticlesClient />;
}
