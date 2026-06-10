import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Init Supabase client (service role untuk bypass RLS) ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Ambil tmdb_id dari request body atau query param ---
    let tmdb_id: number | null = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      tmdb_id = body?.tmdb_id ?? null;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      const param = url.searchParams.get("tmdb_id");
      tmdb_id = param ? parseInt(param, 10) : null;
    }

    if (!tmdb_id || isNaN(Number(tmdb_id))) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Parameter tmdb_id wajib diisi dan harus berupa angka.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // =========================================================
    // STEP 1 & 2: SELECT ke tabel movies berdasarkan tmdb_id
    //             Ambil id, title, original_title
    // =========================================================
    const { data: movie, error: movieError } = await supabase
      .from("movies")
      .select("id, title, original_title")
      .eq("tmdb_id", tmdb_id)
      .maybeSingle();

    if (movieError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Gagal query tabel movies: ${movieError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!movie) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Movie dengan tmdb_id ${tmdb_id} tidak ditemukan di tabel movies.`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { id: movie_id, title, original_title } = movie;

    // =========================================================
    // STEP 3: SELECT ke cinema_movies berdasarkan title ATAU
    //         original_title, non-case-sensitive (ilike)
    // =========================================================

    // Bangun filter: title match title ATAU original_title
    // Gunakan ilike untuk case-insensitive matching
    let cinemaQuery = supabase
      .from("cinema_movies")
      .select("id, title, movie_id")
      .ilike("title", title); // match dengan title dulu

    // Jika original_title tersedia, sertakan juga sebagai OR condition
    // Supabase mendukung filter OR via .or()
    if (original_title && original_title.trim() !== "") {
      cinemaQuery = supabase
        .from("cinema_movies")
        .select("id, title, movie_id")
        .or(`title.ilike.${title},title.ilike.${original_title}`);
    }

    const { data: cinemaMovies, error: cinemaError } = await cinemaQuery;

    if (cinemaError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Gagal query tabel cinema_movies: ${cinemaError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Tidak ada data cinema_movies yang cocok
    if (!cinemaMovies || cinemaMovies.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Movie ditemukan (id: ${movie_id}, title: "${title}"), namun tidak ada data di cinema_movies yang cocok. Tidak ada yang diupdate.`,
          movie: { id: movie_id, title, original_title },
          updated_count: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // =========================================================
    // STEP 4: Update field movie_id di cinema_movies
    //         Hanya update row yang movie_id-nya belum diset
    //         atau berbeda dengan movie_id yang baru
    // =========================================================
    const idsToUpdate = cinemaMovies
      .filter((cm) => cm.movie_id !== movie_id)
      .map((cm) => cm.id);

    let updatedRows: { id: string; title: string }[] = [];

    if (idsToUpdate.length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from("cinema_movies")
        .update({ movie_id })
        .in("id", idsToUpdate)
        .select("id, title");

      if (updateError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Gagal update cinema_movies: ${updateError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      updatedRows = updated ?? [];
    }

    const alreadySynced = cinemaMovies
      .filter((cm) => cm.movie_id === movie_id)
      .map((cm) => ({ id: cm.id, title: cm.title }));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sinkronisasi selesai untuk tmdb_id ${tmdb_id}.`,
        movie: { id: movie_id, title, original_title },
        updated_count: updatedRows.length,
        updated_rows: updatedRows,
        already_synced_count: alreadySynced.length,
        already_synced_rows: alreadySynced,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
