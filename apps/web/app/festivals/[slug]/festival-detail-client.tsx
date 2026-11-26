"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Film,
  Clapperboard,
  Newspaper,
  Globe,
  Ticket,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";
import { getPosterUrl } from "@/lib/tmdb";
import { FESTIVAL_META } from "@/types/constants";
import {
  festivalStatusColor,
  festivalStatusLabel,
  formatDateRange,
} from "@/utils/festival-utils";
import type { FestivalDetail } from "@/types/home";
import type { FestivalTicket } from "@/types/festivals-extra";

interface Props {
  slug: string;
  initialYear: number;
  locale: string;
}

type Detail = FestivalDetail & { tickets: FestivalTicket[] };

type Tab = "lineup" | "buzz" | "oscar" | "tickets";

export function FestivalDetailClient({ slug, initialYear, locale }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("lineup");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/festivals/${slug}?year=${initialYear}&lang=${locale}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Detail | null) => {
        if (data) setDetail(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, [slug, initialYear, locale]);

  if (loading) {
    return (
      <main className="min-h-screen pt-6 pb-24 px-4 lg:px-6">
        <div className="h-[220px] rounded-2xl bg-white/10 animate-pulse mb-4" />
        <div className="h-6 w-1/3 rounded bg-white/10 animate-pulse mb-2" />
        <div className="h-4 w-1/2 rounded bg-white/10 animate-pulse" />
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-screen pt-24 px-4 text-center text-muted-foreground">
        {locale === "id" ? "Data festival tidak ditemukan." : "Festival data not found."}
      </main>
    );
  }

  const { festival, edition } = detail;
  const meta = FESTIVAL_META[festival.slug] ?? FESTIVAL_META["cannes"];

  const tabs: { id: Tab; label: string; icon: typeof Clapperboard; count?: number }[] = [
    { id: "lineup", label: "Lineup", icon: Clapperboard, count: detail.lineup.length },
    { id: "buzz", label: "Buzz", icon: Newspaper, count: detail.buzz.length },
    { id: "oscar", label: "Oscar Contender", icon: Trophy, count: detail.oscarContenders.length },
    { id: "tickets", label: locale === "id" ? "Tiket" : "Tickets", icon: Ticket, count: detail.tickets.length },
  ];

  return (
    <main className="min-h-screen pb-24">
      {/* Hero */}
      <div className="relative w-full aspect-[21/9] lg:aspect-[3/1] overflow-hidden bg-muted">
        {festival.banner_path ? (
          <img
            src={festival.banner_path}
            alt={festival.short_name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />

        <Link
          href="/festivals"
          className="absolute top-4 left-4 lg:top-6 lg:left-8 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs backdrop-blur-sm hover:bg-black/70 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {locale === "id" ? "Semua festival" : "All festivals"}
        </Link>

        <div className="absolute inset-x-0 bottom-0 px-4 lg:px-8 pb-5 max-w-6xl mx-auto w-full">
          <p className="text-xs font-medium text-white/70">
            {meta.flag} {festival.location}
          </p>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mt-1">
            {locale === "id" ? festival.name : festival.name_en}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${festivalStatusColor(edition.status)}`}>
              {festivalStatusLabel(edition.status, locale)}
            </span>
            <span className="text-xs text-white/70">
              {edition.edition_number ? `Edisi ke-${edition.edition_number} · ` : ""}
              {edition.year}
              {edition.date_start
                ? ` · ${formatDateRange(edition.date_start, edition.date_end, locale)}`
                : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-8 -mt-2 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
          {/* Main column */}
          <div className="flex-1 min-w-0">
            {(locale === "id" ? festival.description : festival.description_en) && (
              <p className="text-sm text-muted-foreground leading-relaxed mb-5 mt-5">
                {locale === "id" ? festival.description : festival.description_en}
              </p>
            )}

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-white/10 pb-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0
                    ${
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] px-1.5 rounded-full ${activeTab === tab.id ? "bg-white/20" : "bg-white/10"}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="pt-5">
              {activeTab === "lineup" && (
                <div>
                  {detail.sections
                    .filter((sec) => detail.lineup.some((l) => l.section?.id === sec.id))
                    .map((sec) => {
                      const films = detail.lineup.filter((l) => l.section?.id === sec.id);
                      return (
                        <div key={sec.id} className="mb-6">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            {locale === "id" ? sec.name : sec.name_en}
                          </p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                            {films.map((film) => {
                              const poster = film.movie?.poster_path ?? film.poster_path;
                              const title = film.movie?.title ?? film.external_title ?? "—";
                              const href = film.movie?.tmdb_id ? `/movie/${film.movie.tmdb_id}` : "#";
                              const Wrapper = film.movie?.tmdb_id ? Link : "div";
                              return (
                                <Wrapper key={film.id} href={href as string} className="group">
                                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 hover-lift">
                                    {poster ? (
                                      <img
                                        src={getPosterUrl(poster, "w185")}
                                        alt={title}
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <Film className="w-6 h-6 text-white/20" />
                                      </div>
                                    )}
                                    {film.is_winner && (
                                      <span className="absolute top-1 left-1 text-[9px] bg-primary/80 text-white px-1.5 py-1 rounded font-bold">
                                        🏆 WIN
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1.5 text-xs font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                                    {title}
                                  </p>
                                  {film.director && (
                                    <p className="text-[10px] text-muted-foreground truncate">{film.director}</p>
                                  )}
                                </Wrapper>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  {!detail.lineup.length && (
                    <p className="text-sm text-muted-foreground text-center py-10">
                      {locale === "id" ? "Lineup belum diumumkan." : "Lineup not announced yet."}
                    </p>
                  )}
                </div>
              )}

              {activeTab === "buzz" && (
                <div className="space-y-3">
                  {detail.buzz.map((item) => (
                    <div key={item.id} className="rounded-xl bg-white/5 p-4 flex gap-3">
                      {item.buzz_score != null && (
                        <div className="flex-shrink-0 flex flex-col items-center justify-center w-10">
                          <span className="text-lg font-bold text-primary leading-none">{item.buzz_score}</span>
                          <span className="text-[9px] text-muted-foreground">/10</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {item.source}
                          </span>
                          {item.published_at && (
                            <span className="text-[10px] text-muted-foreground/60">
                              · {new Date(item.published_at).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground leading-snug">{item.headline}</p>
                        {item.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                        )}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-xs text-primary hover:underline"
                          >
                            {locale === "id" ? "Baca selengkapnya" : "Read more"} <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  {!detail.buzz.length && (
                    <p className="text-sm text-muted-foreground text-center py-10">
                      {locale === "id" ? "Belum ada berita terbaru." : "No buzz yet."}
                    </p>
                  )}
                </div>
              )}

              {activeTab === "oscar" && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {detail.oscarContenders.map((film) => {
                    const poster = film.movie?.poster_path ?? film.poster_path;
                    const title = film.movie?.title ?? film.external_title ?? "—";
                    const href = film.movie?.tmdb_id ? `/movie/${film.movie.tmdb_id}` : "#";
                    return (
                      <Link key={film.id} href={href} className="group">
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 hover-lift">
                          {poster ? (
                            <img
                              src={getPosterUrl(poster, "w185")}
                              alt={title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="w-6 h-6 text-white/20" />
                            </div>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                          {title}
                        </p>
                      </Link>
                    );
                  })}
                  {!detail.oscarContenders.length && (
                    <p className="text-sm text-muted-foreground text-center py-10 col-span-full">
                      {locale === "id" ? "Belum ada kandidat Oscar." : "No Oscar contenders yet."}
                    </p>
                  )}
                </div>
              )}

              {activeTab === "tickets" && (
                <div className="space-y-3">
                  {detail.tickets.map((t) => (
                    <div key={t.id} className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {locale === "id" ? t.tier_name : (t.tier_name_en ?? t.tier_name)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.price_min != null
                            ? `${t.currency} ${t.price_min.toLocaleString(locale === "id" ? "id-ID" : "en-US")}${
                                t.price_max && t.price_max !== t.price_min
                                  ? ` – ${t.currency} ${t.price_max.toLocaleString(locale === "id" ? "id-ID" : "en-US")}`
                                  : ""
                              }`
                            : locale === "id"
                              ? "Harga belum diumumkan"
                              : "Price not announced"}
                        </p>
                        {(locale === "id" ? t.notes : (t.notes_en ?? t.notes)) && (
                          <p className="text-[11px] text-muted-foreground/70 mt-1">
                            {locale === "id" ? t.notes : (t.notes_en ?? t.notes)}
                          </p>
                        )}
                      </div>
                      {t.purchase_url && (
                        <a
                          href={t.purchase_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          <Ticket className="w-3.5 h-3.5" />
                          {locale === "id" ? "Beli" : "Buy"}
                        </a>
                      )}
                    </div>
                  ))}
                  {!detail.tickets.length && (
                    <p className="text-sm text-muted-foreground text-center py-10">
                      {locale === "id" ? "Informasi tiket belum tersedia." : "Ticket info not available yet."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:w-72 shrink-0">
            <div className="lg:sticky lg:top-8 flex flex-col gap-4 mt-5 lg:mt-5">
              <div className="p-4 rounded-2xl bg-card border border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  {locale === "id" ? "Info Festival" : "Festival Info"}
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-foreground">
                    <Trophy className="w-3.5 h-3.5 text-primary" />
                    {meta.award}
                  </div>
                  {festival.website_url && (
                    <a
                      href={festival.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      {locale === "id" ? "Situs resmi" : "Official website"}
                    </a>
                  )}
                </div>
              </div>

              {festival.website_url && (
                <a
                  href={festival.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full gradient-primary text-white font-semibold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
                >
                  {locale === "id" ? "Kunjungi Situs Resmi" : "Visit Official Site"}
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
