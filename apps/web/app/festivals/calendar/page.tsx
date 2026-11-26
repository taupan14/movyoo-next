import type { Metadata } from "next";
import { FestivalCalendarClient } from "./festival-calendar-client";

const SITE_URL = "https://movyoo.id";

export const metadata: Metadata = {
  title: "Kalender Festival Film — Movyoo",
  description:
    "Kalender lengkap jadwal festival film dunia: Cannes, Venice, Berlinale, TIFF, Sundance, dan FFI.",
  alternates: { canonical: `${SITE_URL}/festivals/calendar` },
};

export default function FestivalCalendarPage() {
  return <FestivalCalendarClient />;
}
