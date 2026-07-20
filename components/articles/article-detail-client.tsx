"use client";

/**
 * components/articles/article-detail-client.tsx — FINAL v3
 *
 * Layout:
 * Main column : editorial → daftar film → ReviewList (list ulasan)
 * Sidebar     : artikel terkait → rating summary → ReviewForm (form + spice)
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { startLoader } from "@/components/page-loader";
import { cn } from "@/lib/utils";
import { ChevronLeft, Eye, Clock, Tag, ChevronRight } from "lucide-react";
import type { ArticleDetail, ArticleSummary } from "@/lib/articles-db";
import { ShareButton } from "./share-button";
import { SpiceMeterDisplay } from "./spice-meter";
import { ReviewProvider, ReviewForm, ReviewList } from "./review-section";
import { MovieList } from "./movie-list";
import { LikeButton } from "./like-button";
import NativeBannerAd from "@/components/ads/NativeBannerAd";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  article: ArticleDetail & { avg_spice?: number | null; review_count?: number };
  related: ArticleSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TMDB_COVER = "https://image.tmdb.org/t/p/w1280";

const coverUrl = (p: string | null) =>
  !p
    ? "/placeholder-article.jpg"
    : p.startsWith("http")
      ? p
      : `${TMDB_COVER}${p}`;

const fmtDate = (iso: string | null) =>
  !iso
    ? ""
    : new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

// ─── Related card ─────────────────────────────────────────────────────────────

function RelatedCard({
  article,
}: {
  article: ArticleSummary & {
    avg_spice?: number | null;
    review_count?: number;
  };
}) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      onClick={() => startLoader()}
      className="group flex gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/40 transition-all"
    >
      <div className="shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-muted">
        <img
          src={coverUrl(article.cover_path)}
          alt={article.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      </div>
      <div className="flex flex-col justify-center gap-1 min-w-0">
        <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
          {article.title}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground">
            {fmtDate(article.published_at)}
          </p>
          <SpiceMeterDisplay
            avgSpice={article.avg_spice ?? null}
            reviewCount={article.review_count ?? 0}
            size="sm"
          />
        </div>
      </div>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ArticleDetailClient({ article, related }: Props) {
  const [avgSpice, setAvgSpice] = useState<number | null>(
    article.avg_spice ?? null,
  );
  const [reviewCount, setReviewCount] = useState(article.review_count ?? 0);

  useEffect(() => {
    fetch(`/api/articles/${article.slug}/view`, { method: "POST" });
  }, [article.slug]);

  return (
    <ReviewProvider
      article={article}
      onRatingUpdate={(avg, count) => {
        setAvgSpice(avg);
        setReviewCount(count);
      }}
    >
      <main className="min-h-screen pb-24 lg:pb-8">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <div className="relative w-full aspect-[21/9] lg:aspect-[3/1] overflow-hidden bg-muted">
          {/* Background: full screen, blur */}
          <img
            src={coverUrl(article.cover_path)}
            alt=""
            aria-hidden="true"
            className="absolute -inset-y-8 inset-x-0 w-full h-[calc(100%+4rem)] object-cover scale-120 blur-sm opacity-60"
          />
          <div className="absolute inset-0 bg-background/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

          {/* Back button */}
          <button
            onClick={() => {
              startLoader();
              history.back();
            }}
            className="absolute top-4 left-4 lg:top-6 lg:left-8 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs backdrop-blur-sm hover:bg-black/70 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Kembali
          </button>

          {/* Poster: landscape, centered, floating */}
          <div className="absolute inset-0 flex items-center justify-center px-6 lg:px-0">
            <div className="relative w-[75%] lg:w-[55%] aspect-video rounded-xl overflow-hidden shadow-2xl">
              <img
                src={coverUrl(article.cover_path)}
                alt={article.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="px-4 lg:px-8 -mt-17 lg:-mt-25 relative z-10">
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-10">
            {/* ── Main column ────────────────────────────────────────────── */}
            <article className="flex-1 min-w-0">
              {/* Topic badge */}
              {article.topic_type && article.topic_value && (
                <div className="flex items-center gap-1.5 mb-3">
                  <Tag className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary uppercase tracking-wide">
                    {article.topic_value}
                  </span>
                </div>
              )}

              <h1 className="text-2xl lg:text-3xl font-bold text-foreground leading-tight mb-4">
                {article.title}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  {fmtDate(article.published_at)}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="w-3.5 h-3.5" />
                  {article.view_count.toLocaleString("id-ID")}
                </span>
                <SpiceMeterDisplay
                  avgSpice={avgSpice}
                  reviewCount={reviewCount}
                  size="sm"
                />

                <ShareButton slug={article.slug} title={article.title} />
                <LikeButton slug={article.slug} />
              </div>

              {/* Editorial body */}
              {article.body && (
                <div
                  className={cn(
                    "prose prose-xs prose-invert max-w-none mb-8",
                    "prose-p:text-muted-foreground prose-p:leading-relaxed",
                    "prose-headings:text-foreground prose-headings:font-semibold",
                    "prose-strong:text-foreground",
                    "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                  )}
                  dangerouslySetInnerHTML={{ __html: article.body }}
                />
              )}

              {/* Daftar film */}
              <MovieList items={article.items} movies={article.movies} />

              <NativeBannerAd className="px-4" />

              {/* List ulasan — di bawah daftar film */}
              <ReviewList />

              {/* Mobile only: rating + form di bawah list ulasan */}
              <div className="lg:hidden mt-8 flex flex-col gap-4">
                <div className="p-4 rounded-2xl bg-card border border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Rating Komunitas
                  </p>
                  <SpiceMeterDisplay
                    avgSpice={avgSpice}
                    reviewCount={reviewCount}
                  />
                </div>
                <ReviewForm />
              </div>
            </article>

            {/* ── Sidebar ────────────────────────────────────────────────── */}
            <aside className="hidden lg:block lg:w-72 shrink-0">
              <div className="lg:sticky lg:top-8 flex flex-col gap-4">
                {/* Artikel terkait */}
                {related.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Artikel Terkait
                    </h3>
                    <div className="flex flex-col gap-2">
                      {related.map((r) => (
                        <RelatedCard key={r.id} article={r} />
                      ))}
                    </div>
                    <Link
                      href="/articles"
                      onClick={() => startLoader()}
                      className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
                    >
                      Lihat semua artikel{" "}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}

                {/* Rating summary */}
                <div className="p-4 rounded-2xl bg-card border border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Rating Komunitas
                  </p>
                  <SpiceMeterDisplay
                    avgSpice={avgSpice}
                    reviewCount={reviewCount}
                  />
                </div>

                {/* Form kirim ulasan */}
                <ReviewForm />
              </div>
            </aside>
          </div>
        </div>
      </main>
    </ReviewProvider>
  );
}
