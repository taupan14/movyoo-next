"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useI18n } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";
import { FESTIVAL_META } from "@/types/constants";
import { festivalStatusColor, festivalStatusLabel } from "@/utils/festival-utils";
import type { FestivalCalendarData, FestivalCalendarItem } from "@/types/festivals-extra";

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDate(iso: string) {
  return new Date(iso + "T00:00:00");
}

function dayInRange(day: Date, item: FestivalCalendarItem) {
  const start = toDate(item.date_start);
  const end = item.date_end ? toDate(item.date_end) : start;
  return day >= start && day <= end;
}

export function FestivalCalendarClient() {
  const { locale } = useI18n();
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [data, setData] = useState<FestivalCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FestivalCalendarItem | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/festivals/calendar?year=${viewYear}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, [viewYear]);

  const monthNames = locale === "id" ? MONTH_NAMES_ID : MONTH_NAMES_EN;
  const weekdays = locale === "id" ? WEEKDAYS_ID : WEEKDAYS_EN;

  // ── Bangun grid hari untuk bulan yang sedang dilihat ─────────────────────────
  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay(); // 0=Min
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const items = data?.items ?? [];

    const list: { date: Date | null; items: FestivalCalendarItem[] }[] = [];
    for (let i = 0; i < startWeekday; i++) list.push({ date: null, items: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const matched = items.filter((it) => dayInRange(date, it));
      list.push({ date, items: matched });
    }
    return list;
  }, [viewYear, viewMonth, data]);

  // Festival yang aktif/overlap di bulan yang sedang dilihat (untuk legenda)
  const monthLegend = useMemo(() => {
    if (!data) return [];
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0);
    const seen = new Map<number, FestivalCalendarItem>();
    for (const it of data.items) {
      const start = toDate(it.date_start);
      const end = it.date_end ? toDate(it.date_end) : start;
      if (start <= monthEnd && end >= monthStart) seen.set(it.edition_id, it);
    }
    return Array.from(seen.values());
  }, [data, viewYear, viewMonth]);

  // Timeline: semua edisi diurutkan, dari yang terdekat ke hari ini
  const timeline = useMemo(() => {
    if (!data) return [];
    return [...data.items].sort(
      (a, b) => toDate(a.date_start).getTime() - toDate(b.date_start).getTime(),
    );
  }, [data]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <main className="min-h-screen pt-6 pb-24 px-4 lg:px-6">
      <h1 className="text-2xl lg:text-3xl font-bold text-gradient mb-1">
        {locale === "id" ? "Kalender Festival" : "Festival Calendar"}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {locale === "id"
          ? "Lihat jadwal festival film dunia sepanjang tahun."
          : "Browse the world's film festival schedule throughout the year."}
      </p>

      <div className="max-w-3xl mx-auto">
        {/* ── Grid kalender ──────────────────────────────────────────────────── */}
        <div className="rounded-2xl glass p-4 lg:p-5">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goPrevMonth}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-base font-semibold text-foreground">
              {monthNames[viewMonth]} {viewYear}
            </p>
            <button
              onClick={goNextMonth}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {monthLegend.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {monthLegend.map((it) => (
                <span
                  key={it.edition_id}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: it.accent_color }}
                  />
                  {it.short_name}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-7 gap-1">
            {weekdays.map((w) => (
              <div key={w} className="text-[10px] text-muted-foreground text-center pb-1">
                {w}
              </div>
            ))}
            {loading
              ? Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-lg bg-white/5 animate-pulse" />
                ))
              : cells.map((cell, i) => {
                  if (!cell.date) return <div key={i} />;
                  const isToday =
                    cell.date.toDateString() === today.toDateString();
                  const primaryItem = cell.items[0];
                  return (
                    <button
                      key={i}
                      onClick={() => primaryItem && setSelectedItem(primaryItem)}
                      disabled={!primaryItem}
                      className={cn(
                        "aspect-square rounded-lg text-xs flex items-center justify-center transition-colors relative",
                        primaryItem ? "font-semibold" : "text-foreground/80",
                        isToday && "ring-1 ring-primary",
                      )}
                      style={
                        primaryItem
                          ? {
                              backgroundColor: `${primaryItem.accent_color}26`,
                              color: primaryItem.accent_color,
                            }
                          : undefined
                      }
                    >
                      {cell.date.getDate()}
                      {cell.items.length > 1 && (
                        <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current" />
                      )}
                    </button>
                  );
                })}
          </div>

          {selectedItem && (
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedItem.short_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {selectedItem.location}
                </p>
              </div>
              <Link
                href={`/festivals/${selectedItem.slug}?year=${selectedItem.year}`}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                {locale === "id" ? "Lihat detail" : "View details"}
              </Link>
            </div>
          )}
        </div>

        {/* ── Timeline ringkas ──────────────────────────────────────────────── */}
        <div className="mt-8">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {locale === "id" ? "Daftar Edisi" : "Edition List"}
          </p>
          <div className="flex flex-col gap-2">
            {timeline.map((it) => {
              const meta = FESTIVAL_META[it.slug] ?? FESTIVAL_META["cannes"];
              return (
                <Link
                  key={it.edition_id}
                  href={`/festivals/${it.slug}?year=${it.year}`}
                  className="flex items-center gap-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors p-3"
                >
                  <div
                    className="w-1.5 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: it.accent_color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {meta.flag} {it.short_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {toDate(it.date_start).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
                        day: "numeric",
                        month: "short",
                      })}
                      {it.date_end
                        ? ` – ${toDate(it.date_end).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { day: "numeric", month: "short", year: "numeric" })}`
                        : ` ${it.year}`}
                      {" · "}
                      {it.location}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border ${festivalStatusColor(it.status)}`}
                  >
                    {festivalStatusLabel(it.status, locale)}
                  </span>
                </Link>
              );
            })}
            {!loading && !timeline.length && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {locale === "id" ? "Belum ada jadwal." : "No schedule yet."}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
