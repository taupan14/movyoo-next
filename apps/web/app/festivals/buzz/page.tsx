import type { Metadata } from "next";
import { FestivalBuzzClient } from "./festival-buzz-client";

const SITE_URL = "https://movyoo.id";

export const metadata: Metadata = {
  title: "Buzz Festival Film — Berita Terbaru | Movyoo",
  description:
    "Berita dan reaksi kritikus terbaru dari festival film dunia: Cannes, Venice, Berlinale, TIFF, Sundance, dan FFI.",
  alternates: { canonical: `${SITE_URL}/festivals/buzz` },
};

export default function FestivalBuzzPage() {
  return <FestivalBuzzClient />;
}
