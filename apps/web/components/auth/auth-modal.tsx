"use client";

// components/auth/auth-modal.tsx

import { useState, useEffect } from "react";
import {
  X,
  Mail,
  Lock,
  User,
  Github,
  Wand2,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

type AuthTab = "signin" | "signup";
type EmailMode = "password" | "magic_link";

// ─── Email Sent Screen ────────────────────────────────────────────────────────

function EmailSentScreen({
  email,
  type,
  onBack,
}: {
  email: string;
  type: "verify" | "magic";
  onBack: () => void;
}) {
  return (
    <div className="p-6 flex flex-col items-center text-center gap-4">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mt-2">
        <Mail className="w-8 h-8 text-primary" />
      </div>

      {/* Text */}
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-foreground">
          {type === "verify" ? "Cek email kamu" : "Link dikirim!"}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {type === "verify" ? (
            <>
              Kami kirimkan link konfirmasi ke{" "}
              <span className="text-foreground font-medium">{email}</span>. Klik
              link tersebut untuk mengaktifkan akun, lalu login.
            </>
          ) : (
            <>
              Link masuk dikirim ke{" "}
              <span className="text-foreground font-medium">{email}</span>.
              Tidak perlu password — cukup klik link di email.
            </>
          )}
        </p>
      </div>

      {/* Tips */}
      <div className="w-full rounded-xl bg-white/5 border border-white/8 p-3 text-left space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Tidak menerima email?
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Cek folder Spam atau Promotions</li>
          <li>Tunggu beberapa menit</li>
          <li>Pastikan alamat email sudah benar</li>
        </ul>
      </div>

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali
      </button>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function AuthModal() {
  const {
    authModalOpen,
    authModalTab,
    closeAuthModal,
    signInWithGoogle,
    signInWithGitHub,
    signInWithEmail,
    signUpWithEmail,
    signInWithMagicLink,
  } = useAuth();

  const [tab, setTab] = useState<AuthTab>(authModalTab);
  const [emailMode, setEmailMode] = useState<EmailMode>("password");

  // Sync tab jika authModalTab berubah dari luar (e.g. openAuthModal("signup"))
  useEffect(() => {
    if (authModalOpen) {
      setTab(authModalTab);
      setEmailSent(null);
      setError(null);
    }
  }, [authModalOpen, authModalTab]);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "email sent" state: null = form normal, "verify" = setelah register, "magic" = setelah magic link
  const [emailSent, setEmailSent] = useState<"verify" | "magic" | null>(null);

  if (!authModalOpen) return null;

  const reset = () => setError(null);

  const handleBackFromEmailSent = () => {
    setEmailSent(null);
    setPassword("");
    reset();
  };

  // ── OAuth ──────────────────────────────────────────────────────────────────

  const handleGoogle = async () => {
    setLoading("google");
    reset();
    await signInWithGoogle();
    setLoading(null);
  };

  const handleGitHub = async () => {
    setLoading("github");
    reset();
    await signInWithGitHub();
    setLoading(null);
  };

  // ── Email submit ───────────────────────────────────────────────────────────

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();

    // Magic link
    if (emailMode === "magic_link") {
      if (!email) return setError("Masukkan email terlebih dahulu.");
      setLoading("magic");
      const { error: err } = await signInWithMagicLink(email);
      setLoading(null);
      if (err) return setError(err);
      setEmailSent("magic");
      return;
    }

    setLoading("email");

    if (tab === "signin") {
      // Login biasa
      const { error: err } = await signInWithEmail(email, password);
      setLoading(null);
      if (err) {
        // Supabase mengembalikan pesan teknis — mapping ke bahasa Indonesia
        if (
          err.toLowerCase().includes("invalid") ||
          err.toLowerCase().includes("credentials")
        ) {
          return setError("Email atau password salah.");
        }
        if (err.toLowerCase().includes("email not confirmed")) {
          return setError(
            "Email belum dikonfirmasi. Cek inbox kamu dan klik link verifikasi.",
          );
        }
        return setError(err);
      }
      closeAuthModal();
    } else {
      // Register
      if (!name.trim()) {
        setLoading(null);
        return setError("Nama tidak boleh kosong.");
      }
      if (password.length < 8) {
        setLoading(null);
        return setError("Password minimal 8 karakter.");
      }

      const { error: err } = await signUpWithEmail(email, password, name);
      setLoading(null);
      if (err) {
        if (err.toLowerCase().includes("already registered")) {
          return setError(
            "Email sudah terdaftar. Coba masuk atau gunakan email lain.",
          );
        }
        return setError(err);
      }
      // Tampilkan layar "cek email"
      setEmailSent("verify");
    }
  };

  const isLoading = loading !== null;

  return (
    <>
      {/* Backdrop — tidak bisa dismiss jika sedang di layar email sent */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={emailSent ? undefined : closeAuthModal}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            "relative w-full max-w-md rounded-2xl border border-white/10",
            "bg-[#0f0f0f] shadow-2xl",
            "animate-in fade-in zoom-in-95 duration-200",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — disembunyikan saat emailSent */}
          {!emailSent && (
            <div className="flex items-center justify-between p-6 pb-0">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {tab === "signin" ? "Masuk ke Movyoo" : "Buat akun baru"}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {tab === "signin"
                    ? "Lanjutkan pengalaman nonton kamu"
                    : "Gratis selamanya · Tanpa kartu kredit"}
                </p>
              </div>
              <button
                onClick={closeAuthModal}
                className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── Email Sent Screen ── */}
          {emailSent ? (
            <>
              {/* Close button tetap tampil */}
              <div className="absolute top-4 right-4">
                <button
                  onClick={closeAuthModal}
                  className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <EmailSentScreen
                email={email}
                type={emailSent}
                onBack={handleBackFromEmailSent}
              />
            </>
          ) : (
            /* ── Form Screen ── */
            <div className="p-6 space-y-4">
              {/* Tab switch */}
              <div className="flex gap-1 p-1 rounded-xl bg-white/5">
                {(["signin", "signup"] as AuthTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t);
                      reset();
                    }}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                      tab === t
                        ? "bg-primary text-white shadow"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t === "signin" ? "Masuk" : "Daftar"}
                  </button>
                ))}
              </div>

              {/* OAuth buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleGoogle}
                  disabled={isLoading}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10",
                    "bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {loading === "google" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  <span>Google</span>
                </button>

                <button
                  onClick={handleGitHub}
                  disabled={isLoading}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10",
                    "bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {loading === "github" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Github className="w-4 h-4" />
                  )}
                  <span>GitHub</span>
                </button>
              </div>

              {/* Divider */}
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-muted-foreground">atau</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Email mode toggle */}
              <div className="flex gap-1 p-1 rounded-xl bg-white/5">
                <button
                  onClick={() => {
                    setEmailMode("password");
                    reset();
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all",
                    emailMode === "password"
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Email & Password
                </button>
                <button
                  onClick={() => {
                    setEmailMode("magic_link");
                    reset();
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all",
                    emailMode === "magic_link"
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Magic Link
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                {/* Nama (signup + password mode only) */}
                {tab === "signup" && emailMode === "password" && (
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Nama lengkap"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm",
                        "bg-white/5 border border-white/10 text-foreground",
                        "placeholder:text-muted-foreground",
                        "focus:outline-none focus:border-primary/50 focus:bg-white/8 transition",
                      )}
                    />
                  </div>
                )}

                {/* Email */}
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className={cn(
                      "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm",
                      "bg-white/5 border border-white/10 text-foreground",
                      "placeholder:text-muted-foreground",
                      "focus:outline-none focus:border-primary/50 focus:bg-white/8 transition",
                    )}
                  />
                </div>

                {/* Password */}
                {emailMode === "password" && (
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        tab === "signup"
                          ? "Password (min. 8 karakter)"
                          : "Password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete={
                        tab === "signup" ? "new-password" : "current-password"
                      }
                      className={cn(
                        "w-full pl-10 pr-12 py-2.5 rounded-xl text-sm",
                        "bg-white/5 border border-white/10 text-foreground",
                        "placeholder:text-muted-foreground",
                        "focus:outline-none focus:border-primary/50 transition",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={cn(
                    "w-full py-2.5 rounded-xl font-medium text-sm",
                    "gradient-primary text-white",
                    "hover:opacity-90 active:scale-[0.98] transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "flex items-center justify-center gap-2",
                  )}
                >
                  {(loading === "email" || loading === "magic") && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {emailMode === "magic_link"
                    ? "Kirim Magic Link"
                    : tab === "signin"
                      ? "Masuk"
                      : "Buat Akun"}
                </button>
              </form>

              {/* Magic link info */}
              {emailMode === "magic_link" && (
                <p className="text-xs text-muted-foreground text-center">
                  Kami kirimkan link masuk ke email kamu — tidak perlu password.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Google Icon ──────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
