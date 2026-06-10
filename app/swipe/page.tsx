"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/hooks/use-locale";
import { useAuth } from "@/hooks/use-auth";
import { getPosterUrl } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  X,
  Heart,
  Star,
  RotateCcw,
  ArrowLeft,
  Loader2,
  LogIn,
  Users,
  Tag,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SwipeAction = "like" | "dislike";
type MediaType = "movie" | "tv";

interface SwipeFeedItem {
  pool_id: number;
  media_type: MediaType;
  movie_id?: number;
  series_id?: number;
  bucket: string;
  score: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_year: string | null;
  overview: string;
  genres: string[];
  cast: string[];
}

interface FeedResponse {
  items: SwipeFeedItem[];
  source: "pool" | "fallback";
  poolLeft: number | null;
  isGuest: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 90;
const PREFETCH_AT = 3; // prefetch saat sisa item di queue < angka ini

// ─── Bucket badge ─────────────────────────────────────────────────────────────

const BUCKET_CONFIG: Record<string, { label: string; className: string }> = {
  personal: { label: "For You", className: "bg-violet-500/80" },
  adjacent: { label: "Discover", className: "bg-blue-500/80" },
  wildcard: { label: "Wildcard", className: "bg-amber-500/80" },
  trending: { label: "Trending", className: "bg-rose-500/80" },
  hidden_gem: { label: "Hidden Gem", className: "bg-emerald-500/80" },
};

// ─── Auth Gate ────────────────────────────────────────────────────────────────
// Ditampilkan saat user belum login dan belum memilih "lanjut sebagai guest".
// Klik "Masuk" → buka modal auth yang sudah ada di app (openAuthModal).
// Klik "Lanjut tanpa login" → set guestConfirmed = true, langsung ke feed.

function AuthGate({
  locale,
  onSignIn,
  onContinueAsGuest,
}: {
  locale: string;
  onSignIn: () => void;
  onContinueAsGuest: () => void;
}) {
  const isId = locale === "id";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-xl">
        <Zap className="w-8 h-8 text-white" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Swipe Pick</h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
          {isId
            ? "Login untuk rekomendasi personal yang makin pintar dari setiap swipe kamu."
            : "Log in to get smarter recommendations that learn from every swipe."}
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onSignIn}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          <LogIn className="w-4 h-4" />
          {isId ? "Masuk / Daftar" : "Log in / Sign up"}
        </button>

