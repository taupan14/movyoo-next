import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-TMDB-Key",
};

const TMDB_BASE = "https://api.themoviedb.org/3";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const MOOD_GENRE_MAP: Record<string, number[]> = {
  ketawa: [16, 35, 10751, 10402],
  tegang: [27, 53, 9648, 80],
  nangis: [18, 10749, 36],
  santai: [16, 35, 10751, 10402, 37],
  mikir: [878, 99, 36, 9648],
  berat: [18, 36, 10752, 80],
  laugh: [16, 35, 10751, 10402],
  thrill: [27, 53, 9648, 80],
  cry: [18, 10749, 36],
  chill: [16, 35, 10751, 10402, 37],
  think: [878, 99, 36, 9648],
  heavy: [18, 36, 10752, 80],
};

function getTmdbKey(req: Request): string {
  const fromHeader = req.headers.get("X-TMDB-Key");
  if (fromHeader) return fromHeader;
  return Deno.env.get("TMDB_API_KEY") || "";
}

async function tmdbFetch(
  path: string,
  apiKey: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

async function cacheMoviesToSupabase(
  movies: any[],
  region: string,
  supabase: any,
  apiKey: string,
) {
  for (const movie of movies) {
    if (!movie.id) continue;
    const { data: existing } = await supabase
      .from("cached_movies")
      .select("id")
      .eq("tmdb_id", movie.id)
      .maybeSingle();

    if (existing) continue;

    let detail = movie;
    try {
      detail = await tmdbFetch(`/movie/${movie.id}`, apiKey, {
        language: "en-US",
      });
    } catch {
      detail = movie;
    }

    let detailID = null;
    try {
      detailID = await tmdbFetch(`/movie/${movie.id}`, apiKey, {
        language: "id-ID",
      });
    } catch {
      /* ignore */
    }

    let watchProviders: any = [];
    try {
      const wp = await tmdbFetch(`/movie/${movie.id}/watch/providers`, apiKey);
      watchProviders =
        wp.results?.[region]?.flatrate || wp.results?.["US"]?.flatrate || [];
    } catch {
      /* ignore */
    }

    const genreIds =
      movie.genre_ids || detail.genres?.map((g: any) => g.id) || [];
    const moodTags = inferMoodTags(genreIds);
    const pace = inferPace(genreIds, detail.runtime);

    await supabase.from("cached_movies").upsert(
      {
        tmdb_id: movie.id,
        title: detail.title || movie.title || "",
        original_title: detail.original_title || "",
        overview: detail.overview || movie.overview || "",
        overview_id: detailID?.overview || "",
        poster_path: detail.poster_path || movie.poster_path || "",
        backdrop_path: detail.backdrop_path || movie.backdrop_path || "",
        release_date: detail.release_date || movie.release_date || null,
        runtime: detail.runtime || null,
        vote_average: detail.vote_average || movie.vote_average || 0,
        vote_count: detail.vote_count || movie.vote_count || 0,
        popularity: detail.popularity || movie.popularity || 0,
        genres: detail.genres || [],
        genre_ids: genreIds,
        adult: detail.adult || false,
        original_language: detail.original_language || "",
        production_countries: detail.production_countries || [],
        status: detail.status || "",
        tagline: detail.tagline || "",
        worth_it: inferWorthIt(detail.vote_average, detail.popularity),
        mood_tags: moodTags,
        pace: pace,
        platforms: watchProviders.map((p: any) => ({
          name: p.provider_name,
          logo: p.logo_path,
          type: "ott",
        })),
        cached_at: new Date().toISOString(),
      },
      { onConflict: "tmdb_id" },
    );
  }
}

function inferMoodTags(genreIds: number[]): string[] {
  const tags: string[] = [];
  for (const [mood, ids] of Object.entries(MOOD_GENRE_MAP)) {
    if (mood.length > 6) continue; // skip English keys
    if (genreIds.some((g: number) => ids.includes(g))) {
      tags.push(mood);
    }
  }
  return tags;
}

function inferPace(genreIds: number[], runtime: number | null): string {
  if (runtime && runtime > 150) return "slow";
  if (genreIds.includes(28) || genreIds.includes(53)) return "fast";
  if (genreIds.includes(18) || genreIds.includes(36)) return "slow";
  return "medium";
}

function inferWorthIt(voteAvg: number, popularity: number): string {
  if (voteAvg >= 7.5 && popularity > 50) return "yes";
  if (voteAvg >= 6.5) return "fan";
  return "skip";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = getTmdbKey(req);
    if (!TMDB_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "TMDB API key not provided. Set TMDB_API_KEY env var or pass X-TMDB-Key header.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const url = new URL(req.url);
    const path = url.pathname.replace("/tmdb", "") || "/";
    const region = url.searchParams.get("region") || "ID";
    const language = url.searchParams.get("language") || "id";
    const langParam = language === "id" ? "id-ID" : "en-US";

    // Route: /trending
    if (path === "/trending") {
      const window = url.searchParams.get("window") || "week";
      const data = await tmdbFetch(`/trending/movie/${window}`, TMDB_API_KEY, {
        language: langParam,
        region,
      });
      // Fetch alternate language overview for top 5 hero movies
      const altLang = language === "id" ? "en-US" : "id-ID";
      const top5 = data.results?.slice(0, 5) || [];
      for (const movie of top5) {
        try {
          const alt = await tmdbFetch(
            `/trending/movie/${window}`,
            TMDB_API_KEY,
            { language: altLang, region },
          );
          const altMovie = alt.results?.find((m: any) => m.id === movie.id);
          if (altMovie?.overview) {
            movie.overview_alt = altMovie.overview;
          }
        } catch {
          /* ignore */
        }
        break; // Only need one alt-language fetch since TMDB returns all movies
      }
      // Actually fetch alt language list once and map overviews
      try {
        const altData = await tmdbFetch(
          `/trending/movie/${window}`,
          TMDB_API_KEY,
          { language: altLang, region },
        );
        for (const movie of top5) {
          const altMovie = altData.results?.find((m: any) => m.id === movie.id);
          if (altMovie?.overview) {
            movie.overview_alt = altMovie.overview;
          }
        }
      } catch {
        /* ignore */
      }
      await cacheMoviesToSupabase(
        data.results?.slice(0, 20) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /now-playing
    if (path === "/now-playing") {
      const data = await tmdbFetch("/movie/now_playing", TMDB_API_KEY, {
        language: langParam,
        region,
      });
      await cacheMoviesToSupabase(
        data.results?.slice(0, 20) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /upcoming
    if (path === "/upcoming") {
      const data = await tmdbFetch("/movie/upcoming", TMDB_API_KEY, {
        language: langParam,
        region,
      });
      await cacheMoviesToSupabase(
        data.results?.slice(0, 20) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /popular
    if (path === "/popular") {
      const data = await tmdbFetch("/movie/popular", TMDB_API_KEY, {
        language: langParam,
        region,
      });
      await cacheMoviesToSupabase(
        data.results?.slice(0, 20) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /top-rated
    if (path === "/top-rated") {
      const data = await tmdbFetch("/movie/top_rated", TMDB_API_KEY, {
        language: langParam,
        region,
      });
      await cacheMoviesToSupabase(
        data.results?.slice(0, 20) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /movie/:id
    const movieMatch = path.match(/^\/movie\/(\d+)$/);
    if (movieMatch) {
      const tmdbId = movieMatch[1];
      const data = await tmdbFetch(`/movie/${tmdbId}`, TMDB_API_KEY, {
        language: langParam,
      });
      let dataID = null;
      try {
        dataID = await tmdbFetch(`/movie/${tmdbId}`, TMDB_API_KEY, {
          language: "id-ID",
        });
      } catch {
        /* ignore */
      }

      let watchProviders: any = {};
      try {
        watchProviders = await tmdbFetch(
          `/movie/${tmdbId}/watch/providers`,
          TMDB_API_KEY,
        );
      } catch {
        /* ignore */
      }

      let credits: any = {};
      try {
        credits = await tmdbFetch(`/movie/${tmdbId}/credits`, TMDB_API_KEY);
      } catch {
        /* ignore */
      }

      let similar: any = {};
      try {
        similar = await tmdbFetch(`/movie/${tmdbId}/similar`, TMDB_API_KEY, {
          language: langParam,
        });
      } catch {
        /* ignore */
      }

      const regionProviders =
        watchProviders.results?.[region] ||
        watchProviders.results?.["US"] ||
        {};

      const result = {
        ...data,
        overview_id: dataID?.overview || "",
        title_id: dataID?.title || "",
        watch_providers: regionProviders,
        credits: credits,
        similar: similar.results?.slice(0, 10) || [],
      };

      await cacheMoviesToSupabase([data], region, supabase, TMDB_API_KEY);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /search
    if (path === "/search") {
      const query = url.searchParams.get("query") || "";
      if (!query) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await tmdbFetch("/search/movie", TMDB_API_KEY, {
        language: langParam,
        query,
        region,
      });
      await cacheMoviesToSupabase(
        data.results?.slice(0, 10) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /mood
    if (path === "/mood") {
      const mood = url.searchParams.get("mood") || "santai";
      const moodMap = MOOD_GENRE_MAP;
      const genreIds = moodMap[mood] || MOOD_GENRE_MAP.santai;
      const genreStr = genreIds.join(",");
      const data = await tmdbFetch("/discover/movie", TMDB_API_KEY, {
        language: langParam,
        with_genres: genreStr,
        sort_by: "popularity.desc",
        region,
        "vote_count.gte": "100",
      });
      await cacheMoviesToSupabase(
        data.results?.slice(0, 20) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /recommendations
    if (path === "/recommendations") {
      const movieId = url.searchParams.get("movie_id") || "";
      if (!movieId) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await tmdbFetch(
        `/movie/${movieId}/recommendations`,
        TMDB_API_KEY,
        { language: langParam },
      );
      await cacheMoviesToSupabase(
        data.results?.slice(0, 10) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /trending-platform
    if (path === "/trending-platform") {
      const platform = url.searchParams.get("platform") || "netflix";
      const providerMap: Record<string, number> = {
        netflix: 8,
        "disney+": 337,
        "disney-hotstar": 122,
        "amazon-prime": 9,
        hbo: 384,
        "hbo-go": 31,
        "apple-tv": 350,
        vidio: 489,
        catchplay: 576,
      };
      const providerId = providerMap[platform] || 8;
      const data = await tmdbFetch("/discover/movie", TMDB_API_KEY, {
        language: langParam,
        with_watch_providers: providerId.toString(),
        watch_region: region,
        sort_by: "popularity.desc",
      });
      await cacheMoviesToSupabase(
        data.results?.slice(0, 20) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify({ ...data, platform }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /watch-providers (list all providers for region)
    if (path === "/watch-providers") {
      const data = await tmdbFetch("/watch/providers/movie", TMDB_API_KEY, {
        language: langParam,
        watch_region: region,
      });
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /genres
    if (path === "/genres") {
      const data = await tmdbFetch("/genre/movie/list", TMDB_API_KEY, {
        language: langParam,
      });
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: /discover (generic discover with all params passed through)
    if (path === "/discover") {
      const discoverParams: Record<string, string> = { language: langParam };
      for (const [k, v] of url.searchParams.entries()) {
        if (k !== "language" && k !== "region") {
          discoverParams[k] = v;
        }
      }
      if (!discoverParams.sort_by) discoverParams.sort_by = "popularity.desc";
      const data = await tmdbFetch(
        "/discover/movie",
        TMDB_API_KEY,
        discoverParams,
      );
      await cacheMoviesToSupabase(
        data.results?.slice(0, 20) || [],
        region,
        supabase,
        TMDB_API_KEY,
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Route not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
