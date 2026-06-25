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
