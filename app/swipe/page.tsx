"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/hooks/use-locale";
import { useAuth } from "@/hooks/use-auth";
import { getPosterUrl } from "@/lib/tmdb";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Chrome,
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
  Trophy,
  Dna,
  Flame,
  CheckCircle2,
  ChevronRight,
  Play,
} from "lucide-react";

import NativeBannerAd from "@/components/ads/NativeBannerAd";

// ─── Types ────────────────────────────────────────────────────────────────────

type SwipeAction = "like" | "dislike";
type MediaType = "movie" | "tv";
type BucketChallenge =
  | "all"
  | "personal"
  | "trending"
  | "hidden_gem"
  | "wildcard";

interface SwipeFeedItem {
  pool_id: number;
  media_type: MediaType;
  movie_id?: number;
  series_id?: number;
  tmdb_id?: number;
  bucket: string;
  score: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_year: string | null;
  overview: string | null;
  overview_en: string | null;
  genres: string[];
  cast: string[];
}

interface FeedResponse {
  items: SwipeFeedItem[];
  source: "pool" | "fallback";
  poolLeft: number | null;
  isGuest: boolean;
}

// ─── Daily Quest types ─────────────────────────────────────────────────────────

interface Quest {
  id: string;
  label: string;
  labelId: string;
  target: number;
  progress: number;
  done: boolean;
  xp: number;
  /** null = count any liked, string = match genres[] */
  matchGenre: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_GOAL = 20; // swipe per sesi (untuk logged-in user)
const SWIPE_THRESHOLD = 90;
const PREFETCH_AT = 3;

// ─── Bucket config ─────────────────────────────────────────────────────────────

const BUCKET_CONFIG: Record<string, { label: string; className: string }> = {
  personal: { label: "For You", className: "bg-violet-500/80" },
  adjacent: { label: "Discover", className: "bg-blue-500/80" },
  wildcard: { label: "Wildcard", className: "bg-amber-500/80" },
  trending: { label: "Trending", className: "bg-rose-500/80" },
  hidden_gem: { label: "Hidden Gem", className: "bg-emerald-500/80" },
};

const CHALLENGE_OPTIONS: {
  id: BucketChallenge;
  emoji: string;
  label: string;
  labelId: string;
  desc: string;
  descId: string;
}[] = [
  {
    id: "all",
    emoji: "🎬",
    label: "Movie Night",
    labelId: "Movie Night",
    desc: "Mixed picks, all genres",
    descId: "Semua genre, campuran pilihan",
  },
  {
    id: "trending",
    emoji: "🔥",
    label: "Hot Right Now",
    labelId: "Lagi Trending",
    desc: "Most popular titles",
    descId: "Judul paling populer saat ini",
  },
  {
    id: "personal",
    emoji: "✨",
    label: "Just For You",
    labelId: "Khusus Untukmu",
    desc: "Tailored to your taste",
    descId: "Disesuaikan selera kamu",
  },
  {
    id: "hidden_gem",
    emoji: "💎",
    label: "Hidden Gems",
    labelId: "Film Tersembunyi",
    desc: "Under-the-radar masterpieces",
    descId: "Mahakarya yang belum banyak dikenal",
  },
  {
    id: "wildcard",
    emoji: "🎲",
    label: "Wildcard",
    labelId: "Surprise Me",
    desc: "Unexpected discoveries",
    descId: "Penemuan tak terduga",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Hitung match score (0–100) dari item berdasarkan bucket + vote */
function calcMatchScore(item: SwipeFeedItem): number {
  const bucketBonus: Record<string, number> = {
    personal: 20,
    adjacent: 10,
    hidden_gem: 15,
    trending: 5,
    wildcard: 0,
  };
  const bonus = bucketBonus[item.bucket] ?? 0;
  const voteBase = Math.round((item.vote_average / 10) * 70);
  return Math.min(100, voteBase + bonus);
}

/** Build daily quests — 3 quest tiap sesi */
function buildQuests(locale: string): Quest[] {
  const isId = locale === "id";
  return [
    {
      id: "like5",
      label: "Like 5 titles",
      labelId: "Suka 5 judul",
      target: 5,
      progress: 0,
      done: false,
      xp: 20,
      matchGenre: null,
    },
    {
      id: "scifi3",
      label: "Discover 3 Sci-Fi",
      labelId: "Temukan 3 Sci-Fi",
      target: 3,
      progress: 0,
      done: false,
      xp: 30,
      matchGenre: "Science Fiction",
    },
    {
      id: "action3",
      label: "Like 3 Action",
      labelId: "Suka 3 Action",
      target: 3,
      progress: 0,
      done: false,
      xp: 30,
      matchGenre: "Action",
    },
  ];
}

/** Analisis genre dari liked items → top genres + persona */
function analyzeMovieDNA(liked: SwipeFeedItem[]): {
  topGenres: { genre: string; pct: number }[];
  persona: { emoji: string; label: string; labelId: string } | null;
} {
  if (liked.length === 0) return { topGenres: [], persona: null };

  const genreCount: Record<string, number> = {};
  for (const item of liked) {
    for (const g of item.genres) {
      genreCount[g] = (genreCount[g] ?? 0) + 1;
    }
  }

  const total = Object.values(genreCount).reduce((a, b) => a + b, 0) || 1;
  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, count]) => ({
      genre,
      pct: Math.round((count / total) * 100),
    }));

