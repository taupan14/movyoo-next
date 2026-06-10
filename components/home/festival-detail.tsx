"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Film,
  Award,
  Clapperboard,
  Newspaper,
  Globe,
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

interface FestivalDetailPanelProps {
  slug: string;
  year: number;
  locale: string;
}

export function FestivalDetailPanel({
  slug,
  year,
  locale,
}: FestivalDetailPanelProps) {
  const [detail, setDetail] = useState<FestivalDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"lineup" | "buzz" | "oscar">(
    "lineup",
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setDetail(null);

    const lang = locale === "id" ? "id" : "en";
    fetch(`/api/festivals/${slug}?year=${year}&lang=${lang}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FestivalDetail) => {
        if (!cancelled) {
          // console.log("[FestivalDetailPanel] data:", data);
          setDetail(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[FestivalDetailPanel] fetch error:", e);
          setDetail(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [slug, year, locale]);

  const tabs = [
    {
      id: "lineup" as const,
      label: "Lineup",
      icon: Clapperboard,
      count: detail?.lineup.length,
    },
    // {
    //   id: "awards" as const,
    //   label: locale === "id" ? "Penghargaan" : "Awards",
    //   icon: Award,
    //   count: detail?.awards.length,
    // },
    {
      id: "buzz" as const,
      label: "Buzz",
      icon: Newspaper,
      count: detail?.buzz.length,
    },
    {
      id: "oscar" as const,
      label: "Oscar Contender",
      icon: Trophy,
      count: detail?.oscarContenders.length,
    },
  ];

  if (loading) {
    return (
      <div className="mt-4 rounded-2xl glass p-4 animate-pulse space-y-3">
        <div className="h-4 w-1/3 rounded bg-white/10" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-24 rounded-lg bg-white/10" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-white/10" />
          ))}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mt-4 rounded-2xl glass p-6 text-center text-sm text-muted-foreground">
        {locale === "id"
          ? "Data festival belum tersedia."
          : "Festival data not available yet."}
      </div>
    );
  }

  const { festival, edition } = detail;
  const meta = FESTIVAL_META[festival.slug] ?? FESTIVAL_META["cannes"];

  return (
    <div className="mt-4 rounded-2xl glass overflow-hidden animate-slide-up">
      {/* ── Header panel ──────────────────────────────────────────────────────── */}
      <div className={`px-4 pt-4 pb-3 bg-gradient-to-r ${meta.gradient}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xs font-medium`}>
              {meta.flag} {festival.location}
            </p>
            <h4 className="text-base font-bold text-primary mt-0.5">
              {locale === "id" ? festival.name : festival.name_en}
            </h4>
            <p className="text-xs text-white/60 mt-0.5">
              {edition.edition_number
                ? `Edisi ke-${edition.edition_number} · `
                : ""}
              {edition.year}
              {edition.date_start
                ? ` · ${formatDateRange(edition.date_start, edition.date_end, locale)}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${festivalStatusColor(edition.status)}`}
            >
              {festivalStatusLabel(edition.status, locale)}
            </span>
            {festival.website_url && (
              <a
                href={festival.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg glass hover:bg-white/10 transition-colors"
                aria-label="Website resmi"
              >
                <Globe className="w-4 h-4 text-white/70" />
              </a>
            )}
          </div>
        </div>
        {(locale === "id" ? festival.description : festival.description_en) && (
          <p className="text-xs text-white/60 mt-2 line-clamp-2">
            {locale === "id" ? festival.description : festival.description_en}
          </p>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-3 pt-3 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0
              ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`text-[9px] px-1 rounded-full ${
                  activeTab === tab.id ? "bg-white/20" : "bg-white/10"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────────── */}
      <div className="p-3">
        {/* LINEUP */}
        {activeTab === "lineup" && (
          <div>
            {detail.sections
              .filter((sec) =>
                detail.lineup.some((l) => l.section?.id === sec.id),
              )
              .map((sec) => {
                const films = detail.lineup.filter(
                  (l) => l.section?.id === sec.id,
                );
                return (
                  <div key={sec.id} className="mb-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                      {locale === "id" ? sec.name : sec.name_en}
                    </p>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                      {films.map((film) => {
                        const poster =
                          film.movie?.poster_path ?? film.poster_path;
                        const title =
                          film.movie?.title ?? film.external_title ?? "—";
                        const href = film.movie?.tmdb_id
                          ? `/movie/${film.movie.tmdb_id}`
                          : "#";
                        return (
                          <div
                            key={film.id}
                            // href={href}
                            className="flex-shrink-0 w-[90px] group"
                          >
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
                              <div className="absolute top-1 left-1 flex gap-1">
                                {film.is_winner && (
                                  <span className="text-[9px] bg-primary/80 text-white px-1.5 py-1 rounded font-bold leading-none mt-1 ms-0.5">
                                    🏆 WIN
                                  </span>
                                )}
                                {film.is_world_premiere && (
                                  <span className="text-[8px] bg-primary/90 text-white px-1 py-0.5 rounded font-medium leading-none">
                                    WP
                                  </span>
                                )}
                                {film.is_oscar_contender && (
                                  <span className="text-[8px] bg-amber-500/90 text-white px-1 py-0.5 rounded font-medium leading-none">
                                    🏆
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="mt-1 text-[10px] font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                              {title}
                            </p>
                            {film.director && (
                              <p className="text-[9px] text-muted-foreground truncate">
                                {film.director}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            {/* Film tanpa seksi */}
            {(() => {
              const noSection = detail.lineup.filter((l) => !l.section);
              if (!noSection.length) return null;
              return (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    {locale === "id" ? "Lainnya" : "Other"}
                  </p>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {noSection.map((film) => {
                      const poster =
                        film.movie?.poster_path ?? film.poster_path;
                      const title =
                        film.movie?.title ?? film.external_title ?? "—";
                      const href = film.movie?.tmdb_id
                        ? `/movie/${film.movie.tmdb_id}`
                        : "#";
                      return (
                        <Link
                          key={film.id}
                          href={href}
                          className="flex-shrink-0 w-[90px] group"
                        >
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
                          <p className="mt-1 text-[10px] font-medium text-foreground line-clamp-2 leading-tight">
                            {title}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {!detail.lineup.length && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {locale === "id"
                  ? "Lineup belum diumumkan."
                  : "Lineup not announced yet."}
              </p>
            )}
          </div>
        )}

        {/* AWARDS */}
        {/* {activeTab === "awards" && (
          <div className="space-y-3">
            {detail.awards.map((award) => (
              <div key={award.id} className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className={`w-4 h-4 ${meta.badgeText}`} />
                  <p className="text-sm font-semibold text-foreground">
                    {locale === "id" ? award.name : award.name_en}
                  </p>
                </div>
                {award.winners.length > 0 ? (
                  <div className="space-y-2">
                    {award.winners.map((w) => {
                      const posterPath =
                        w.lineup?.movie?.poster_path ?? w.lineup?.poster_path;
                      const filmTitle =
                        w.lineup?.movie?.title ?? w.lineup?.external_title;
                      const href = w.lineup?.movie?.tmdb_id
                        ? `/movie/${w.lineup.movie.tmdb_id}`
                        : null;

                      return (
                        <div
                          key={w.id}
                          className={`flex items-center gap-3 rounded-lg p-2 ${
                            w.is_winner
                              ? "bg-amber-500/10 border border-amber-500/20"
                              : "bg-white/5"
                          }`}
                        >
                          {posterPath && (
                            <div className="w-9 h-[54px] flex-shrink-0 rounded-md overflow-hidden">
                              <img
                                src={getPosterUrl(posterPath, "w92")}
                                alt={filmTitle ?? ""}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {w.is_winner && (
                              <span className="text-[9px] font-semibold text-amber-400 uppercase tracking-wider">
                                🏆 Winner
                              </span>
                            )}
                            {filmTitle &&
                              (href ? (
                                <Link
                                  href={href}
                                  className="block text-xs font-medium text-foreground hover:text-primary truncate transition-colors"
                                >
                                  {filmTitle}
                                </Link>
                              ) : (
                                <p className="text-xs font-medium text-foreground truncate">
                                  {filmTitle}
                                </p>
                              ))}
                            {w.lineup?.director && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {w.lineup.director}
                              </p>
                            )}
                            {w.person_name && (
                              <p className="text-xs text-foreground">
                                {w.person_name}
                              </p>
                            )}
                            {w.special_mention && (
                              <p className="text-[10px] text-muted-foreground italic">
                                {w.special_mention}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {locale === "id"
                      ? "Belum diumumkan."
                      : "Not announced yet."}
                  </p>
                )}
              </div>
            ))}

            {!detail.awards.length && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {locale === "id"
                  ? "Penghargaan belum diumumkan."
                  : "Awards not announced yet."}
              </p>
            )}
          </div>
        )} */}

        {/* BUZZ */}
        {activeTab === "buzz" && (
          <div className="space-y-2">
            {detail.buzz.map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-white/5 p-3 flex gap-3"
              >
                {item.buzz_score != null && (
                  <div className="flex-shrink-0 flex flex-col items-center justify-center w-8">
                    <span className="text-base font-bold text-primary leading-none">
                      {item.buzz_score}
                    </span>
                    <span className="text-[8px] text-muted-foreground">
                      /10
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {item.source}
                    </span>
                    {item.published_at && (
                      <span className="text-[9px] text-muted-foreground/60">
                        ·{" "}
                        {new Date(item.published_at).toLocaleDateString(
                          locale === "id" ? "id-ID" : "en-US",
                          { day: "numeric", month: "short" },
                        )}
                      </span>
                    )}
                    {item.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                    {item.headline}
                  </p>
                  {item.summary && (
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary hover:underline"
                    >
                      Baca selengkapnya <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}

            {!detail.buzz.length && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {locale === "id"
                  ? "Belum ada berita terbaru."
                  : "No buzz articles yet."}
              </p>
            )}
          </div>
        )}

        {/* OSCAR CONTENDERS */}
        {activeTab === "oscar" && (
          <div>
            <p className="text-xs text-muted-foreground mb-3 px-1">
              {locale === "id"
                ? "Film-film yang diprediksi akan bersaing di Academy Awards."
                : "Films predicted to compete at the Academy Awards."}
            </p>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
              {detail.oscarContenders.map((film) => {
                const poster = film.movie?.poster_path ?? film.poster_path;
                const title = film.movie?.title ?? film.external_title ?? "—";
                const href = film.movie?.tmdb_id
                  ? `/movie/${film.movie.tmdb_id}`
                  : "#";
                return (
                  <Link
                    key={film.id}
                    href={href}
                    className="flex-shrink-0 w-[100px] group"
                  >
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
                      <div className="absolute top-1 right-1">
                        <span className="text-xs">🏆</span>
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                      {title}
                    </p>
                    {film.director && (
                      <p className="text-[9px] text-muted-foreground truncate">
                        {film.director}
                      </p>
                    )}
                    {film.section && (
                      <p className="text-[9px] text-muted-foreground truncate">
                        {locale === "id"
                          ? film.section.name
                          : film.section.name_en}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>

            {!detail.oscarContenders.length && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {locale === "id"
                  ? "Belum ada kandidat Oscar yang diidentifikasi."
                  : "No Oscar contenders identified yet."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
