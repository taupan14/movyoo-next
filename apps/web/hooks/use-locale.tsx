"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { Locale, t, TranslationKey } from "@/lib/i18n";

// ─── External store ───────────────────────────────────────────────────────────
const STORAGE_KEY = "movyoo-locale";

type Listener = () => void;
const listeners = new Set<Listener>();

let currentLocale: Locale = "id";

// Inisialisasi dari localStorage (hanya di browser)
if (typeof window !== "undefined") {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "id" || saved === "en") currentLocale = saved;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Locale {
  return currentLocale;
}

function getServerSnapshot(): Locale {
  return "id";
}

function setLocaleExternal(locale: Locale) {
  currentLocale = locale;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, locale);
  }
  listeners.forEach((l) => l());
}
// ─────────────────────────────────────────────────────────────────────────────

interface I18nContextType {
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nContextType>({ setLocale: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const setLocale = useCallback((l: Locale) => setLocaleExternal(l), []);
  return (
    <I18nContext.Provider value={{ setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const locale = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const { setLocale } = useContext(I18nContext);

  // FIX: region selalu 'ID' — tidak bergantung pada bahasa UI.
  // Data di Supabase hanya tersedia untuk region 'ID'.
  // Bahasa (id/en) hanya mempengaruhi teks UI dan kolom overview yang dipilih.
  const region = "ID";

  const translate = useCallback(
    (key: TranslationKey): string => t(locale, key),
    [locale],
  );

  return { locale, setLocale, t: translate, region };
}
