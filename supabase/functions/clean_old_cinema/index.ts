import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Cleanup Logic ───────────────────────────────────────────────────────────

async function cleanupOldData(): Promise<{
  showtimes: number;
  cinema_movies: number;
}> {
  // Cutoff = 7 days ago from now (based on created_at ascending)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffISO = cutoff.toISOString();

  // ── 1. Delete showtimes older than 7 days ────────────────────────────────
  // showtimes has cascade from cinema_movies, but we delete explicitly
  // to get an accurate count and avoid relying solely on cascade behavior.
  const { data: deletedShowtimes, error: showtimesError } = await supabase
    .from("showtimes")
    .delete()
    .lt("created_at", cutoffISO)
    .select("id");

  if (showtimesError) {
    throw new Error(`delete showtimes: ${showtimesError.message}`);
  }

  // ── 2. Delete cinema_movies older than 7 days ────────────────────────────
  // Deleting cinema_movies will also cascade-delete any remaining showtimes
  // linked to them (via FK cinema_movie_id ON DELETE CASCADE).
  const { data: deletedCinemaMovies, error: cinemaMoviesError } = await supabase
    .from("cinema_movies")
    .delete()
    .lt("created_at", cutoffISO)
    .select("id");

  if (cinemaMoviesError) {
    throw new Error(`delete cinema_movies: ${cinemaMoviesError.message}`);
  }

  return {
    showtimes: deletedShowtimes?.length ?? 0,
    cinema_movies: deletedCinemaMovies?.length ?? 0,
  };
}

// ─── Edge Function Handler ───────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Accept POST or GET (for cron-triggered invocations via Supabase scheduler)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await cleanupOldData();

    console.log(
      `[cleanup-old-data] Deleted ${result.showtimes} showtimes, ` +
        `${result.cinema_movies} cinema_movies`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Cleanup completed",
        deleted: result,
        cutoff: (() => {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          return d.toISOString();
        })(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cleanup-old-data] Error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
