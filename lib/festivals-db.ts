/**
 * festivals-db.ts
 * Controller layer: query tabel festivals + relasi.
 * Konsisten dengan pola movies-db.ts (Supabase client, typed returns, error handling).
 */

import { supabase } from "./supabase";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FestivalItem {
  id: number;
  slug: string;
  name: string;
  name_en: string;
  short_name: string;
  location: string;
  country_code: string;
  website_url: string | null;
  logo_path: string | null;
  banner_path: string | null;
  accent_color: string;
  founded_year: number | null;
  description: string | null;
  description_en: string | null;
}

export interface FestivalEdition {
  id: number;
  festival_id: number;
  edition_number: number | null;
  year: number;
  date_start: string | null;
  date_end: string | null;
  status: "upcoming" | "ongoing" | "completed";
  theme: string | null;
  total_films: number | null;
  official_website: string | null;
}

export interface FestivalSection {
  id: number;
  slug: string;
  name: string;
  name_en: string;
  is_competition: boolean;
  sort_order: number;
}

export interface FestivalLineupItem {
  id: number;
  movie_id: number | null;
  external_title: string | null;
  external_tmdb_id: number | null;
  director: string | null;
  country: string | null;
  runtime_min: number | null;
  is_world_premiere: boolean;
  is_oscar_contender: boolean;
  is_winner: boolean;
  premiere_type: string | null;
  synopsis: string | null;
  synopsis_en: string | null;
  poster_path: string | null;
  trailer_url: string | null;
  sort_order: number;
  section: Pick<FestivalSection, "id" | "name" | "name_en" | "slug"> | null;
  // Join ke tabel movies (jika ada)
  movie?: {
    id: number;
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    release_date: string | null;
  } | null;
}

export interface FestivalAward {
  id: number;
  slug: string;
  name: string;
  name_en: string;
  description: string | null;
  sort_order: number;
  winners: FestivalWinner[];
}

export interface FestivalWinner {
  id: number;
  lineup_id: number | null;
  person_name: string | null;
  person_tmdb_id: number | null;
  is_winner: boolean;
  special_mention: string | null;
  lineup?: Pick<
    FestivalLineupItem,
    "id" | "external_title" | "director" | "poster_path" | "movie"
  > | null;
}

export interface FestivalBuzzItem {
  id: number;
  source: string;
  source_logo: string | null;
  headline: string;
  headline_id: string | null;
  summary: string | null;
  summary_id: string | null;
  url: string | null;
  published_at: string | null;
  buzz_score: number | null;
  tags: string[];
  lineup?: Pick<
    FestivalLineupItem,
    "id" | "external_title" | "poster_path"
  > | null;
}

export interface FestivalHomeCard {
  festival: FestivalItem;
  latestEdition: FestivalEdition | null;
}

