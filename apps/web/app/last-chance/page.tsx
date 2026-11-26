import type { Metadata } from "next";
import LastChanceClient from "./last-chance-detail";

export const metadata: Metadata = {
  title: "Film yang Akan Segera Hilang dari Streaming",
  description:
    "Daftar film dan series yang akan segera dihapus dari Netflix, Disney+, dan platform streaming lainnya. Tonton sebelum terlambat!",
  openGraph: {
    title: "Film Segera Hilang dari Streaming | Movyoo",
    description:
      "Tonton sebelum terlambat — film dan series yang akan segera dihapus dari platform streaming.",
    url: "https://movyoo.id/last-chance",
  },
  alternates: {
    canonical: "https://movyoo.id/last-chance",
  },
};

export default function LastChancePage() {
  return <LastChanceClient />;
}
