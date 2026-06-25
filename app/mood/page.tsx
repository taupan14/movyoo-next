import type { Metadata } from "next";
import MoodClient from "./mood-detail";

export const metadata: Metadata = {
  title: "Rekomendasi Film Berdasarkan Mood",
  description:
    "Lagi pengen nonton apa? Pilih mood kamu — senang, sedih, tegang, atau santai — dan Movyoo rekomendasikan film yang pas.",
  openGraph: {
    title: "Rekomendasi Film Berdasarkan Mood | Movyoo",
    description:
      "Pilih mood kamu dan temukan film yang pas untuk ditonton sekarang.",
    url: "https://movyoo.id/mood",
  },
  alternates: {
    canonical: "https://movyoo.id/mood",
  },
};

export default function MoodPage() {
  return <MoodClient />;
}
