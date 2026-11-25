"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, Newspaper } from "lucide-react";
import { useI18n } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";
import type { FestivalBuzzFeedData, FestivalBuzzFeedItem } from "@/types/festivals-extra";

function BuzzCard({ item, locale }: { item: FestivalBuzzFeedItem; locale: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <Link
          href={`/festivals/${item.festival.slug}`}
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${item.festival.accent_color}26`,
            color: item.festival.accent_color,
          }}
        >
          {item.festival.short_name}
        </Link>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {item.source}
        </span>
        {item.published_at && (
          <span className="text-[10px] text-muted-foreground/60">
            · {new Date(item.published_at).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
        {item.buzz_score != null && (
          <span className="ml-auto text-xs font-bold text-primary">{item.buzz_score}/10</span>
        )}
      </div>

      <p className="text-sm font-semibold text-foreground leading-snug">
        {locale === "id" ? (item.headline_id ?? item.headline) : item.headline}
      </p>
      {(item.summary_id ?? item.summary) && (
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3">
          {locale === "id" ? (item.summary_id ?? item.summary) : item.summary}
        </p>
      )}
      {item.lineup_title && (
        <p className="text-[11px] text-muted-foreground/70 mt-1.5">
          {locale === "id" ? "Terkait: " : "About: "}
          <span className="text-foreground">{item.lineup_title}</span>
        </p>
      )}

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-xs text-primary hover:underline"
        >
          {locale === "id" ? "Baca sumber asli" : "Read source"} <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

export function FestivalBuzzClient() {
  const { locale } = useI18n();
  const [items, setItems] = useState<FestivalBuzzFeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback((p: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    fetch(`/api/festivals/buzz?page=${p}&limit=15`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: FestivalBuzzFeedData | null) => {
        if (json) {
          setItems((prev) => (append ? [...prev, ...json.items] : json.items));
          setTotalPages(json.totalPages);
        }
      })
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, []);

  useEffect(() => {
    load(1, false);
  }, [load]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next, true);
  };

  return (
    <main className="min-h-screen pt-6 pb-24 px-4 lg:px-6">
      <div className="flex items-center gap-2 mb-1">
        <Newspaper className="w-6 h-6 text-primary" />
        <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
          {locale === "id" ? "Buzz Festival" : "Festival Buzz"}
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {locale === "id"
          ? "Berita dan reaksi kritikus terbaru dari festival film dunia."
          : "The latest news and critic reactions from the world's film festivals."}
      </p>

      <div className="max-w-2xl mx-auto flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[140px] rounded-2xl bg-white/10 animate-pulse" />
          ))
        ) : !items.length ? (
          <p className="text-center text-muted-foreground py-20">
            {locale === "id" ? "Belum ada berita." : "No buzz yet."}
          </p>
        ) : (
          <>
            {items.map((item) => (
              <BuzzCard key={item.id} item={item} locale={locale} />
            ))}
            {page < totalPages && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className={cn(
                  "mt-2 py-3 rounded-xl glass text-sm font-medium text-foreground hover:bg-white/10 transition-colors",
                  loadingMore && "opacity-60",
                )}
              >
                {loadingMore
                  ? locale === "id" ? "Memuat..." : "Loading..."
                  : locale === "id" ? "Muat lebih banyak" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
