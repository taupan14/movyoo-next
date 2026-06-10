import { MovieCard } from "@/components/movie-card";
import { SeriesCard } from "@/components/series-card";
import { SectionHeaderHome } from "@/components/section-header";
import type { Movie, TvSeries } from "@/types/home";

// ─── Trending Number Overlay Card ─────────────────────────────────────────────

const TRENDING_NUMBER_STYLE: React.CSSProperties = {
  fontSize: 82,
  lineHeight: 1,
  zIndex: 0,
  color: "transparent",
  WebkitTextStroke: "2px rgba(255,255,255,0.15)",
  backgroundImage:
    "linear-gradient(175deg, #d1d5db 0%, #979797ff 55%, #5a5a5aff 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
};

export function TrendingNumberCard({
  rank,
  data,
}: {
  rank: number;
  data: Movie;
  title: string;
  href: string;
}) {
  return (
    <div className="relative flex-shrink-0 group mr-4" style={{ width: 240 }}>
      <MovieCard movie={data} variant="poster" />
      <span
        aria-hidden="true"
        className="absolute bottom-8 left-0 select-none pointer-events-none font-black"
        style={TRENDING_NUMBER_STYLE}
      >
        {rank}
      </span>
    </div>
  );
}

export function TrendingNumberCardSeries({
  rank,
  data,
}: {
  rank: number;
  data: TvSeries;
  title: string;
  href: string;
}) {
  return (
    <div className="relative flex-shrink-0 group mr-4" style={{ width: 240 }}>
      <SeriesCard series={data} variant="poster" />
      <span
        aria-hidden="true"
        className="absolute bottom-11 left-0 select-none pointer-events-none font-black"
        style={TRENDING_NUMBER_STYLE}
      >
        {rank}
      </span>
    </div>
  );
}

// ─── Trending Rows ────────────────────────────────────────────────────────────

export function TrendingMovieRow({
  title,
  movies,
}: {
  title: string;
  movies: Movie[];
}) {
  if (!movies.length) return null;
  return (
    <section className="mb-8">
      <SectionHeaderHome title={title} />
      <div className="flex overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-2">
        {movies.map((movie, idx) => (
          <TrendingNumberCard
            key={movie.id}
            rank={idx + 1}
            data={movie}
            title={movie.title}
            href={`/movie/${(movie as any).tmdb_id ?? movie.id}`}
          />
        ))}
      </div>
    </section>
  );
}

export function TrendingSeriesRow({
  title,
  series,
}: {
  title: string;
  series: TvSeries[];
}) {
  if (!series.length) return null;
  return (
    <section className="mb-8">
      <SectionHeaderHome title={title} />
      <div className="flex overflow-x-auto scrollbar-hide px-4 lg:px-6 pb-2">
        {series.map((s, idx) => (
          <TrendingNumberCardSeries
            key={s.id}
            rank={idx + 1}
            data={s}
            title={s.name}
            href={`/tv-series/${s.tmdb_id}`}
          />
        ))}
      </div>
    </section>
  );
}
