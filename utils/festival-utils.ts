import type { FestivalEdition } from "../types/home";

export function festivalStatusLabel(
  status: FestivalEdition["status"],
  locale: string,
): string {
  if (locale === "id") {
    return status === "ongoing"
      ? "Berlangsung"
      : status === "upcoming"
        ? "Segera"
        : "Selesai";
  }
  return status === "ongoing"
    ? "Ongoing"
    : status === "upcoming"
      ? "Upcoming"
      : "Completed";
}

export function festivalStatusColor(status: FestivalEdition["status"]): string {
  return status === "ongoing"
    ? "bg-green-500/20 text-green-400 border-green-500/30"
    : status === "upcoming"
      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
      : "bg-white/10 text-white/50 border-white/10";
}

export function formatDateRange(
  start: string | null,
  end: string | null,
  locale: string,
): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const lang = locale === "id" ? "id-ID" : "en-US";
  const s = new Date(start).toLocaleDateString(lang, opts);
  if (!end) return s;
  const e = new Date(end).toLocaleDateString(lang, opts);
  return `${s} – ${e}`;
}
