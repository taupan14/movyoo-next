'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useI18n } from '@/hooks/use-locale';
import { supabase } from '@/lib/supabase';
import { fetchNowPlaying, getPosterUrl } from '@/lib/tmdb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MapPin, Navigation, Search, Star, Clock, ExternalLink, Film, Loader as Loader2, Calendar } from 'lucide-react';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Cinema {
  id: string;
  name: string;
  chain: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  google_maps_url: string;
  booking_url: string;
  source: string;
}

interface CinemaMovie {
  id: string;
  title: string;
  genre: string;
  duration: string;
  age_rating: string;
  format: string;
  source: string;
}

interface NowPlayingMovie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHAIN_COLORS: Record<string, string> = {
  XXI: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  CGV: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Cinepolis: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const CHAIN_DOT: Record<string, string> = {
  XXI: 'bg-rose-500',
  CGV: 'bg-amber-500',
  Cinepolis: 'bg-emerald-500',
};

const CHAIN_BOOKING: Record<string, string> = {
  XXI: 'https://21cineplex.com',
  CGV: 'https://www.cgv.id',
  Cinepolis: 'https://www.cinepolis.co.id',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CinemaPage() {
  const { t, locale } = useI18n();

  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [cinemaMovies, setCinemaMovies] = useState<CinemaMovie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMovies, setLoadingMovies] = useState(true);

  const [cityFilter, setCityFilter] = useState('Jakarta');
  const [chainFilter, setChainFilter] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCinema, setSelectedCinema] = useState<Cinema | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  /* Load cinemas from Supabase */
  useEffect(() => {
    async function loadCinemas() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('cinemas')
          .select('*')
          .order('city', { ascending: true })
          .order('name', { ascending: true });
        if (error) throw error;
        setCinemas((data || []) as Cinema[]);
      } catch (e) {
        console.error('Failed to load cinemas', e);
      }
      setLoading(false);
    }
    loadCinemas();
  }, []);

  /* Load cinema movies from Supabase */
  useEffect(() => {
    async function loadMovies() {
      setLoadingMovies(true);
      try {
        const { data, error } = await supabase
          .from('cinema_movies')
          .select('id, title, genre, duration, age_rating, format, source')
          .eq('show_date', new Date().toISOString().split('T')[0])
          .order('title');
        if (error) throw error;
        const unique = new Map<string, CinemaMovie>();
        for (const m of data || []) {
          if (!unique.has(m.title)) unique.set(m.title, m as CinemaMovie);
        }
        setCinemaMovies(Array.from(unique.values()));
      } catch (e) {
        console.error('Failed to load cinema movies', e);
      }
      setLoadingMovies(false);
    }
    loadMovies();
  }, []);

  /* Load now-playing posters from TMDB */
  useEffect(() => {
    async function loadNowPlaying() {
      try {
        const lang = locale === 'id' ? 'id' : 'en';
        const data = await fetchNowPlaying(lang, 'ID');
        setNowPlaying(
          (data.results || []).slice(0, 12).map((m: any) => ({
            id: m.id,
            title: m.title,
            poster_path: m.poster_path,
            vote_average: m.vote_average,
          }))
        );
      } catch {
        /* ignore */
      }
    }
    loadNowPlaying();
  }, [locale]);

  /* Derived data */
  const cities = useMemo(() => {
    const unique = Array.from(new Set(cinemas.map((c) => c.city)));
    return [locale === 'id' ? 'Semua' : 'All', ...unique.sort()];
  }, [cinemas, locale]);

  const chains = useMemo(
    () => [locale === 'id' ? 'Semua' : 'All', 'XXI', 'CGV', 'Cinepolis'],
    [locale]
  );

  const filtered = useMemo(() => {
    const allKey = locale === 'id' ? 'Semua' : 'All';
    return cinemas.filter((c) => {
      if (cityFilter !== allKey && c.city !== cityFilter) return false;
      if (chainFilter !== allKey && c.chain !== chainFilter) return false;
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [cinemas, cityFilter, chainFilter, searchQuery, locale]);

  /* Geolocation */
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (lat > -7.5 && lat < -5.9 && lng > 106.5 && lng < 107.2) setCityFilter('Jakarta');
        else if (lat > -7.1 && lat < -6.7) setCityFilter('Bandung');
        else if (lat > -7.4 && lat < -7.1 && lng > 112) setCityFilter('Surabaya');
        else setCityFilter(locale === 'id' ? 'Semua' : 'All');
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }, [locale]);

  /* Cinema count per city */
  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cinemas) {
      counts[c.city] = (counts[c.city] || 0) + 1;
    }
    return counts;
  }, [cinemas]);

  return (
    <div className="min-h-screen pt-6 pb-24 animate-fade-in">
      {/* Header */}
      <div className="px-4 lg:px-6 mb-6">
        <Badge className="mb-3 bg-emerald-600/20 text-emerald-300 border-emerald-500/30">
          <MapPin className="w-3 h-3 mr-1" />
          {locale === 'id' ? 'Bioskop Terdekat' : 'Nearest Cinema'}
        </Badge>
        <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
          {locale === 'id' ? 'Cari Bioskop & Jadwal Tayang' : 'Find Cinemas & Showtimes'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {locale === 'id'
            ? 'Temukan XXI, CGV, dan Cinépolis terdekat — plus film yang sedang tayang.'
            : 'Find the nearest XXI, CGV, and Cinépolis — plus currently showing movies.'}
        </p>
      </div>

      {/* Filters */}
      <div className="px-4 lg:px-6 mb-5 space-y-3">
        {/* Search + Locate */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={locale === 'id' ? 'Cari nama bioskop...' : 'Search cinema name...'}
              className="pl-9 h-9"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLocate}
            disabled={locating}
            className="gap-2 border border-white/10 hover:border-white/25"
          >
            {locating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {locale === 'id' ? 'Lokasi Saya' : 'My Location'}
            </span>
          </Button>
        </div>

        {/* City filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {cities.map((city) => (
            <button
              key={city}
              onClick={() => setCityFilter(city)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                cityFilter === city
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground'
              )}
            >
              {city}
              {cityCounts[city] ? ` (${cityCounts[city]})` : ''}
            </button>
          ))}
        </div>

        {/* Chain filter */}
        <div className="flex gap-2">
          {chains.map((chain) => (
            <button
              key={chain}
              onClick={() => setChainFilter(chain)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                chainFilter === chain
                  ? chain === (locale === 'id' ? 'Semua' : 'All')
                    ? 'bg-white/10 text-white border-white/30'
                    : CHAIN_COLORS[chain] || 'bg-white/10 text-white border-white/30'
                  : 'border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground'
              )}
            >
              {chain}
            </button>
          ))}
        </div>
      </div>

      {/* Main content: Cinema list */}
      <div className="px-4 lg:px-6 mb-8">
        <p className="text-xs text-muted-foreground mb-3">
          {filtered.length} {locale === 'id' ? 'bioskop ditemukan' : 'cinemas found'}
        </p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            {locale === 'id'
              ? 'Tidak ada bioskop untuk filter ini.'
              : 'No cinemas found for this filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((cinema) => (
              <div
                key={cinema.id}
                onClick={() =>
                  setSelectedCinema(selectedCinema?.id === cinema.id ? null : cinema)
                }
                className={cn(
                  'rounded-xl p-4 border transition-all cursor-pointer',
                  selectedCinema?.id === cinema.id
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn('w-2 h-2 rounded-full', CHAIN_DOT[cinema.chain] || 'bg-gray-500')} />
                      <Badge
                        className={cn(
                          'text-[10px] px-1.5 py-0 h-4',
                          CHAIN_COLORS[cinema.chain] || ''
                        )}
                      >
                        {cinema.chain}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{cinema.city}</span>
                    </div>
                    <p className="font-semibold text-sm text-foreground leading-tight truncate">
                      {cinema.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {cinema.address}
                    </p>
                  </div>
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>

                {selectedCinema?.id === cinema.id && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
                    <a
                      href={cinema.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                    >
                      <Navigation className="w-3 h-3 inline mr-1" />
                      {locale === 'id' ? 'Rute' : 'Route'}
                    </a>
                    <a
                      href={cinema.booking_url || CHAIN_BOOKING[cinema.chain]}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3 inline mr-1" />
                      {locale === 'id' ? 'Beli Tiket' : 'Buy Ticket'}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Now Playing in Cinemas */}
      <div className="px-4 lg:px-6 mb-8">
        <div className="flex items-center gap-2 mb-5">
          <Calendar className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-gradient">
            {locale === 'id' ? 'Sedang Tayang di Bioskop' : 'Now Playing in Cinemas'}
          </h2>
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 ml-1">
            <Clock className="w-3 h-3 mr-1" />
            {locale === 'id' ? 'Sekarang' : 'Now'}
          </Badge>
        </div>

        {/* Cinema movies from database */}
        {cinemaMovies.length > 0 && (
          <div className="mb-6">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
              {cinemaMovies.slice(0, 20).map((movie) => (
                <div
                  key={movie.id}
                  className="flex-shrink-0 w-[140px] glass rounded-xl p-3 hover-lift"
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Film className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground">{movie.format}</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 mb-1">
                    {movie.title}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {movie.age_rating && (
                      <Badge className="text-[8px] px-1 py-0 h-3.5 bg-rose-500/20 text-rose-300 border-rose-500/30">
                        {movie.age_rating}
                      </Badge>
                    )}
                    {movie.duration && (
                      <span className="text-[9px] text-muted-foreground">{movie.duration}</span>
                    )}
                  </div>
                  {movie.genre && (
                    <p className="text-[9px] text-muted-foreground mt-1 line-clamp-1">
                      {movie.genre}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Now playing posters from TMDB */}
        {loadingMovies ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          nowPlaying.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {nowPlaying.map((movie) => (
                <Link
                  key={movie.id}
                  href={`/movie/${movie.id}`}
                  className="group block"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-secondary mb-2">
                    {movie.poster_path ? (
                      <img
                        src={getPosterUrl(movie.poster_path, 'w342')}
                        alt={movie.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                    {movie.title}
                  </p>
                  {movie.vote_average > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 mt-0.5">
                      <Star className="w-2.5 h-2.5 fill-yellow-400" />
                      {movie.vote_average.toFixed(1)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )
        )}
      </div>

      {/* Data source attribution */}
      <div className="px-4 lg:px-6 text-center">
        <p className="text-[10px] text-muted-foreground/50">
          {locale === 'id'
            ? 'Data bioskop dari 21 Cineplex & CGV Indonesia. Jadwal dapat berubah sewaktu-waktu.'
            : 'Cinema data from 21 Cineplex & CGV Indonesia. Schedules may change without notice.'}
        </p>
      </div>
    </div>
  );
}
