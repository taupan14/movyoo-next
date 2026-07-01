"use client";

import { useState } from "react";
import Image from "next/image";
import { Coffee, ExternalLink, CheckCircle2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { DONATION_TIERS, type DonationTier } from "@/lib/ads/config";
import { useAdSettings } from "@/hooks/use-ad-settings";

// ─── Constants ────────────────────────────────────────────────────────────────

const SAWERIA_QR_URL = "/qr-saweria.png";
const SAWERIA_URL = "https://saweria.co/movyoo";

// ─── Tier Journey ─────────────────────────────────────────────────────────────

const TIER_ORDER = DONATION_TIERS.map((t) => t.tier);

function getTierIndex(tier: DonationTier): number {
  if (!tier) return -1;
  return TIER_ORDER.indexOf(tier);
}

function getNextTier(tier: DonationTier) {
  const idx = getTierIndex(tier);
  if (idx === -1) return DONATION_TIERS[0];
  if (idx >= DONATION_TIERS.length - 1) return null;
  return DONATION_TIERS[idx + 1];
}

export interface TierJourneyProps {
  currentTier: DonationTier;
  isLoading: boolean;
}

export function TierJourney({ currentTier, isLoading }: TierJourneyProps) {
  const currentIdx = getTierIndex(currentTier);
  const nextTier = getNextTier(currentTier);
  const currentTierInfo = DONATION_TIERS.find((t) => t.tier === currentTier);

  return (
    <div className="w-full">
      {/* Progress nodes */}
      <div className="flex justify-center">
        <div className="flex items-start">
          {DONATION_TIERS.map((t, i) => {
            const isActive = i <= currentIdx;
            const isCurrent = i === currentIdx;
            const isLast = i === DONATION_TIERS.length - 1;

            return (
              <div key={t.tier} className="flex items-start">
                {/* Node */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-300",
                      isCurrent
                        ? "border border-primary/60 bg-primary/15 shadow-[0_0_0_3px_rgba(139,92,246,0.1)]"
                        : isActive
                          ? "border border-primary/30 bg-primary/10"
                          : "border border-white/10 bg-white/[0.03]",
                    )}
                  >
                    {isLoading ? (
                      <span className="w-3 h-3 rounded-full bg-white/10 animate-pulse" />
                    ) : (
                      <span>{t.emoji}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[9px] mt-1.5 text-center leading-tight w-12 truncate",
                      isCurrent
                        ? "text-primary/80 font-medium"
                        : isActive
                          ? "text-white/50"
                          : "text-white/20",
                    )}
                  >
                    {t.label
                      .replace(" Award", "")
                      .replace("Hall of Fame", "HoF")}
                  </span>
                </div>

                {/* Connector */}
                {!isLast && (
                  <div
                    className={cn(
                      "h-px mt-4 w-8 mx-1 transition-all duration-300",
                      i < currentIdx ? "bg-primary/30" : "bg-white/[0.07]",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail card */}
      <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
        {isLoading ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
            <div className="h-2.5 w-32 rounded bg-white/[0.06] animate-pulse" />
          </div>
        ) : currentTier === null ? (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium text-white/60">
              Belum ada traktiran
            </p>
            <p className="text-[11px] text-white/30 leading-relaxed">
              Mulai dari{" "}
              <span className="text-primary/70">
                {DONATION_TIERS[0].emoji} {DONATION_TIERS[0].label}
              </span>{" "}
              dengan traktiran min. Rp 5.000
              <br />
              Popunder (iklan saat klik) langsung dimatikan.
            </p>
          </div>
        ) : (
          currentTierInfo && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-white/70">
                  Tier kamu:{" "}
                  <span className="text-primary/90">
                    {currentTierInfo.emoji} {currentTierInfo.label}
                  </span>
                </p>
                <span className="text-[9px] text-white/25 shrink-0">
                  {currentTierInfo.range}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {currentTierInfo.benefits.map((b) => (
                  <li
                    key={b}
                    className="flex items-center gap-1.5 text-[11px] text-white/40"
                  >
                    <span className="w-1 h-1 rounded-full bg-primary/50 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              {nextTier && (
                <p className="text-[10px] text-white/25 mt-0.5 pt-2 border-t border-white/[0.05]">
                  Traktir lagi mulai{" "}
                  <span className="text-yellow-400/60">
                    {nextTier.range.split("–")[0].trim()}
                  </span>{" "}
                  untuk naik ke{" "}
                  <span className="text-white/40">
                    {nextTier.emoji} {nextTier.label}
                  </span>
                </p>
              )}
            </div>
          )
        )}
      </div>

      <p className="text-[9px] text-white/15 mt-2 px-0.5">
        *Syarat dan ketentuan berlaku.
      </p>
    </div>
  );
}

// ─── Traktir Modal ────────────────────────────────────────────────────────────

type ModalStep = "qr" | "confirm" | "success" | "error";

interface SuccessData {
  tier: DonationTier;
  tierLabel: string | null;
  message: string;
  verified: boolean;
}

export interface TraktirModalProps {
  onClose: () => void;
  /** Step yang langsung ditampilkan saat modal dibuka. Default: "qr" */
  initialStep?: ModalStep;
}

export function TraktirModal({
  onClose,
  initialStep = "qr",
}: TraktirModalProps) {
  const { user, openAuthModal } = useAuth();
  const [step, setStep] = useState<ModalStep>(initialStep);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  const { tier: currentTier, refetchTier } = useAdSettings();

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

      setSuccessData({
        tier: json.tier,
        tierLabel: json.tierLabel,
        message: json.message,
        verified: json.verified,
      });
      setStep("success");

      if (json.verified) {
        await refetchTier();
      }
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
      <div className="relative w-full max-w-md rounded-2xl bg-[#0C0E12] border border-white/10 shadow-2xl overflow-hidden">
        {/* Glow bar top */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Step: QR ──────────────────────────────────────────────────────── */}
        {step === "qr" && (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Coffee className="w-5 h-5 text-white fill-white" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-white">
                Traktir Movyoo
              </h3>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                Traktiran kamu sangat berarti untuk kami. Dapatkan reward bebas
                iklan sesuai tier traktiran-mu!
              </p>
            </div>

            {/* Tier journey */}
            <TierJourney currentTier={currentTier} isLoading={false} />

            <div className="p-2 bg-white rounded-xl mt-1">
              <Image
                src={SAWERIA_QR_URL}
                alt="QR Saweria Movyoo"
                width={230}
                height={230}
                className="rounded-lg"
              />
            </div>

            <p className="text-[11px] text-white/35">
              Scan QR di atas atau klik tombol untuk traktir via Saweria
            </p>

            <a
              href={SAWERIA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Traktir via Saweria
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={() => setStep("confirm")}
              className="w-full py-2.5 rounded-xl border border-white/10 text-white/60 text-xs hover:border-white/20 hover:text-white/80 transition-colors"
            >
              Sudah traktir? Klaim reward-mu →
            </button>
          </div>
        )}

        {/* ── Step: Confirm ─────────────────────────────────────────────────── */}
        {step === "confirm" && (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Klaim Reward Traktiran
              </h3>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                {user
                  ? `Kami akan mencocokkan traktiran Saweria dengan akun ${user.email}. Tier iklan akan diperbarui otomatis.`
                  : "Kamu perlu login terlebih dahulu untuk mengklaim reward traktiran."}
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
                <>{user ? "Konfirmasi & Klaim Reward" : "Login untuk Klaim"}</>
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

        {/* ── Step: Success ─────────────────────────────────────────────────── */}
        {step === "success" && successData && (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-white">
                {successData.verified
                  ? "Makasih udah traktir! 🎉"
                  : "Klaim Diterima!"}
              </h3>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                {successData.message}
              </p>
            </div>

            {successData.verified && successData.tierLabel && (
              <div className="w-full px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
                <p className="text-sm font-semibold text-primary">
                  {successData.tierLabel}
                </p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  Tier traktiran kamu
                </p>
              </div>
            )}

            {successData.verified ? (
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors"
              >
                Selesai
              </button>
            ) : (
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-white/10 text-white/60 text-sm hover:border-white/20 transition-colors"
              >
                Tutup
              </button>
            )}
          </div>
        )}

        {/* ── Step: Error ───────────────────────────────────────────────────── */}
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
