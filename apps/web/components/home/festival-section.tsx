"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Trophy, ChevronRight, Film } from "lucide-react";
import { getPosterUrl } from "@/lib/tmdb";
import { SectionHeaderHome } from "@/components/section-header";
import { FestivalBannerCard } from "./festival-banner";
import { FestivalDetailPanel } from "./festival-detail";
import type { FestivalHomeCard, FestivalsData } from "@/types/home";

interface FilmFestivalSectionProps {
  locale: string;
}

export function FilmFestivalSection({ locale }: FilmFestivalSectionProps) {
  const [festivalsData, setFestivalsData] = useState<FestivalsData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [activeFestival, setActiveFestival] = useState<FestivalHomeCard | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    const lang = locale === "id" ? "id" : "en";

    fetch(`/api/festivals?lang=${lang}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FestivalsData | null) => {
        if (!controller.signal.aborted && data) {
          // console.log("[festivals] data:", data);
          setFestivalsData(data);
          // Auto-select: pilih ongoing/upcoming pertama, atau yang pertama
          // const auto =
          //   data.festivals.find((f) => f.latestEdition?.status === "ongoing") ??
          //   data.festivals.find(
          //     (f) => f.latestEdition?.status === "upcoming",
          //   ) ??
          //   data.festivals[0] ??
          //   null;

          // console.log("[festivals] auto:", auto);
          setActiveFestival(data.festivals[0]);
        }
        if (!controller.signal.aborted) setLoading(false);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setLoading(false);
      });

    return () => controller.abort();
  }, [locale]);

  const sectionTitle = locale === "id" ? "Festival Film" : "Film Festivals";

  if (loading) {
    return (
      <section className="mb-8">
        <div className="h-5 w-36 rounded-md bg-white/10 mx-4 lg:mx-6 mb-3 animate-pulse" />
        <div className="flex gap-3 overflow-hidden px-4 lg:px-6">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="w-[200px] lg:w-[240px] h-[160px] flex-shrink-0 rounded-2xl bg-white/10 animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!festivalsData?.festivals.length) return null;

  return (
    <section className="mb-8 animate-slide-up">
      <SectionHeaderHome title={sectionTitle} />

      {/* ── Banner carousel ──────────────────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-3">
        {festivalsData.festivals.map((card) => (
          <FestivalBannerCard
            key={card.festival.id}
            card={card}
            locale={locale}
            onClick={() =>
              setActiveFestival((prev) =>
                prev?.festival.id === card.festival.id ? null : card,
              )
            }
            isActive={activeFestival?.festival.id === card.festival.id}
          />
        ))}
      </div>

      {/* ── Detail panel (expandable) ─────────────────────────────────────────── */}
      {activeFestival && activeFestival.latestEdition && (
        <div className="px-4 lg:px-6">
          <FestivalDetailPanel
            slug={activeFestival.festival.slug}
            year={activeFestival.latestEdition.year}
            locale={locale}
          />
        </div>
      )}

      {/* ── Oscar contenders row (lintas festival) ────────────────────────────── */}
      {festivalsData.oscarContenders.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between px-4 lg:px-6 mb-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-lg font-semibold text-foreground">
                {locale === "id"
                  ? "Nominasi Kandidat Oscar"
                  : "Oscar Contender Nominees"}
              </span>
            </div>
            <Link
              href="/festivals/oscar"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {locale === "id" ? "Lihat semua" : "See all"}
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-2">
            {festivalsData.oscarContenders.map((film) => {
              const poster = film.movie?.poster_path ?? film.poster_path;
              const title = film.movie?.title ?? film.external_title ?? "—";
              const href = film.movie?.tmdb_id
                ? `/movie/${film.movie.tmdb_id}`
                : "#";
              return (
                <Link
                  key={film.id}
                  href={href}
                  className="flex-shrink-0 w-[100px] lg:w-[120px] group"
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 hover-lift card-shine">
                    {poster ? (
                      <img
                        src={getPosterUrl(poster, "w185")}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-6 h-6 text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute top-1.5 right-1.5 text-sm">🏆</div>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                    {title}
                  </p>
                  {film.director && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {film.director}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
