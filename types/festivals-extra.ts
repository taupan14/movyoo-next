/**
 * types/festivals-extra.ts
 *
 * INTEGRASI: gabungkan tipe-tipe di sini ke types/home.ts yang sudah ada
 * (tempat FestivalHomeCard, FestivalsData, FestivalDetail didefinisikan).
 * Field `tickets` di bawah perlu ditambahkan ke tipe FestivalDetail yang ada.
 */

// ── Tiket ────────────────────────────────────────────────────────────────────

export interface FestivalTicket {
  id: number;
  edition_id: number;
  tier_name: string;
  tier_name_en: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  purchase_url: string | null;
  notes: string | null;
  notes_en: string | null;
  sort_order: number;
}

// Tambahkan ke tipe FestivalDetail yang sudah ada di types/home.ts:
//   tickets: FestivalTicket[];

// ── Festival list (halaman /festivals) ────────────────────────────────────────

export interface FestivalListItem {
  festival: {
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
  };
  latestEdition: {
    id: number;
    edition_number: number | null;
    year: number;
    date_start: string | null;
    date_end: string | null;
    status: "upcoming" | "ongoing" | "completed";
  } | null;
}

export interface FestivalListData {
  festivals: FestivalListItem[];
}

// ── Calendar (halaman /festivals/calendar) ────────────────────────────────────

export interface FestivalCalendarItem {
  festival_id: number;
  slug: string;
  short_name: string;
  location: string;
  edition_id: number;
  edition_number: number | null;
  year: number;
  date_start: string; // ISO date, required untuk tampil di kalender
  date_end: string | null;
  status: "upcoming" | "ongoing" | "completed";
  accent_color: string;
}

export interface FestivalCalendarData {
  items: FestivalCalendarItem[];
}

// ── Buzz feed lintas festival (halaman /festivals/buzz) ───────────────────────

export interface FestivalBuzzFeedItem {
  id: number;
  edition_id: number;
  festival: {
    slug: string;
    short_name: string;
    accent_color: string;
  };
  lineup_id: number | null;
  lineup_title: string | null;
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
}

export interface FestivalBuzzFeedData {
  items: FestivalBuzzFeedItem[];
  page: number;
  totalPages: number;
}
