/**
 * app/articles/[slug]/page.tsx — UPDATED
 *
 * Fix:
 * - OG image lengkap (width/height/alt/type) → gambar muncul saat di-share
 * - Twitter Card metadata ditambahkan
 * - JSON-LD dilengkapi dengan image, url, author
 * - Double fetch article dihilangkan (sebelumnya fetch 2x)
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleDetailClient } from "@/components/articles/article-detail-client";
import { fetchArticleBySlug, fetchRelatedArticles } from "@/lib/articles-db";

interface Props {
  params: { slug: string };
  searchParams: { lang?: string };
}

const SITE_URL = "https://movyoo.id";
const TMDB_W1280 = "https://image.tmdb.org/t/p/w1280";
const TMDB_W780 = "https://image.tmdb.org/t/p/w780";

function resolveImageUrl(
  path: string | null,
  size: "w1280" | "w780" = "w1280",
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return size === "w1280" ? `${TMDB_W1280}${path}` : `${TMDB_W780}${path}`;
}

// ── Dynamic metadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const lang = searchParams.lang ?? "id";
  const article = await fetchArticleBySlug(params.slug, lang);

  if (!article) {
    return {
      title: "Artikel Tidak Ditemukan — Movyoo",
      robots: { index: false },
    };
  }

  const title = article.meta_title || `${article.title} — Movyoo`;
  const description =
    article.meta_desc ||
    article.excerpt ||
    "Baca artikel film pilihan di Movyoo.";
  const canonical = `${SITE_URL}/articles/${article.slug}`;

  // Gambar OG — w1280 untuk Facebook/WhatsApp, w780 untuk Twitter
  const ogImageUrl = resolveImageUrl(article.cover_path, "w1280");
  const twitterImageUrl = resolveImageUrl(article.cover_path, "w780");

  return {
    title,
    description,

    alternates: {
      canonical,
    },

    // ── Open Graph — dipakai Facebook, WhatsApp, Telegram, LinkedIn ──────────
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Movyoo",
      type: "article",
      publishedTime: article.published_at ?? undefined,
      locale: lang === "id" ? "id_ID" : "en_US",
      images: ogImageUrl
        ? [
            {
              url: ogImageUrl,
              width: 1280,
              height: 720,
              alt: title,
              type: "image/jpeg",
            },
          ]
        : undefined,
    },

    // ── Twitter Card — dipakai Twitter/X ─────────────────────────────────────
    twitter: {
      card: twitterImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: twitterImageUrl ? [twitterImageUrl] : undefined,
      site: "@movyoo_id", // ganti dengan handle Twitter Movyoo
    },

    // ── Robots ────────────────────────────────────────────────────────────────
    robots: {
      index: true,
      follow: true,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ArticleDetailPage({
  params,
  searchParams,
}: Props) {
  const lang = searchParams.lang ?? "id";

  // Fix: sebelumnya fetch artikel 2x — sekarang 1x lalu ambil related
  const article = await fetchArticleBySlug(params.slug, lang);
  if (!article) notFound();

  const related = await fetchRelatedArticles(
    article.id,
    article.topic_type,
    article.topic_value,
    lang,
    4,
  );

  const canonical = `${SITE_URL}/articles/${article.slug}`;
  const ogImageUrl = resolveImageUrl(article.cover_path, "w1280");

  // ── JSON-LD Article structured data ──────────────────────────────────────
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.meta_desc || article.excerpt || "",
    url: canonical,
    datePublished: article.published_at ?? "",
    dateModified: article.published_at ?? "",
    inLanguage: lang === "id" ? "id-ID" : "en-US",
    image: ogImageUrl
      ? {
          "@type": "ImageObject",
          url: ogImageUrl,
          width: 1280,
          height: 720,
        }
      : undefined,
    publisher: {
      "@type": "Organization",
      name: "Movyoo",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/movyoo-logo-2.png`,
      },
    },
    author: {
      "@type": "Organization",
      name: "Movyoo",
      url: SITE_URL,
    },
    // Daftar film sebagai mentions
    mentions:
      article.items?.slice(0, 10).map((item) => ({
        "@type": item.media_type === "tv" ? "TVSeries" : "Movie",
        name: item.media.title,
      })) ?? [],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArticleDetailClient article={article} related={related} />
    </>
  );
}
