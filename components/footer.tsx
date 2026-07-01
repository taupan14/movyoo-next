"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Instagram,
  Twitter,
  Youtube,
  Mail,
  Coffee,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { startLoader } from "@/components/page-loader";
import { Poppins } from "next/font/google";
import { TraktirModal } from "@/components/traktir-modal";

const poppins = Poppins({
  subsets: ["latin"],
  weight: "800",
});

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

// ─── Footer ───────────────────────────────────────────────────────────────────

export function Footer() {
  const [traktirOpen, setTraktirOpen] = useState(false);

  return (
    <>
      <footer className="mt-15">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="max-w-7xl mx-auto px-4 lg:px-6 pt-10 pb-8 lg:pt-12 lg:pb-10">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr_1fr]">
            {/* Brand + Pills */}
            <div className="flex flex-col gap-4">
              <Link
                href="/"
                onClick={startLoader}
                className="flex items-center gap-2"
              >
                <div className="flex items-center justify-center">
                  <Image
                    src="/image.png"
                    alt="Logo"
                    width={20}
                    height={20}
                    className="object-cover mt-1"
                    priority
                  />
                </div>
                <span
                  className={`${poppins.className} font-bold text-white text-xl tracking-wider`}
                >
                  Movyoo<span className="text-primary text-2xl ml-0.5">.</span>
                </span>
              </Link>

              <p className="text-xs text-white/40 leading-relaxed max-w-xs">
                Movyoo membantu kamu menemukan film dan series terbaik.
                Rekomendasi berdasarkan mood, jadwal bioskop, film trending, dan
                lainnya.
              </p>

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

              {/* Traktir CTA */}
              <button
                onClick={() => setTraktirOpen(true)}
                className={cn(
                  "group flex items-center gap-2 px-4 py-2.5 rounded-xl w-fit mt-1",
                  "border border-primary/20 hover:border-primary/40",
                  "bg-gradient-to-r from-primary/10 to-primary/20",
                  "hover:from-primary/20 hover:to-primary/30",
                  "text-primary text-xs font-medium transition-all duration-200",
                )}
              >
                <Coffee className="w-3.5 h-3.5 fill-rose-400 group-hover:scale-110 transition-transform" />
                Traktir kami
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

              <div className="flex items-center gap-1.5 mt-1">
                <Sparkles className="w-3 h-3 text-purple-400/50" />
                <span className="text-[10px] text-white/20">
                  Update film terbaru setiap hari
                </span>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 pt-5 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-white/20 text-center sm:text-left">
              © 2026 Movyoo · Dibuat di Indonesia 🇮🇩
            </p>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setTraktirOpen(true)}
                className="hidden sm:flex items-center gap-1.5 text-[10px] text-primary/60 hover:text-primary/90 transition-colors border border-primary/15 hover:border-primary/30 px-2.5 py-1 rounded-full"
              >
                <Coffee className="w-2.5 h-2.5 fill-primary/60" />
                Traktir = bebas iklan selamanya
              </button>
            </div>
          </div>
        </div>
      </footer>

      {traktirOpen && <TraktirModal onClose={() => setTraktirOpen(false)} />}
    </>
  );
}
