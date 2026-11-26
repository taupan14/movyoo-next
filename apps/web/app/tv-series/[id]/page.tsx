import type { Metadata } from "next";
import TvDetailClient from "./tv-detail";

const BASE_URL = "https://movyoo.id";
const TMDB_IMG = "https://image.tmdb.org/t/p";

interface Props {
  params: { id: string };
}

async function fetchTvMeta(tmdbId: string) {
  try {
    const res = await fetch(`${BASE_URL}/api/tv/${tmdbId}?lang=id&region=ID`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.series ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const series = await fetchTvMeta(params.id);

  if (!series) {
    return {
      title: "Series Tidak Ditemukan",
      description: "Series yang kamu cari tidak tersedia di Movyoo.",
    };
  }

  const title = series.name;
  const description = series.overview
    ? series.overview.slice(0, 160)
    : `Temukan info lengkap, trailer, dan tempat nonton ${title} di Movyoo.`;

  const posterUrl = series.poster_path
    ? `${TMDB_IMG}/w500${series.poster_path}`
    : `${BASE_URL}/og-image.jpg`;

  const backdropUrl = series.backdrop_path
    ? `${TMDB_IMG}/w1280${series.backdrop_path}`
    : posterUrl;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Movyoo`,
      description,
      url: `${BASE_URL}/tv-series/${params.id}`,
      type: "video.tv_show",
      images: [{ url: backdropUrl, width: 1280, height: 720, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Movyoo`,
      description,
      images: [backdropUrl],
    },
    alternates: {
      canonical: `${BASE_URL}/tv-series/${params.id}`,
    },
  };
}

// ── JSON-LD helper ────────────────────────────────────────────────────────────
function TvJsonLd({ series, tmdbId }: { series: any; tmdbId: string }) {
  const posterUrl = series.poster_path
    ? `${TMDB_IMG}/w500${series.poster_path}`
    : null;

  const creators = (series.crew ?? [])
    .filter((c: any) =>
      ["Creator", "Executive Producer", "Showrunner"].includes(c.job),
    )
    .slice(0, 3)
    .map((c: any) => ({ "@type": "Person", name: c.name }));

  const cast = (series.cast ?? [])
    .slice(0, 10)
    .map((c: any) => ({ "@type": "Person", name: c.name }));

  const genres = (series.genres ?? []).map((g: any) => g.name);

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: series.name,
    description: series.overview?.slice(0, 300) ?? "",
    url: `${BASE_URL}/tv-series/${tmdbId}`,
    ...(posterUrl && { image: posterUrl }),
    ...(series.first_air_date && { startDate: series.first_air_date }),
    ...(series.last_air_date && { endDate: series.last_air_date }),
    ...(series.number_of_seasons && {
      numberOfSeasons: series.number_of_seasons,
    }),
    ...(series.number_of_episodes && {
      numberOfEpisodes: series.number_of_episodes,
    }),
    ...(genres.length > 0 && { genre: genres }),
    ...(creators.length > 0 && { creator: creators }),
    ...(cast.length > 0 && { actor: cast }),
    ...(series.vote_average > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: series.vote_average.toFixed(1),
        ratingCount: series.vote_count,
        bestRating: 10,
        worstRating: 0,
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function TvSeriesPage({ params }: Props) {
  const series = await fetchTvMeta(params.id);

  return (
    <>
      {series && <TvJsonLd series={series} tmdbId={params.id} />}
      <TvDetailClient />
    </>
  );
}