        <button
          onClick={onContinueAsGuest}
          className="px-6 py-3 rounded-xl glass text-muted-foreground text-sm font-medium hover:bg-white/10 transition-colors"
        >
          {isId ? "Lanjut tanpa login" : "Continue as guest"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground/60 max-w-xs">
        {isId
          ? "Mode tamu: swipe tidak disimpan, rekomendasi tidak dipersonalisasi."
          : "Guest mode: swipes aren't saved, recommendations aren't personalized."}
      </p>
    </div>
  );
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────

function SwipeCard({
  item,
  swipeDir,
  cardRef,
  onMouseDown,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  locale,
  t,
}: {
  item: SwipeFeedItem;
  swipeDir: "left" | "right" | null;
  cardRef: React.RefObject<HTMLDivElement>;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  locale: string;
  t: (key: string) => string;
}) {
  const bucket = BUCKET_CONFIG[item.bucket] ?? BUCKET_CONFIG["trending"];
  const mediaLabel =
    item.media_type === "tv"
      ? locale === "id"
        ? "Serial"
        : "Series"
      : locale === "id"
        ? "Film"
        : "Movie";

  return (
    <div
      ref={cardRef}
      className="relative rounded-3xl overflow-hidden glass-strong cursor-grab active:cursor-grabbing select-none touch-none"
      style={{
        transform: "translateX(0) rotate(0deg)",
        willChange: "transform",
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative aspect-[2/3]">
        <img
          src={getPosterUrl(item.poster_path, "w780")}
          alt={item.title}
          className="w-full h-full object-cover"
          draggable={false}
        />

        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

        {/* LIKE stamp */}
        <div
          className={cn(
            "absolute top-8 left-6 px-4 py-2 rounded-xl border-4 border-green-500 text-green-400 font-black text-2xl rotate-[-20deg] transition-opacity duration-200",
            swipeDir === "right" ? "opacity-100" : "opacity-0",
          )}
        >
          {t("swipe_right").toUpperCase()}
        </div>

        {/* NOPE stamp */}
        <div
          className={cn(
            "absolute top-8 right-6 px-4 py-2 rounded-xl border-4 border-red-500 text-red-400 font-black text-2xl rotate-[20deg] transition-opacity duration-200",
            swipeDir === "left" ? "opacity-100" : "opacity-0",
          )}
        >
          {t("swipe_left").toUpperCase()}
        </div>

        {/* Top badges */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white",
              bucket.className,
            )}
          >
            {bucket.label}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-black/40 text-white/80">
            {mediaLabel}
          </span>
        </div>

        {/* Info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2.5">
          {/* Title + meta */}
          <div>
            <h2 className="text-xl font-bold text-white leading-tight line-clamp-2 mb-1.5">
              {item.title}
            </h2>
            <div className="flex items-center gap-2.5">
              {item.vote_average > 0 && (
                <span className="flex items-center gap-1 text-sm text-yellow-400 font-semibold">
                  <Star className="w-3.5 h-3.5 fill-yellow-400" />
                  {item.vote_average.toFixed(1)}
                </span>
              )}
              {item.release_year && (
                <span className="text-sm text-white/50">
                  {item.release_year}
                </span>
              )}
            </div>
          </div>

          {/* Genres */}
          {item.genres.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag className="w-3 h-3 text-white/40 flex-shrink-0" />
              {item.genres.map((g) => (
                <span
                  key={g}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/75"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Overview */}
          {item.overview && (
            <p className="text-xs text-white/65 line-clamp-3 leading-relaxed">
              {item.overview}
            </p>
          )}

          {/* Cast */}
          {item.cast.length > 0 && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <Users className="w-3 h-3 text-white/40 flex-shrink-0" />
              <p className="text-[11px] text-white/55 truncate">
                {item.cast.join(" · ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ResultsScreen({
  liked,
  onRestart,
  locale,
  isGuest,
  onSignIn,
}: {
  liked: SwipeFeedItem[];
  onRestart: () => void;
  locale: string;
  isGuest: boolean;
  onSignIn: () => void;
}) {
  const isId = locale === "id";
  const topPick = liked[0];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 gap-8">
      <div className="text-center">
        <div className="text-4xl mb-3">🎬</div>
        <h2 className="text-xl font-bold text-foreground">
          {isId ? "Sesi selesai!" : "Session done!"}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {isId
            ? `Kamu suka ${liked.length} film/series`
            : `You liked ${liked.length} title${liked.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {liked.length > 0 ? (
        <div className="w-full max-w-sm space-y-3">
          {liked.map((item) => {
            const href =
              item.media_type === "movie"
                ? `/movie/${item.movie_id}`
                : `/tv/${item.series_id}`;
            return (
              <Link
                key={`${item.media_type}-${item.movie_id ?? item.series_id}`}
                href={href}
                className="group flex items-center gap-3 glass rounded-2xl p-3 hover:bg-white/8 transition-colors"
              >
                <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                  <img
                    src={getPosterUrl(item.poster_path, "w185")}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors truncate">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.vote_average > 0 && (
                      <span className="flex items-center gap-1 text-xs text-yellow-400">
                        <Star className="w-3 h-3 fill-yellow-400" />
                        {item.vote_average.toFixed(1)}
                      </span>
                    )}
                    {item.release_year && (
                      <span className="text-xs text-muted-foreground">
                        {item.release_year}
                      </span>
                    )}
                    {item.genres[0] && (
                      <span className="text-xs text-muted-foreground truncate">
                        {item.genres[0]}
                      </span>
                    )}
                  </div>
                </div>
                <Heart className="w-4 h-4 text-red-400 fill-red-400 flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm text-center">
          {isId
            ? "Belum ada yang kamu suka. Coba lagi!"
            : "You didn't like anything. Try again!"}
        </p>
      )}

      {/* Guest sign-in nudge */}
      {isGuest && (
        <div className="w-full max-w-sm glass rounded-2xl p-4 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">
            {isId ? "Simpan progress kamu" : "Save your progress"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isId
              ? "Login untuk rekomendasi yang makin pintar dari setiap swipe."
              : "Log in to get recommendations that learn from your taste."}
          </p>
          <button
            onClick={onSignIn}
            className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <LogIn className="w-4 h-4" />
            {isId ? "Masuk sekarang" : "Log in now"}
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onRestart}
          className="flex items-center gap-2 px-5 py-3 rounded-xl glass text-foreground font-medium text-sm hover:bg-white/10 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          {isId ? "Swipe Lagi" : "Swipe Again"}
        </button>
        {topPick && (
          <Link
            href={
              topPick.media_type === "movie"
                ? `/movie/${topPick.movie_id}`
                : `/tv/${topPick.series_id}`
            }
            className="flex items-center gap-2 px-5 py-3 rounded-xl gradient-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            {isId ? "Tonton ini!" : "Watch this!"}
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SwipePage() {
  const { t, locale, region } = useI18n();
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const isId = locale === "id";

  // ── Feed state ──────────────────────────────────────────────────────────
  const [guestConfirmed, setGuestConfirmed] = useState(false); // user pilih "lanjut tanpa login"
  const [queue, setQueue] = useState<SwipeFeedItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [liked, setLiked] = useState<SwipeFeedItem[]>([]);
  const [totalSwiped, setTotalSwiped] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // ── Drag state ──────────────────────────────────────────────────────────
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const isGuest = !authLoading && !user;
  // Apakah user sudah "masuk" ke feed — login atau explicit pilih guest
  const feedReady = !authLoading && (!!user || guestConfirmed);
  const currentItem = queue[currentIdx];
  const remaining = queue.length - currentIdx;

  // ── Fetch feed ──────────────────────────────────────────────────────────
  const fetchFeed = useCallback(
    async (append = false) => {
      if (isFetching) return;
      setIsFetching(true);
      if (!append) setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/swipe-pick?limit=10`);
        const json: FeedResponse = await res.json();
        if (!res.ok) throw new Error("fetch failed");

        if (append) {
          setQueue((prev) => {
            const seen = new Set(
              prev.map((i) => `${i.media_type}-${i.movie_id ?? i.series_id}`),
            );
            const fresh = json.items.filter(
              (i) => !seen.has(`${i.media_type}-${i.movie_id ?? i.series_id}`),
            );
            return [...prev, ...fresh];
          });
        } else {
          setQueue(json.items);
          setCurrentIdx(0);
        }
      } catch {
        setError(
          isId
            ? "Gagal memuat film. Coba lagi."
            : "Failed to load. Please try again.",
        );
      } finally {
        setLoading(false);
        setIsFetching(false);
      }
    },
    [isFetching, isId],
  );

  // Fetch setelah user siap (login atau confirm guest)
  useEffect(() => {
    if (!feedReady) return;
    fetchFeed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedReady]);

  // Prefetch saat sisa < threshold
  useEffect(() => {
    if (!feedReady || loading || isFetching || showResults) return;
    if (remaining <= PREFETCH_AT) fetchFeed(true);
  }, [remaining, feedReady, loading, isFetching, showResults, fetchFeed]);

  // ── Process swipe ───────────────────────────────────────────────────────
  const processSwipe = useCallback(
    async (direction: "left" | "right") => {
      if (isAnimating || !currentItem) return;
      setIsAnimating(true);
      setSwipeDir(direction);

      const item = currentItem;
      const action: SwipeAction = direction === "right" ? "like" : "dislike";

      setTimeout(() => {
        if (direction === "right") setLiked((prev) => [...prev, item]);
        setTotalSwiped((prev) => prev + 1);

        if (currentIdx + 1 >= queue.length) {
          setShowResults(true);
        } else {
          setCurrentIdx((prev) => prev + 1);
        }

        setSwipeDir(null);
        setIsAnimating(false);

        // Simpan ke DB hanya jika login
        if (user) {
          fetch("/api/swipe-pick/swipe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mediaType: item.media_type,
              movieId: item.movie_id,
              seriesId: item.series_id,
              action,
              poolId: item.pool_id,
            }),
          }).catch((err) => console.error("[swipe] POST failed:", err));
        }
      }, 280);
    },
    [currentItem, isAnimating, currentIdx, queue.length, user],
  );

  const handleSkip = () => processSwipe("left");
  const handleLike = () => processSwipe("right");

  const handleRestart = () => {
    setCurrentIdx(0);
    setLiked([]);
    setTotalSwiped(0);
    setShowResults(false);
    setSwipeDir(null);
    setIsAnimating(false);
    setQueue([]);
    fetchFeed(false);
  };

  // ── Touch handlers ──────────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    const touch = e.touches[0];
    startPos.current = currentPos.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || isAnimating) return;
    const touch = e.touches[0];
    currentPos.current = { x: touch.clientX, y: touch.clientY };
    const deltaX = touch.clientX - startPos.current.x;
    if (cardRef.current) {
      cardRef.current.style.transform = `translateX(${deltaX}px) rotate(${deltaX * 0.08}deg)`;
      cardRef.current.style.transition = "none";
    }
    setSwipeDir(
      deltaX > SWIPE_THRESHOLD * 0.5
        ? "right"
        : deltaX < -SWIPE_THRESHOLD * 0.5
          ? "left"
          : null,
    );
  };

  const handleTouchEnd = () => {
    if (!isDragging.current || isAnimating) return;
    isDragging.current = false;
    const deltaX = currentPos.current.x - startPos.current.x;
    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      processSwipe(deltaX > 0 ? "right" : "left");
    } else {
      if (cardRef.current) {
        cardRef.current.style.transition = "transform 0.3s ease";
        cardRef.current.style.transform = "translateX(0) rotate(0deg)";
      }
      setSwipeDir(null);
    }
  };

