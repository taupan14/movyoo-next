import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { PageLoader } from "@/components/page-loader";
import { Suspense } from "react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Movyoo - Your Movie Discovery",
  description:
    "Discover the best movies and where to watch them. Smart recommendations, mood-based discovery, and more.",
  openGraph: {
    title: "Movyoo - Your Movie Discovery",
    description: "Discover the best movies and where to watch them.",
  },
  twitter: {
    card: "summary_large_image",
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
          {/* PageLoader tidak perlu wrap children — dia standalone visual */}
          <Suspense>
            <PageLoader />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
