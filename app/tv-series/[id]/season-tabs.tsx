"use client";

import { useEffect, useState } from "react";
import { Calendar, Film, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SeasonTabsProps {
  seasons: TvSeason[];
  locale: string;
  seriesTmdbId: number;
}

function formatDate(date: string | null | undefined, locale = "en"): string {
  if (!date) return "--";
  try {
    return new Date(date).toLocaleDateString(
      locale === "id" ? "id-ID" : "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      },
    );
  } catch {
    return date;
  }
}

function formatRuntime(mins: number | null | undefined): string {
  if (!mins) return "--";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SeasonTabs({
  seasons,
  locale,
  seriesTmdbId,
}: SeasonTabsProps) {
  const [activeSeason, setActiveSeason] = useState(
    seasons[0]?.season_number ?? 1,
  );

  const [episodeMap, setEpisodeMap] = useState<Record<number, TvEpisode[]>>({});

  const [loading, setLoading] = useState(false);

  const currentSeason = seasons.find((s) => s.season_number === activeSeason);

  /* ------------------------------------------------------------------ */
  /*  Season & Episode Accordion                                         */
  /* ------------------------------------------------------------------ */

  function EpisodeCard({ ep, locale }: { ep: TvEpisode; locale: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
      <div className="glass-strong rounded-xl overflow-hidden transition-all duration-200">
        <button
          className="w-full flex gap-3 p-3 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          {/* Thumbnail */}
          <div className="flex-shrink-0 w-[100px] lg:w-[120px] aspect-video rounded-lg overflow-hidden bg-white/5">
            {ep.still_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
                alt={ep.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-6 h-6 text-muted-foreground/30" />
              </div>
            )}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider">
                Ep {ep.episode_number}
              </span>
              {ep.runtime && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {formatRuntime(ep.runtime)}
                </span>
              )}
              {ep.air_date && (
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(ep.air_date)}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground line-clamp-1">
              {ep.name}
            </p>
            {ep.overview && !expanded && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {ep.overview}
              </p>
            )}
          </div>
          <div className="flex-shrink-0 self-center">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>
        {expanded && ep.overview && (
          <div className="px-3 pb-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {ep.overview}
            </p>
          </div>
        )}
      </div>
    );
  }

  async function loadEpisodes(seasonNumber: number) {
    if (episodeMap[seasonNumber]) return;

    setLoading(true);

    try {
      const lang = locale === "id" ? "id" : "en";

      const res = await fetch(
        `/api/tv/${seriesTmdbId}/season/${seasonNumber}?lang=${lang}`,
      );

      const data = await res.json();

      setEpisodeMap((prev) => ({
        ...prev,
        [seasonNumber]: data.episodes ?? [],
      }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEpisodes(activeSeason);
  }, [activeSeason]);

  const episodes = episodeMap[activeSeason] ?? [];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {seasons.map((season) => {
          const active = season.season_number === activeSeason;

          return (
            <button
              key={season.season_number}
              onClick={() => setActiveSeason(season.season_number)}
              className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all
                ${
                  active
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "glass hover:bg-white/10 text-muted-foreground"
                }`}
            >
              <span>{season.name}</span>

              <span className="ml-2 rounded-full bg-black/20 px-2 py-0.5 text-xs">
                {season.episode_count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Season Info */}
      {currentSeason && (
        <div className="glass rounded-2xl p-4">
          {/* <div className="flex gap-4">
            {currentSeason.poster_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w185${currentSeason.poster_path}`}
                alt={currentSeason.name}
                className="h-28 w-20 rounded-xl object-cover"
              />
            ) : (
              <div className="h-28 w-20 rounded-xl bg-white/5" />
            )}

            <div className="flex-1">
              <h3 className="font-semibold text-lg">{currentSeason.name}</h3>

              <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Film className="h-4 w-4" />
                  {currentSeason.episode_count}{" "}
                  {locale === "id" ? "Episode" : "Episodes"}
                </span>

                {currentSeason.air_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(currentSeason.air_date, locale)}
                  </span>
                )}
              </div>

              {currentSeason.overview && (
                <p className="mt-3 text-sm text-muted-foreground line-clamp-3">
                  {currentSeason.overview}
                </p>
              )}
            </div>
          </div> */}

          {/* Episodes */}
          <div className="mt-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="glass flex gap-3 rounded-xl p-3">
                    <Skeleton className="h-16 w-28 rounded-lg" />

                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            ) : episodes.length > 0 ? (
              <div className="space-y-3">
                {episodes.map((ep) => (
                  <EpisodeCard
                    key={ep.episode_number}
                    ep={ep}
                    locale={locale}
                  />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {locale === "id"
                  ? "Data episode belum tersedia"
                  : "Episode data not available"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
