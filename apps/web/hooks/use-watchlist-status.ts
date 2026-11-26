import { useState, useEffect, useCallback } from "react";

export function useWatchlistStatus(movieId: number | undefined) {
  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistId, setWatchlistId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/watchlist?media_type=movie`);
      if (!res.ok) return;
      const items: Array<{ id: number; movie_id: number }> = await res.json();
      const found = items.find((item) => item.movie_id === id);
      setInWatchlist(!!found);
      setWatchlistId(found?.id ?? null);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (movieId) checkStatus(movieId);
    else {
      setInWatchlist(false);
      setWatchlistId(null);
    }
  }, [movieId, checkStatus]);

  const toggle = useCallback(
    async (movie: {
      id: number;
      title: string;
      poster_path: string | null;
      vote_average: number;
      release_date?: string;
    }): Promise<"added" | "removed" | "error"> => {
      setLoading(true);
      try {
        if (inWatchlist && watchlistId) {
          const res = await fetch(`/api/watchlist?id=${watchlistId}`, {
            method: "DELETE",
          });
          if (!res.ok) return "error";
          setInWatchlist(false);
          setWatchlistId(null);
          return "removed";
        } else {
          const res = await fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              media_type: "movie",
              movie_id: movie.id,
              status: "want_to_watch",
            }),
          });
          if (!res.ok) return "error";
          const data = await res.json();
          setInWatchlist(true);
          setWatchlistId(data.id);
          return "added";
        }
      } catch {
        return "error";
      } finally {
        setLoading(false);
      }
    },
    [inWatchlist, watchlistId],
  );

  return { inWatchlist, loading, toggle };
}
