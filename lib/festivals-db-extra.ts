// lib/festivals-db-extra.ts
//
// INTEGRASI: pindahkan fungsi-fungsi ini ke lib/festivals-db.ts yang sudah ada
// (satu file dengan fetchFestivalsForHome & fetchOscarContenders).
//
// Pakai createSupabaseServer() (anon key + RLS) karena semua data di sini
// bersifat public-read — konsisten dengan policy "festival_tickets_public_read"
// di migration. createSupabaseServer bersifat async (await cookies()), jadi
// semua fungsi di bawah ini juga async dan meng-await client-nya.

import { createSupabaseServer } from "@/lib/supabase-server";
import type {
  FestivalListData,
  FestivalListItem,
  FestivalCalendarData,
  FestivalCalendarItem,
  FestivalBuzzFeedData,
  FestivalBuzzFeedItem,
  FestivalTicket,
} from "@/types/festivals-extra";

// ── 1. List semua festival (halaman /festivals) ───────────────────────────────

export async function fetchAllFestivals(): Promise<FestivalListData> {
  const supabase = await createSupabaseServer();

  const { data: festivals, error } = await supabase
    .from("festivals")
    .select(
      `
      id, slug, name, name_en, short_name, location, country_code,
      website_url, logo_path, banner_path, accent_color,
      festival_editions ( id, edition_number, year, date_start, date_end, status )
      `,
    )
    .order("position", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[fetchAllFestivals] error:", error);
    return { festivals: [] };
  }

  const items: FestivalListItem[] = (festivals ?? []).map((f: any) => {
    const editions = (f.festival_editions ?? []) as any[];
    const latestEdition =
      editions.find((e) => e.status === "ongoing") ??
      editions
        .filter((e) => e.status === "upcoming")
        .sort((a, b) =>
          (a.date_start ?? "").localeCompare(b.date_start ?? ""),
        )[0] ??
      editions.sort((a, b) => b.year - a.year)[0] ??
      null;

    return {
      festival: {
        id: f.id,
        slug: f.slug,
        name: f.name,
        name_en: f.name_en,
        short_name: f.short_name,
        location: f.location,
        country_code: f.country_code,
        website_url: f.website_url,
        logo_path: f.logo_path,
        banner_path: f.banner_path,
        accent_color: f.accent_color,
      },
      latestEdition: latestEdition
        ? {
            id: latestEdition.id,
            edition_number: latestEdition.edition_number,
            year: latestEdition.year,
            date_start: latestEdition.date_start,
            date_end: latestEdition.date_end,
            status: latestEdition.status,
          }
        : null,
    };
  });

  return { festivals: items };
}

// ── 2. Tiket untuk satu edisi (dipakai di halaman detail) ─────────────────────

export async function fetchFestivalTickets(
  editionId: number,
): Promise<FestivalTicket[]> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("festival_tickets")
    .select("*")
    .eq("edition_id", editionId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[fetchFestivalTickets] error:", error);
    return [];
  }

  return (data ?? []) as FestivalTicket[];
}

// ── 3. Kalender — semua edisi dalam rentang tahun ──────────────────────────────

export async function fetchFestivalCalendar(
  yearFrom: number,
  yearTo: number,
): Promise<FestivalCalendarData> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("festival_editions")
    .select(
      `
      id, edition_number, year, date_start, date_end, status,
      festivals ( id, slug, short_name, location, accent_color )
      `,
    )
    .gte("year", yearFrom)
    .lte("year", yearTo)
    .not("date_start", "is", null)
    .order("date_start", { ascending: true });

  if (error) {
    console.error("[fetchFestivalCalendar] error:", error);
    return { items: [] };
  }

  const items: FestivalCalendarItem[] = (data ?? [])
    .filter((e: any) => e.festivals)
    .map((e: any) => ({
      festival_id: e.festivals.id,
      slug: e.festivals.slug,
      short_name: e.festivals.short_name,
      location: e.festivals.location,
      edition_id: e.id,
      edition_number: e.edition_number,
      year: e.year,
      date_start: e.date_start,
      date_end: e.date_end,
      status: e.status,
      accent_color: e.festivals.accent_color,
    }));

  return { items };
}

// ── 4. Buzz feed lintas festival (halaman /festivals/buzz) ────────────────────

export async function fetchFestivalBuzzFeed(
  page: number,
  limit: number,
  opts?: { festivalSlug?: string; source?: string },
): Promise<FestivalBuzzFeedData> {
  const supabase = await createSupabaseServer();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("festival_buzz")
    .select(
      `
      id, edition_id, lineup_id, source, source_logo, headline, headline_id,
      summary, summary_id, url, published_at, buzz_score, tags,
      festival_editions!inner (
        id,
        festivals!inner ( slug, short_name, accent_color )
      ),
      festival_lineup ( external_title, movie_id )
      `,
      { count: "exact" },
    )
    .order("published_at", { ascending: false })
    .range(from, to);

  if (opts?.source) query = query.eq("source", opts.source);
  if (opts?.festivalSlug) {
    query = query.eq("festival_editions.festivals.slug", opts.festivalSlug);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[fetchFestivalBuzzFeed] error:", error);
    return { items: [], page, totalPages: 1 };
  }

  const items: FestivalBuzzFeedItem[] = (data ?? []).map((b: any) => ({
    id: b.id,
    edition_id: b.edition_id,
    festival: {
      slug: b.festival_editions.festivals.slug,
      short_name: b.festival_editions.festivals.short_name,
      accent_color: b.festival_editions.festivals.accent_color,
    },
    lineup_id: b.lineup_id,
    lineup_title: b.festival_lineup?.external_title ?? null,
    source: b.source,
    source_logo: b.source_logo,
    headline: b.headline,
    headline_id: b.headline_id,
    summary: b.summary,
    summary_id: b.summary_id,
    url: b.url,
    published_at: b.published_at,
    buzz_score: b.buzz_score,
    tags: b.tags ?? [],
  }));

  const totalPages = count ? Math.max(1, Math.ceil(count / limit)) : 1;

  return { items, page, totalPages };
}

// ── 5. Satu festival by slug — dipakai untuk generateMetadata di /festivals/[slug] ──

export async function fetchFestivalBySlugBasic(slug: string) {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("festivals")
    .select(
      "id, slug, name, name_en, short_name, location, description, description_en, banner_path, website_url",
    )
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}
