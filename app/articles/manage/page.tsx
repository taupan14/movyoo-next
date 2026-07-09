"use client";

/**
 * app/articles/manage/page.tsx — FILE BARU
 * List artikel milik kontributor yang login, dengan aksi edit/hapus.
 * Redirect ke /articles jika bukan kontributor.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Eye,
  Clock,
  FileEdit,
  BadgeCheck,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { startLoader } from "@/components/page-loader";
import type { ContributorArticle } from "@/types/contributor";

const TMDB_IMG = "https://image.tmdb.org/t/p/w300";
function coverUrl(path: string | null): string {
  if (!path) return "/placeholder-article.jpg";
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG}${path}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ManageArticlesPage() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [articles, setArticles] = useState<ContributorArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contributor/articles");
      const data = await res.json();
      if (res.status === 403) {
        setRole("user");
        setLoading(false);
        return;
      }
      setRole("contributor");
      setArticles(data.articles ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      openAuthModal("signin");
      router.replace("/articles");
      return;
    }
    if (user) fetchArticles();
  }, [authLoading, user, router, openAuthModal, fetchArticles]);

  async function handleDelete(id: number) {
    if (!confirm("Hapus artikel ini? Tindakan tidak bisa dibatalkan.")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/contributor/articles/${id}`, { method: "DELETE" });
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <BookOpen className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">
          Halaman ini khusus untuk kontributor Movyoo.
        </p>
        <Link
          href="/articles"
          onClick={() => startLoader()}
          className="px-4 py-2 rounded-xl gradient-primary text-white text-sm font-medium"
        >
          Kembali ke Artikel
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-6 pb-24 max-w-5xl mx-auto px-4 lg:px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gradient">Kelola Artikel</h1>
          <p className="text-sm text-muted-foreground">
            Artikel yang kamu tulis sebagai kontributor
          </p>
        </div>
        <button
          onClick={() => {
            startLoader();
            router.push("/articles/manage/new");
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Artikel Baru
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <FileEdit className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            Kamu belum menulis artikel apa pun
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <div
              key={a.id}
              className="flex gap-3 p-3 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <img
                src={coverUrl(a.cover_path)}
                alt={a.title}
                className="w-24 h-16 sm:w-32 sm:h-20 rounded-xl object-cover shrink-0 bg-white/5"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {a.title}
                    </h3>
                    <span
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0",
                        a.status === "published"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400",
                      )}
                    >
                      <BadgeCheck className="w-3 h-3" />
                      {a.status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                  {a.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {a.excerpt}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatDate(a.published_at ?? a.created_at)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Eye className="w-3 h-3" />
                    {a.view_count.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0 justify-center">
                <button
                  onClick={() => {
                    startLoader();
                    router.push(`/articles/manage/${a.id}`);
                  }}
                  className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  title="Hapus"
                >
                  {deletingId === a.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
