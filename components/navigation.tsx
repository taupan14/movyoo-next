"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useI18n } from "@/hooks/use-locale";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Chrome as Home,
  Compass,
  Heart,
  Zap,
  Brain,
  Swords,
  CalendarClock,
  Clock,
  Search,
  Globe,
  Menu,
  X,
  Flame,
  LogIn,
} from "lucide-react";
import { useState } from "react";
import { Poppins } from "next/font/google";
import { startLoader } from "@/components/page-loader"; // ← sesuaikan path

const poppins = Poppins({
  subsets: ["latin"],
  weight: "800",
});

const navItems = [
  { href: "/", icon: Home, labelKey: "nav_home" as const },
  { href: "/explore", icon: Compass, labelKey: "nav_explore" as const },
  { href: "/mood", icon: Brain, labelKey: "nav_mood" as const },
  { href: "/swipe", icon: Zap, labelKey: "nav_swipe" as const },
  // { href: "/watchlist", icon: Heart, labelKey: "nav_watchlist" as const },
  { href: "/battle", icon: Swords, labelKey: "nav_battle" as const },
  { href: "/quiz", icon: Flame, labelKey: "nav_quiz" as const },
  // {
  //   href: "/coming-soon",
  //   icon: CalendarClock,
  //   labelKey: "nav_coming_soon" as const,
  // },
  { href: "/last-chance", icon: Clock, labelKey: "nav_last_chance" as const },
];

// ─── Avatar / Login button ────────────────────────────────────────────────────

function AuthButton({ size = "md" }: { size?: "sm" | "md" }) {
  const { user, loading, openAuthModal } = useAuth();
  const pathname = usePathname();
  const dim = size === "sm" ? "w-9 h-9" : "w-11 h-11";
  const avatarDim = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const iconDim = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  if (loading) {
    return <div className={cn(dim, "rounded-xl animate-pulse bg-white/5")} />;
  }

  if (user) {
    const initial = (user.profile?.display_name ??
      user.email ??
      "U")[0].toUpperCase();
    return (
      <Link
        href="/profile"
        onClick={() => {
          if (pathname !== "/profile") startLoader();
        }}
        className={cn(
          dim,
          "rounded-xl flex items-center justify-center transition-all duration-200",
          "hover:bg-white/5 relative group",
        )}
        title={user.profile?.display_name ?? user.email}
      >
        {user.profile?.avatar_url ? (
          <img
            src={user.profile.avatar_url}
            alt={initial}
            className={cn(
              avatarDim,
              "rounded-full object-cover ring-2 ring-secondary/50",
            )}
          />
        ) : (
          <div
            className={cn(
              avatarDim,
              "rounded-full gradient-primary flex items-center justify-center",
              "text-white font-bold text-xs ring-2 ring-primary/40",
            )}
          >
            {initial}
          </div>
        )}
        <div className="absolute left-full ml-3 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border shadow-lg z-50">
          {user.profile?.display_name ?? user.email}
        </div>
      </Link>
    );
  }

  return (
    <button
      onClick={() => openAuthModal("signin")}
      className={cn(
        dim,
        "rounded-xl flex items-center justify-center transition-all duration-200",
        "text-muted-foreground hover:text-primary hover:bg-primary/10 relative group",
      )}
      title="Login"
    >
      <LogIn className={iconDim} />
      <div className="absolute left-full ml-3 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border shadow-lg z-50">
        Login
      </div>
    </button>
  );
}

// ─── Navigation Component ─────────────────────────────────────────────────────

export function Navigation() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Trigger preloader hanya jika berpindah halaman
  function go(href: string) {
    if (pathname !== href) startLoader();
  }

  return (
    <>
      {/* ── Desktop Sidebar ──────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[72px] flex-col items-center py-6 gap-2 bg-card/50 backdrop-blur-xl border-r border-border z-50">
        <Link href="/" onClick={() => go("/")} className="mb-6">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center font-bold text-white text-lg">
            <Image
              src="/movyoo-logo-2.png"
              alt="Logo"
              width={21}
              height={21}
              className="object-cover"
              priority
            />
          </div>
        </Link>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => go(item.href)}
                className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group relative",
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                <item.icon className="w-5 h-5" />
                {isActive && (
                  <div className="absolute left-0 w-0.5 h-5 bg-primary rounded-r-full" />
                )}
                <div className="absolute left-full ml-3 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border shadow-lg z-50">
                  {t(item.labelKey)}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="flex flex-col gap-1">
          <Link
            href="/search"
            onClick={() => go("/search")}
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
              pathname === "/search"
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
          >
            <Search className="w-5 h-5" />
          </Link>
          <button
            onClick={() => setLocale(locale === "id" ? "en" : "id")}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
          >
            <Globe className="w-5 h-5" />
          </button>
          <AuthButton size="md" />
        </div>
      </aside>

      {/* ── Mobile Top Bar ───────────────────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 glass">
        <div className="flex items-center justify-between px-4 h-14">
          <Link
            href="/"
            onClick={() => go("/")}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center font-bold text-white text-sm">
              <Image
                src="/movyoo-logo-2.png"
                alt="Logo"
                width={18}
                height={18}
                className="object-cover"
                priority
              />
            </div>
            <span
              className={`${poppins.className} font-bold text-white text-lg tracking-wider`}
            >
              Movyoo
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              href="/search"
              onClick={() => go("/search")}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                pathname === "/search"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Search className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setLocale(locale === "id" ? "en" : "id")}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe className="w-4 h-4" />
            </button>
            <AuthButton size="sm" />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="px-4 pb-4 grid grid-cols-5 gap-2 animate-fade-in">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setMobileOpen(false);
                    go(item.href);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 rounded-xl transition-all text-xs",
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="truncate w-full text-center">
                    {t(item.labelKey)}
                  </span>
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {/* ── Mobile Bottom Bar ────────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.slice(0, 5).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => go(item.href)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn("w-5 h-5", isActive && "animate-bounce-in")}
                />
                <span className="text-[10px] truncate">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
