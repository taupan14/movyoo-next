"use client";

/**
 * components/articles/review-section.tsx — SPLIT
 *
 * Export:
 *   <ReviewProvider>   — wrapper context, taruh di article-detail-client
 *   <ReviewForm>       — form + spice meter → sidebar
 *   <ReviewList>       — list ulasan → main column (bawah daftar film)
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/use-auth";
import { SpiceMeterInput, SPICE_CONFIG } from "./spice-meter";
import { cn } from "@/lib/utils";
import {
  Send,
  Trash2,
  Loader2,
  MessageSquare,
  AtSign,
  ChevronDown,
} from "lucide-react";
import type { ArticleReview } from "@/lib/article-reviews-db";
import type { ArticleDetail } from "@/lib/articles-db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

const POSTER = "https://image.tmdb.org/t/p/w92";

// ─── Shared Context ───────────────────────────────────────────────────────────

interface ReviewCtx {
  reviews: ArticleReview[];
  userReview: ArticleReview | null;
  total: number;
  loading: boolean;
  submitting: boolean;
  spice: number;
  comment: string;
  taggedIds: number[];
  setSpice: (v: number) => void;
  setComment: (v: string) => void;
  setTaggedIds: (fn: (prev: number[]) => number[]) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleDelete: () => Promise<void>;
  article: ArticleDetail;
  mentionQuery: string | null;
  setMentionQuery: (v: string | null) => void;
  handleMentionSelect: (id: number, title: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  handleCommentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const ReviewContext = createContext<ReviewCtx | null>(null);

function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReview must be inside ReviewProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ProviderProps {
  article: ArticleDetail;
  onRatingUpdate?: (avgSpice: number, reviewCount: number) => void;
  children: ReactNode;
}

export function ReviewProvider({
  article,
  onRatingUpdate,
  children,
}: ProviderProps) {
  const { user, openAuthModal } = useAuth();

  const [reviews, setReviews] = useState<ArticleReview[]>([]);
  const [userReview, setUserReview] = useState<ArticleReview | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [spice, setSpice] = useState(3);
  const [comment, setComment] = useState("");
  const [taggedIds, setTaggedIds] = useState<number[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/articles/${article.slug}/reviews`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setReviews(json.reviews ?? []);
      setUserReview(json.userReview ?? null);
      setTotal(json.total ?? 0);

      if (json.userReview) {
        setSpice(json.userReview.spice);
        setComment(json.userReview.comment ?? "");
        setTaggedIds(json.userReview.tagged_movie_ids ?? []);
      }
    } catch (err) {
      console.error("[ReviewProvider] fetchReviews:", err);
    } finally {
      setLoading(false);
    }
  }, [article.slug]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  function handleCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setComment(val);
    const cursor = e.target.selectionStart;
    const match = val.slice(0, cursor).match(/@([^@\s]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function handleMentionSelect(id: number, title: string) {
    const cursor = textareaRef.current?.selectionStart ?? comment.length;
    const upTo = comment.slice(0, cursor);
    const match = upTo.match(/@([^@\s]*)$/);
    if (!match) return;
    setComment(
      `${upTo.slice(0, match.index)}@${title} ${comment.slice(cursor)}`,
    );
    setMentionQuery(null);
    if (!taggedIds.includes(id)) {
      setTaggedIds((prev) => [...prev, id]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      openAuthModal("signin");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/articles/${article.slug}/reviews`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spice, comment, tagged_movie_ids: taggedIds }),
      });
      const json = await res.json();
      if (res.ok) {
        onRatingUpdate?.(json.avgSpice, json.reviewCount);
        await new Promise((r) => setTimeout(r, 300));
        await fetchReviews();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    await fetch(`/api/articles/${article.slug}/reviews`, {
      method: "DELETE",
      credentials: "include",
    });
    setUserReview(null);
    setComment("");
    setTaggedIds([]);
    setSpice(3);
    await fetchReviews();
  }

  return (
    <ReviewContext.Provider
      value={{
        reviews,
        userReview,
        total,
        loading,
        submitting,
        spice,
        comment,
        taggedIds,
        setSpice,
        setComment,
        setTaggedIds,
        handleSubmit,
        handleDelete,
        article,
        mentionQuery,
        setMentionQuery,
        handleMentionSelect,
        textareaRef,
        handleCommentChange,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

// ─── @Mention Picker ─────────────────────────────────────────────────────────

import type { ArticleMediaItem } from "@/lib/articles-db";

function MentionPicker({
  items,
  query,
  onSelect,
}: {
  items: ArticleMediaItem[];
  query: string;
  onSelect: (id: number, title: string) => void;
}) {
  const filtered = items.filter((it) =>
    it.media.title.toLowerCase().includes(query.toLowerCase()),
  );
  if (!filtered.length) return null;

  return (
    <div className="absolute bottom-full mb-1 left-0 w-64 rounded-xl bg-popover border border-border shadow-xl z-50 overflow-hidden animate-fade-in">
      {filtered.slice(0, 6).map((it, i) => (
        <button
          key={`${it.media_type}-${it.id}`}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(it.id, it.media.title);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
        >
          <span className="text-xs text-muted-foreground shrink-0">
            #{i + 1}
          </span>
          {it.media.poster_path && (
            <img
              src={`${POSTER}${it.media.poster_path}`}
              alt=""
              className="w-6 h-9 rounded object-cover shrink-0"
            />
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-foreground line-clamp-1 leading-snug">
              {it.media.title}
            </span>
            {it.media_type === "tv" && (
              <span className="text-[10px] text-primary">TV Series</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── ReviewForm — sidebar ─────────────────────────────────────────────────────

export function ReviewForm() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const {
    userReview,
    submitting,
    spice,
    comment,
    taggedIds,
    setSpice,
    setTaggedIds,
    handleSubmit,
    article,
    mentionQuery,
    setMentionQuery,
    handleMentionSelect,
    textareaRef,
    handleCommentChange,
  } = useReview();

  if (authLoading) return null;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-4"
    >
      {userReview && (
        <p className="text-xs text-primary font-medium">✏️ Edit ulasan kamu</p>
      )}

      <SpiceMeterInput value={spice} onChange={setSpice} />

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={comment}
          onChange={handleCommentChange}
          onBlur={() => setTimeout(() => setMentionQuery(null), 200)}
          placeholder={
            (article.items?.length ?? article.movies.length) > 0
              ? "Tulis pendapatmu… ketik @ untuk tag film"
              : "Tulis pendapatmu tentang artikel ini…"
          }
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none transition-colors"
        />
        {mentionQuery !== null && (article.items?.length ?? 0) > 0 && (
          <MentionPicker
            items={article.items ?? []}
            query={mentionQuery}
            onSelect={handleMentionSelect}
          />
        )}
      </div>

      {taggedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {taggedIds.map((id) => {
            const it = article.items?.find((x) => x.id === id);
            if (!it) return null;
            return (
              <span
                key={id}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] border border-primary/20"
              >
                <AtSign className="w-2.5 h-2.5" />
                {it.media.title}
                <button
                  type="button"
                  onClick={() => setTaggedIds((p) => p.filter((x) => x !== id))}
                  className="ml-0.5 hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {user ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Sebagai{" "}
            <span className="text-foreground font-medium">
              {user.profile?.display_name ?? user.email}
            </span>
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {userReview ? "Perbarui" : "Kirim"} ulasan
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => openAuthModal("signin")}
          className="w-full py-2.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        >
          Login untuk menulis ulasan
        </button>
      )}
    </form>
  );
}

// ─── ReviewCard ───────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  items,
  isOwn,
  onDelete,
}: {
  review: ArticleReview;
  items: ArticleMediaItem[];
  isOwn: boolean;
  onDelete: () => void;
}) {
  const cfg = SPICE_CONFIG[review.spice - 1];
  const initial = (review.profile?.display_name ?? "U")[0].toUpperCase();

  function renderComment(text: string) {
    const titles = items.map((it) => it.media.title);
    return text.split(/(@[^\s@]+(?:\s[^\s@]+)*)/g).map((part, i) => {
      const hit = titles.find(
        (t) => part.toLowerCase() === `@${t.toLowerCase()}`,
      );
      if (hit) {
        return (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[11px] font-medium"
          >
            <AtSign className="w-2.5 h-2.5" />
            {hit}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div className="flex gap-3 p-4 rounded-xl bg-card border border-border">
      <div className="shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
        {review.profile?.avatar_url ? (
          <img
            src={review.profile.avatar_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          initial
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-foreground truncate">
              {review.profile?.display_name ?? "Pengguna"}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                cfg.bg,
                cfg.text,
              )}
            >
              {cfg.emoji} {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground">
              {timeAgo(review.created_at)}
            </span>
            {isOwn && (
              <button
                onClick={onDelete}
                className="text-muted-foreground hover:text-red-400 transition-colors"
                title="Hapus review"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {review.comment && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {renderComment(review.comment)}
          </p>
        )}
        {(review.tagged_movie_ids?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {review.tagged_movie_ids.map((mid) => {
              const it = items.find((x) => x.id === mid);
              if (!it) return null;
              return (
                <span
                  key={mid}
                  className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-muted-foreground border border-border"
                >
                  <AtSign className="w-2.5 h-2.5" />
                  {it.media.title}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ReviewList — main column ─────────────────────────────────────────────────

export function ReviewList() {
  const { user } = useAuth();
  const { reviews, total, loading, userReview, handleDelete, article } =
    useReview();
  const [showAll, setShowAll] = useState(false);
  const visibleReviews = showAll ? reviews : reviews.slice(0, 4);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 mt-8">
        <div className="h-5 w-32 rounded bg-white/5 animate-pulse" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-card border border-border animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (reviews.length === 0) return null;

  return (
    <section className="mt-8 flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        Ulasan Komunitas
        <span className="text-xs font-normal text-muted-foreground">
          ({total})
        </span>
      </h2>

      <div className="flex flex-col gap-2">
        {visibleReviews.map((r) => (
          <ReviewCard
            key={r.id}
            review={r}
            items={article.items ?? []}
            isOwn={r.user_id === user?.id}
            onDelete={handleDelete}
          />
        ))}
        {reviews.length > 4 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform",
                showAll && "rotate-180",
              )}
            />
            {showAll
              ? "Sembunyikan"
              : `Lihat ${reviews.length - 4} ulasan lainnya`}
          </button>
        )}
      </div>
    </section>
  );
}