  // Persona mapping
  const topGenre = topGenres[0]?.genre ?? "";
  const personaMap: Record<
    string,
    { emoji: string; label: string; labelId: string }
  > = {
    "Science Fiction": {
      emoji: "🚀",
      label: "Space Explorer",
      labelId: "Penjelajah Luar Angkasa",
    },
    Action: { emoji: "💥", label: "Thrill Seeker", labelId: "Pencari Sensasi" },
    Thriller: {
      emoji: "🕵️",
      label: "Mind Hacker",
      labelId: "Pemecah Teka-teki",
    },
    Drama: { emoji: "🎭", label: "Story Seeker", labelId: "Pencinta Cerita" },
    Comedy: { emoji: "😂", label: "Laugh Chaser", labelId: "Pemburu Tawa" },
    Horror: { emoji: "🎃", label: "Fear Junkie", labelId: "Pecandu Horor" },
    Animation: {
      emoji: "✨",
      label: "Dream Watcher",
      labelId: "Pemimpi Sejati",
    },
    Romance: {
      emoji: "💕",
      label: "Heart Collector",
      labelId: "Kolektor Hati",
    },
    Documentary: {
      emoji: "🔍",
      label: "Truth Seeker",
      labelId: "Pencari Kebenaran",
    },
    Fantasy: {
      emoji: "🧙",
      label: "World Builder",
      labelId: "Pembangun Dunia",
    },
  };

  const persona = personaMap[topGenre] ?? null;
  return { topGenres, persona };
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

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

// ─── Challenge Picker ─────────────────────────────────────────────────────────
// Ditampilkan sekali sebelum sesi dimulai untuk user login

function ChallengePicker({
  locale,
  onPick,
}: {
  locale: string;
  onPick: (challenge: BucketChallenge) => void;
}) {
  const isId = locale === "id";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 gap-6">
      <div className="text-center">
        <div className="text-3xl mb-3">🎬</div>
        <h1 className="text-xl font-bold text-foreground mb-1">
          {isId ? "Pilih Mode Sesi" : "Choose Your Session"}
        </h1>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          {isId
            ? `Swipe ${SESSION_GOAL} judul dan temukan tontonan terbaikmu`
            : `Swipe ${SESSION_GOAL} titles and find your perfect watch`}
        </p>
      </div>

      <div className="w-full max-w-sm space-y-2.5">
        {CHALLENGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onPick(opt.id)}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl glass hover:bg-white/8 active:scale-[0.98] transition-all text-left group"
          >
            <span className="text-2xl">{opt.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                {isId ? opt.labelId : opt.label}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {isId ? opt.descId : opt.desc}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
          </button>
        ))}
      </div>
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
  t: (key: TranslationKey) => string;
}) {
  // console.log("<<< Swipe >>>", item);
  const bucket = BUCKET_CONFIG[item.bucket] ?? BUCKET_CONFIG["trending"];
  const mediaLabel =
    item.media_type === "tv"
      ? locale === "id"
        ? "Serial"
        : "Series"
      : locale === "id"
        ? "Film"
        : "Movie";

  const overviewText = item.overview || item.overview_en || "";
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

          {overviewText && (
            <p className="text-xs text-white/65 line-clamp-3 leading-relaxed">
              {overviewText}
            </p>
          )}

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

// ─── Match Score Toast ────────────────────────────────────────────────────────

function MatchScoreToast({
  score,
  visible,
}: {
  score: number;
  visible: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
        "pointer-events-none transition-all duration-300",
        visible ? "opacity-100 scale-100" : "opacity-0 scale-75",
      )}
    >
      <div className="flex flex-col items-center gap-1 bg-black/80 backdrop-blur-sm border border-green-500/40 rounded-2xl px-6 py-4 shadow-xl shadow-green-500/20">
        <span className="text-3xl font-black text-green-400">{score}%</span>
        <span className="text-xs text-green-300/80 font-medium">Match</span>
      </div>
    </div>
  );
}

