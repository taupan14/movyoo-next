"use client";

/**
 * components/contributor/media-picker.tsx — FILE BARU
 * Search & tautkan film/series ke artikel (article_movies / article_tv).
 * Dipakai di dalam ArticleForm.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Loader2,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Film,
  Tv as TvIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArticleMediaLink, MediaSearchResult } from "@/types/contributor";

const TMDB_IMG = "https://image.tmdb.org/t/p/w154";
function posterUrl(path: string | null): string {
  if (!path) return "https://placehold.co/154x231/1a1a2e/eee?text=No+Poster";
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG}${path}`;
}

function formatYear(date: string | null): string {
  if (!date) return "";
  return date.slice(0, 4);
}

interface MediaPickerProps {
  value: ArticleMediaLink[];
  onChange: (media: ArticleMediaLink[]) => void;
}

export function MediaPicker({ value, onChange }: MediaPickerProps) {
  const [tab, setTab] = useState<"movie" | "tv">("movie");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/search/${tab === "movie" ? "movies" : "tv"}?q=${encodeURIComponent(
            query.trim(),
          )}`,
        );
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tab]);

  const isSelected = useCallback(
    (item: { media_type: "movie" | "tv"; id: number }) =>
      value.some((v) => v.media_type === item.media_type && v.id === item.id),
    [value],
  );

  function addItem(item: MediaSearchResult) {
    if (isSelected(item)) return;
    const newItem: ArticleMediaLink = {
      media_type: item.media_type,
      id: item.id,
      title: item.title,
      poster_path: item.poster_path,
      release_date: item.release_date,
      note: "",
      sort_order: value.length,
    };
    onChange([...value, newItem]);
  }

  function removeItem(index: number) {
    const next = value
      .filter((_, i) => i !== index)
      .map((v, i) => ({ ...v, sort_order: i }));
    onChange(next);
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((v, i) => ({ ...v, sort_order: i })));
  }

  function updateNote(index: number, note: string) {
    const next = [...value];
    next[index] = { ...next[index], note };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {/* Selected items */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((item, i) => (
            <div
              key={`${item.media_type}-${item.id}`}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/8"
            >
              <img
                src={posterUrl(item.poster_path)}
                alt={item.title}
                className="w-10 h-14 rounded-lg object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {item.media_type === "movie" ? (
                    <Film className="w-3 h-3 text-primary shrink-0" />
                  ) : (
                    <TvIcon className="w-3 h-3 text-primary shrink-0" />
                  )}
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.title}
                  </p>
                  {item.release_date && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({formatYear(item.release_date)})
                    </span>
                  )}
                </div>
                <input
                  value={item.note ?? ""}
                  onChange={(e) => updateNote(i, e.target.value)}
                  placeholder="Catatan singkat (opsional)..."
                  className="w-full mt-1 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveItem(i, -1)}
                  disabled={i === 0}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(i, 1)}
                  disabled={i === value.length - 1}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/8 w-fit">
        {(["movie", "tv"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setResults([]);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              tab === t
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "movie" ? (
              <Film className="w-3.5 h-3.5" />
            ) : (
              <TvIcon className="w-3.5 h-3.5" />
            )}
            {t === "movie" ? "Film" : "Series"}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Cari ${tab === "movie" ? "film" : "series"} untuk ditautkan...`}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/60"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1">
          {results.map((r) => {
            const selected = isSelected(r);
            return (
              <button
                key={`${r.media_type}-${r.id}`}
                type="button"
                onClick={() => addItem(r)}
                disabled={selected}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-xl border text-left transition-colors",
                  selected
                    ? "bg-primary/10 border-primary/30 opacity-60 cursor-default"
                    : "bg-white/[0.02] border-white/8 hover:border-primary/40",
                )}
              >
                <img
                  src={posterUrl(r.poster_path)}
                  alt={r.title}
                  className="w-8 h-11 rounded-md object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {r.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatYear(r.release_date)}
                  </p>
                </div>
                {selected ? (
                  <span className="text-[10px] text-primary shrink-0">✓</span>
                ) : (
                  <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {query.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Tidak ditemukan {tab === "movie" ? "film" : "series"} dengan judul
          itu.
        </p>
      )}
    </div>
  );
}
