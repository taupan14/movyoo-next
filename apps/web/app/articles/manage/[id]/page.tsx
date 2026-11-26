"use client";

/**
 * app/articles/manage/[id]/page.tsx — FILE BARU
 */

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ArticleForm } from "@/components/contributor/article-form";
import type { ContributorArticle } from "@/types/contributor";

export default function EditArticlePage() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [article, setArticle] = useState<ContributorArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      openAuthModal("signin");
      router.replace("/articles");
    }
  }, [authLoading, user, router, openAuthModal]);

  useEffect(() => {
    if (!user || !params?.id) return;
    fetch(`/api/contributor/articles/${params.id}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.article) setArticle(data.article);
      })
      .finally(() => setLoading(false));
  }, [user, params?.id]);

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">
          Artikel tidak ditemukan atau bukan milikmu.
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-6 pb-24 max-w-3xl mx-auto px-4 lg:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gradient">Edit Artikel</h1>
        <p className="text-sm text-muted-foreground">{article.title}</p>
      </div>
      <ArticleForm initialData={article} articleId={article.id} />
    </main>
  );
}
