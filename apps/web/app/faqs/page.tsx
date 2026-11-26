import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ — Movyoo",
  description: "Pertanyaan yang sering ditanyakan tentang Movyoo.",
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Apa itu Movyoo?",
    a: "Movyoo adalah platform penemuan film & TV series yang membantu kamu menemukan tontonan malam ini dengan cara yang menyenangkan. Fitur unggulan kami meliputi Swipe Pick, Mood Finder, Hidden Gems, dan banyak lagi.",
  },
  {
    q: "Apakah Movyoo gratis?",
    a: "Ya, Movyoo sepenuhnya gratis. Kami menjaga layanan tetap hidup melalui iklan dan donasi sukarela dari pengguna. Donator akan mendapatkan pengalaman bebas iklan selamanya.",
  },
  {
    q: "Bagaimana cara menjadi donator dan bebas iklan?",
    a: 'Klik tombol "Dukung kami dengan donasi" di footer, scan QR Saweria dan lakukan donasi, lalu klik "Sudah donasi? Klaim bebas iklan". Iklan akan langsung dimatikan di akunmu setelah konfirmasi.',
  },
  {
    q: "Data film dari mana?",
    a: "Movyoo menggunakan data dari The Movie Database (TMDB). Movyoo bukan afiliasi resmi TMDB, namun menggunakan API mereka sesuai dengan syarat penggunaan yang berlaku.",
  },
  {
    q: "Apakah Movyoo menyediakan layanan streaming?",
    a: "Tidak. Movyoo adalah platform penemuan dan rekomendasi film, bukan layanan streaming. Kami membantu kamu menemukan film yang tepat dan memberitahu di platform mana kamu bisa menontonnya.",
  },
  {
    q: "Bagaimana cara kerja fitur Swipe Pick?",
    a: "Swipe Pick menampilkan film atau series satu per satu — geser kanan jika tertarik, geser kiri untuk lewati. Movyoo mempelajari preferensimu untuk memberikan rekomendasi yang makin personal.",
  },
  {
    q: "Apakah data saya aman?",
    a: "Kami hanya menyimpan data yang dibutuhkan untuk fitur aplikasi (watchlist, preferensi, dll). Kami tidak menjual data pengguna ke pihak ketiga. Baca Kebijakan Privasi kami untuk detail lengkapnya.",
  },
  {
    q: "Bagaimana cara melaporkan bug atau memberikan saran?",
    a: "Kamu bisa menghubungi kami melalui email di hello@movyoo.id atau melalui media sosial kami. Setiap masukan sangat kami hargai!",
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen text-white">
      <div className="max-w-2xl mx-auto px-4 py-16 lg:py-24">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/"
            className="text-xs text-white/30 hover:text-white/60 transition-colors mb-6 inline-block"
          >
            ← Kembali ke Beranda
          </Link>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
            Pertanyaan Umum
          </h1>
          <p className="text-white/50 text-sm leading-relaxed">
            Tidak menemukan jawaban yang kamu cari?{" "}
            <a
              href="mailto:hello@movyoo.id"
              className="text-primary hover:underline"
            >
              Hubungi kami
            </a>
            .
          </p>
        </div>

        {/* FAQ List */}
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <details
              key={i}
              className="group rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer text-sm font-medium text-white/80 hover:text-white transition-colors select-none list-none">
                {faq.q}
                {/* Chevron */}
                <svg
                  className="w-4 h-4 shrink-0 text-white/30 transition-transform group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-4">
                <p className="text-xs text-white/45 leading-relaxed">{faq.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}
