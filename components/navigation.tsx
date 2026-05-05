'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';
import { Chrome as Home, Compass, Heart, Zap, Brain, Swords, CalendarClock, Clock, Search, Globe, Menu, X, Flame } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/', icon: Home, labelKey: 'nav_home' as const },
  { href: '/explore', icon: Compass, labelKey: 'nav_explore' as const },
  { href: '/mood', icon: Brain, labelKey: 'nav_mood' as const },
  { href: '/swipe', icon: Zap, labelKey: 'nav_swipe' as const },
  { href: '/watchlist', icon: Heart, labelKey: 'nav_watchlist' as const },
  { href: '/battle', icon: Swords, labelKey: 'nav_battle' as const },
  { href: '/quiz', icon: Flame, labelKey: 'nav_quiz' as const },
  { href: '/coming-soon', icon: CalendarClock, labelKey: 'nav_coming_soon' as const },
  { href: '/last-chance', icon: Clock, labelKey: 'nav_last_chance' as const },
];

export function Navigation() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[72px] flex-col items-center py-6 gap-2 bg-card/50 backdrop-blur-xl border-r border-border z-50">
        <Link href="/" className="mb-6">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center font-bold text-white text-lg">
            M
          </div>
        </Link>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group relative',
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
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

        <div className="flex flex-col gap-1">
          <Link
            href="/search"
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200',
              pathname === '/search'
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
          >
            <Search className="w-5 h-5" />
          </Link>
          <button
            onClick={() => setLocale(locale === 'id' ? 'en' : 'id')}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
          >
            <Globe className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 glass">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center font-bold text-white text-sm">
              M
            </div>
            <span className="font-bold text-gradient text-lg">Movyoo</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/search"
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                pathname === '/search'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Search className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setLocale(locale === 'id' ? 'en' : 'id')}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 rounded-xl transition-all text-xs',
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="truncate w-full text-center">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {/* Mobile Bottom Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.slice(0, 5).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className={cn('w-5 h-5', isActive && 'animate-bounce-in')} />
                <span className="text-[10px] truncate">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
