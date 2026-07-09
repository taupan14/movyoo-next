"use client";

/**
 * components/articles/become-contributor-button.tsx — FILE BARU
 *
 * Tombol "Ingin menjadi kontributor" di halaman /articles.
 * State:
 *  - belum login        → klik = buka modal login (openAuthModal)
 *  - belum request      → tampil tombol + modal alasan
 *  - status pending     → tombol "Menunggu review" (disabled)
 *  - status rejected    → tombol "Ajukan kembali" + tampilkan admin_note
 *  - role contributor   → tampil link "Kelola Artikel Saya" (bukan tombol ini)
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, Clock, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { startLoader } from "@/components/page-loader";
import type { ContributorRequest, UserRole } from "@/types/contributor";

export function BecomeContributorButton() {
  const { user, openAuthModal } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>("user");
  const [latestRequest, setLatestRequest] = useState<ContributorRequest | null>(
    null,
  );
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/contributor/request");
      const data = await res.json();
      setRole(data.role ?? "user");
      setLatestRequest(data.latestRequest ?? null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function submitRequest() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/contributor/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal mengirim pengajuan");
        return;
      }
      setLatestRequest(data.request);
      setShowModal(false);
      setReason("");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  // Sudah jadi kontributor/admin → tampilkan link kelola artikel
  if (role === "contributor" || role === "admin") {
    return (
      <button
        onClick={() => {
          startLoader();
          router.push("/articles/manage");
        }}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        <PenLine className="w-4 h-4" />
        Kelola Artikel Saya
      </button>
    );
  }

  if (!user) {
    return (
      <button
        onClick={() => openAuthModal("signin")}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      >
        <PenLine className="w-4 h-4" />
        Ingin menjadi kontributor
      </button>
    );
  }

  if (latestRequest?.status === "pending") {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium">
        <Clock className="w-4 h-4" />
        Menunggu review
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1.5">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <PenLine className="w-4 h-4" />
          {latestRequest?.status === "rejected"
            ? "Ajukan kembali jadi kontributor"
            : "Ingin menjadi kontributor"}
        </button>
        {latestRequest?.status === "rejected" && latestRequest.admin_note && (
          <p className="flex items-start gap-1.5 text-xs text-destructive max-w-sm">
            <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {latestRequest.admin_note}
          </p>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#141420] border border-white/10 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Jadi Kontributor Movyoo</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ceritakan singkat kenapa kamu ingin menulis artikel di Movyoo.
              Pengajuan akan direview oleh tim kami.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Saya suka menulis review film dan ingin berbagi rekomendasi..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={submitRequest}
                disabled={submitting}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg gradient-primary text-white text-sm disabled:opacity-50",
                )}
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Kirim Pengajuan
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-white/5 text-sm text-muted-foreground hover:text-foreground"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
