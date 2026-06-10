import type { HomeData } from "./home";

// ─── Empty State ──────────────────────────────────────────────────────────────

export const EMPTY_HOME_DATA: HomeData = {
  trending: [],
  nowPlaying: [],
  upcoming: [],
  popular: [],
  indonesianMovies: [],
  netflixTrending: [],
  disneyTrending: [],
  onAirSeries: [],
  popularSeries: [],
  trendingSeries: [],
  popularCast: [],
};

// ─── Festival Metadata ────────────────────────────────────────────────────────
// Metadata statis per festival — warna, ikon, gradien — tidak perlu dari DB

export const FESTIVAL_META: Record<
  string,
  {
    gradient: string;
    badgeBg: string;
    badgeText: string;
    flag: string;
    award: string;
  }
> = {
  cannes: {
    gradient: "from-amber-900/80 via-yellow-900/60 to-black/80",
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-400",
    flag: "🇫🇷",
    award: "Palme d'Or",
  },
  venice: {
    gradient: "from-green-900/80 via-rose-900/60 to-black/80",
    badgeBg: "bg-green-500/20",
    badgeText: "text-green-400",
    flag: "🇮🇹",
    award: "Golden Lion",
  },
  berlinale: {
    gradient: "from-orange-900/80 via-amber-500/60 to-black/80",
    badgeBg: "bg-orange-500/20",
    badgeText: "text-orange-400",
    flag: "🇩🇪",
    award: "Golden Bear",
  },
  tiff: {
    gradient: "from-red-900/80 via-red-900/60 to-black/80",
    badgeBg: "bg-red-500/20",
    badgeText: "text-red-400",
    flag: "🇨🇦",
    award: "People's Choice",
  },
  sundance: {
    gradient: "from-blue-900/80 via-blue-900/60 to-black/80",
    badgeBg: "bg-blue-500/20",
    badgeText: "text-blue-400",
    flag: "🇺🇸",
    award: "Grand Jury Prize",
  },
  ffi: {
    gradient: "from-rose-900/80 via-red-900/60 to-black/80",
    badgeBg: "bg-rose-500/20",
    badgeText: "text-rose-400",
    flag: "🇮🇩",
    award: "Piala Citra",
  },
  biff: {
    gradient: "from-black-900/80 via-amber-900/60 to-black/80",
    badgeBg: "bg-black-500/20",
    badgeText: "text-black-400",
    flag: "🇰🇷",
    award: "Busan Award",
  },
};
