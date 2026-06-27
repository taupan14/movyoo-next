"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Instagram,
  Twitter,
  Youtube,
  Mail,
  Heart,
  ExternalLink,
  CheckCircle2,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { startLoader } from "@/components/page-loader";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: "800",
});

// ─── Saweria ──────────────────────────────────────────────────────────────────
const SAWERIA_QR_URL = "/qr-saweria.png";
const SAWERIA_URL = "https://saweria.co/movyoo";

// ─── Links ────────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Tentang Kami", href: "/about-us" },
  { label: "FAQ", href: "/faqs" },
  { label: "Kebijakan Privasi", href: "/privacy-policy" },
  { label: "Syarat & Ketentuan", href: "/terms" },
];

const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://instagram.com/movyoo", icon: Instagram },
  { label: "Twitter / X", href: "https://twitter.com/movyoo", icon: Twitter },
  { label: "YouTube", href: "https://youtube.com/@movyoo", icon: Youtube },
  { label: "Email", href: "mailto:hello@movyoo.id", icon: Mail },
];

const FEATURE_PILLS = [
  "Film Bioskop",
  "TV Series",
  "Festival Film",
  "Mood Finder",
  "Kuis Film",
  "Last Chance",
  "Swipe & Pilih",
  "Redeem Hadiah",
];

// ─── Donation Modal ───────────────────────────────────────────────────────────

