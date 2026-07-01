import type { Metadata } from "next";
import Link from "next/link";
import { Film, Target, Users, Zap } from "lucide-react";
import { AboutDonationSection } from "./about-donation-section";

export const metadata: Metadata = {
  title: "Tentang Kami — Movyoo",
  description:
    "Movyoo adalah platform penemuan film & TV series terbaik untuk penonton Indonesia.",
};

const VALUES = [
  {
    icon: Film,
    color: "from-violet-500 to-purple-600",
    title: "Cinta Film",
    desc: "Kami percaya setiap film layak ditemukan oleh penonton yang tepat.",
  },
  {
    icon: Target,
    color: "from-rose-500 to-pink-600",
    title: "Relevan",
    desc: "Rekomendasi yang personal, bukan sekadar daftar populer.",
  },
  {
    icon: Users,
    color: "from-amber-500 to-orange-600",
    title: "Komunitas",
    desc: "Dibangun bersama masukan nyata dari penonton Indonesia.",
  },
  {
    icon: Zap,
    color: "from-cyan-500 to-sky-600",
    title: "Cepat & Ringan",
    desc: "Pengalaman yang mulus di semua perangkat, tanpa hambatan.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0a0c14] text-white">
      <div className="max-w-2xl mx-auto px-4 py-16 lg:py-24">
        {/* Header */}
        <div className="mb-11">
          <Link
            href="/"
            className="text-xs text-white/30 hover:text-white/60 transition-colors mb-6 inline-block"
          >
            ← Kembali ke Beranda
          </Link>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
            Tentang{" "}
            <span className="text-primary">
              mov<span className="text-white">yoo</span>
            </span>
          </h1>
          <p className="text-white/50 leading-relaxed">
            Platform yang akan membantu kamu menemukan film dan series terbaik.
            Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan
            lainnya.
          </p>
        </div>

        {/* Donation Section — client island */}
        <AboutDonationSection />

        {/* Story */}
        <section className="mb-12 space-y-4">
          <h2 className="text-lg font-semibold text-white/80">Cerita Kami</h2>
          <div className="space-y-3 text-sm text-white/50 leading-relaxed">
            <p>
              Movyoo lahir dari frustrasi sederhana: terlalu banyak film bagus
              yang sulit ditemukan di antara lautan konten. Kami ingin membuat
              pengalaman menemukan film terasa seperti berbicara dengan teman
              yang benar-benar tahu selera kamu.
            </p>
            <p>
              Dengan fitur seperti{" "}
              <span className="text-white/70">Swipe Pick</span>,{" "}
              <span className="text-white/70">Mood Finder</span>, dan{" "}
              <span className="text-white/70">Hidden Gems</span>, kami
              menggabungkan data dari TMDB dengan preferensi personal untuk
              menghadirkan rekomendasi yang benar-benar relevan.
            </p>
            <p>
              Movyoo adalah proyek indie yang terus berkembang. Setiap fitur
              baru lahir dari masukan komunitas — termasuk kamu yang sedang
              membaca ini.
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white/80 mb-5">
            Nilai Kami
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] flex flex-col gap-3"
              >
                <div
                  className={`w-9 h-9 rounded-lg bg-gradient-to-br ${v.color} flex items-center justify-center`}
                >
                  <v.icon className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">{v.title}</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                    {v.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
          <h2 className="text-sm font-semibold text-white/80 mb-1">
            Hubungi Kami
          </h2>
          <p className="text-xs text-white/40 mb-3">
            Ada saran, laporan bug, atau sekadar ingin say hi?
          </p>
          <a
            href="mailto:hello@movyoo.id"
            className="text-sm text-primary hover:underline"
          >
            hello@movyoo.id
          </a>
        </section>
      </div>
    </main>
  );
}
