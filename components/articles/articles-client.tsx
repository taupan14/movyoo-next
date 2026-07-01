"use client";

/**
 * components/articles/articles-client.tsx  — UPDATED
 * Tambahan: SpiceMeterDisplay di setiap article card
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";
import { startLoader } from "@/components/page-loader";
import {
  BookOpen,
  Tag,
  User,
  Video,
  Building2,
  Tv,
  Layers,
  ChevronRight,
  Eye,
  Clock,
  Search,
  Loader2,
} from "lucide-react";
import type { ArticleSummary, TopicType } from "@/lib/articles-db";
import { SpiceMeterDisplay } from "./spice-meter";

// import NativeBannerAd from "@/components/ads/NativeBannerAd";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOPIC_FILTERS: {
  value: TopicType | "all";
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "all", label: "Semua", icon: Layers },
  { value: "genre", label: "Genre", icon: Tag },
  { value: "actor", label: "Aktor", icon: User },
  { value: "director", label: "Sutradara", icon: Video },
  { value: "studio", label: "Studio", icon: Building2 },
  { value: "platform", label: "Platform", icon: Tv },
  { value: "custom", label: "Lainnya", icon: BookOpen },
];

const TMDB_IMG = "https://image.tmdb.org/t/p/w780";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function coverUrl(path: string | null): string {
  if (!path) return "/placeholder-article.jpg";
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG}${path}`;
}

// ─── Article Card ─────────────────────────────────────────────────────────────

function ArticleCard({ article }: { article: ArticleSummary }) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      onClick={() => startLoader()}
      className="group flex flex-col rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Cover */}
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        <img
          src={coverUrl(article.cover_path)}
          alt={article.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {/* Topic badge */}
        {article.topic_type && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary/90 text-white backdrop-blur-sm capitalize">
            {article.topic_type === "genre"
              ? "Genre"
              : article.topic_type === "actor"
                ? "Aktor"
                : article.topic_type === "director"
                  ? "Sutradara"
                  : article.topic_type === "studio"
                    ? "Studio"
                    : article.topic_type === "platform"
                      ? "Platform"
                      : "Artikel"}
          </span>
        )}
        {article.topic_value && (
          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/60 text-white backdrop-blur-sm">
            {article.topic_value}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 p-4 flex-1">
        <h2 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {article.title}
        </h2>
        {article.excerpt && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {article.excerpt}
          </p>
        )}

        {/* Footer: date · views · spice */}
        <div className="mt-auto pt-3 border-t border-border/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatDate(article.published_at)}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Eye className="w-3 h-3" />
              {article.view_count.toLocaleString("id-ID")}
            </span>
          </div>

          {/* Spice meter — hanya tampil kalau sudah ada review */}
          <SpiceMeterDisplay
            avgSpice={article.avg_spice}
            reviewCount={article.review_count}
            size="sm"
          />
        </div>
      </div>
    </Link>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ArticleCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden bg-card border border-border animate-pulse">
      <div className="aspect-[16/9] bg-white/5" />
      <div className="p-4 flex flex-col gap-2">
        <div className="h-4 rounded bg-white/5 w-3/4" />
        <div className="h-3 rounded bg-white/5 w-full" />
        <div className="h-3 rounded bg-white/5 w-2/3" />
        <div className="mt-2 h-3 rounded bg-white/5 w-1/3" />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ArticlesClient() {
  const { locs } = useI18n();
  const locale = locs || "id";

  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [topicFilter, setTopicFilter] = useState<TopicType | "all">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchArticles = useCallback(
    async (
      p: number,
      topic: typeof topicFilter,
      q: string,
      replace = false,
    ) => {
      if (p === 1) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams({
        lang: locale,
        page: String(p),
        limit: "18",
      });
      if (topic !== "all") params.set("topic_type", topic);
      if (q) params.set("topic_value", q);

      try {
        const res = await fetch(`/api/articles?${params}`);
        const json = await res.json();
        setArticles((prev) =>
          replace || p === 1 ? json.articles : [...prev, ...json.articles],
        );
        setTotalPages(json.totalPages);
        setTotal(json.total);
        setPage(p);
      } catch {
        // silent
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    fetchArticles(1, topicFilter, search, true);
  }, [topicFilter, search, locale, fetchArticles]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <main className="min-h-screen pt-6 pb-24">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6 mb-6">
        <div>
          <div className="flex flex-col gap-1 mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
              {locale === "id"
                ? "Artikel Film & Serial"
                : "Film & Series Articles"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {locale === "id"
                ? "Panduan nonton, rekomendasi, dan ulasan terlengkap"
                : "The most comprehensive viewing guide, recommendations, and reviews"}
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-5 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Cari genre, aktor, sutradara…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Cari
            </button>
          </form>

          {/* Topic filter chips */}
          <div className="flex gap-2 flex-wrap">
            {TOPIC_FILTERS.map((f) => {
              const Icon = f.icon;
              const active = topicFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setTopicFilter(f.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    active
                      ? "bg-primary text-white"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* {!loading && (
            <p className="mt-3 text-xs text-muted-foreground">
              {total.toLocaleString("id-ID")} artikel ditemukan
            </p>
          )} */}
        </div>
      </div>

      {/* <NativeBannerAd className="px-4" /> */}

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6 mb-6">
        <div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <ArticleCardSkeleton key={i} />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <BookOpen className="w-12 h-12 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Belum ada artikel</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}

          {/* Load more */}
          {!loading && page < totalPages && (
            <div className="flex justify-center mt-8">
              <button
                onClick={() => fetchArticles(page + 1, topicFilter, search)}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                Muat lebih banyak
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
