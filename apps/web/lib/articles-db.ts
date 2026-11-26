/**
 * lib/articles-db.ts  — UPDATED v3
 * Fix: fetch article_tv + gabungkan movie & tv series jadi satu list `items`
 */

import { supabase } from "./supabase";
import type { CachedMovie } from "./movies-db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TopicType =
  | "genre"
  | "actor"
  | "director"
  | "studio"
  | "platform"
  | "custom";

export type ArticleStatus = "draft" | "published";
export type ArticleSource = "manual" | "auto";

export interface ArticleSummary {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_path: string | null;
  topic_type: TopicType | null;
  topic_value: string | null;
  view_count: number;
  avg_spice: number | null;
  review_count: number;
  published_at: string | null;
  lang: string;
}

export interface ArticleMovie {
  movie_id: number;
  sort_order: number;
  note: string | null;
  movie: CachedMovie;
}

export interface ArticleTv {
  tv_id: number;
  sort_order: number;
  note: string | null;
  tv: CachedMovie;
}

// Item gabungan movie + tv untuk satu daftar, sudah di-sort
export interface ArticleMediaItem {
  id: number;
  media_type: "movie" | "tv";
  sort_order: number;
  note: string | null;
  media: CachedMovie;
}

export interface ArticleDetail extends ArticleSummary {
  title_en: string | null;
  body: string | null;
  meta_title: string | null;
  meta_desc: string | null;
  source: ArticleSource;
  movies: ArticleMovie[];
  tvSeries: ArticleTv[];
  items: ArticleMediaItem[]; // movie + tv digabung & di-sort
}

export interface ArticleListParams {
  lang?: string;
  topic_type?: TopicType;
  topic_value?: string;
  page?: number;
  limit?: number;
}

export interface ArticleListResult {
  articles: ArticleSummary[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ARTICLE_SUMMARY_COLS = `
  id, slug, title, title_en, excerpt, cover_path,
  topic_type, topic_value, view_count,
  avg_spice, review_count,
  published_at, lang
`.trim();

function pickTitle(
  row: { title: string; title_en: string | null },
  lang: string,
): string {
  if (lang === "en" && row.title_en) return row.title_en;
  return row.title;
}

function mapSummary(row: any, lang: string): ArticleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: pickTitle(row, lang),
    excerpt: row.excerpt ?? null,
    cover_path: row.cover_path ?? null,
    topic_type: row.topic_type ?? null,
    topic_value: row.topic_value ?? null,
    view_count: row.view_count ?? 0,
    avg_spice: row.avg_spice != null ? Number(row.avg_spice) : null,
    review_count: row.review_count ?? 0,
    published_at: row.published_at ?? null,
    lang: row.lang,
  };
}

