"use client";

/**
 * hooks/use-user-settings.tsx
 *
 * Fetch & cache user settings (show_ads, dll).
 * Gunakan hook ini di komponen ads supaya bisa cek show_ads sebelum render.
 *
 * Usage:
 *   const { showAds, loading } = useUserSettings();
 *   if (!showAds) return null; // skip render iklan
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

interface UserSettings {
  show_ads: boolean;
}

const DEFAULT_SETTINGS: UserSettings = { show_ads: true };

export function useUserSettings() {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Kalau auth masih loading, tunggu dulu
    if (authLoading) return;

    // Kalau tidak login → default (tampilkan iklan)
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    async function fetchSettings() {
      setLoading(true);
      try {
        const res = await fetch("/api/user-settings");
        if (!res.ok) throw new Error("Gagal fetch settings");
        const data: UserSettings = await res.json();
        setSettings(data);
      } catch {
        // Fallback ke default jika gagal
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, [user, authLoading]);

  return {
    showAds: settings.show_ads,
    settings,
    loading,
  };
}
