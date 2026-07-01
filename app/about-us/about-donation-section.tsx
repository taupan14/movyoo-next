"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { TraktirModal } from "@/components/traktir-modal";
// import { useAdSettings } from "@/hooks/use-ad-settings";

const SAWERIA_QR_URL = "/qr-saweria.png";
const SAWERIA_URL = "https://saweria.co/movyoo";

type ModalInitialStep = "qr" | "confirm";

export function AboutDonationSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialStep, setInitialStep] = useState<ModalInitialStep>("qr");

  // Tier dibaca dari AdsProvider context (SSR, no flicker)
  //   const { tier: currentTier } = useAdSettings();

  function openModal(step: ModalInitialStep) {
    setInitialStep(step);
    setModalOpen(true);
  }

  return (
    <>
      <div className="flex flex-col items-center gap-4 text-center mb-10">
        {/* QR Code */}
        <div className="p-3 bg-white rounded-xl">
          <Image
            src={SAWERIA_QR_URL}
            alt="QR Saweria Movyoo"
            width={260}
            height={260}
            className="rounded-lg"
          />
        </div>

        <p className="text-[11px] text-white/35">
          Scan QR di atas atau klik tombol untuk donasi via Saweria
        </p>

        {/* CTA: Traktir */}
        <a
          href={SAWERIA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Donasi via Saweria
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {/* CTA: Klaim */}
        {/* <button
          onClick={() => openModal("confirm")}
          className="w-full py-2.5 rounded-xl border border-white/10 text-white/60 text-sm hover:border-white/20 hover:text-white/80 transition-colors"
        >
          Sudah donasi? Klaim bebas iklan →
        </button> */}
      </div>

      {/* Tier Journey */}
      {/* <div className="w-full flex justify-center">
        <TierJourney currentTier={currentTier} isLoading={false} />
      </div> */}

      {modalOpen && (
        <TraktirModal
          onClose={() => setModalOpen(false)}
          initialStep={initialStep}
        />
      )}
    </>
  );
}
