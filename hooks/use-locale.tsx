'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale, t, TranslationKey } from '@/lib/i18n';

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
  region: string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'id',
  setLocale: () => {},
  t: (key) => key,
  region: 'ID',
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('id');

  useEffect(() => {
    const saved = localStorage.getItem('movyoo-locale') as Locale | null;
    if (saved && (saved === 'id' || saved === 'en')) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('movyoo-locale', l);
  };

  const region = locale === 'id' ? 'ID' : 'US';

  const translate = (key: TranslationKey): string => t(locale, key);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translate, region }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
