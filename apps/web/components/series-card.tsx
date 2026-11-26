"use client";

import Link from "next/link";
import { getPosterUrl, getBackdropUrl } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Star,
  TriangleAlert as AlertTriangle,
} from "lucide-react";
import { Tv } from "lucide-react";
import { startLoader } from "@/components/page-loader";

interface TvSeries {
  id: number;
  tmdb_id: number;
  name: string;
  original_name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date?: string;
  popularity?: number;
  overview?: string;
  overview_en?: string;
  number_of_seasons?: number;
}

interface SeriesCardProps {
  series: TvSeries;
  variant?: "poster" | "backdrop" | "compact";
  showRating?: boolean;
  showLeaving?: boolean;
  leavingDays?: number;
  className?: string;
}

export function SeriesCard({
  series,
  variant = "poster",
  showRating = true,
  showLeaving = false,
  leavingDays,
  className,
}: SeriesCardProps) {
  //   console.log("series >> ", series);
  return (
    <Link
      href={`/tv-series/${series.tmdb_id}`}
      onClick={startLoader}
      className={cn("block group", className)}
    >
      <div className="relative rounded-xl overflow-hidden hover-lift card-shine">
        <div className="aspect-[2/3] relative">
          <img
            src={getPosterUrl(series.poster_path)}
            alt={series.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* <h3 className="font-semibold text-white text-sm line-clamp-2">
              {series.name}
            </h3> */}
          </div>
        </div>
        {showRating && series.vote_average > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-xs">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-white font-medium">
              {series.vote_average?.toFixed(1)}
            </span>
          </div>
        )}
        <div className="absolute top-2.5 left-2 px-2 py-1 rounded-md bg-primary/80 backdrop-blur-sm">
          <Tv className="w-2.5 h-2.5 text-white" />
        </div>
        {showLeaving && leavingDays !== undefined && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/90 text-white text-xs font-medium animate-pulse-glow">
            <AlertTriangle className="w-3 h-3" />
            {leavingDays}d
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
          {series.name}
        </h3>
        {series.first_air_date && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {series.first_air_date?.slice(0, 4)}
            <span className="text-base mx-1 align-middle">•</span>
            {series.number_of_seasons !== undefined &&
            series.number_of_seasons > 1
              ? series.number_of_seasons + " Seasons"
              : series.number_of_seasons + " Season"}
          </p>
        )}
      </div>
    </Link>
  );
}

interface SeriesRowProps {
  title: string;
  series: TvSeries[];
  variant?: "poster" | "backdrop";
  path?: string;
  pathTitle?: string;
  showLeaving?: boolean;
  leavingData?: Record<number, number>;
}

export function SeriesRow({
  title,
  series,
  path = "/explore",
  pathTitle,
  variant = "poster",
  showLeaving = false,
  leavingData,
}: SeriesRowProps) {
  if (!series.length) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 px-4 lg:px-8">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>

        {pathTitle && (
          <Link
            href={path}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            {pathTitle}
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-2">
        {series.map((movie) => {
          // console.log("movie id >> ", movie.tmdb_id);

          return (
            <div
              key={movie.id}
              className={cn(
                variant === "poster"
                  ? "w-[140px] lg:w-[160px]"
                  : "w-[280px] lg:w-[320px]",
                "flex-shrink-0",
              )}
            >
              <SeriesCard
                series={movie}
                variant={variant}
                showLeaving={showLeaving}
                leavingDays={leavingData?.[movie.id]}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
