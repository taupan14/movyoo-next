"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, MapPin, Calendar, Newspaper, ArrowRight } from "lucide-react";
import { useI18n } from "@/hooks/use-locale";
import { FESTIVAL_META } from "@/types/constants";
import { festivalStatusColor, festivalStatusLabel, formatDateRange } from "@/utils/festival-utils";
import type { FestivalListData } from "@/types/festivals-extra";

function FestivalCard({
  item,
  locale,
}: {
  item: FestivalListData["festivals"][number];
  locale: string;
}) {
  const { festival, latestEdition } = item;
  const meta = FESTIVAL_META[festival.slug] ?? FESTIVAL_META["cannes"];

  return (
    <Link
      href={`/festivals/${festival.slug}`}
      className="group relative rounded-2xl overflow-hidden hover-lift card-shine ring-1 ring-white/10"
    >
      <div className="relative h-[180px]">
        {festival.banner_path ? (
          <img
            src={festival.banner_path}
            alt={festival.short_name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${meta.gradient}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        {latestEdition && (
          <span
            className={`absolute top-3 right-3 text-[10px] font-semibold px-2 py-1 rounded-full border ${festivalStatusColor(latestEdition.status)}`}
          >
            {festivalStatusLabel(latestEdition.status, locale)}
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <span>{meta.flag}</span>
          <MapPin className="w-3 h-3" />
          {festival.location}
        </div>
        <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
          {locale === "id" ? festival.name : festival.name_en}
        </h3>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
          <Trophy className="w-3 h-3" />
          {meta.award}
        </div>
        {latestEdition?.date_start && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-foreground">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            {latestEdition.edition_number ? `Edisi ke-${latestEdition.edition_number} · ` : ""}
            {formatDateRange(latestEdition.date_start, latestEdition.date_end, locale)}
          </div>
        )}
        <div className="flex items-center gap-1 mt-3 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          {locale === "id" ? "Lihat detail" : "View details"}
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
}

export function FestivalsListClient() {
  const { locale } = useI18n();
  const [data, setData] = useState<FestivalListData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/festivals/list", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-screen pt-6 pb-24">
      <div className="px-4 lg:px-6 mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
          {locale === "id" ? "Festival Film" : "Film Festivals"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {locale === "id"
            ? "Jadwal, lineup, kandidat Oscar, dan berita dari festival film dunia."
            : "Schedules, lineups, Oscar contenders, and news from the world's film festivals."}
        </p>
        <div className="flex gap-2 mt-4">
          <Link
            href="/festivals/calendar"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg glass text-xs font-medium text-foreground hover:bg-white/10 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
            {locale === "id" ? "Kalender" : "Calendar"}
          </Link>
          <Link
            href="/festivals/buzz"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg glass text-xs font-medium text-foreground hover:bg-white/10 transition-colors"
          >
            <Newspaper className="w-3.5 h-3.5" />
            Buzz
          </Link>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[280px] rounded-2xl bg-white/10 animate-pulse" />
            ))}
          </div>
        ) : !data?.festivals.length ? (
          <p className="text-center text-muted-foreground py-20">
            {locale === "id" ? "Belum ada data festival." : "No festival data yet."}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
            {data.festivals.map((item) => (
              <FestivalCard key={item.festival.id} item={item} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
