import type { Metadata } from "next";
import ExploreClient from "./explore-detail";

export const metadata: Metadata = {
  title: "Jelajahi Film & Series",
  description:
    "Temukan film dan series terbaik berdasarkan genre, platform streaming, rating, dan tahun rilis. Filter lengkap untuk semua selera.",
  openGraph: {
    title: "Jelajahi Film & Series | Movyoo",
    description:
      "Temukan film dan series terbaik berdasarkan genre, platform streaming, rating, dan tahun rilis.",
    url: "https://movyoo.id/explore",
  },
  alternates: {
    canonical: "https://movyoo.id/explore",
  },
};

export default function ExplorePage() {
  return <ExploreClient />;
}
