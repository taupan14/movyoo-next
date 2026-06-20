// supabase/functions/generate-trivia-questions/index.ts
//
// Worker yang auto-generate soal trivia dari data film di DB.
// Dipanggil via GitHub Actions (manual atau terjadwal).
//
// Tipe soal yang di-generate:
//   1. higher_rating     — Film mana rating lebih tinggi? (easy)
//   2. more_popular      — Film mana lebih populer? (easy)
//   3. guess_synopsis    — Tebak film dari sinopsis (medium)
//   4. guess_director    — Siapa sutradara film X? (medium)
//   5. guess_cast        — Siapa pemeran utama film X? (medium)
//   6. guess_year        — Tahun berapa film X dirilis? (hard)
//   7. guess_genre       — Genre apa film X? (easy)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
function posterUrl(path: string | null): string | null {
  return path ? `${TMDB_IMG}${path}` : null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Generate: Higher Rating ──────────────────────────────────────────────────
async function generateHigherRating(movies: any[], count = 30) {
  const questions = [];
  const shuffled = shuffle(movies.filter((m) => m.vote_count > 500));

  for (let i = 0; i < Math.min(count, Math.floor(shuffled.length / 2)); i++) {
    const a = shuffled[i * 2];
    const b = shuffled[i * 2 + 1];
    if (!a || !b) break;

    const correct = a.vote_average >= b.vote_average ? "A" : "B";
    const wrong = correct === "A" ? "B" : "A";

    questions.push({
      type: "higher_rating",
      difficulty: "easy",
      category: "rating",
      question_text: `Film mana yang memiliki rating lebih tinggi?`,
      option_a: a.title ?? a.name,
      option_b: b.title ?? b.name,
      option_c: `Keduanya sama`,
      option_d: `Tidak ada yang tahu`,
      correct_option: correct,
      explanation: `${a.title ?? a.name} memiliki rating ${a.vote_average.toFixed(1)} sedangkan ${b.title ?? b.name} memiliki rating ${b.vote_average.toFixed(1)}.`,
      image_url: posterUrl(a.poster_path),
      movie_id: a.id,
      tmdb_id: a.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── Generate: More Popular ───────────────────────────────────────────────────
async function generateMorePopular(movies: any[], count = 20) {
  const questions = [];
  const shuffled = shuffle(movies.filter((m) => m.popularity > 10));

  for (let i = 0; i < Math.min(count, Math.floor(shuffled.length / 2)); i++) {
    const a = shuffled[i * 2];
    const b = shuffled[i * 2 + 1];
    if (!a || !b) break;

    const correct = (a.popularity ?? 0) >= (b.popularity ?? 0) ? "A" : "B";

    questions.push({
      type: "more_popular",
      difficulty: "easy",
      category: "popularity",
      question_text: `Film mana yang lebih populer?`,
      option_a: a.title ?? a.name,
      option_b: b.title ?? b.name,
      option_c: `Popularitas keduanya sama`,
      option_d: `Tidak bisa ditentukan`,
      correct_option: correct,
      explanation: `${a.title ?? a.name} memiliki skor popularitas ${Math.round(a.popularity ?? 0)} sedangkan ${b.title ?? b.name} memiliki skor ${Math.round(b.popularity ?? 0)}.`,
      image_url: posterUrl(a.poster_path),
      movie_id: a.id,
      tmdb_id: a.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── Generate: Guess from Synopsis ───────────────────────────────────────────
async function generateGuessSynopsis(movies: any[], count = 40) {
  const questions = [];
  const pool = shuffle(
    movies.filter((m) => (m.overview || m.overview_en) && m.poster_path),
  );

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const target = pool[i];
    const synopsis = (target.overview || target.overview_en || "").substring(
      0,
      150,
    );
    if (synopsis.length < 30) continue;

    // 3 pilihan salah dari film lain
    const others = shuffle(pool.filter((m) => m.id !== target.id)).slice(0, 3);
    if (others.length < 3) continue;

    const options = shuffle([target, ...others]);
    const correctIdx = options.findIndex((o) => o.id === target.id);
    const optionLabels = ["A", "B", "C", "D"] as const;

    questions.push({
      type: "guess_synopsis",
      difficulty: "medium",
      category: "synopsis",
      question_text: `Tebak film dari sinopsis berikut: "${synopsis}..."`,
      option_a: options[0].title ?? options[0].name,
      option_b: options[1].title ?? options[1].name,
      option_c: options[2].title ?? options[2].name,
      option_d: options[3].title ?? options[3].name,
      correct_option: optionLabels[correctIdx],
      explanation: `Film ini adalah "${target.title ?? target.name}" (${target.release_date?.substring(0, 4) ?? target.first_air_date?.substring(0, 4) ?? "?"}).`,
      image_url: posterUrl(target.poster_path),
      movie_id: target.id,
      tmdb_id: target.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── Generate: Guess Director ─────────────────────────────────────────────────
async function generateGuessDirector(count = 30) {
  // Ambil film beserta crew (director)
  const { data: crews } = await supabase
    .from("movie_crew")
    .select(
      `
      person_id,
      movies!inner ( id, tmdb_id, title, poster_path, release_date )
    `,
    )
    .eq("job", "Director")
    .limit(200);

  if (!crews?.length) return [];

  // Ambil nama person
  const personIds = [...new Set(crews.map((c: any) => c.person_id))];
  const { data: persons } = await supabase
    .from("persons")
    .select("id, name")
    .in("id", personIds.slice(0, 100));

  if (!persons?.length) return [];

  const personMap = new Map(persons.map((p: any) => [p.id, p.name]));
  const shuffled = shuffle(
    crews.filter((c: any) => personMap.has(c.person_id)),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const crew = shuffled[i];
    const movie = crew.movies;
    const directorName = personMap.get(crew.person_id);
    if (!directorName || !movie?.poster_path) continue;

    // 3 wrong directors
    const wrongNames = shuffle(
      persons.filter((p) => p.id !== crew.person_id).map((p) => p.name),
    ).slice(0, 3);
    if (wrongNames.length < 3) continue;

    const options = shuffle([directorName, ...wrongNames]);
    const correctIdx = options.indexOf(directorName);
    const optionLabels = ["A", "B", "C", "D"] as const;

    questions.push({
      type: "guess_director",
      difficulty: "medium",
      category: "director",
      question_text: `Siapa sutradara film "${movie.title}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: optionLabels[correctIdx],
      explanation: `"${movie.title}" disutradarai oleh ${directorName}.`,
      image_url: posterUrl(movie.poster_path),
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── Generate: Guess Cast ─────────────────────────────────────────────────────
async function generateGuessCast(count = 30) {
  const { data: casts } = await supabase
    .from("movie_cast")
    .select(
      `
      person_id,
      character_name,
      movies!inner ( id, tmdb_id, title, poster_path )
    `,
    )
    .eq("cast_order", 0) // pemeran utama
    .not("movies.poster_path", "is", null)
    .limit(200);

  if (!casts?.length) return [];

  const personIds = [...new Set(casts.map((c: any) => c.person_id))];
  const { data: persons } = await supabase
    .from("persons")
    .select("id, name")
    .in("id", personIds.slice(0, 100));

  if (!persons?.length) return [];

  const personMap = new Map(persons.map((p: any) => [p.id, p.name]));
  const shuffled = shuffle(
    casts.filter((c: any) => personMap.has(c.person_id)),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const cast = shuffled[i];
    const movie = cast.movies;
    const actorName = personMap.get(cast.person_id);
    if (!actorName || !movie?.poster_path) continue;

    const wrongNames = shuffle(
      persons.filter((p) => p.id !== cast.person_id).map((p) => p.name),
    ).slice(0, 3);
    if (wrongNames.length < 3) continue;

    const options = shuffle([actorName, ...wrongNames]);
    const correctIdx = options.indexOf(actorName);
    const optionLabels = ["A", "B", "C", "D"] as const;

    questions.push({
      type: "guess_cast",
      difficulty: "medium",
      category: "actor",
      question_text: `Siapa pemeran utama dalam film "${movie.title}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: optionLabels[correctIdx],
      explanation: `Pemeran utama "${movie.title}" adalah ${actorName} yang memerankan karakter ${cast.character_name ?? "utama"}.`,
      image_url: posterUrl(movie.poster_path),
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── Generate: Guess Year ─────────────────────────────────────────────────────
async function generateGuessYear(movies: any[], count = 25) {
  const pool = shuffle(movies.filter((m) => m.release_date && m.poster_path));
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const movie = pool[i];
    const year = parseInt(movie.release_date.substring(0, 4));
    if (isNaN(year)) continue;

    // Generate 3 wrong years (±1–5 tahun)
    const offsets = shuffle([-4, -3, -2, -1, 1, 2, 3, 4]).slice(0, 3);
    const wrongYears = offsets.map((o) => String(year + o));
    const options = shuffle([String(year), ...wrongYears]);
    const correctIdx = options.indexOf(String(year));
    const optionLabels = ["A", "B", "C", "D"] as const;

    questions.push({
      type: "guess_year",
      difficulty: "hard",
      category: "general",
      question_text: `Tahun berapa film "${movie.title}" dirilis?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: optionLabels[correctIdx],
      explanation: `"${movie.title}" pertama kali dirilis pada tahun ${year}.`,
      image_url: posterUrl(movie.poster_path),
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    console.log("[generate-trivia-questions] Starting...");

    // Ambil semua movies dari DB (sudah ada)
    const { data: movies, error: moviesErr } = await supabase
      .from("movies")
      .select(
        "id, tmdb_id, title, poster_path, vote_average, vote_count, popularity, overview, overview_en, release_date",
      )
      .eq("status", "Released")
      .gt("vote_count", 100)
      .order("popularity", { ascending: false })
      .limit(500);

    if (moviesErr) throw new Error(`fetch movies: ${moviesErr.message}`);

    // Generate semua tipe soal
    const [ratingQs, popularQs, synopsisQs, directorQs, castQs, yearQs] =
      await Promise.all([
        generateHigherRating(movies ?? [], 40),
        generateMorePopular(movies ?? [], 25),
        generateGuessSynopsis(movies ?? [], 50),
        generateGuessDirector(35),
        generateGuessCast(35),
        generateGuessYear(movies ?? [], 30),
      ]);

    const allQuestions = [
      ...ratingQs,
      ...popularQs,
      ...synopsisQs,
      ...directorQs,
      ...castQs,
      ...yearQs,
    ];

    console.log(
      `[generate-trivia-questions] Generated ${allQuestions.length} questions total`,
    );

    // Hapus soal auto-gen lama sebelum insert baru
    // (manual questions tetap aman karena is_manual = true)
    const { error: deleteErr } = await supabase
      .from("questions")
      .delete()
      .eq("is_manual", false);

    if (deleteErr)
      throw new Error(`delete old questions: ${deleteErr.message}`);

    // Batch insert
    const BATCH_SIZE = 50;
    let inserted = 0;

    for (let i = 0; i < allQuestions.length; i += BATCH_SIZE) {
      const batch = allQuestions.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase
        .from("questions")
        .insert(batch);

      if (insertErr) {
        console.error(
          `[generate-trivia-questions] Batch ${i} error:`,
          insertErr.message,
        );
        continue;
      }
      inserted += batch.length;
    }

    console.log(`[generate-trivia-questions] Inserted ${inserted} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        generated: allQuestions.length,
        inserted,
        breakdown: {
          higher_rating: ratingQs.length,
          more_popular: popularQs.length,
          guess_synopsis: synopsisQs.length,
          guess_director: directorQs.length,
          guess_cast: castQs.length,
          guess_year: yearQs.length,
        },
        run_at: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-trivia-questions] Error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
