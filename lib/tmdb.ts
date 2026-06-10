const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "";

const EDGE_BASE = `${SUPABASE_URL}/functions/v1/tmdb`;

const headers = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  "X-TMDB-Key": TMDB_API_KEY,
};

export async function fetchFromEdge(
  path: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`${EDGE_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `Edge function error: ${res.status}`);
  }
  return res.json();
}

export async function fetchTrending(
  window: string = "week",
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/trending", { window, language, region });
}

export async function fetchNowPlaying(
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/now-playing", { language, region });
}

export async function fetchUpcoming(
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/upcoming", { language, region });
}

export async function fetchPopular(
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/popular", { language, region });
}

export async function fetchTopRated(
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/top-rated", { language, region });
}

export async function fetchMovieDetail(
  tmdbId: number,
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge(`/movie/${tmdbId}`, { language, region });
}

export async function searchMovies(
  query: string,
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/search", { query, language, region });
}

export async function fetchMoodMovies(
  mood: string,
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/mood", { mood, language, region });
}

export async function fetchTrendingByPlatform(
  platform: string,
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/trending-platform", { platform, language, region });
}

export async function fetchRecommendations(
  movieId: number,
  language: string = "id",
  region: string = "ID",
) {
  return fetchFromEdge("/recommendations", {
    movie_id: movieId.toString(),
    language,
    region,
  });
}

export async function fetchGenres(language: string = "id") {
  return fetchFromEdge("/genres", { language });
}

export const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";

export function getPosterUrl(
  path: string | null,
  size: string = "w500",
): string {
  if (!path) return "https://placehold.co/500x750/1a1a2e/eee?text=No+Poster";

  // console.log("[path poster url]", path);
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG_BASE}/${size}${path}`;
}

export function getBackdropUrl(
  path: string | null,
  size: string = "w1280",
): string {
  if (!path) return "https://placehold.co/1280x720/1a1a2e/eee?text=No+Image";

  // console.log("[path backdrop url]", path);
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG_BASE}/${size}${path}`;
}

export function getLogoUrl(path: string | null, size: string = "w200"): string {
  if (!path) return "";
  return `${TMDB_IMG_BASE}/${size}${path}`;
}

export function getProfileUrl(
  path: string | null,
  size: string = "w185",
): string {
  if (!path) return "https://placehold.co/185x278/1a1a2e/eee?text=No+Photo";
  return `${TMDB_IMG_BASE}/${size}${path}`;
}