function DonationModal({ onClose }: { onClose: () => void }) {
  const { user, openAuthModal } = useAuth();
  const [step, setStep] = useState<"qr" | "confirm" | "success" | "error">(
    "qr",
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleConfirm() {
    if (!user) {
      onClose();
      openAuthModal("signin");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/donation/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donor_name: user.profile?.display_name ?? "" }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Terjadi kesalahan");

      setStep("success");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-[#0C0E12] border border-white/10 shadow-2xl overflow-hidden">
        {/* Glow bar top */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {step === "qr" && (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Dukung Movyoo
              </h3>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                Donasi-mu sangat berarti untuk kami supaya Movyoo terus
                berkembang.
                <br />
                Donator otomatis bebas iklan selamanya 🎉
              </p>
            </div>

            <div className="p-3 bg-white rounded-xl">
              <Image
                src={SAWERIA_QR_URL}
                alt="QR Saweria Movyoo"
                width={180}
                height={180}
                className="rounded-lg"
              />
            </div>

            <p className="text-[11px] text-white/35">
              Scan QR di atas atau klik tombol untuk donasi via Saweria
            </p>

            <a
              href={SAWERIA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Donasi via Saweria
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={() => setStep("confirm")}
              className="w-full py-2.5 rounded-xl border border-white/10 text-white/60 text-sm hover:border-white/20 hover:text-white/80 transition-colors"
            >
              Sudah donasi? Klaim bebas iklan →
            </button>
          </div>
        )}

        {step === "confirm" && (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Klaim Bebas Iklan
              </h3>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                {user
                  ? `Akun ${user.email} akan kami tandai sebagai donator. Iklan akan langsung dimatikan.`
                  : "Kamu perlu login terlebih dahulu untuk mengklaim reward bebas iklan."}
              </p>
            </div>

            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>{user ? "Konfirmasi & Matikan Iklan" : "Login untuk Klaim"}</>
              )}
            </button>

            <button
              onClick={() => setStep("qr")}
              className="text-xs text-white/35 hover:text-white/60 transition-colors"
            >
              ← Kembali
            </button>
          </div>
        )}

        {step === "success" && (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Terima kasih! 🎉
              </h3>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                Kamu sekarang adalah donator Movyoo. Iklan telah dimatikan di
                akunmu. Refresh halaman untuk melihat perubahannya.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors"
            >
              Refresh Halaman
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <X className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Gagal mengklaim
              </h3>
              <p className="text-xs text-white/50 mt-1">{errorMsg}</p>
            </div>
            <button
              onClick={() => setStep("confirm")}
              className="w-full py-2.5 rounded-xl border border-white/10 text-white/60 text-sm hover:border-white/20 transition-colors"
            >
              Coba lagi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function Footer() {
  const [donationOpen, setDonationOpen] = useState(false);

  return (
    <>
      <footer className="mt-15">
        {/* ── Rainbow glow bar ─────────────────────────────────────────────── */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        {/* <div className="h-px w-full bg-gradient-to-r from-transparent via-purple-500/40 to-transparent mt-px" /> */}

        <div className="max-w-7xl mx-auto px-4 lg:px-6 pt-10 pb-8 lg:pt-12 lg:pb-10">
          {/* ── Main grid ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr_1fr]">
            {/* Brand + Pills */}
            <div className="flex flex-col gap-4">
              <Link
                href="/"
                onClick={startLoader}
                className="flex items-center gap-2"
              >
                <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center font-bold text-white text-sm">
                  <Image
                    src="/movyoo-logo-2.png"
                    alt="Logo"
                    width={22}
                    height={22}
                    className="object-cover"
                    priority
                  />
                </div>
                <span
                  className={`${poppins.className} font-bold text-white text-2xl tracking-wider`}
                >
                  Movyoo<span className="text-primary text-2xl ml-0.5">.</span>
                </span>
              </Link>

              <p className="text-xs text-white/40 leading-relaxed max-w-xs">
                Movyoo membantu kamu menemukan film dan series terbaik.
                Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan
                lainnya.
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2">
                {FEATURE_PILLS.map((pill) => (
                  <span
                    key={pill}
                    className="px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] text-white/35 tracking-wide"
                  >
                    {pill}
                  </span>
                ))}
              </div>

              {/* Donation CTA */}
              <button
                onClick={() => setDonationOpen(true)}
                className={cn(
                  "group flex items-center gap-2 px-4 py-2.5 rounded-xl w-fit mt-1",
                  "border border-primary/20 hover:border-primary/40",
                  "bg-gradient-to-r from-primary/10 to-primary/20",
                  "hover:from-primary/20 hover:to-primary/30",
                  "text-primary text-xs font-medium transition-all duration-200",
                )}
              >
                <Heart className="w-3.5 h-3.5 fill-rose-400 group-hover:scale-110 transition-transform" />
                Dukung kami dengan donasi
                <span className="ml-auto text-[10px] text-rose-400/50">
                  · bebas iklan 🎉
                </span>
              </button>
            </div>

            {/* Nav Links */}
            <div className="flex flex-col gap-3">
              <p className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.12em]">
                Halaman
              </p>
              <ul className="flex flex-col gap-2.5">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={startLoader}
                      className="text-sm text-white/45 hover:text-white/75 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Social */}
            <div className="flex flex-col gap-3">
              <p className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.12em]">
                Ikuti Kami
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SOCIAL_LINKS.map((s) => (
                  <a
                    key={s.href}
                    href={s.href}
                    target={s.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl",
                      "border border-white/[0.07] bg-white/[0.02]",
                      "text-xs text-white/40 hover:text-white/70",
                      "hover:border-white/[0.12] hover:bg-white/[0.04]",
                      "transition-all duration-150",
                    )}
                  >
                    <s.icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{s.label}</span>
                  </a>
                ))}
              </div>

              {/* Sparkles hint */}
              <div className="flex items-center gap-1.5 mt-1">
                <Sparkles className="w-3 h-3 text-purple-400/50" />
                <span className="text-[10px] text-white/20">
                  Update film terbaru setiap hari
                </span>
              </div>
            </div>
          </div>

          {/* ── Bottom bar ───────────────────────────────────────────────────── */}
          <div className="mt-10 pt-5 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-white/20 text-center sm:text-left">
              © 2026 Movyoo · Dibuat di Indonesia 🇮🇩
            </p>

            <div className="flex items-center gap-4">
              {/* <p className="text-[11px] text-white/15">
                PLYNESIA CREATIVE LABS
              </p> */}

              {/* Inline donate nudge */}
              <button
                onClick={() => setDonationOpen(true)}
                className="hidden sm:flex items-center gap-1.5 text-[10px] text-primary/60 hover:text-primary/90 transition-colors border border-primary/15 hover:border-primary/30 px-2.5 py-1 rounded-full"
              >
                <Heart className="w-2.5 h-2.5 fill-primary/60" />
                Donasi = bebas iklan selamanya
              </button>
            </div>
          </div>
        </div>
      </footer>

      {donationOpen && <DonationModal onClose={() => setDonationOpen(false)} />}
    </>
  );
}
