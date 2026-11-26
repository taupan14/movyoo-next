import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchFestivalBySlugBasic } from "@/lib/festivals-db-extra";
import { FestivalDetailClient } from "./festival-detail-client";

const SITE_URL = "https://movyoo.id";

interface Props {
  params: { slug: string };
  searchParams: { year?: string; lang?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const festival = await fetchFestivalBySlugBasic(params.slug);

  if (!festival) {
    return { title: "Festival Tidak Ditemukan — Movyoo", robots: { index: false } };
  }

  const title = `${festival.short_name} — Jadwal, Lineup & Berita | Movyoo`;
  const description =
    festival.description ??
    `Info lengkap ${festival.name}: tanggal, lokasi, lineup film, dan berita terbaru.`;
  const canonical = `${SITE_URL}/festivals/${festival.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Movyoo",
      type: "website",
      images: festival.banner_path
        ? [{ url: festival.banner_path, width: 1280, height: 720, alt: festival.short_name }]
        : undefined,
    },
  };
}

export default async function FestivalDetailPage({ params, searchParams }: Props) {
  const festival = await fetchFestivalBySlugBasic(params.slug);
  if (!festival) notFound();

  const year = searchParams.year ? Number(searchParams.year) : new Date().getFullYear();
  const lang = searchParams.lang ?? "id";

  return <FestivalDetailClient slug={params.slug} initialYear={year} locale={lang} />;
}
