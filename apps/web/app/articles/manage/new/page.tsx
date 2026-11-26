"use client";

/**
 * app/articles/manage/new/page.tsx — FILE BARU
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ArticleForm } from "@/components/contributor/article-form";

export default function NewArticlePage() {
  const { user, loading, openAuthModal } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      openAuthModal("signin");
      router.replace("/articles");
    }
  }, [loading, user, router, openAuthModal]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-6 pb-24 max-w-5xl mx-auto px-4 lg:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gradient">Tulis Artikel Baru</h1>
        <p className="text-sm text-muted-foreground">
          Isi form di bawah, lalu publish atau simpan sebagai draft
        </p>
      </div>
      <ArticleForm />
    </main>
  );
}
