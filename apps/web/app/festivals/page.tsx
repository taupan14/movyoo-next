import type { Metadata } from "next";
import { FestivalsListClient } from "./festivals-list-client";

const SITE_URL = "https://movyoo.id";

export const metadata: Metadata = {
  title: "Festival Film — Jadwal, Lineup, dan Berita Terbaru | Movyoo",
  description:
    "Jelajahi festival film dunia: Cannes, Venice, Berlinale, TIFF, Sundance, dan FFI. Lihat jadwal, lineup, kandidat Oscar, dan berita terbaru.",
  alternates: { canonical: `${SITE_URL}/festivals` },
  openGraph: {
    title: "Festival Film — Movyoo",
    description:
      "Jadwal, lineup, dan berita festival film dunia dalam satu tempat.",
    url: `${SITE_URL}/festivals`,
    siteName: "Movyoo",
    type: "website",
  },
};

export default function FestivalsPage() {
  return <FestivalsListClient />;
}
