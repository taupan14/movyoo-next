/**
 * leaving-soon-db.ts
 * Query tabel leaving_soon + movies dengan two-step fetch.
 * Menggunakan createSupabaseServer() agar kompatibel di API route (server-side).
 */

import { createSupabaseServer } from "./supabase-server";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ContentType = "movie" | "tv";
export type UrgencyTier = "critical" | "urgent" | "warning";

export interface LeavingSoonItem {
  id: number;
  content_type: ContentType;
  platform_slug: string;
  available_until: string;
  days_left: number;
  tier: UrgencyTier;
  content_id: number;
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
  lang: string;
  region: string;
  contentType?: ContentType | "all";
  platform?: string;
  maxDays?: number;
  limit?: number;
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

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000));
}

function pickOverview(
  row: { overview?: string | null; overview_en?: string | null },
  lang: string,
): string {
  // overview = bahasa original, overview_en = english
  if (lang === "id") return row.overview || row.overview_en || "";
  return row.overview_en || row.overview || "";
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
    maxDays = 45, // 45 hari — TTL sync adalah 30 hari, jadi harus lebih dari 30
    limit = 50,
  } = params;

  // createSupabaseServer() adalah async — harus di-await
  const supabase = await createSupabaseServer();

  // Gunakan tanggal WIB (UTC+7) agar konsisten dengan user di Indonesia
  const nowWIB = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayStr = nowWIB.toISOString().slice(0, 10);

  const maxDate = new Date(nowWIB);
  maxDate.setDate(maxDate.getDate() + maxDays);
  const maxDateStr = maxDate.toISOString().slice(0, 10);

  let movieItems: LeavingSoonItem[] = [];

  // ── Movie ──────────────────────────────────────────────────────────────────
  if (contentType === "all" || contentType === "movie") {
    // Step 1: ambil baris leaving_soon untuk movie
    let q = supabase
      .from("leaving_soon")
      .select("id, movie_id, platform_slug, available_until")
      .eq("content_type", "movie")
      .eq("region", region)
      .gte("available_until", todayStr)
      .lte("available_until", maxDateStr)
      .not("movie_id", "is", null)
      .order("available_until", { ascending: true })
      .limit(limit);

    if (platform) q = q.eq("platform_slug", platform);

    const { data: leavingRows, error: leavingError } = await q;

    if (leavingError) {
      console.error(
        "[leaving-soon-db] leaving_soon query error:",
        leavingError.message,
      );
    } else if (leavingRows && leavingRows.length > 0) {
      // Step 2: fetch data movies berdasarkan movie_id yang didapat
      const movieIds = leavingRows.map((r: any) => r.movie_id);

      const { data: movies, error: moviesError } = await supabase
        .from("movies")
        .select(
          "id, tmdb_id, title, original_title, original_language, poster_path, backdrop_path, vote_average, release_date, popularity, overview, overview_en",
        )
        .in("id", movieIds);

      if (moviesError) {
        console.error(
          "[leaving-soon-db] movies query error:",
          moviesError.message,
        );
      } else {
        // Map movie_id → movie object untuk lookup O(1)
        const movieMap = new Map((movies ?? []).map((m: any) => [m.id, m]));

        movieItems = leavingRows
          .map((row: any) => {
            const m = movieMap.get(row.movie_id);
            if (!m) return null;

            const availableUntil = new Date(row.available_until);
            availableUntil.setHours(23, 59, 59, 0);
            const daysLeft = daysBetween(nowWIB, availableUntil);

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
  }

  // ── TV Series (aktifkan saat tabel tv_series siap) ────────────────────────
  let tvItems: LeavingSoonItem[] = [];

  if (contentType === "all" || contentType === "tv") {
    /*
    // Step 1: ambil baris leaving_soon untuk tv
    let q = supabase
      .from("leaving_soon")
      .select("id, tv_series_id, platform_slug, available_until")
      .eq("content_type", "tv")
      .eq("region", region)
      .gte("available_until", todayStr)
      .lte("available_until", maxDateStr)
      .not("tv_series_id", "is", null)
      .order("available_until", { ascending: true })
      .limit(limit);

    if (platform) q = q.eq("platform_slug", platform);

    const { data: leavingRows, error: leavingError } = await q;

    if (!leavingError && leavingRows?.length > 0) {
      const seriesIds = leavingRows.map((r: any) => r.tv_series_id);

      const { data: series, error: seriesError } = await supabase
        .from("tv_series")
        .select("id, tmdb_id, name, original_name, original_language, poster_path, backdrop_path, vote_average, first_air_date, popularity, overview, overview_en")
        .in("id", seriesIds);

      if (!seriesError) {
        const seriesMap = new Map((series ?? []).map((s: any) => [s.id, s]));

        tvItems = leavingRows.map((row: any) => {
          const s = seriesMap.get(row.tv_series_id);
          if (!s) return null;
          const availableUntil = new Date(row.available_until);
          availableUntil.setHours(23, 59, 59, 0);
          const daysLeft = daysBetween(today, availableUntil);
          return {
            id: row.id,
            content_type: "tv" as ContentType,
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
    }
    */
  }

  // ── Merge & sort by days_left ascending ───────────────────────────────────
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
