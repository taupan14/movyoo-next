import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — Movyoo",
  description:
    "Kebijakan privasi Movyoo tentang pengumpulan dan penggunaan data pengguna.",
};

const LAST_UPDATED = "1 Juni 2025";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0a0c14] text-white">
      <div className="max-w-2xl mx-auto px-4 py-16 lg:py-24">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/"
            className="text-xs text-white/30 hover:text-white/60 transition-colors mb-6 inline-block"
          >
            ← Kembali ke Beranda
          </Link>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-3">
            Kebijakan Privasi
          </h1>
          <p className="text-xs text-white/30">
            Terakhir diperbarui: {LAST_UPDATED}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-invert prose-sm max-w-none space-y-8">
          <Section title="1. Pendahuluan">
            <p>
              Movyoo (&ldquo;kami&rdquo;, &ldquo;layanan kami&rdquo;)
              berkomitmen untuk melindungi privasi pengguna. Kebijakan ini
              menjelaskan bagaimana kami mengumpulkan, menggunakan, dan
              melindungi informasi pribadimu saat menggunakan platform Movyoo.
            </p>
          </Section>

          <Section title="2. Data yang Kami Kumpulkan">
            <p>Kami mengumpulkan beberapa jenis data berikut:</p>
            <ul>
              <li>
                <strong>Data Akun:</strong> Email, nama, dan foto profil saat
                kamu mendaftar menggunakan email atau akun Google/GitHub.
              </li>
              <li>
                <strong>Data Aktivitas:</strong> Watchlist, preferensi genre,
                riwayat swipe, dan pengaturan aplikasi.
              </li>
              <li>
                <strong>Data Donasi:</strong> Nama donator dan referensi
                transaksi Saweria (jika kamu melakukan donasi).
              </li>
              <li>
                <strong>Data Teknis:</strong> Log error dan data performa untuk
                meningkatkan layanan.
              </li>
            </ul>
          </Section>

          <Section title="3. Penggunaan Data">
            <p>Data yang kami kumpulkan digunakan untuk:</p>
            <ul>
              <li>Menyediakan dan meningkatkan fitur aplikasi</li>
              <li>Memberikan rekomendasi film yang personal</li>
              <li>Memproses donasi dan memberikan reward bebas iklan</li>
              <li>Mengirim notifikasi terkait layanan (jika diizinkan)</li>
              <li>Menganalisis penggunaan untuk pengembangan fitur baru</li>
            </ul>
          </Section>

          <Section title="4. Berbagi Data dengan Pihak Ketiga">
            <p>
              Kami <strong>tidak menjual</strong> data pribadimu kepada
              siapapun. Kami hanya berbagi data dengan:
            </p>
            <ul>
              <li>
                <strong>Supabase:</strong> Penyimpanan database dan autentikasi
              </li>
              <li>
                <strong>TMDB:</strong> Pengambilan data film (anonim, tidak ada
                data pribadi yang dikirim)
              </li>
              <li>
                <strong>Adsterra:</strong> Jaringan iklan untuk pengguna yang
                tidak melakukan donasi
              </li>
            </ul>
          </Section>

          <Section title="5. Iklan">
            <p>
              Movyoo menampilkan iklan dari jaringan pihak ketiga untuk
              mendukung operasional layanan. Pengguna yang melakukan donasi akan
              secara otomatis mendapatkan pengalaman bebas iklan.
            </p>
            <p>
              Jaringan iklan kami mungkin menggunakan cookie untuk menampilkan
              iklan yang relevan. Kamu dapat mengatur preferensi cookie melalui
              pengaturan browser.
            </p>
          </Section>

          <Section title="6. Keamanan Data">
            <p>
              Kami menggunakan enkripsi standar industri dan Row Level Security
              (RLS) di Supabase untuk memastikan hanya kamu yang dapat mengakses
              data pribadimu. Namun, tidak ada sistem yang 100% aman — kami
              mendorong kamu untuk menggunakan kata sandi yang kuat.
            </p>
          </Section>

          <Section title="7. Hak Pengguna">
            <p>Kamu berhak untuk:</p>
            <ul>
              <li>Mengakses data pribadi yang kami simpan</li>
              <li>Meminta koreksi data yang tidak akurat</li>
              <li>Meminta penghapusan akun dan semua data terkait</li>
              <li>Menarik persetujuan kapan saja</li>
            </ul>
            <p>
              Untuk menggunakan hak ini, hubungi kami di{" "}
              <a
                href="mailto:hello@movyoo.id"
                className="text-primary hover:underline"
              >
                hello@movyoo.id
              </a>
              .
            </p>
          </Section>

          <Section title="8. Cookie">
            <p>
              Movyoo menggunakan cookie esensial untuk autentikasi dan
              preferensi pengguna. Cookie dari jaringan iklan digunakan untuk
              tujuan personalisasi iklan bagi pengguna non-donator.
            </p>
          </Section>

          <Section title="9. Perubahan Kebijakan">
            <p>
              Kami dapat memperbarui kebijakan ini sewaktu-waktu. Perubahan
              signifikan akan diinformasikan melalui email atau notifikasi di
              aplikasi. Dengan terus menggunakan Movyoo setelah perubahan, kamu
              menyetujui kebijakan yang diperbarui.
            </p>
          </Section>

          <Section title="10. Kontak">
            <p>
              Pertanyaan tentang kebijakan privasi ini? Hubungi kami di{" "}
              <a
                href="mailto:hello@movyoo.id"
                className="text-primary hover:underline"
              >
                hello@movyoo.id
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-white/80 mb-3">{title}</h2>
      <div className="text-sm text-white/45 leading-relaxed space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_strong]:text-white/65 [&_a]:text-primary">
        {children}
      </div>
    </section>
  );
}
