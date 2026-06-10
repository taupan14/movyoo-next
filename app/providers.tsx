"use client";

import { I18nProvider } from "@/hooks/use-locale";
import { AuthProvider } from "@/hooks/use-auth";
import { Navigation } from "@/components/navigation";
import { AuthModal } from "@/components/auth/auth-modal";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <Navigation />
        <AuthModal />
        <main className="lg:pl-[72px] pt-14 lg:pt-0 pb-20 lg:pb-0 min-h-screen">
          {children}
        </main>
      </AuthProvider>
    </I18nProvider>
  );
}
