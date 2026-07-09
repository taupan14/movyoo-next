"use client";

/**
 * components/contributor/article-form.tsx — FILE BARU
 * Form create/edit artikel, field mengikuti kolom tabel `articles`.
 * Dipakai di app/articles/manage/new dan app/articles/manage/[id].
 */

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ImagePlus,
  Save,
  Send,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { startLoader } from "@/components/page-loader";
import type { ArticleFormInput, ContributorArticle, TopicType } from "@/types/contributor";

const TOPIC_OPTIONS: { value: TopicType | ""; label: string }[] = [
  { value: "", label: "Tanpa topik spesifik" },
  { value: "genre", label: "Genre" },
  { value: "actor", label: "Aktor" },
  { value: "director", label: "Sutradara" },
  { value: "studio", label: "Studio" },
  { value: "platform", label: "Platform" },
  { value: "custom", label: "Lainnya" },
];

const TMDB_IMG = "https://image.tmdb.org/t/p/w780";
function coverPreviewUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG}${path}`;
}

interface ArticleFormProps {
  initialData?: ContributorArticle | null;
  articleId?: number; // ada = mode edit
}

export function ArticleForm({ initialData, articleId }: ArticleFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!articleId;

  const [form, setForm] = useState<ArticleFormInput>({
    title: initialData?.title ?? "",
    title_en: initialData?.title_en ?? "",
    excerpt: initialData?.excerpt ?? "",
    body: initialData?.body ?? "",
    cover_path: initialData?.cover_path ?? null,
    lang: (initialData?.lang as "id" | "en") ?? "id",
    topic_type: (initialData?.topic_type as TopicType) ?? "",
    topic_value: initialData?.topic_value ?? "",
    meta_title: initialData?.meta_title ?? "",
    meta_desc: initialData?.meta_desc ?? "",
    status: initialData?.status ?? "published",
  });

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flaggedWords, setFlaggedWords] = useState<string[]>([]);

  function update<K extends keyof ArticleFormInput>(key: K, value: ArticleFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/article-cover", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal upload cover");
        return;
      }
      update("cover_path", data.cover_path);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(status: "draft" | "published") {
    if (!form.title.trim() || !form.body.trim()) {
      setError("Judul dan isi artikel wajib diisi");
      return;
    }

    setSaving(status);
    setError(null);
    setFlaggedWords([]);

    const payload: ArticleFormInput = { ...form, status };

    try {
      const res = await fetch(
        isEdit ? `/api/contributor/articles/${articleId}` : "/api/contributor/articles",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan artikel");
        if (data.flagged) {
          setFlaggedWords(
            Array.from(new Set((data.flagged as { word: string }[]).map((f) => f.word))),
          );
        }
        return;
      }

      startLoader();
      router.push("/articles/manage");
    } finally {
      setSaving(null);
    }
  }

  const preview = coverPreviewUrl(form.cover_path);

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            {flaggedWords.length > 0 && (
              <p className="text-xs mt-1 opacity-80">
                Kata terdeteksi: {flaggedWords.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cover */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Cover Artikel
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative aspect-[16/9] max-w-md rounded-2xl overflow-hidden bg-white/5 border border-dashed border-white/15 flex items-center justify-center cursor-pointer group"
        >
          {preview ? (
            <img src={preview} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImagePlus className="w-6 h-6" />
              <span className="text-xs">Klik untuk upload cover</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {uploading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <span className="text-xs text-white font-medium">
                {preview ? "Ganti cover" : "Upload cover"}
              </span>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleCoverUpload}
        />
      </div>

      {/* Title */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Judul (ID) *
          </label>
          <input
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Judul artikel..."
            className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/60"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Judul (EN) — opsional
          </label>
          <input
            value={form.title_en}
            onChange={(e) => update("title_en", e.target.value)}
            placeholder="Article title..."
            className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/60"
          />
        </div>
      </div>

      {/* Excerpt */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Ringkasan Singkat
        </label>
        <textarea
          value={form.excerpt}
          onChange={(e) => update("excerpt", e.target.value)}
          placeholder="Ringkasan singkat yang tampil di kartu artikel..."
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm resize-none focus:outline-none focus:border-primary/60"
        />
      </div>

      {/* Body */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Isi Artikel *
        </label>
        <textarea
          value={form.body}
          onChange={(e) => update("body", e.target.value)}
          placeholder="Tulis isi artikel di sini... (mendukung Markdown)"
          rows={14}
          className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm resize-y font-mono leading-relaxed focus:outline-none focus:border-primary/60"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Format Markdown didukung (##, **bold**, - list, dll).
        </p>
      </div>

      {/* Topic + Lang */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Tipe Topik
          </label>
          <select
            value={form.topic_type}
            onChange={(e) => update("topic_type", e.target.value as TopicType | "")}
            className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/60"
          >
            {TOPIC_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Nilai Topik
          </label>
          <input
            value={form.topic_value}
            onChange={(e) => update("topic_value", e.target.value)}
            placeholder="mis. Action, Christopher Nolan..."
            disabled={!form.topic_type}
            className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/60 disabled:opacity-40"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Bahasa
          </label>
          <select
            value={form.lang}
            onChange={(e) => update("lang", e.target.value as "id" | "en")}
            className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/60"
          >
            <option value="id">Indonesia</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      {/* SEO */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          SEO (opsional)
        </h3>
        <input
          value={form.meta_title}
          onChange={(e) => update("meta_title", e.target.value)}
          placeholder="Meta title"
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary/60"
        />
        <textarea
          value={form.meta_desc}
          onChange={(e) => update("meta_desc", e.target.value)}
          placeholder="Meta description"
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm resize-none focus:outline-none focus:border-primary/60"
        />
      </div>

      {/* Guideline */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Artikel akan langsung tayang setelah dipublish. Pastikan tidak
          mengandung kata kasar, konten dewasa, promosi narkoba/minuman keras,
          atau perjudian — konten seperti ini akan otomatis ditolak sistem.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => handleSubmit("published")}
          disabled={saving !== null}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {saving === "published" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Publish Sekarang
        </button>
        <button
          onClick={() => handleSubmit("draft")}
          disabled={saving !== null}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {saving === "draft" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Simpan sebagai Draft
        </button>
        <button
          onClick={() => router.push("/articles/manage")}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
          Batal
        </button>
      </div>
    </div>
  );
}