export interface FestivalDetail {
  festival: FestivalItem;
  edition: FestivalEdition;
  sections: FestivalSection[];
  lineup: FestivalLineupItem[];
  // awards: FestivalAward[];
  buzz: FestivalBuzzItem[];
  oscarContenders: FestivalLineupItem[];
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function pickText(
  row: { text: string | null; text_id: string | null },
  lang: string,
): string {
  if (lang === "id") return row.text_id || row.text || "";
  return row.text || row.text_id || "";
}

// ─── HOME — Semua festival + edisi terbaru ──────────────────────────────────────

/**
 * Dipakai oleh API route /api/festivals (home section).
 * Mengembalikan semua festival dengan edisi terakhirnya
 * (ongoing/upcoming diprioritaskan).
 */
export async function fetchFestivalsForHome(): Promise<FestivalHomeCard[]> {
  // Fetch semua festival
  const { data: festivals, error: festError } = await supabase
    .from("festivals")
    .select(
      "id, slug, name, name_en, short_name, location, country_code, " +
        "website_url, logo_path, banner_path, accent_color, founded_year, " +
        "description, description_en, position",
    )
    .order("position", { ascending: true });

  if (festError) {
    console.error("[festivals-db] fetchFestivalsForHome:", festError.message);
    return [];
  }

  if (!festivals?.length) return [];

  const festivalIds = festivals.map((f: any) => f.id);

  // Fetch edisi terbaru untuk semua festival sekaligus
  // Priority: ongoing > upcoming > completed, year desc
  const { data: editions, error: edError } = await supabase
    .from("festival_editions")
    .select(
      "id, festival_id, edition_number, year, date_start, date_end, " +
        "status, theme, total_films, official_website",
    )
    .in("festival_id", festivalIds)
    .order("year", { ascending: false })
    .returns<FestivalEdition[]>();

  if (edError) {
    console.error(
      "[festivals-db] fetchFestivalsForHome editions:",
      edError.message,
    );
  }

  // Pilih 1 edisi terbaik per festival
  const editionMap = new Map<number, FestivalEdition>();
  for (const ed of editions ?? []) {
    const existing = editionMap.get(ed.festival_id);
    if (!existing) {
      editionMap.set(ed.festival_id, ed as FestivalEdition);
    } else {
      // Prefer ongoing > upcoming > completed
      const rank = (s: string) =>
        s === "ongoing" ? 0 : s === "upcoming" ? 1 : 2;
      if (rank(ed.status) < rank(existing.status)) {
        editionMap.set(ed.festival_id, ed as FestivalEdition);
      }
    }
  }

  return festivals.map((f: any) => ({
    festival: f as FestivalItem,
    latestEdition: editionMap.get(f.id) ?? null,
  }));
}

// ─── DETAIL — Satu festival satu edisi ────────────────────────────────────────

/**
 * Fetch detail lengkap: lineup, winners, buzz untuk 1 edisi festival.
 * Dipakai oleh API route /api/festivals/[slug].
 */
export async function fetchFestivalDetail(
  slug: string,
  year: number,
  lang: string,
): Promise<FestivalDetail | null> {
  // ── Festival master ──────────────────────────────────────────────────────────
  const { data: festival, error: fErr } = await supabase
    .from("festivals")
    .select("*")
    .eq("slug", slug)
    .single();

  if (fErr || !festival) {
    console.error(
      "[festivals-db] fetchFestivalDetail festival:",
      fErr?.message,
    );
    return null;
  }

  // ── Edition ──────────────────────────────────────────────────────────────────
  const { data: edition, error: eErr } = await supabase
    .from("festival_editions")
    .select("*")
    .eq("festival_id", festival.id)
    .eq("year", year)
    .single();

  if (eErr || !edition) {
    console.error("[festivals-db] fetchFestivalDetail edition:", eErr?.message);
    return null;
  }

  // ── Parallel fetch: sections, lineup, awards+winners, buzz ──────────────────
  const [sectionsRes, lineupRes, buzzRes] = await Promise.allSettled([
    fetchSections(edition.id),
    fetchLineup(edition.id, lang),
    // fetchAwardsWithWinners(edition.id, lang),
    fetchBuzz(edition.id, lang),
  ]);

  const sections = sectionsRes.status === "fulfilled" ? sectionsRes.value : [];
  const lineup = lineupRes.status === "fulfilled" ? lineupRes.value : [];
  // const awards = awardsRes.status === "fulfilled" ? awardsRes.value : [];
  const buzz = buzzRes.status === "fulfilled" ? buzzRes.value : [];

  const oscarContenders = lineup.filter((l) => l.is_oscar_contender);

  return {
    festival: festival as FestivalItem,
    edition: edition as FestivalEdition,
    sections,
    lineup,
    // awards,
    buzz,
    oscarContenders,
  };
}

// ─── Private helpers ───────────────────────────────────────────────────────────

async function fetchSections(editionId: number): Promise<FestivalSection[]> {
  const { data, error } = await supabase
    .from("festival_sections")
    .select("id, slug, name, name_en, is_competition, sort_order")
    .eq("edition_id", editionId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[festivals-db] fetchSections:", error.message);
    return [];
  }
  return data ?? [];
}

async function fetchLineup(
  editionId: number,
  lang: string,
): Promise<FestivalLineupItem[]> {
  const { data, error } = await supabase
    .from("festival_lineup")
    .select(
      `
      id, movie_id, external_title, external_tmdb_id,
      director, country, runtime_min,
      is_world_premiere, is_oscar_contender, premiere_type,
      synopsis, synopsis_en, poster_path, trailer_url, sort_order, is_winner,
      festival_sections (
        id, name, name_en, slug
      ),
      movies (
        id, tmdb_id, title, poster_path, backdrop_path,
        vote_average, release_date
      )
    `,
    )
    .eq("edition_id", editionId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[festivals-db] fetchLineup:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    movie_id: row.movie_id,
    external_title: row.external_title,
    external_tmdb_id: row.external_tmdb_id,
    director: row.director,
    country: row.country,
    runtime_min: row.runtime_min,
    is_world_premiere: row.is_world_premiere,
    is_oscar_contender: row.is_oscar_contender,
    is_winner: row.is_winner,
    premiere_type: row.premiere_type,
    synopsis:
      lang === "id"
        ? row.synopsis || row.synopsis_en || ""
        : row.synopsis_en || row.synopsis || "",
    synopsis_en: row.synopsis_en,
    poster_path: row.poster_path,
    trailer_url: row.trailer_url,
    sort_order: row.sort_order,
    section: row.festival_sections
      ? {
          id: row.festival_sections.id,
          name: row.festival_sections.name,
          name_en: row.festival_sections.name_en,
          slug: row.festival_sections.slug,
        }
      : null,
    movie: row.movies ?? null,
  }));
}

