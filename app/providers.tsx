'use client';

import { I18nProvider } from '@/hooks/use-locale';
import { Navigation } from '@/components/navigation';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <Navigation />
      <main className="lg:pl-[72px] pt-14 lg:pt-0 pb-20 lg:pb-0 min-h-screen">
        {children}
      </main>
    </I18nProvider>
  );
}
