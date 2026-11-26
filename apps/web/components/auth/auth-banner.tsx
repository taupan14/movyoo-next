"use client";

import { useState } from "react";

interface AuthBannerProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export function AuthBanner({ onSignIn, onSignUp }: AuthBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="animate-fade-in absolute bottom-24 lg:bottom-20 left-4 lg:left-8 right-4 lg:right-auto lg:max-w-sm z-20">
      <div className="glass-strong rounded-2xl border border-white/15 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">
              Simpan film favoritmu
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Buat akun gratis untuk watchlist, koleksi, dan rekomendasi
              personal.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={onSignUp}
                className="px-4 py-1.5 rounded-lg gradient-primary text-white text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Daftar Gratis
              </button>
              <button
                onClick={onSignIn}
                className="px-4 py-1.5 rounded-lg glass border border-white/10 text-xs text-foreground font-medium hover:bg-white/10 transition-colors"
              >
                Masuk
              </button>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            aria-label="Tutup"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