  // ── Mouse handlers ──────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isAnimating) return;
    e.preventDefault();
    startPos.current = currentPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = true;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || isAnimating) return;
      currentPos.current = { x: e.clientX, y: e.clientY };
      const deltaX = e.clientX - startPos.current.x;
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${deltaX}px) rotate(${deltaX * 0.08}deg)`;
        cardRef.current.style.transition = "none";
      }
      setSwipeDir(
        deltaX > SWIPE_THRESHOLD * 0.5
          ? "right"
          : deltaX < -SWIPE_THRESHOLD * 0.5
            ? "left"
            : null,
      );
    };

    const onUp = (e: MouseEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const deltaX = e.clientX - startPos.current.x;
      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        processSwipe(deltaX > 0 ? "right" : "left");
      } else {
        if (cardRef.current) {
          cardRef.current.style.transition = "transform 0.3s ease";
          cardRef.current.style.transform = "translateX(0) rotate(0deg)";
        }
        setSwipeDir(null);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isAnimating, processSwipe]);

  // ─── Render: auth loading ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Render: auth gate (belum login & belum pilih guest) ─────────────────
  if (!user && !guestConfirmed) {
    return (
      <AuthGate
        locale={locale}
        onSignIn={() => openAuthModal("signin")}
        onContinueAsGuest={() => setGuestConfirmed(true)}
      />
    );
  }

  // ─── Render: loading feed ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 text-muted-foreground">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
        {/* <span className="text-sm">{isId ? "Memuat..." : "Loading..."}</span> */}
      </div>
    );
  }

  // ─── Render: error ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          onClick={() => fetchFeed(false)}
          className="px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium"
        >
          {isId ? "Coba lagi" : "Retry"}
        </button>
      </div>
    );
  }

  // ─── Render: results ─────────────────────────────────────────────────────
  if (showResults) {
    return (
      <ResultsScreen
        liked={liked}
        onRestart={handleRestart}
        locale={locale}
        isGuest={isGuest}
        onSignIn={() => openAuthModal("signin")}
      />
    );
  }

  // ─── Render: main swipe UI ───────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-30 glass-strong">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/"
              className="flex items-center justify-center w-9 h-9 rounded-xl glass hover:bg-white/10 transition-colors"
              aria-label="Home"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Link>
            <div className="flex-1">
              <h1 className="text-sm font-bold text-foreground">
                {t("nav_swipe")}
              </h1>
              {isGuest && (
                <p className="text-[10px] text-muted-foreground/70">
                  {isId
                    ? "Mode Tamu — swipe tidak disimpan"
                    : "Guest mode — swipes not saved"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {remaining > 0 && (
                <span className="text-xs text-muted-foreground font-medium">
                  {remaining} {isId ? "tersisa" : "left"}
                </span>
              )}
              {isFetching && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/50" />
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full gradient-primary transition-all duration-300 ease-out"
              style={{
                width:
                  queue.length > 0
                    ? `${(currentIdx / queue.length) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        {currentItem ? (
          <div className="relative w-full max-w-sm">
            {/* Peek card behind */}
            {queue[currentIdx + 1] && (
              <div className="absolute inset-2 rounded-3xl glass opacity-30 scale-[0.95]" />
            )}

            <SwipeCard
              item={currentItem}
              swipeDir={swipeDir}
              cardRef={cardRef}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              locale={locale}
              t={t}
            />
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-sm">
              {isId ? "Tidak ada film lagi" : "No more titles"}
            </p>
            <button
              onClick={handleRestart}
              className="px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium"
            >
              {isId ? "Mulai lagi" : "Start over"}
            </button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {currentItem && (
        <div className="sticky bottom-0 z-30 pb-6 pt-2 px-4">
          <div className="flex items-center justify-center gap-8">
            {/* Skip */}
            <button
              onClick={handleSkip}
              disabled={isAnimating}
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200",
                "bg-red-500/10 border-2 border-red-500/40 text-red-500",
                "hover:bg-red-500 hover:text-white hover:border-red-500 hover:scale-110",
                "active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                "shadow-lg shadow-red-500/10",
              )}
              aria-label={t("swipe_left")}
            >
              <X className="w-7 h-7" />
            </button>

            {/* Like */}
            <button
              onClick={handleLike}
              disabled={isAnimating}
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200",
                "bg-green-500/10 border-2 border-green-500/40 text-green-500",
                "hover:bg-green-500 hover:text-white hover:border-green-500 hover:scale-110",
                "active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                "shadow-lg shadow-green-500/10",
              )}
              aria-label={t("swipe_right")}
            >
              <Heart className="w-7 h-7" />
            </button>
          </div>

          {/* Guest nudge — muncul setiap 5 swipe */}
          {isGuest && totalSwiped > 0 && totalSwiped % 5 === 0 && (
            <div className="mt-4 text-center">
              <button
                onClick={() => openAuthModal("signin")}
                className="inline-flex items-center gap-1.5 text-xs text-primary font-medium"
              >
                <LogIn className="w-3.5 h-3.5" />
                {isId
                  ? "Login untuk simpan swipe ini"
                  : "Log in to save your picks"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
