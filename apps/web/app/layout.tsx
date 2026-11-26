import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { PageLoader } from "@/components/page-loader";
import { Suspense } from "react";
import { Footer } from "@/components/footer";
import { AdsProvider } from "@/components/ads/AdsProvider";
import { getInitialAdState } from "@/lib/ads/get-ad-flags";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"] });

const BASE_URL = "https://movyoo.id";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Movyoo — Temukan Film Terbaik untuk Ditonton",
    template: "%s | Movyoo",
  },
  description:
    "Movyoo membantu kamu menemukan film dan series terbaik. Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan lainnya.",
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
      "Movyoo membantu kamu menemukan film dan series terbaik. Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan lainnya.",
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
      "Movyoo membantu kamu menemukan film dan series terbaik. Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan lainnya.",
    images: ["/og-image.jpg"],
  },
  alternates: {
    canonical: BASE_URL,
  },
  other: {
    "google-adsense-account": process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID!,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialAdState = await getInitialAdState();

  return (
    <html lang="id">
      {/* Google AdSense */}
      <head>
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}`}
          crossOrigin="anonymous"
        />
      </head>
      <body className={inter.className}>
        <Providers>
          <AdsProvider initialState={initialAdState}>
            {children}
            <Suspense>
              <PageLoader />
            </Suspense>
            <Footer />
          </AdsProvider>
        </Providers>
      </body>
    </html>
  );
}
