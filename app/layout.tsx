import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { PageLoader } from "@/components/page-loader";
import { Suspense } from "react";

const inter = Inter({ subsets: ["latin"] });

const BASE_URL = "https://movyoo.id"; // ← ganti dengan domain kamu

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Movyoo — Temukan Film Terbaik untuk Ditonton",
    template: "%s | Movyoo",
  },
  description:
    "Movyoo membantu kamu menemukan film dan series terbaik. Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan more.",
  keywords: [
    "film",
    "movie",
    "bioskop",
    "jadwal bioskop",
    "rekomendasi film",
    "film Indonesia",
    "series",
    "streaming",
    "movyoo",
  ],
  authors: [{ name: "Movyoo" }],
  creator: "Movyoo",
  publisher: "Movyoo",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: BASE_URL,
    siteName: "Movyoo",
    title: "Movyoo — Temukan Film Terbaik untuk Ditonton",
    description:
      "Movyoo membantu kamu menemukan film dan series terbaik. Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan more.",
    images: [
      {
        url: "/og-image.jpg", // ← buat file ini di /public (1200x630px)
        width: 1200,
        height: 630,
        alt: "Movyoo — Movie Discovery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Movyoo — Temukan Film Terbaik untuk Ditonton",
    description:
      "Movyoo membantu kamu menemukan film dan series terbaik. Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan more.",
    images: ["/og-image.jpg"],
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={inter.className}>
        <Providers>
          {children}
          <Suspense>
            <PageLoader />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