function mapMedia(m: any, lang: string): CachedMovie {
  // movie pakai: title, original_title
  // tv_series pakai: name, original_name
  const title = m.title ?? m.name ?? "";
  const originalTitle = m.original_title ?? m.original_name ?? "";

  return {
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.original_language === "id" ? originalTitle || title : title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average ?? 0),
    release_date: m.release_date ?? m.first_air_date ?? null,
    popularity: Number(m.popularity ?? 0),
    overview:
      lang === "id"
        ? m.overview || m.overview_en || ""
        : m.overview_en || m.overview || "",
  };
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export async function fetchArticleList(
  params: ArticleListParams = {},
): Promise<ArticleListResult> {
  const { lang = "id", topic_type, topic_value, page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("articles")
    .select(ARTICLE_SUMMARY_COLS, { count: "exact" })
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (topic_type) query = query.eq("topic_type", topic_type);
  if (topic_value) query = query.ilike("topic_value", topic_value);
  if (lang !== "all") query = query.eq("lang", lang);

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[articles-db] fetchArticleList:", error.message);
    return { articles: [], total: 0, page, totalPages: 0 };
  }

  return {
    articles: (data ?? []).map((r: any) => mapSummary(r, lang)),
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

// ─── DETAIL by slug ───────────────────────────────────────────────────────────

export async function fetchArticleBySlug(
  slug: string,
  lang = "id",
): Promise<ArticleDetail | null> {
  // Fetch artikel + movies + tv series dalam satu query
  const { data, error } = await supabase
    .from("articles")
    .select(
      `
      id, slug, title, title_en, excerpt, body, cover_path,
      topic_type, topic_value, view_count,
      avg_spice, review_count,
      published_at, lang, meta_title, meta_desc, source,
      article_movies (
        movie_id, sort_order, note,
        movies (
          id, tmdb_id, title, original_title, original_language,
          poster_path, backdrop_path, vote_average, release_date,
          popularity, overview, overview_en
        )
      ),
      article_tv (
        tv_id, sort_order, note,
        tv_series (
          id, tmdb_id, name, original_name, original_language,
          poster_path, backdrop_path, vote_average, first_air_date,
          popularity, overview, overview_en
        )
      )
      `,
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) {
    if (error?.code !== "PGRST116") {
      console.error("[articles-db] fetchArticleBySlug:", error?.message);
    }
    return null;
  }

  // Map movies
  const movies: ArticleMovie[] = (data.article_movies ?? [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((am: any) => ({
      movie_id: am.movie_id,
      sort_order: am.sort_order,
      note: am.note ?? null,
      movie: mapMedia(am.movies, lang),
    }));

  // Map tv series
  const tvSeries: ArticleTv[] = (data.article_tv ?? [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((at: any) => ({
      tv_id: at.tv_id,
      sort_order: at.sort_order,
      note: at.note ?? null,
      tv: mapMedia(at.tv_series, lang),
    }));

  // Gabungkan movie + tv, sort by sort_order, untuk ditampilkan dalam satu list
  const items: ArticleMediaItem[] = [
    ...movies.map((m) => ({
      id: m.movie_id,
      media_type: "movie" as const,
      sort_order: m.sort_order,
      note: m.note,
      media: m.movie,
    })),
    ...tvSeries.map((t) => ({
      id: t.tv_id,
      media_type: "tv" as const,
      sort_order: t.sort_order,
      note: t.note,
      media: t.tv,
    })),
  ].sort((a, b) => a.sort_order - b.sort_order);

  return {
    ...mapSummary(data, lang),
    title_en: data.title_en ?? null,
    body: data.body ?? null,
    meta_title: data.meta_title ?? null,
    meta_desc: data.meta_desc ?? null,
    source: data.source,
    movies,
    tvSeries,
    items,
  };
}

// ─── Related articles ─────────────────────────────────────────────────────────

export async function fetchRelatedArticles(
  articleId: number,
  topicType: TopicType | null,
  topicValue: string | null,
  lang = "id",
  limit = 4,
): Promise<ArticleSummary[]> {
  let query = supabase
    .from("articles")
    .select(ARTICLE_SUMMARY_COLS)
    .eq("status", "published")
    .neq("id", articleId)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (topicType) query = query.eq("topic_type", topicType);

  const { data, error } = await query;

  if (error) {
    console.error("[articles-db] fetchRelatedArticles:", error.message);
    return [];
  }

  return (data ?? []).map((r: any) => mapSummary(r, lang));
}

// ─── Topics untuk filter sidebar ─────────────────────────────────────────────

export async function fetchArticleTopics(): Promise<
  { topic_type: string; topic_value: string; count: number }[]
> {
  const { data, error } = await supabase
    .from("articles")
    .select("topic_type, topic_value")
    .eq("status", "published")
    .not("topic_type", "is", null)
    .not("topic_value", "is", null);

  if (error) {
    console.error("[articles-db] fetchArticleTopics:", error.message);
    return [];
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const key = `${row.topic_type}::${row.topic_value}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([key, count]) => {
      const [topic_type, topic_value] = key.split("::");
      return { topic_type, topic_value, count };
    })
    .sort((a, b) => b.count - a.count);
}
