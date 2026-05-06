import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY")!;

const auth = req.headers.get("Authorization");
const url = new URL(req.url);

if (url.pathname.includes("sync")) {
  const auth = req.headers.get("Authorization");

  if (auth !== `Bearer ${Deno.env.get("CRON_SECRET")}`) {
    return new Response("Unauthorized", { status: 401 });
  }
}

// 🔥 helper fetch
async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);

  Object.entries(params).forEach(([k, v]) => {
    url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
}

// 🔥 ambil provider mapping dari DB
async function getPlatformMap() {
  const { data } = await supabase.from("platforms").select("*");
  const map: Record<number, any> = {};
  data?.forEach((p) => {
    if (p.tmdb_provider_id) map[p.tmdb_provider_id] = p;
  });
  return map;
}

// 🔥 sync 1 movie full detail
async function syncMovie(movie: any, platformMap: any) {
  const tmdbId = movie.id;

  // detail
  const detail = await tmdbFetch(`/movie/${tmdbId}`, {
    language: "id-ID",
  });

  const videos = await tmdbFetch(`/movie/${tmdbId}/videos`);
  const credits = await tmdbFetch(`/movie/${tmdbId}/credits`);
  const providers = await tmdbFetch(`/movie/${tmdbId}/watch/providers`);

  // 🎬 ambil trailer
  const trailer = videos.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube",
  );

  // 🔥 UPSERT MOVIE
  const { data: movieRow } = await supabase
    .from("movies")
    .upsert(
      {
        tmdb_id: tmdbId,
        title: detail.title,
        original_title: detail.original_title,
        overview: detail.overview,
        tagline: detail.tagline,
        vote_average: detail.vote_average,
        vote_count: detail.vote_count,
        popularity: detail.popularity,
        status: detail.status,
        original_language: detail.original_language,
        poster_path: detail.poster_path,
        backdrop_path: detail.backdrop_path,
        release_date: detail.release_date,
        runtime: detail.runtime,
        budget: detail.budget,
        revenue: detail.revenue,
        trailer_key: trailer?.key || null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "tmdb_id" },
    )
    .select()
    .single();

  const movieId = movieRow.id;

  // 🔥 GENRES
  if (detail.genres?.length) {
    for (const g of detail.genres) {
      const { data: genreRow } = await supabase
        .from("genres")
        .upsert(
          {
            tmdb_genre_id: g.id,
            name: g.name,
            slug: g.name.toLowerCase().replace(/\s+/g, "-"),
          },
          { onConflict: "tmdb_genre_id" },
        )
        .select()
        .single();

      await supabase.from("movie_genres").upsert({
        movie_id: movieId,
        genre_id: genreRow.id,
      });
    }
  }

  // 🔥 PLATFORM (WATCH PROVIDERS)
  const region = "ID";
  const flatrate = providers.results?.[region]?.flatrate || [];

  for (const p of flatrate) {
    const platform = platformMap[p.provider_id];
    if (!platform) continue;

    await supabase.from("movie_platforms").upsert({
      movie_id: movieId,
      platform_id: platform.id,
      region,
      type: "streaming",
    });
  }

  // 🔥 CAST (top 10)
  const cast = credits.cast?.slice(0, 10) || [];

  for (const c of cast) {
    await supabase.from("movie_cast").upsert({
      movie_id: movieId,
      person_id: c.id,
      name: c.name,
      character: c.character,
      profile_path: c.profile_path,
      order_index: c.order,
    });
  }
}

// 🔥 MAIN SYNC
serve(async () => {
  const start = new Date();

  try {
    await supabase.from("sync_logs").insert({
      sync_type: "daily",
      status: "running",
    });

    const platformMap = await getPlatformMap();

    // 🔥 sumber data utama
    const sources = [
      "/trending/movie/day",
      "/movie/popular",
      "/movie/top_rated",
      "/movie/upcoming",
    ];

    let total = 0;

    for (const src of sources) {
      const data = await tmdbFetch(src);

      for (const movie of data.results.slice(0, 20)) {
        await syncMovie(movie, platformMap);
        total++;
      }
    }

    await supabase.from("sync_logs").insert({
      sync_type: "daily",
      status: "success",
      movies_processed: total,
      finished_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, total }));
  } catch (err) {
    await supabase.from("sync_logs").insert({
      sync_type: "daily",
      status: "error",
      error_message: err.message,
    });

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});