// ─── Quest Bar ────────────────────────────────────────────────────────────────

function QuestBar({ quests, locale }: { quests: Quest[]; locale: string }) {
  const isId = locale === "id";
  const doneCount = quests.filter((q) => q.done).length;
  const totalXP = quests
    .filter((q) => q.done)
    .reduce((sum, q) => sum + q.xp, 0);

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
      {quests.map((q) => (
        <div
          key={q.id}
          className={cn(
            "flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors",
            q.done
              ? "bg-green-500/15 border-green-500/30 text-green-400"
              : "bg-white/5 border-white/10 text-muted-foreground",
          )}
        >
          {q.done ? (
            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
          ) : (
            <Trophy className="w-3 h-3 flex-shrink-0 opacity-50" />
          )}
          <span className="truncate max-w-[80px]">
            {isId ? q.labelId : q.label}
          </span>
          {!q.done && (
            <span className="text-muted-foreground/50">
              {q.progress}/{q.target}
            </span>
          )}
          {q.done && <span className="text-green-400/70">+{q.xp}xp</span>}
        </div>
      ))}
      {totalXP > 0 && (
        <div className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
          {totalXP} XP
        </div>
      )}
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ResultsScreen({
  liked,
  quests,
  onRestart,
  locale,
  isGuest,
  onSignIn,
}: {
  liked: SwipeFeedItem[];
  quests: Quest[];
  onRestart: () => void;
  locale: string;
  isGuest: boolean;
  onSignIn: () => void;
}) {
  const isId = locale === "id";
  const topPick = liked[0];
  const { topGenres, persona } = analyzeMovieDNA(liked);
  const totalXP = quests.filter((q) => q.done).reduce((s, q) => s + q.xp, 0);
  const doneQuests = quests.filter((q) => q.done);

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-10 gap-6 overflow-y-auto">
      {/* Header */}
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

      {/* Movie DNA — hanya kalau ada liked items */}
      {!isGuest && liked.length >= 3 && (
        <div className="w-full max-w-sm glass rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Dna className="w-4 h-4 text-primary" />
            <p className="text-sm font-bold text-foreground">
              {isId ? "Movie DNA kamu" : "Your Movie DNA"}
            </p>
            {persona && (
              <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/15 text-primary">
                {persona.emoji} {isId ? persona.labelId : persona.label}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {topGenres.map(({ genre, pct }) => (
              <div key={genre} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{genre}</span>
                  <span className="text-foreground font-medium">{pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full gradient-primary transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quest results */}
      {!isGuest && doneQuests.length > 0 && (
        <div className="w-full max-w-sm glass rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-bold text-foreground">
                {isId ? "Quest Selesai" : "Quests Completed"}
              </p>
            </div>
            {totalXP > 0 && (
              <span className="text-sm font-black text-amber-400">
                +{totalXP} XP
              </span>
            )}
          </div>
          {doneQuests.map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span>{isId ? q.labelId : q.label}</span>
              <span className="ml-auto text-green-400 font-medium">
                +{q.xp} XP
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Liked list */}
      {liked.length > 0 ? (
        <div className="w-full max-w-sm space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {isId ? "Yang kamu suka" : "Your picks"}
          </p>
          {liked.map((item) => {
            const href =
              item.media_type === "movie"
                ? `/movie/${item.tmdb_id}`
                : `/tv-series/${item.tmdb_id}`;
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

      <div className="flex items-center gap-3 pb-4">
        <Link
          href={`/`}
          className="flex items-center gap-2 px-5 py-3 rounded-xl glass text-foreground font-medium text-sm hover:bg-white/10 transition-colors"
        >
          <Chrome className="w-4 h-4" />
          {isId ? "Kembali ke Beranda" : "Back to Home"}
        </Link>

        <button
          onClick={onRestart}
          className="flex items-center gap-2 px-5 py-3 rounded-xl gradient-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <RotateCcw className="w-4 h-4" />
          {isId ? "Main Lagi" : "Play Again"}
        </button>
        {/* {topPick && (
          <Link
            href={
              topPick.media_type === "movie"
                ? `/movie/${topPick.movie_id}`
                : `/tv/${topPick.series_id}`
            }
            className="flex items-center gap-2 px-5 py-3 rounded-xl gradient-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            <Play className="w-4 h-4" />
            {isId ? "Tonton ini!" : "Watch this!"}
          </Link>
        )} */}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SwipePage() {
  const { t, locale } = useI18n();
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const isId = locale === "id";

  // ── Auth / session gate state ──────────────────────────────────────────
  const [guestConfirmed, setGuestConfirmed] = useState(false);
  const [challenge, setChallenge] = useState<BucketChallenge | null>(null); // null = belum pilih (login only)

  // ── Feed state ─────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<SwipeFeedItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [liked, setLiked] = useState<SwipeFeedItem[]>([]);
  const [totalSwiped, setTotalSwiped] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // ── Quest state ────────────────────────────────────────────────────────
  const [quests, setQuests] = useState<Quest[]>([]);

  // ── Match score toast ──────────────────────────────────────────────────
  const [matchScore, setMatchScore] = useState(0);
  const [showMatchToast, setShowMatchToast] = useState(false);

  // ── Drag state ─────────────────────────────────────────────────────────
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const isGuest = !authLoading && !user;
  // feedReady: sudah login + pilih challenge, atau guest confirmed
  const feedReady =
    !authLoading && ((!!user && challenge !== null) || guestConfirmed);
  const currentItem = queue[currentIdx];
  const remaining = queue.length - currentIdx;

  // Session progress (hanya logged-in)
  const sessionProgress = Math.min(totalSwiped, SESSION_GOAL);
  const sessionDone = !isGuest && totalSwiped >= SESSION_GOAL;

  // ── Init quests ketika sesi dimulai (user login saja) ─────────────────
  useEffect(() => {
    if (feedReady && !isGuest) {
      setQuests(buildQuests(locale));
    }
  }, [feedReady, isGuest, locale]);

  // ── Fetch feed ─────────────────────────────────────────────────────────
  const fetchFeed = useCallback(
    async (append = false) => {
      if (isFetching) return;
      setIsFetching(true);
      if (!append) setLoading(true);
      setError(null);

      try {
        // Tambahkan filter bucket jika challenge bukan 'all' dan user login
        const params = new URLSearchParams({ limit: "10" });
        if (!isGuest && challenge && challenge !== "all") {
          params.set("bucket", challenge);
        }
        const res = await fetch(`/api/swipe-pick?${params.toString()}`);
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
    [isFetching, isId, isGuest, challenge],
  );

  // Fetch setelah feed siap
  useEffect(() => {
    if (!feedReady) return;
    fetchFeed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedReady]);

  // Prefetch saat sisa < threshold (dan sesi belum selesai)
  useEffect(() => {
    if (!feedReady || loading || isFetching || showResults || sessionDone)
      return;
    if (remaining <= PREFETCH_AT) fetchFeed(true);
  }, [
    remaining,
    feedReady,
    loading,
    isFetching,
    showResults,
    sessionDone,
    fetchFeed,
  ]);

  // Session done → show results
  useEffect(() => {
    if (sessionDone && !showResults) setShowResults(true);
  }, [sessionDone, showResults]);

  // ── Update quests setelah like ─────────────────────────────────────────
  const updateQuests = useCallback(
    (item: SwipeFeedItem, action: SwipeAction) => {
      if (isGuest || action !== "like") return;
      setQuests((prev) =>
        prev.map((q) => {
          if (q.done) return q;
          // Quest tanpa genre filter: hitung semua like
          const matches =
            q.matchGenre === null ||
            item.genres.some(
              (g) => g.toLowerCase() === q.matchGenre!.toLowerCase(),
            );
          if (!matches) return q;
          const newProgress = q.progress + 1;
          return {
            ...q,
            progress: newProgress,
            done: newProgress >= q.target,
          };
        }),
      );
    },
    [isGuest],
  );

  // ── Process swipe ──────────────────────────────────────────────────────
  const processSwipe = useCallback(
    async (direction: "left" | "right") => {
      if (isAnimating || !currentItem) return;
      setIsAnimating(true);
      setSwipeDir(direction);

      const item = currentItem;
      const action: SwipeAction = direction === "right" ? "like" : "dislike";

      // Instant match score (swipe kanan)
      if (direction === "right") {
        const score = calcMatchScore(item);
        setMatchScore(score);
        setShowMatchToast(true);
        setTimeout(() => setShowMatchToast(false), 1400);
      }

      setTimeout(() => {
        if (direction === "right") {
          setLiked((prev) => [...prev, item]);
          updateQuests(item, "like");
        }

        const nextTotal = totalSwiped + 1;
        setTotalSwiped(nextTotal);

        // Untuk guest: endless (queue habis baru results)
        // Untuk login: sesi SESSION_GOAL swipe
        const shouldEnd = isGuest
          ? currentIdx + 1 >= queue.length
          : nextTotal >= SESSION_GOAL;

        if (shouldEnd) {
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
    [
      currentItem,
      isAnimating,
      currentIdx,
      queue.length,
      user,
      isGuest,
      totalSwiped,
      updateQuests,
    ],
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
    // Reset challenge picker untuk user login, langsung restart untuk guest
    if (!isGuest) {
      setChallenge(null);
      setQuests([]);
    } else {
      fetchFeed(false);
    }
  };

  // ── Touch handlers ─────────────────────────────────────────────────────
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

  // ── Mouse handlers ─────────────────────────────────────────────────────
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

  // ── Render: auth loading ───────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render: auth gate ──────────────────────────────────────────────────
  if (!user && !guestConfirmed) {
    return (
      <AuthGate
        locale={locale}
        onSignIn={() => openAuthModal("signin")}
        onContinueAsGuest={() => setGuestConfirmed(true)}
      />
    );
  }

  // ── Render: challenge picker (user login, belum pilih) ─────────────────
  if (user && !isGuest && challenge === null) {
    return <ChallengePicker locale={locale} onPick={(c) => setChallenge(c)} />;
  }

  // ── Render: loading feed ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
      </div>
    );
  }

  // ── Render: error ──────────────────────────────────────────────────────
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

  // ── Render: results ────────────────────────────────────────────────────
  if (showResults) {
    return (
      <ResultsScreen
        liked={liked}
        quests={quests}
        onRestart={handleRestart}
        locale={locale}
        isGuest={isGuest}
        onSignIn={() => openAuthModal("signin")}
      />
    );
  }

  // ── Render: main swipe UI ──────────────────────────────────────────────
  const challengeInfo = CHALLENGE_OPTIONS.find((c) => c.id === challenge);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-30 glass-strong">
        <div className="px-4 lg:px-6 py-3 space-y-2">
          {/* Row 1: nav + title + counter */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center justify-center w-9 h-9 rounded-xl glass hover:bg-white/10 transition-colors"
              aria-label="Home"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-foreground">
                  {t("nav_swipe")}
                </h1>
                {challengeInfo && (
                  <span className="text-xs text-muted-foreground">
                    · {challengeInfo.emoji}{" "}
                    {isId ? challengeInfo.labelId : challengeInfo.label}
                  </span>
                )}
              </div>
              {isGuest && (
                <p className="text-[10px] text-muted-foreground/70">
                  {isId
                    ? "Mode Tamu — swipe tidak disimpan"
                    : "Guest mode — swipes not saved"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Session counter untuk logged-in user */}
              {!isGuest ? (
                <span className="text-xs font-bold text-foreground">
                  <span className="text-primary">{sessionProgress}</span>
                  <span className="text-muted-foreground/50">
                    /{SESSION_GOAL}
                  </span>
                </span>
              ) : (
                remaining > 0 && (
                  <span className="text-xs text-muted-foreground font-medium">
                    {remaining} {isId ? "tersisa" : "left"}
                  </span>
                )
              )}
              {isFetching && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/50" />
              )}
            </div>
          </div>

          {/* Row 2: progress bar */}
          {!isGuest ? (
            /* Session progress bar */
            <div className="space-y-0.5">
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full gradient-primary transition-all duration-300 ease-out"
                  style={{
                    width: `${(sessionProgress / SESSION_GOAL) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            /* Guest: queue progress */
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
          )}

          {/* Row 3: Quest bar (login only) */}
          {!isGuest && quests.length > 0 && (
            <QuestBar quests={quests} locale={locale} />
          )}
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

            {/* Match score toast — overlay di atas card */}
            <MatchScoreToast score={matchScore} visible={showMatchToast} />
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

      <NativeBannerAd className="px-4" />
    </div>
  );
}
