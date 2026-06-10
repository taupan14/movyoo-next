"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useI18n } from "@/hooks/use-locale";
import { searchMovies } from "@/lib/tmdb";
import { MovieCard } from "@/components/movie-card";
import { cn } from "@/lib/utils";
import { Search, X, Clock, TrendingUp, Loader as Loader2 } from "lucide-react";

interface Movie {
  id: number;
  title: string;
  tmdb_id: number;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  genre_ids?: number[];
  popularity?: number;
  overview?: string;
}

const RECENT_SEARCHES_KEY = "movyoo-recent-searches";
const MAX_RECENT = 8;

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  const recent = getRecentSearches().filter((s) => s !== query);
  recent.unshift(query);
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(recent.slice(0, MAX_RECENT)),
  );
}

function removeRecentSearch(query: string): string[] {
  if (typeof window === "undefined") return [];
  const recent = getRecentSearches().filter((s) => s !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
  return recent;
}

function clearRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  localStorage.removeItem(RECENT_SEARCHES_KEY);
  return [];
}

function SearchSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[2/3] rounded-xl bg-muted" />
          <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
          <div className="mt-1 h-3 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function SearchPage() {
  const { t, locale, region } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
    // auto-focus
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(t);
  }, []);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const lang = locale === "id" ? "id" : "en";
        const data = await searchMovies(searchQuery.trim(), lang, region);
        setResults(data.results || []);
      } catch (err) {
        console.error("Search failed:", err);
        setResults([]);
      }
      setLoading(false);
    },
    [locale, region],
  );

  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value.trim()) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      setHasSearched(true);
      performSearch(value);
    }, 300);
  };

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    addRecentSearch(searchQuery);
    setRecentSearches(getRecentSearches());
    setHasSearched(true);
    performSearch(searchQuery);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      handleSearch(query);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleRemoveRecent = (searchTerm: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = removeRecentSearch(searchTerm);
    setRecentSearches(updated);
  };

  const handleClearRecent = () => {
    const updated = clearRecentSearches();
    setRecentSearches(updated);
  };

  return (
    <div className="min-h-screen px-4 lg:px-6 py-6 lg:py-8">
      {/* Header */}
      <div className="animate-fade-in mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-1">
          {t("nav_search")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("search_placeholder")}
        </p>
      </div>

      {/* Search Input */}
      <div className="animate-slide-up relative mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("search_placeholder")}
            className={cn(
              "w-full h-14 pl-12 pr-12 rounded-2xl text-base",
              "bg-white/5 border border-white/10",
              "text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
              "backdrop-blur-xl transition-all duration-300",
            )}
          />
          {loading && (
            <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
          )}
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Recent Searches (show when not searching) */}
      {!hasSearched && recentSearches.length > 0 && (
        <div className="animate-fade-in mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {locale === "id" ? "Pencarian Terakhir" : "Recent Searches"}
              </h2>
            </div>
            <button
              onClick={handleClearRecent}
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              {locale === "id" ? "Hapus Semua" : "Clear All"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term) => (
              <button
                key={term}
                onClick={() => handleSearch(term)}
                className="group flex items-center gap-1.5 px-3 py-2 rounded-xl glass hover:bg-white/10 transition-all duration-200"
              >
                <Clock className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                  {term}
                </span>
                <span
                  onClick={(e) => handleRemoveRecent(term, e)}
                  className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trending hint (when no search active) */}
      {!hasSearched && recentSearches.length === 0 && (
        <div className="animate-fade-in flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <TrendingUp className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {locale === "id" ? "Mulai Cari Film" : "Start Searching Movies"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {locale === "id"
              ? "Ketik judul film yang ingin kamu cari di atas"
              : "Type a movie title you want to search above"}
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <SearchSkeleton />}

      {/* Search Results */}
      {!loading && hasSearched && (
        <div className="animate-fade-in">
          {results.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {locale === "id"
                  ? `${results.length} hasil ditemukan`
                  : `${results.length} results found`}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {results.map((movie, i) => (
                  <div
                    key={movie.id}
                    className="animate-slide-up"
                    style={{ animationDelay: `${Math.min(i * 50, 500)}ms` }}
                  >
                    <MovieCard movie={movie} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {t("no_results")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {locale === "id"
                  ? `Tidak ditemukan film untuk "${query}"`
                  : `No movies found for "${query}"`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
