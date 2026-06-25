import type { Metadata } from "next";
import MovieDetailClient from "./movie-detail";

const BASE_URL = "https://movyoo.id";
const TMDB_IMG = "https://image.tmdb.org/t/p";

interface Props {
  params: { id: string };
}

async function fetchMovieMeta(tmdbId: string) {
  try {
    const res = await fetch(
      `${BASE_URL}/api/movies/${tmdbId}?lang=id&region=ID`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.movie ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const movie = await fetchMovieMeta(params.id);

  if (!movie) {
    return {
      title: "Film Tidak Ditemukan",
      description: "Film yang kamu cari tidak tersedia di Movyoo.",
    };
  }

  const title = movie.title;
  const description = movie.overview
    ? movie.overview.slice(0, 160)
    : `Temukan info lengkap, trailer, dan tempat nonton ${title} di Movyoo.`;

  const posterUrl = movie.poster_path
    ? `${TMDB_IMG}/w500${movie.poster_path}`
    : `${BASE_URL}/og-image.jpg`;

  const backdropUrl = movie.backdrop_path
    ? `${TMDB_IMG}/w1280${movie.backdrop_path}`
    : posterUrl;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Movyoo`,
      description,
      url: `${BASE_URL}/movie/${params.id}`,
      type: "video.movie",
      images: [{ url: backdropUrl, width: 1280, height: 720, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Movyoo`,
      description,
      images: [backdropUrl],
    },
    alternates: {
      canonical: `${BASE_URL}/movie/${params.id}`,
    },
  };
}

// ── JSON-LD helper ────────────────────────────────────────────────────────────
function MovieJsonLd({ movie, tmdbId }: { movie: any; tmdbId: string }) {
  const posterUrl = movie.poster_path
    ? `${TMDB_IMG}/w500${movie.poster_path}`
    : null;

  const directors = (movie.credits?.crew ?? [])
    .filter((c: any) => c.job === "Director")
    .map((c: any) => ({ "@type": "Person", name: c.name }));

  const cast = (movie.credits?.cast ?? [])
    .slice(0, 10)
    .map((c: any) => ({ "@type": "Person", name: c.name }));

  const genres = (movie.genres ?? []).map((g: any) => g.name);

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    description: movie.overview?.slice(0, 300) ?? "",
    url: `${BASE_URL}/movie/${tmdbId}`,
    ...(posterUrl && { image: posterUrl }),
    ...(movie.release_date && { datePublished: movie.release_date }),
    ...(movie.runtime && { duration: `PT${movie.runtime}M` }),
    ...(genres.length > 0 && { genre: genres }),
    ...(directors.length > 0 && { director: directors }),
    ...(cast.length > 0 && { actor: cast }),
    ...(movie.vote_average > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: movie.vote_average.toFixed(1),
        ratingCount: movie.vote_count,
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

export default async function MoviePage({ params }: Props) {
  const movie = await fetchMovieMeta(params.id);

  return (
    <>
      {movie && <MovieJsonLd movie={movie} tmdbId={params.id} />}
      <MovieDetailClient />
    </>
  );
}