async function fetchAwardsWithWinners(
  editionId: number,
  lang: string,
): Promise<FestivalAward[]> {
  const { data: awards, error: aErr } = await supabase
    .from("festival_awards")
    .select("id, slug, name, name_en, description, sort_order")
    .eq("edition_id", editionId)
    .order("sort_order", { ascending: true });

  if (aErr) {
    console.error("[festivals-db] fetchAwards:", aErr.message);
    return [];
  }
  if (!awards?.length) return [];

  const awardIds = awards.map((a: any) => a.id);

  const { data: winners, error: wErr } = await supabase
    .from("festival_winners")
    .select(
      `
      id, award_id, lineup_id, person_name, person_tmdb_id,
      is_winner, special_mention,
      festival_lineup (
        id, external_title, director, poster_path,
        movies (
          id, tmdb_id, title, poster_path, backdrop_path, vote_average
        )
      )
    `,
    )
    .in("award_id", awardIds);

  if (wErr) {
    console.error("[festivals-db] fetchWinners:", wErr.message);
  }

  const winnersByAward = new Map<number, FestivalWinner[]>();
  for (const w of winners ?? []) {
    const list = winnersByAward.get(w.award_id) ?? [];

    const lineupData = Array.isArray(w.festival_lineup)
      ? w.festival_lineup[0]
      : w.festival_lineup;

    list.push({
      id: w.id,
      lineup_id: w.lineup_id,
      person_name: w.person_name,
      person_tmdb_id: w.person_tmdb_id,
      is_winner: w.is_winner,
      special_mention: w.special_mention,
      lineup: lineupData
        ? {
            id: lineupData.id,
            external_title: lineupData.external_title,
            director: lineupData.director,
            poster_path: lineupData.poster_path,
            movie: Array.isArray(lineupData.movies)
              ? (lineupData.movies[0] ?? null)
              : (lineupData.movies ?? null),
          }
        : null,
    });

    winnersByAward.set(w.award_id, list);
  }

  return awards.map((a: any) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    name_en: a.name_en,
    description: a.description,
    sort_order: a.sort_order,
    winners: winnersByAward.get(a.id) ?? [],
  }));
}

async function fetchBuzz(
  editionId: number,
  lang: string,
): Promise<FestivalBuzzItem[]> {
  const { data, error } = await supabase
    .from("festival_buzz")
    .select(
      `
      id, source, source_logo, headline, headline_id,
      summary, summary_id, url, published_at, buzz_score, tags,
      festival_lineup (
        id, external_title, poster_path
      )
    `,
    )
    .eq("edition_id", editionId)
    .order("published_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[festivals-db] fetchBuzz:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    source: row.source,
    source_logo: row.source_logo,
    headline: lang === "id" ? row.headline_id || row.headline : row.headline,
    headline_id: row.headline_id,
    summary:
      lang === "id"
        ? row.summary_id || row.summary || null
        : row.summary || null,
    summary_id: row.summary_id,
    url: row.url,
    published_at: row.published_at,
    buzz_score: row.buzz_score,
    tags: row.tags ?? [],
    lineup: row.festival_lineup
      ? {
          id: row.festival_lineup.id,
          external_title: row.festival_lineup.external_title,
          poster_path: row.festival_lineup.poster_path,
        }
      : null,
  }));
}

// ─── UPCOMING OSCAR CONTENDERS (lintas festival) ───────────────────────────────

/**
 * Semua film bertanda is_oscar_contender dari edisi terbaru,
 * dipakai untuk widget "Oscar Contenders" di home.
 */
export async function fetchOscarContenders(
  lang: string,
  limit = 10,
): Promise<FestivalLineupItem[]> {
  const { data, error } = await supabase
    .from("festival_lineup")
    .select(
      `
      id, movie_id, external_title, external_tmdb_id,
      director, country, is_oscar_contender, poster_path,
      synopsis, synopsis_en,
      festival_sections ( id, name, name_en, slug ),
      movies (
        id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date
      )
    `,
    )
    .eq("is_oscar_contender", true)
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[festivals-db] fetchOscarContenders:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    movie_id: row.movie_id,
    external_title: row.external_title,
    external_tmdb_id: row.external_tmdb_id,
    director: row.director,
    country: row.country,
    runtime_min: null,
    is_world_premiere: false,
    is_oscar_contender: row.is_oscar_contender,
    premiere_type: null,
    synopsis:
      lang === "id"
        ? row.synopsis || row.synopsis_en || ""
        : row.synopsis_en || row.synopsis || "",
    synopsis_en: row.synopsis_en,
    poster_path: row.poster_path,
    trailer_url: null,
    sort_order: 0,
    section: row.festival_sections ?? null,
    is_winner: row.is_winner ?? false,
    movie: row.movies ?? null,
  }));
}
