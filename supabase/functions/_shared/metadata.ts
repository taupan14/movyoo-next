// supabase/functions/_shared/metadata.ts
// Helper untuk build PoolMetadata dari row movie/tv_series + join data.
// Dipakai oleh refresh-guest-pool dan generate-user-pool.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PoolMetadata, MediaType } from "./types.ts";

/**
 * Ambil genre names (maks 2) dan cast names (maks 3) untuk satu film/series.
 * Dipanggil satu kali per item saat worker generate pool — bukan saat user request.
 */
export async function buildMetadata(
  supabase: SupabaseClient,
  mediaType: MediaType,
  movieId: number | null,
  seriesId: number | null,
  baseRow: {
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    release_date?: string | null;
    first_air_date?: string | null;
    overview: string;
  },
): Promise<PoolMetadata> {
  const releaseYear =
    (baseRow.release_date ?? baseRow.first_air_date ?? "").slice(0, 4) || null;

  let genres: string[] = [];
  let cast: string[] = [];

  if (mediaType === "movie" && movieId) {
    const [genreRes, castRes] = await Promise.allSettled([
      supabase
        .from("movie_genres")
        .select("genres(name)")
        .eq("movie_id", movieId)
        .limit(2),
      supabase
        .from("movie_cast")
        .select("name")
        .eq("movie_id", movieId)
        .order("cast_order", { ascending: true })
        .limit(3),
    ]);

    if (genreRes.status === "fulfilled") {
      genres = ((genreRes.value as any).data ?? [])
        .map((r: any) => r.genres?.name)
        .filter(Boolean);
    }
    if (castRes.status === "fulfilled") {
      cast = ((castRes.value as any).data ?? [])
        .map((r: any) => r.name)
        .filter(Boolean);
    }
  }

  if (mediaType === "tv" && seriesId) {
    const [genreRes, castRes] = await Promise.allSettled([
      supabase
        .from("tv_genres")
        .select("genres(name)")
        .eq("series_id", seriesId)
        .limit(2),
      supabase
        .from("tv_cast")
        .select("name")
        .eq("series_id", seriesId)
        .order("cast_order", { ascending: true })
        .limit(3),
    ]);

    if (genreRes.status === "fulfilled") {
      genres = ((genreRes.value as any).data ?? [])
        .map((r: any) => r.genres?.name)
        .filter(Boolean);
    }
    if (castRes.status === "fulfilled") {
      cast = ((castRes.value as any).data ?? [])
        .map((r: any) => r.name)
        .filter(Boolean);
    }
  }

  return {
    title: baseRow.title,
    poster_path: baseRow.poster_path,
    backdrop_path: baseRow.backdrop_path,
    vote_average: Number(baseRow.vote_average),
    release_year: releaseYear,
    overview: baseRow.overview ?? "",
    genres,
    cast,
  };
}
