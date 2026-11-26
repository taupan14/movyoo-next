import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan — Movyoo",
  description: "Syarat dan ketentuan penggunaan layanan Movyoo.",
};

const LAST_UPDATED = "1 Juni 2025";

export default function TermsPage() {
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
            Syarat &amp; Ketentuan
          </h1>
          <p className="text-xs text-white/30">
            Terakhir diperbarui: {LAST_UPDATED}
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8">
          <Section title="1. Penerimaan Syarat">
            <p>
              Dengan mengakses dan menggunakan Movyoo, kamu menyatakan telah
              membaca, memahami, dan menyetujui syarat dan ketentuan ini. Jika
              tidak setuju, mohon hentikan penggunaan layanan kami.
            </p>
          </Section>

          <Section title="2. Deskripsi Layanan">
            <p>
              Movyoo adalah platform penemuan film dan TV series yang
              menyediakan rekomendasi personal, watchlist, dan informasi seputar
              konten hiburan. Movyoo bukan layanan streaming dan tidak
              menyediakan konten film secara langsung.
            </p>
          </Section>

          <Section title="3. Akun Pengguna">
            <p>
              Untuk menggunakan fitur lengkap Movyoo, kamu perlu membuat akun.
              Kamu bertanggung jawab untuk:
            </p>
            <ul>
              <li>Menjaga kerahasiaan kredensial akunmu</li>
              <li>Semua aktivitas yang terjadi di bawah akunmu</li>
              <li>Memberikan informasi yang akurat saat mendaftar</li>
            </ul>
            <p>
              Kami berhak menangguhkan akun yang melanggar syarat ini tanpa
              pemberitahuan sebelumnya.
            </p>
          </Section>

          <Section title="4. Penggunaan yang Dilarang">
            <p>Kamu dilarang menggunakan Movyoo untuk:</p>
            <ul>
              <li>Mengumpulkan data pengguna lain tanpa izin</li>
              <li>Mencoba meretas, merusak, atau mengganggu sistem kami</li>
              <li>Menyebarkan konten ilegal, berbahaya, atau menyinggung</li>
              <li>
                Menggunakan bot atau alat otomatis untuk mengakses layanan kami
              </li>
              <li>Mengklaim bebas iklan tanpa benar-benar melakukan donasi</li>
            </ul>
          </Section>

          <Section title="5. Donasi dan Reward Bebas Iklan">
            <p>
              Reward bebas iklan diberikan kepada pengguna yang melakukan donasi
              melalui Saweria dan mengklaim reward secara manual di aplikasi.
              Ketentuan:
            </p>
            <ul>
              <li>Reward berlaku untuk satu akun terdaftar</li>
              <li>Donasi bersifat sukarela dan tidak dapat dikembalikan</li>
              <li>
                Kami berhak mencabut reward jika terdapat indikasi kecurangan
              </li>
              <li>
                Besaran donasi tidak ditentukan — berapapun yang kamu mampu
              </li>
            </ul>
          </Section>

          <Section title="6. Kekayaan Intelektual">
            <p>
              Seluruh konten, desain, dan kode Movyoo adalah milik tim Movyoo.
              Data film yang ditampilkan bersumber dari TMDB dan tunduk pada
              lisensi TMDB. Kamu dilarang menyalin, mendistribusikan, atau
              memodifikasi konten Movyoo tanpa izin tertulis.
            </p>
          </Section>

          <Section title="7. Penafian Layanan">
            <p>
              Movyoo disediakan &ldquo;sebagaimana adanya&rdquo; tanpa jaminan
              apapun. Kami tidak menjamin ketersediaan layanan 24/7 dan tidak
              bertanggung jawab atas kerugian yang timbul akibat penggunaan atau
              ketidakmampuan menggunakan layanan kami.
            </p>
          </Section>

          <Section title="8. Batasan Tanggung Jawab">
            <p>
              Sejauh diizinkan hukum yang berlaku, Movyoo tidak bertanggung
              jawab atas kerugian tidak langsung, insidental, atau konsekuensial
              yang timbul dari penggunaan layanan kami.
            </p>
          </Section>

          <Section title="9. Perubahan Syarat">
            <p>
              Kami dapat memperbarui syarat ini sewaktu-waktu. Perubahan
              signifikan akan diinformasikan minimal 7 hari sebelum berlaku.
              Penggunaan layanan setelah perubahan berlaku dianggap sebagai
              persetujuan terhadap syarat baru.
            </p>
          </Section>

          <Section title="10. Hukum yang Berlaku">
            <p>
              Syarat ini tunduk pada hukum Republik Indonesia. Segala sengketa
              diselesaikan melalui musyawarah mufakat, atau jika tidak berhasil,
              melalui pengadilan yang berwenang di Indonesia.
            </p>
          </Section>

          <Section title="11. Kontak">
            <p>
              Pertanyaan tentang syarat ini? Hubungi kami di{" "}
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
