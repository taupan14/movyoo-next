/**
 * leaving-soon-db.ts
 * Controller layer: query tabel `leaving_soon` + relasi movies / tv_series.
 * Digunakan oleh API route /api/movies/last-chance
 */

import { supabase } from "./supabase";
import type { CachedMovie } from "./movies-db";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ContentType = "movie" | "tv";
export type UrgencyTier = "critical" | "urgent" | "warning";

export interface LeavingSoonItem {
  // Identitas baris leaving_soon
  id: number;
  content_type: ContentType;
  platform_slug: string;
  available_until: string; // ISO date string 'YYYY-MM-DD'
  days_left: number; // dihitung di query-level (server time)
  tier: UrgencyTier; // dihitung dari days_left

  // Data konten (movie atau tv)
  content_id: number; // movies.id atau tv_series.id
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string | null;
  popularity?: number;
  overview?: string;
}

export interface FetchLeavingSoonParams {
  lang: string; // 'id' | 'en'
  region: string; // 'ID' | 'US'
  contentType?: ContentType | "all"; // default: 'all'
  platform?: string; // slug filter, opsional
  maxDays?: number; // ambil yang leaving dalam N hari, default 30
  limit?: number; // default 50
}

export interface LeavingSoonResult {
  items: LeavingSoonItem[];
  total: number;
  criticalCount: number;
  urgentCount: number;
  warningCount: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function computeTier(daysLeft: number): UrgencyTier {
  if (daysLeft <= 3) return "critical";
  if (daysLeft <= 7) return "urgent";
  return "warning";
}

function pickOverview(
  row: { overview?: string | null; overview_en?: string | null },
  lang: string,
): string {
  if (lang === "id") return row.overview || row.overview_en || "";
  return row.overview_en || row.overview || "";
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

// ─── MAIN FETCH ───────────────────────────────────────────────────────────────

export async function fetchLeavingSoon(
  params: FetchLeavingSoonParams,
): Promise<LeavingSoonResult> {
  const {
    lang,
    region,
    contentType = "all",
    platform,
    maxDays = 30,
    limit = 50,
  } = params;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + maxDays);

  const todayStr = today.toISOString().slice(0, 10);
  const maxDateStr = maxDate.toISOString().slice(0, 10);

  // ── Query movie leaving_soon ──────────────────────────────────────────────
  let movieItems: LeavingSoonItem[] = [];

  if (contentType === "all" || contentType === "movie") {
    let q = supabase
      .from("leaving_soon")
      .select(
        `
        id,
        platform_slug,
        available_until,
        movies (
          id, tmdb_id, title, original_title, original_language,
          poster_path, backdrop_path, vote_average,
          release_date, popularity, overview, overview_en
        )
        `,
      )
      .eq("content_type", "movie")
      .eq("region", region)
      .gte("available_until", todayStr)
      .lte("available_until", maxDateStr)
      .order("available_until", { ascending: true })
      .limit(limit);

    if (platform) {
      q = q.eq("platform_slug", platform);
    }

    const { data, error } = await q;

    if (error) {
      console.error(
        "[leaving-soon-db] fetchLeavingSoon (movie):",
        error.message,
      );
    } else {
      movieItems = (data ?? [])
        .map((row: any) => {
          const m = row.movies;
          if (!m) return null;

          const availableUntil = new Date(row.available_until);
          availableUntil.setHours(23, 59, 59, 0);
          const daysLeft = daysBetween(today, availableUntil);

          return {
            id: row.id,
            content_type: "movie" as ContentType,
            platform_slug: row.platform_slug,
            available_until: row.available_until,
            days_left: daysLeft,
            tier: computeTier(daysLeft),
            content_id: m.id,
            tmdb_id: m.tmdb_id,
            title:
              m.original_language === "id"
                ? m.original_title || m.title
                : m.title,
            poster_path: m.poster_path,
            backdrop_path: m.backdrop_path,
            vote_average: Number(m.vote_average),
            release_date: m.release_date ?? null,
            popularity: Number(m.popularity),
            overview: pickOverview(m, lang),
          } satisfies LeavingSoonItem;
        })
        .filter(Boolean) as LeavingSoonItem[];
    }
  }

  // ── Query tv leaving_soon ─────────────────────────────────────────────────
  // TODO: Aktifkan setelah tabel tv_series tersedia
  // Pola sama dengan di atas, ganti join ke tv_series
  let tvItems: LeavingSoonItem[] = [];

  if (contentType === "all" || contentType === "tv") {
    // Placeholder — uncomment & sesuaikan kolom saat tabel tv_series siap:
    /*
    let q = supabase
      .from("leaving_soon")
      .select(`
        id, platform_slug, available_until,
        tv_series (
          id, tmdb_id, name, original_name, original_language,
          poster_path, backdrop_path, vote_average,
          first_air_date, popularity, overview, overview_en
        )
      `)
      .eq("content_type", "tv")
      .eq("region", region)
      .gte("available_until", todayStr)
      .lte("available_until", maxDateStr)
      .order("available_until", { ascending: true })
      .limit(limit);

    if (platform) q = q.eq("platform_slug", platform);

    const { data, error } = await q;

    if (!error) {
      tvItems = (data ?? []).map((row: any) => {
        const s = row.tv_series;
        if (!s) return null;
        const availableUntil = new Date(row.available_until);
        availableUntil.setHours(23, 59, 59, 0);
        const daysLeft = daysBetween(today, availableUntil);
        return {
          id: row.id,
          content_type: "tv",
          platform_slug: row.platform_slug,
          available_until: row.available_until,
          days_left: daysLeft,
          tier: computeTier(daysLeft),
          content_id: s.id,
          tmdb_id: s.tmdb_id,
          title: s.name,
          poster_path: s.poster_path,
          backdrop_path: s.backdrop_path,
          vote_average: Number(s.vote_average),
          release_date: s.first_air_date ?? null,
          popularity: Number(s.popularity),
          overview: pickOverview(s, lang),
        };
      }).filter(Boolean) as LeavingSoonItem[];
    }
    */
  }

  // ── Merge & sort ──────────────────────────────────────────────────────────
  const all = [...movieItems, ...tvItems].sort(
    (a, b) => a.days_left - b.days_left,
  );

  return {
    items: all,
    total: all.length,
    criticalCount: all.filter((i) => i.tier === "critical").length,
    urgentCount: all.filter((i) => i.tier === "urgent").length,
    warningCount: all.filter((i) => i.tier === "warning").length,
  };
}
