// app/sitemap.ts
import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const BASE_URL = "https://movyoo.id"; // ← samakan dengan BASE_URL di layout.tsx

async function getAllMovieTmdbIds(): Promise<number[]> {
  const { data, error } = await supabase
    .from("movies")
    .select("tmdb_id")
    .gt("tmdb_id", 0)
    .not("poster_path", "is", null)
    .order("popularity", { ascending: false })
    .limit(5000);

  if (error) return [];
  return (data ?? []).map((m: any) => m.tmdb_id);
}

async function getAllTvTmdbIds(): Promise<number[]> {
  const { data, error } = await supabase
    .from("tv_series")
    .select("tmdb_id")
    .gt("tmdb_id", 0)
    .not("poster_path", "is", null)
    .order("popularity", { ascending: false })
    .limit(2000);

  if (error) return [];
  return (data ?? []).map((m: any) => m.tmdb_id);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [movieIds, tvIds] = await Promise.all([
    getAllMovieTmdbIds(),
    getAllTvTmdbIds(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/explore`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/mood`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/swipe`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/last-chance`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];

  const movieRoutes: MetadataRoute.Sitemap = movieIds.map((tmdbId) => ({
    url: `${BASE_URL}/movie/${tmdbId}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const tvRoutes: MetadataRoute.Sitemap = tvIds.map((tmdbId) => ({
    url: `${BASE_URL}/tv-series/${tmdbId}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...movieRoutes, ...tvRoutes];
}
