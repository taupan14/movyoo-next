/**
 * GET /api/movies/[id]
 *
 * Query params:
 *   lang   — 'id' | 'en'  (default: 'en')
 *   region — e.g. 'ID', 'US'  (default: 'ID')
 *
 * Mengembalikan semua data yang dibutuhkan halaman movie detail:
 * - Data film (movies) lengkap dengan budget, revenue, release_date
 * - Genres (movie_genres → genres)
 * - Cast (movie_cast)
 * - Crew (movie_crew) — Sutradara, Produser, Penulis, Kamera, Suara, dll.
 * - Production companies (movie_companies → production_companies)
 * - Watch providers — Streaming & Sewa/Beli (movie_platforms → platforms)
 * - Cinema data — Bioskop yang sedang menayangkan film (cinema_movies → cinemas)
 * - Trailer key
 * - Similar movies — film dengan genre UTAMA yang sama dari DB, sort by popularity (limit 15)
 * - Recommendations — prioritas: cast serupa → companies sama → platforms sama (quota 12)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const revalidate = 300; // cache 5 menit

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const tmdbId = Number(params.id);
  if (Number.isNaN(tmdbId)) {
    return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const lang = searchParams.get("lang") ?? "en";
  const region = searchParams.get("region") ?? "ID";

  // ── 1. Fetch movie + genres ───────────────────────────────────────────────
  const { data: movieRaw, error: movieErr } = await supabase
    .from("movies")
    .select(
      `
      id, tmdb_id, title, original_title, overview, overview_en,
      tagline, vote_average, vote_count, popularity, status,
      original_language, poster_path, backdrop_path,
      release_date, runtime, budget, revenue, trailer_key,
      movie_genres ( genres ( id, name, slug ) )
    `,
    )
    .eq("tmdb_id", tmdbId)
    .single();

  if (movieErr || !movieRaw) {
    return NextResponse.json({ error: "Movie not found" }, { status: 404 });
  }

  const internalId = movieRaw.id;

  // Genre ids untuk query similar & recommendations
  const genreIds: number[] = (movieRaw.movie_genres ?? [])
    .map((mg: any) => mg.genres?.id)
    .filter(Boolean);

  // ── 2. Fetch semua data pendukung secara paralel ──────────────────────────
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const [
    castRes,
    crewRes,
    productionCompaniesRes,
    platformRes,
    cinemaRes,
    similarRes,
    companiesRes,
    platformsOfMovieRes,
  ] = await Promise.all([
    // Cast — 20 pemeran teratas
    supabase
      .from("movie_cast")
      .select("person_id, name, character, profile_path, order_index")
      .eq("movie_id", internalId)
      .order("order_index", { ascending: true })
      .limit(20),

    // Crew — semua kru film (Sutradara, Produser, Penulis, Kamera, dll.)
    supabase
      .from("movie_crew")
      .select("person_id, name, job, department, profile_path")
      .eq("movie_id", internalId),

    // Production companies — join movie_companies → production_companies
    supabase
      .from("movie_companies")
      .select(
        "production_companies ( id, tmdb_company_id, name, logo_path, origin_country )",
      )
      .eq("movie_id", internalId),

    // All platforms (streaming + rent + buy) — termasuk url & logo_path
    supabase
      .from("movie_platforms")
      .select(
        "type, region, platforms ( id, name, slug, logo_path, tmdb_provider_id, url )",
      )
      .eq("movie_id", internalId),

    // Cinema — cek apakah film sedang tayang hari ini atau lebih
    supabase
      .from("cinema_movies")
      .select(
        `
        id, show_date, show_times, format, movie_code,
        cinemas ( id, name, chain, city, address, booking_url, google_maps_url )
      `,
      )
      .eq("movie_id", internalId)
      .gte("show_date", today)
      .order("show_date", { ascending: true }),

    // Similar — film dengan genre UTAMA yang sama (genre_id pertama), sort by popularity
    // Menggunakan genre utama saja agar hasil lebih presisi & relevan
    genreIds.length > 0
      ? supabase
          .from("movie_genres")
          .select(
            `
            movie_id,
            movies (
              id, tmdb_id, title, poster_path, backdrop_path,
              vote_average, release_date, popularity
            )
          `,
          )
          .eq("genre_id", genreIds[0])
          .neq("movie_id", internalId)
          .limit(60)
      : Promise.resolve({ data: [], error: null }),

    // Companies milik film ini (untuk rekomendasi tier-2)
    supabase
      .from("movie_companies")
      .select("company_id")
      .eq("movie_id", internalId),

    // Platforms milik film ini (untuk rekomendasi tier-3)
    supabase
      .from("movie_platforms")
      .select("platform_id")
      .eq("movie_id", internalId),
  ]);

  // ── 3. Shape cast ─────────────────────────────────────────────────────────
  const cast = (castRes.data ?? []).map((c: any) => ({
    id: c.person_id,
    name: c.name,
    character: c.character,
    profile_path: c.profile_path,
    order: c.order_index,
  }));

  // ── 3b. Shape crew ────────────────────────────────────────────────────────
  //
  // Dikelompokkan per department; frontend bisa filter lebih lanjut.
  // Duplikasi person_id diizinkan (satu orang bisa punya banyak job).
  const crew = (crewRes.data ?? []).map((c: any) => ({
    id: c.person_id,
    name: c.name,
    job: c.job,
    department: c.department ?? "Other",
    profile_path: c.profile_path,
  }));

  // Shorthand derived dari crew — dimasukkan ke credits agar frontend
  // bisa langsung destructure tanpa filter ulang
  const directors = crew.filter((c) => c.job === "Director");
  const producers = crew.filter(
    (c) => c.job === "Producer" || c.job === "Executive Producer",
  );
  const writers = crew.filter(
    (c) =>
      c.job === "Screenplay" ||
      c.job === "Writer" ||
      c.job === "Story" ||
      c.department === "Writing",
  );

  // ── 3c. Shape production companies ───────────────────────────────────────
  const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/original";

  const productionCompanies = (productionCompaniesRes.data ?? [])
    .map((row: any) => row.production_companies)
    .filter(Boolean)
    .map((pc: any) => ({
      id: pc.id,
      name: pc.name,
      logo_path: pc.logo_path ?? null,
      // logo_url siap pakai untuk <img src> tanpa kalkulasi di frontend
      logo_url: pc.logo_path ? `${TMDB_IMG_BASE}${pc.logo_path}` : null,
      origin_country: pc.origin_country ?? "",
    }));

  // Person ids untuk rekomendasi (ambil 5 pemeran utama)
  const mainCastPersonIds: number[] = cast
    .slice(0, 5)
    .map((c: any) => c.id)
    .filter(Boolean);

  // Company ids untuk rekomendasi tier-2
  const companyIds: number[] = (companiesRes.data ?? [])
    .map((c: any) => c.company_id)
    .filter(Boolean);

  // Platform ids untuk rekomendasi tier-3
  const moviePlatformIds: number[] = (platformsOfMovieRes.data ?? [])
    .map((p: any) => p.platform_id)
    .filter(Boolean);

  // ── 4. Rekomendasi — tiered: cast → companies → platforms ────────────────
  //
  // Tier 1: cast serupa (5 pemeran utama)
  // Tier 2: companies sama — hanya dijalankan jika tier 1 < 12 hasil
  // Tier 3: platforms sama — hanya dijalankan jika tier 1+2 < 12 hasil
  //
  const QUOTA = 12;

  /** Deduplicate & sort rows dari relasi movie → film shape, return flat list */
  function shapeMovieRows(rows: any[]): any[] {
    return rows
      .map((r: any) => r.movies)
      .filter(Boolean)
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  }

  /** Merge arrays, deduplicate by movie internal id, exclude current film */
  function mergeUnique(existing: any[], incoming: any[]): any[] {
    const seen = new Set(existing.map((m) => m.id));
    seen.add(internalId); // selalu exclude film ini sendiri
    const merged = [...existing];
    for (const m of incoming) {
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
    }
    return merged;
  }

  function toRecShape(m: any) {
    return {
      id: m.tmdb_id,
      title: m.title,
      poster_path: m.poster_path,
      backdrop_path: m.backdrop_path,
      vote_average: Number(m.vote_average),
      release_date: m.release_date,
      popularity: Number(m.popularity),
    };
  }

  // — Tier 1: cast —
  let recMovies: any[] = [];

  if (mainCastPersonIds.length > 0) {
    const { data: castRecs } = await supabase
      .from("movie_cast")
      .select(
        `movie_id, movies ( id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, popularity )`,
      )
      .in("person_id", mainCastPersonIds)
      .neq("movie_id", internalId)
      .limit(80);

    recMovies = mergeUnique(recMovies, shapeMovieRows(castRecs ?? []));
  }

  // — Tier 2: companies (jika masih kurang dari quota) —
  if (recMovies.length < QUOTA && companyIds.length > 0) {
    const { data: companyRecs } = await supabase
      .from("movie_companies")
      .select(
        `movies ( id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, popularity )`,
      )
      .in("company_id", companyIds)
      .neq("movie_id", internalId)
      .limit(80);

    recMovies = mergeUnique(recMovies, shapeMovieRows(companyRecs ?? []));
  }

  // — Tier 3: platforms (jika masih kurang dari quota) —
  if (recMovies.length < QUOTA && moviePlatformIds.length > 0) {
    const { data: platformRecs } = await supabase
      .from("movie_platforms")
      .select(
        `movies ( id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, popularity )`,
      )
      .in("platform_id", moviePlatformIds)
      .neq("movie_id", internalId)
      .limit(80);

    recMovies = mergeUnique(recMovies, shapeMovieRows(platformRecs ?? []));
  }

  const recommendations = recMovies.slice(0, QUOTA).map(toRecShape);

  // ── 5. Shape watch providers — Streaming + Rent + Buy ────────────────────
  //
  // logo_url = https://image.tmdb.org/t/p/original + logo_path
  // url      = direct link ke platform (kolom url di tabel platforms)
  //
  // Digroup per-region; format TMDB-compatible dipertahankan.
  const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/original";

  const platformsByRegion: Record<
    string,
    { flatrate: any[]; rent: any[]; buy: any[] }
  > = {};

  for (const p of platformRes.data ?? []) {
    const r: string = (p as any).region ?? region;
    if (!platformsByRegion[r]) {
      platformsByRegion[r] = { flatrate: [], rent: [], buy: [] };
    }
    const pl = (p as any).platforms;
    if (!pl) continue;

    const entry = {
      provider_id: pl.tmdb_provider_id,
      provider_name: pl.name,
      logo_path: pl.logo_path,
      // URL lengkap logo agar frontend langsung bisa pakai <img src>
      logo_url: pl.logo_path ? `${TMDB_LOGO_BASE}${pl.logo_path}` : null,
      // Direct link ke halaman film di platform tersebut
      url: pl.url || null,
    };

    if ((p as any).type === "streaming")
      platformsByRegion[r].flatrate.push(entry);
    else if ((p as any).type === "rent") platformsByRegion[r].rent.push(entry);
    else if ((p as any).type === "buy") platformsByRegion[r].buy.push(entry);
  }

  // ── 6. Shape cinema data ──────────────────────────────────────────────────
  //
  // Kelompokkan berdasarkan chain (Cinema XXI, CGV, Cinépolis, dll.)
  // Setiap chain: daftar kota unik + booking_url + status tayang
  //
  const chainMap: Record<
    string,
    {
      chain: string;
      cities: Set<string>;
      booking_url: string;
      google_maps_url: string;
      earliest_date: string;
      latest_date: string;
      formats: Set<string>;
    }
  > = {};

  for (const cm of cinemaRes.data ?? []) {
    const cinema = (cm as any).cinemas;
    if (!cinema) continue;

    const chain: string = cinema.chain || cinema.name || "Unknown";
    const city: string = cinema.city || "";
    const showDate: string = (cm as any).show_date || today;
    const fmt: string = (cm as any).format || "2D";

    if (!chainMap[chain]) {
      chainMap[chain] = {
        chain,
        cities: new Set(),
        booking_url: cinema.booking_url || "",
        google_maps_url: cinema.google_maps_url || "",
        earliest_date: showDate,
        latest_date: showDate,
        formats: new Set(),
      };
    }

    if (city) chainMap[chain].cities.add(city);
    chainMap[chain].formats.add(fmt);

    // Track tanggal tayang terlama untuk badge "Segera Berakhir"
    if (showDate > chainMap[chain].latest_date) {
      chainMap[chain].latest_date = showDate;
    }
    if (showDate < chainMap[chain].earliest_date) {
      chainMap[chain].earliest_date = showDate;
    }
  }

  // Hitung status: jika latest_date <= 7 hari dari sekarang → "ending_soon"
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysStr = sevenDaysLater.toISOString().split("T")[0];

  const cinemas = Object.values(chainMap).map((c) => ({
    chain: c.chain,
    cities: Array.from(c.cities).sort(),
    booking_url: c.booking_url,
    google_maps_url: c.google_maps_url,
    formats: Array.from(c.formats),
    earliest_date: c.earliest_date,
    latest_date: c.latest_date,
    // "ending_soon" jika film akan berhenti tayang dalam 7 hari
    status: c.latest_date <= sevenDaysStr ? "ending_soon" : "now_playing",
  }));

  const isShowingInCinema = cinemas.length > 0;

  // ── 7. Deduplicate & sort similar ─────────────────────────────────────────
  //
  // Menggunakan genre utama (genreIds[0]) → hasil lebih presisi.
  // Sort by popularity descending, limit 15.
  //
  function deduplicateMovies(rows: any[], limit: number) {
    const seen = new Set<number>();
    const result: any[] = [];
    const sorted = [...rows].sort(
      (a, b) => (b.movies?.popularity ?? 0) - (a.movies?.popularity ?? 0),
    );
    for (const row of sorted) {
      const m = row.movies;
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      result.push({
        id: m.tmdb_id,
        title: m.title,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        vote_average: Number(m.vote_average),
        release_date: m.release_date,
        popularity: Number(m.popularity),
      });
      if (result.length >= limit) break;
    }
    return result;
  }

  const similar = deduplicateMovies(similarRes.data ?? [], 15);

  // ── 8. Shape genres ───────────────────────────────────────────────────────
  const genres = (movieRaw.movie_genres ?? [])
    .map((mg: any) => mg.genres)
    .filter(Boolean)
    .map((g: any) => ({ id: g.id, name: g.name }));

  // ── 9. Pick overview sesuai lang, dengan fallback ─────────────────────────
  const overview =
    lang === "id"
      ? movieRaw.overview || movieRaw.overview_en || ""
      : movieRaw.overview_en || movieRaw.overview || "";

  // ── 10. Assemble response ─────────────────────────────────────────────────
  const movie = {
    _internalId: internalId,
    id: movieRaw.tmdb_id,
    title: movieRaw.title,
    original_title: movieRaw.original_title,
    tagline: movieRaw.tagline,
    overview,
    poster_path: movieRaw.poster_path,
    backdrop_path: movieRaw.backdrop_path,
    vote_average: Number(movieRaw.vote_average),
    vote_count: movieRaw.vote_count,
    popularity: Number(movieRaw.popularity),
    runtime: movieRaw.runtime,
    release_date: movieRaw.release_date,
    budget: movieRaw.budget ?? 0,
    revenue: movieRaw.revenue ?? 0,
    status: movieRaw.status,
    trailer_key: movieRaw.trailer_key,
    genres,
    credits: {
      cast,
      // Seluruh crew — frontend filter per department/job
      crew,
      // Shorthand untuk Sinopsis card (sutradara, produser, penulis)
      directors,
      producers,
      writers,
    },
    // Production companies — untuk Rumah Produksi di card Sinopsis
    production_companies: productionCompanies,
    // Watch/providers — format TMDB-compatible, semua region tersedia
    "watch/providers": {
      results: platformsByRegion,
    },
    // Cinema — data real dari DB
    cinema: {
      is_showing: isShowingInCinema,
      chains: cinemas,
    },
    similar: { results: similar },
  };

  return NextResponse.json(
    { movie, recommendations },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
