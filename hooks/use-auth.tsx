"use client";

// hooks/use-auth.tsx — FILE BARU
// Auth context: session, profile, login/logout helpers

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile, AuthUser } from "@/types/auth";

// ─── Migrasi localStorage watchlist → Supabase ───────────────────────────────

async function migrateLocalWatchlist(userId: string) {
  const STORAGE_KEY = "movyoo-watchlist";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const localItems = JSON.parse(raw) as Array<{
      id: number;
      title: string;
      poster_path: string | null;
      vote_average: number;
      release_date?: string;
      status: string;
      remindWhenAvailable: boolean;
      addedAt: number;
    }>;

    if (!localItems.length) return;

    const rows = localItems.map((item) => ({
      user_id: userId,
      media_type: "movie" as const,
      movie_id: item.id,
      status: item.status as "want_to_watch" | "watching" | "watched",
      remind_when_available: item.remindWhenAvailable,
      added_at: new Date(item.addedAt).toISOString(),
    }));

    const { error } = await supabase
      .from("user_watchlist")
      .upsert(rows, { onConflict: "user_id,movie_id", ignoreDuplicates: true });

    if (!error) {
      localStorage.removeItem(STORAGE_KEY);
      console.log(`[auth] Migrated ${rows.length} watchlist items to Supabase`);
    }
  } catch (err) {
    console.error("[auth] Watchlist migration failed:", err);
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  // Auth actions
  signInWithGoogle: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUpWithEmail: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  // Profile actions
  updateProfile: (
    data: Partial<
      Pick<Profile, "username" | "display_name" | "bio" | "avatar_url">
    >,
  ) => Promise<{ error: string | null }>;
  uploadAvatar: (file: File) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  // Auth modal control
  openAuthModal: (tab?: "signin" | "signup") => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;
  authModalTab: "signin" | "signup";
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"signin" | "signup">(
    "signin",
  );
  const migrated = useRef(false);

  const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");

  // Fetch profile dari Supabase
  const fetchProfile = useCallback(
    async (supabaseUser: User): Promise<Profile | null> => {
      // Retry sampai 3x dengan jeda, untuk handle race condition
      // antara auth callback dan trigger insert profile
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", supabaseUser.id)
          .maybeSingle();

        if (error) {
          console.error("[auth] fetchProfile error:", error);
          return null;
        }

        if (data) return data as Profile;

        // Profile belum ada, tunggu sebentar lalu retry
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        }
      }

      return null;
    },
    [],
  );

  const buildAuthUser = useCallback(
    async (supabaseUser: User): Promise<AuthUser> => {
      const profile = await fetchProfile(supabaseUser);
      return {
        id: supabaseUser.id,
        email: supabaseUser.email,
        profile,
      };
    },
    [fetchProfile],
  );

  // Inisialisasi session
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        const authUser = await buildAuthUser(s.user);
        setUser(authUser);

        // Migrasi watchlist localStorage (hanya sekali)
        if (!migrated.current) {
          migrated.current = true;
          migrateLocalWatchlist(s.user.id);
        }
      }
      setLoading(false);
    });

    // Listen untuk perubahan auth state
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (s?.user) {
        const authUser = await buildAuthUser(s.user);
        setUser(authUser);

        // Kalau profile masih null setelah buildAuthUser (race condition),
        // schedule refresh sekali lagi setelah 2 detik
        if (!authUser.profile && event === "SIGNED_IN") {
          setTimeout(async () => {
            const profile = await fetchProfile(s.user);
            if (profile) {
              setUser((prev) => (prev ? { ...prev, profile } : null));
            }
          }, 2000);
        }

        if (event === "SIGNED_IN" && !migrated.current) {
          migrated.current = true;
          migrateLocalWatchlist(s.user.id);
        }
      } else {
        setUser(null);
        migrated.current = false;
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [buildAuthUser]);

  // ─── Auth actions ─────────────────────────────────────────────────────────

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${SITE_URL}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  }, []);

  const signInWithGitHub = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${SITE_URL}/auth/callback` },
    });
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, name: string) => {
      // Cek duplikat email dulu
      const check = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const { exists } = await check.json();
      if (exists) {
        return {
          error: "Email sudah terdaftar. Coba masuk atau gunakan email lain.",
        };
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${SITE_URL}/auth/callback`,
        },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback`,
      },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await Promise.race([
      fetch("/api/auth/signout", { method: "POST" }),
      new Promise((res) => setTimeout(res, 3000)),
    ]).catch(() => {});

    setUser(null);
    setSession(null);

    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, []);

  // ─── Profile actions ──────────────────────────────────────────────────────

  const updateProfile = useCallback(
    async (
      data: Partial<
        Pick<Profile, "username" | "display_name" | "bio" | "avatar_url">
      >,
    ) => {
      if (!user) return { error: "Not authenticated" };

      // Panggil API route (server-side) agar RLS token selalu valid
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (!res.ok) return { error: json.error ?? "Gagal menyimpan profil" };

      // Update local state dengan data terbaru dari server
      setUser((prev) =>
        prev
          ? {
              ...prev,
              profile: prev.profile ? { ...prev.profile, ...json } : json,
            }
          : null,
      );
      return { error: null };
    },
    [user],
  );

  // Upload avatar ke Supabase Storage → update avatar_url di profil
  const uploadAvatar = useCallback(
    async (file: File): Promise<{ error: string | null }> => {
      if (!user) return { error: "Not authenticated" };

      // Validasi tipe & ukuran
      if (!file.type.startsWith("image/"))
        return { error: "File harus berupa gambar" };
      if (file.size > 2 * 1024 * 1024) return { error: "Ukuran maksimal 2 MB" };

      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/avatar.${ext}`;

      // Upload ke bucket "avatars" — buat bucket ini di Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) return { error: uploadError.message };

      // Ambil public URL + cache-bust agar gambar lama tidak tertahan browser
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);
      const avatar_url = `${urlData.publicUrl}?t=${Date.now()}`;

      // Simpan ke profil via updateProfile (sudah pakai API route)
      return updateProfile({ avatar_url });
    },
    [user, updateProfile],
  );

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const profile = await fetchProfile(session.user);
    setUser((prev) => (prev ? { ...prev, profile } : null));
  }, [session, fetchProfile]);

  // ─── Modal control ────────────────────────────────────────────────────────

  const openAuthModal = useCallback((tab: "signin" | "signup" = "signin") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithGoogle,
        signInWithGitHub,
        signInWithEmail,
        signUpWithEmail,
        signInWithMagicLink,
        signOut,
        updateProfile,
        uploadAvatar,
        refreshProfile,
        openAuthModal,
        closeAuthModal,
        authModalOpen,
        authModalTab,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
