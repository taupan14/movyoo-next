"use client";

import { useEffect, useState, useCallback } from "react";
import { Heart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function LikeButton({ slug }: { slug: string }) {
  const { user, openAuthModal } = useAuth();
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/articles/${slug}/likes`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      setLikeCount(json.likeCount ?? 0);
      setLiked(json.liked ?? false);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  async function toggle() {
    if (!user) {
      openAuthModal("signin");
      return;
    }
    if (busy) return;
    setBusy(true);

    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevCount + (prevLiked ? -1 : 1));

    try {
      const res = await fetch(`/api/articles/${slug}/likes`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLikeCount(json.likeCount ?? 0);
      setLiked(json.liked ?? false);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="h-8 w-16 rounded-full bg-white/5 animate-pulse" />;
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all disabled:opacity-60",
        liked
          ? "bg-red-500/15 border-red-500/40 text-red-400"
          : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-red-400/30",
      )}
    >
      <Heart className={cn("w-3.5 h-3.5", liked && "fill-current")} />
      {likeCount}
    </button>
  );
}
