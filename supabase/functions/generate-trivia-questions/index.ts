// supabase/functions/generate-trivia-questions/index.ts
//
// Worker yang auto-generate ~1000 soal trivia dari data film di DB.
// Dipanggil via GitHub Actions (manual atau terjadwal).
//
// ─── Target Pool Harian ───────────────────────────────────────────────────────
//   ~1000 soal = 250 soal base × 4 variasi (phrasing + tipe baru)
//
// ─── Tipe Soal (27 tipe) ─────────────────────────────────────────────────────
//   EXISTING (+ variant):
//   1.  higher_rating           — Film mana rating lebih tinggi? (easy)
//   2.  more_popular            — Film mana lebih populer? (easy)
//   3.  guess_synopsis          — Tebak film dari sinopsis (medium)
//   4.  guess_director          — Siapa sutradara film X? (medium)
//   5.  guess_cast              — Siapa pemeran utama film X? (medium)
//   6.  guess_year              — Tahun berapa film X dirilis? (hard)
//   7.  guess_genre             — Genre apa film X? (easy)
//   8.  guess_genre_combo       — Kombinasi genre film X? (medium)
//   9.  guess_franchise         — Film X bagian dari franchise apa? (easy)
//   10. guess_franchise_order   — Urutan film X dalam franchise? (hard)
//   11. guess_tv_series         — Tebak series dari sinopsis (medium)
//   12. guess_tv_rating         — Series mana rating lebih tinggi? (easy)
//   13. guess_award_film        — Film mana yang menang penghargaan X? (hard)
//   14. guess_release_order     — Film mana yang paling awal rilis? (hard)
//   15. guess_character         — Karakter X dari film mana? (medium)
//   16. guess_villain           — Siapa pemeran karakter X? (medium)
//   BARU:
//   17. guess_tagline           — Tebak film dari tagline (medium)
//   18. guess_runtime_longer    — Film mana durasinya lebih panjang? (easy)
//   19. guess_language          — Film X berbahasa apa? (medium)
//   20. guess_higher_revenue    — Film mana pendapatannya lebih tinggi? (easy)
//   21. guess_higher_budget     — Film mana anggarannya lebih besar? (medium)
//   22. guess_tv_seasons        — Serial X punya berapa season? (medium)
//   23. guess_tv_more_seasons   — Serial mana yang punya lebih banyak season? (easy)
//   24. guess_festival          — Film X ditayangkan di festival mana? (hard)
//   25. guess_oscar_contender   — Film mana yang kandidat Oscar? (medium)
//   26. guess_world_premiere    — Di mana film X world premiere? (hard)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function movieTitle(m: any): string {
  return m.title ?? m.name ?? "Unknown";
}

function releaseYear(m: any): string | null {
  const d = m.release_date ?? m.first_air_date;
  return d ? d.substring(0, 4) : null;
}

const OPTION_LABELS = ["A", "B", "C", "D"] as const;
type OptionLabel = (typeof OPTION_LABELS)[number];

function buildOptions(
  correct: string,
  wrong: string[],
): {
  options: string[];
  correctLabel: OptionLabel;
} {
  const all = shuffle([correct, ...wrong.slice(0, 3)]);
  const idx = all.indexOf(correct);
  return { options: all, correctLabel: OPTION_LABELS[idx] };
}

// ─── Option Image Helpers ─────────────────────────────────────────────────────
// Dipakai untuk tipe soal yang opsinya berupa judul film/series, agar tiap
// pilihan jawaban bisa dilengkapi poster masing-masing (bukan satu gambar
// besar di atas soal). Tipe soal yang opsinya angka/nama orang/teks filler
// sengaja TIDAK diberi gambar (option_x_image = null).

// Bangun map "judul → poster url" dari daftar item (film/series) yang
// datanya sudah lengkap, supaya opsi salah (wrong options) yang cuma berupa
// string judul tetap bisa dicocokkan ke poster aslinya.
function imageMapFromItems<T>(
  items: T[],
  titleFn: (item: T) => string | null | undefined,
  posterPathFn: (item: T) => string | null | undefined,
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const item of items) {
    const title = titleFn(item);
    if (!title || map.has(title)) continue;
    map.set(title, posterUrl(posterPathFn(item) ?? null));
  }
  return map;
}

// Cocokkan array teks opsi (hasil shuffle dari buildOptions) ke gambar
// menggunakan map judul → poster. Opsi yang tidak ada di map akan null.
function mapOptionImages(
  options: string[],
  imageMap: Map<string, string | null>,
): (string | null)[] {
  return options.map((text) => imageMap.get(text) ?? null);
}

// ─── CATEGORY: GENERAL MOVIE TRIVIA (50 soal) ────────────────────────────────
// higher_rating: 20 easy | more_popular: 15 easy | guess_synopsis: 15 medium

async function generateHigherRating(movies: any[], count = 20) {
  const questions = [];
  const pool = shuffle(movies.filter((m) => m.vote_count > 500));

  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort((x, y) => y.vote_average - x.vote_average);
    const best = sorted[0];
    if (sorted[1] && best.vote_average === sorted[1].vote_average) continue; // hindari seri/tie
    const correctIdx = group.findIndex((m) => m.id === best.id);

    questions.push({
      type: "higher_rating",
      difficulty: "easy",
      category: "rating",
      question_text: `Dari 4 film berikut, mana yang memiliki rating tertinggi?`,
      option_a: movieTitle(group[0]),
      option_b: movieTitle(group[1]),
      option_c: movieTitle(group[2]),
      option_d: movieTitle(group[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${movieTitle(best)}" memiliki rating tertinggi yaitu ${best.vote_average.toFixed(1)}.`,
      image_url: posterUrl(best.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: best.id,
      tmdb_id: best.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateMorePopular(movies: any[], count = 15) {
  const questions = [];
  const pool = shuffle(movies.filter((m) => m.popularity > 10));

  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort(
      (x, y) => (y.popularity ?? 0) - (x.popularity ?? 0),
    );
    const best = sorted[0];
    if (sorted[1] && best.popularity === sorted[1].popularity) continue;
    const correctIdx = group.findIndex((m) => m.id === best.id);

    questions.push({
      type: "more_popular",
      difficulty: "easy",
      category: "popularity",
      question_text: `Dari 4 film berikut, mana yang paling populer saat ini?`,
      option_a: movieTitle(group[0]),
      option_b: movieTitle(group[1]),
      option_c: movieTitle(group[2]),
      option_d: movieTitle(group[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${movieTitle(best)}" memiliki skor popularitas tertinggi yaitu ${Math.round(best.popularity ?? 0)}.`,
      image_url: posterUrl(best.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: best.id,
      tmdb_id: best.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateGuessSynopsis(movies: any[], count = 15) {
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

    const others = shuffle(pool.filter((m) => m.id !== target.id)).slice(0, 3);
    if (others.length < 3) continue;

    const all = shuffle([target, ...others]);
    const correctIdx = all.findIndex((o) => o.id === target.id);

    questions.push({
      type: "guess_synopsis",
      difficulty: "medium",
      category: "synopsis",
      question_text: `Tebak film dari sinopsis berikut: "${synopsis}..."`,
      option_a: movieTitle(all[0]),
      option_b: movieTitle(all[1]),
      option_c: movieTitle(all[2]),
      option_d: movieTitle(all[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `Film ini adalah "${movieTitle(target)}" (${releaseYear(target) ?? "?"}).`,
      image_url: posterUrl(target.poster_path),
      option_a_image: posterUrl(all[0].poster_path),
      option_b_image: posterUrl(all[1].poster_path),
      option_c_image: posterUrl(all[2].poster_path),
      option_d_image: posterUrl(all[3].poster_path),
      movie_id: target.id,
      tmdb_id: target.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── CATEGORY: DIRECTOR (30 soal) ────────────────────────────────────────────
// guess_director: 30 medium

async function generateGuessDirector(count = 30) {
  // movie_crew tidak punya FK ke movies, jadi 2 query terpisah
  const { data: crews } = await supabase
    .from("movie_crew")
    .select("movie_id, name, profile_path")
    .eq("job", "Director")
    .not("name", "is", null)
    .limit(400);

  if (!crews?.length) return [];

  // Ambil movie_id unik lalu fetch detail movies
  const movieIds = [...new Set(crews.map((c: any) => c.movie_id))];
  const { data: moviesData } = await supabase
    .from("movies")
    .select("id, tmdb_id, title, poster_path")
    .in("id", movieIds)
    .not("poster_path", "is", null);

  if (!moviesData?.length) return [];

  const movieMap = new Map(moviesData.map((m: any) => [m.id, m]));

  // Gabungkan crew + movie, filter yang movienya ada poster
  const combined = crews
    .map((c: any) => ({
      name: c.name,
      profile_path: c.profile_path,
      movie: movieMap.get(c.movie_id),
    }))
    .filter((c) => c.movie && c.name);

  const allDirectorNames = [
    ...new Set(combined.map((c) => c.name).filter(Boolean)),
  ] as string[];
  if (allDirectorNames.length < 4) return [];

  // Map nama → foto profil (hanya nama yang punya foto)
  const nameToProfile = new Map<string, string>();
  for (const c of combined) {
    if (c.name && c.profile_path && !nameToProfile.has(c.name)) {
      nameToProfile.set(c.name, posterUrl(c.profile_path)!);
    }
  }
  const namesWithPhoto = [...nameToProfile.keys()];

  const pool = shuffle(combined);
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const { name: directorName, movie } = pool[i];
    if (!directorName || !movie) continue;

    // Konsistensi gambar: kalau nama benar punya foto, semua opsi salah
    // juga harus diambil dari nama yang punya foto (biar seragam). Kalau
    // tidak punya foto, semua opsi jadi teks biasa (tanpa gambar).
    const hasPhoto = nameToProfile.has(directorName);
    const candidatePool = hasPhoto ? namesWithPhoto : allDirectorNames;
    const wrongNames = shuffle(
      candidatePool.filter((n) => n !== directorName),
    ).slice(0, 3);
    if (wrongNames.length < 3) continue;

    const { options, correctLabel } = buildOptions(directorName, wrongNames);
    const optionImages = hasPhoto
      ? mapOptionImages(options, nameToProfile)
      : [null, null, null, null];

    questions.push({
      type: "guess_director",
      difficulty: "medium",
      category: "director",
      question_text: `Siapa sutradara film "${movie.title}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${movie.title}" disutradarai oleh ${directorName}.`,
      image_url: posterUrl(movie.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── CATEGORY: ACTOR/ACTRESS (30 soal) ───────────────────────────────────────
// guess_cast: 20 medium | guess_cast_character: 10 medium

async function generateGuessCast(count = 20) {
  // movie_cast: kolom `name` = nama aktor, `character` = nama karakter, `order_index` = urutan
  const { data: casts } = await supabase
    .from("movie_cast")
    .select(
      `name, character, order_index, profile_path, movies!movie_cast_movie_id_fkey ( id, tmdb_id, title, poster_path )`,
    )
    .eq("order_index", 0)
    .not("name", "is", null)
    .not("movies.poster_path", "is", null)
    .limit(300);

  if (!casts?.length) return [];

  // map movies dari FK alias
  const allActorNames = [
    ...new Set(casts.map((c: any) => c.name).filter(Boolean)),
  ] as string[];
  if (allActorNames.length < 4) return [];

  // Map nama → foto profil (hanya nama yang punya foto)
  const nameToProfile = new Map<string, string>();
  for (const c of casts as any[]) {
    if (c.name && c.profile_path && !nameToProfile.has(c.name)) {
      nameToProfile.set(c.name, posterUrl(c.profile_path)!);
    }
  }
  const namesWithPhoto = [...nameToProfile.keys()];

  const pool = shuffle(
    casts.filter((c: any) => c.name && c.movies?.poster_path),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const cast = pool[i];
    const movie = cast.movies;
    const actorName: string = cast.name;
    if (!actorName || !movie?.poster_path) continue;

    const hasPhoto = nameToProfile.has(actorName);
    const candidatePool = hasPhoto ? namesWithPhoto : allActorNames;
    const wrongNames = shuffle(
      candidatePool.filter((n) => n !== actorName),
    ).slice(0, 3);
    if (wrongNames.length < 3) continue;

    const { options, correctLabel } = buildOptions(actorName, wrongNames);
    const optionImages = hasPhoto
      ? mapOptionImages(options, nameToProfile)
      : [null, null, null, null];

    questions.push({
      type: "guess_cast",
      difficulty: "medium",
      category: "actor",
      question_text: `Siapa pemeran utama dalam film "${movie.title}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `Pemeran utama "${movie.title}" adalah ${actorName} yang memerankan karakter ${cast.character ?? "utama"}.`,
      image_url: posterUrl(movie.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// Siapa yang memerankan karakter X dalam film Y?
async function generateGuessCastByCharacter(count = 10) {
  const { data: casts } = await supabase
    .from("movie_cast")
    .select(
      `name, character, order_index, profile_path, movies!movie_cast_movie_id_fkey ( id, tmdb_id, title, poster_path )`,
    )
    .not("character", "is", null)
    .lte("order_index", 2)
    .not("name", "is", null)
    .not("movies.poster_path", "is", null)
    .limit(200);

  if (!casts?.length) return [];

  const allActorNames = [
    ...new Set(casts.map((c: any) => c.name).filter(Boolean)),
  ] as string[];
  if (allActorNames.length < 4) return [];

  // Map nama → foto profil (hanya nama yang punya foto)
  const nameToProfile = new Map<string, string>();
  for (const c of casts as any[]) {
    if (c.name && c.profile_path && !nameToProfile.has(c.name)) {
      nameToProfile.set(c.name, posterUrl(c.profile_path)!);
    }
  }
  const namesWithPhoto = [...nameToProfile.keys()];

  const pool = shuffle(
    casts.filter(
      (c: any) => c.name && c.character?.length > 2 && c.movies?.poster_path,
    ),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const cast = pool[i];
    const movie = cast.movies;
    const actorName: string = cast.name;
    if (!actorName || !movie?.poster_path) continue;

    const hasPhoto = nameToProfile.has(actorName);
    const candidatePool = hasPhoto ? namesWithPhoto : allActorNames;
    const wrongNames = shuffle(
      candidatePool.filter((n) => n !== actorName),
    ).slice(0, 3);
    if (wrongNames.length < 3) continue;

    const { options, correctLabel } = buildOptions(actorName, wrongNames);
    const optionImages = hasPhoto
      ? mapOptionImages(options, nameToProfile)
      : [null, null, null, null];

    questions.push({
      type: "guess_cast",
      difficulty: "medium",
      category: "actor",
      question_text: `Siapa aktor/aktris yang memerankan karakter "${cast.character}" dalam film "${movie.title}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `Karakter "${cast.character}" dalam "${movie.title}" diperankan oleh ${actorName}.`,
      image_url: posterUrl(movie.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── CATEGORY: FRANCHISE (30 soal) ───────────────────────────────────────────
// guess_franchise: 20 easy | guess_franchise_order: 10 hard
//
// Schema: collections (id, key, name, type) ←→ collection_movies
//         (collection_id, media_type, movie_id, series_id, sort_order)

// Helper: ambil semua koleksi beserta film-nya (media_type = 'movie')
async function fetchCollectionsWithMovies(): Promise<
  { id: number; name: string; type: string; films: any[] }[]
> {
  // Single query dengan double join: collection_movies → collections + movies
  const { data: items } = await supabase
    .from("collection_movies")
    .select(
      `
      collection_id,
      sort_order,
      collections!collection_movies_collection_id_fkey ( id, name, type, is_active ),
      movies!collection_movies_movie_id_fkey ( id, tmdb_id, title, poster_path, release_date )
    `,
    )
    .eq("media_type", "movie")
    .not("movie_id", "is", null)
    .order("sort_order", { ascending: true })
    .limit(1000);

  if (!items?.length) return [];

  // Kelompokkan per collection, skip koleksi non-aktif dan film tanpa poster
  const colMap = new Map<
    number,
    { id: number; name: string; type: string; films: any[] }
  >();

  for (const item of items) {
    const col = item.collections as any;
    const film = item.movies as any;
    if (!col?.is_active || !film?.poster_path) continue;

    if (!colMap.has(col.id)) {
      colMap.set(col.id, {
        id: col.id,
        name: col.name,
        type: col.type,
        films: [],
      });
    }
    colMap.get(col.id)!.films.push(film);
  }

  return [...colMap.values()].filter((c) => c.films.length >= 2);
}

// Film X bagian dari franchise/koleksi apa?
async function generateGuessFranchise(_movies: any[], count = 20) {
  const collections = await fetchCollectionsWithMovies();

  if (!collections.length) return [];

  const allNames = collections.map((c) => c.name);
  const questions = [];

  // Hanya ~10 koleksi tersedia, jadi generate multiple soal per koleksi
  // dengan film yang berbeda agar tidak duplikat pertanyaan
  const perCollection = Math.ceil(count / collections.length);

  for (const col of shuffle(collections)) {
    if (questions.length >= count) break;

    const wrongNames = shuffle(allNames.filter((n) => n !== col.name)).slice(
      0,
      3,
    );
    if (wrongNames.length < 3) continue;

    const films = shuffle(col.films).slice(0, perCollection);
    for (const target of films) {
      if (questions.length >= count) break;
      if (!target?.poster_path) continue;

      const { options, correctLabel } = buildOptions(
        col.name,
        shuffle(wrongNames),
      );
      questions.push({
        type: "guess_franchise",
        difficulty: "easy",
        category: "franchise",
        question_text: `Film "${movieTitle(target)}" adalah bagian dari franchise apa?`,
        option_a: options[0],
        option_b: options[1],
        option_c: options[2],
        option_d: options[3],
        correct_option: correctLabel,
        explanation: `"${movieTitle(target)}" adalah bagian dari "${col.name}".`,
        image_url: posterUrl(target.poster_path),
        option_a_image: null,
        option_b_image: null,
        option_c_image: null,
        option_d_image: null,
        movie_id: target.id,
        tmdb_id: target.tmdb_id,
        is_manual: false,
      });
    }
  }
  return questions;
}

// Film X adalah urutan ke-berapa dalam franchise? (pakai sort_order dari collection_movies)
async function generateGuessFranchiseOrder(_movies: any[], count = 10) {
  // Butuh minimal 3 film per koleksi agar soal urutan masuk akal
  const collections = (await fetchCollectionsWithMovies()).filter(
    (c) => c.films.length >= 3,
  );

  if (!collections.length) return [];

  const pool = shuffle(collections);
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const col = pool[i];

    // sort_order sudah diurutkan dari query, fallback ke release_date jika 0 semua
    const sorted = col.films
      .filter((f: any) => f.release_date)
      .sort((a: any, b: any) => a.release_date.localeCompare(b.release_date));

    if (sorted.length < 3) continue;

    const targetIdx = Math.floor(Math.random() * sorted.length);
    const target = sorted[targetIdx];
    if (!target?.poster_path) continue;

    const correctOrder = String(targetIdx + 1);
    const wrongOrders = shuffle(
      Array.from({ length: sorted.length }, (_, k) => String(k + 1)).filter(
        (n) => n !== correctOrder,
      ),
    ).slice(0, 3);

    if (wrongOrders.length < 3) continue;

    const { options, correctLabel } = buildOptions(correctOrder, wrongOrders);
    questions.push({
      type: "guess_franchise_order",
      difficulty: "hard",
      category: "franchise",
      question_text: `"${movieTitle(target)}" adalah film urutan ke berapa dalam "${col.name}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${movieTitle(target)}" adalah film ke-${correctOrder} dalam "${col.name}" (${releaseYear(target)}).`,
      image_url: posterUrl(target.poster_path),
      option_a_image: null,
      option_b_image: null,
      option_c_image: null,
      option_d_image: null,
      movie_id: target.id,
      tmdb_id: target.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── CATEGORY: TV SERIES (30 soal) ───────────────────────────────────────────
// guess_tv_series: 15 medium | guess_tv_rating: 15 easy

async function generateGuessTvSeries(count = 15) {
  const { data: series } = await supabase
    .from("tv_series")
    .select(
      "id, tmdb_id, name, poster_path, overview, overview_en, vote_average, vote_count, first_air_date",
    )
    .gt("vote_count", 100)
    .not("poster_path", "is", null)
    .order("popularity", { ascending: false })
    .limit(200);

  if (!series?.length) return [];

  const pool = shuffle(series.filter((s: any) => s.overview || s.overview_en));
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const target = pool[i];
    const synopsis = (target.overview || target.overview_en || "").substring(
      0,
      120,
    );
    if (synopsis.length < 30) continue;

    const others = shuffle(pool.filter((s: any) => s.id !== target.id)).slice(
      0,
      3,
    );
    if (others.length < 3) continue;

    const all = shuffle([target, ...others]);
    const correctIdx = all.findIndex((o) => o.id === target.id);

    questions.push({
      type: "guess_tv_series",
      difficulty: "medium",
      category: "synopsis",
      question_text: `Tebak serial TV dari sinopsis berikut: "${synopsis}..."`,
      option_a: all[0].name,
      option_b: all[1].name,
      option_c: all[2].name,
      option_d: all[3].name,
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `Serial ini adalah "${target.name}" (${releaseYear(target) ?? "?"}).`,
      image_url: posterUrl(target.poster_path),
      option_a_image: posterUrl(all[0].poster_path),
      option_b_image: posterUrl(all[1].poster_path),
      option_c_image: posterUrl(all[2].poster_path),
      option_d_image: posterUrl(all[3].poster_path),
      movie_id: null,
      series_id: target.id,
      tmdb_id: target.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateGuessTvRating(count = 15) {
  const { data: series } = await supabase
    .from("tv_series")
    .select("id, tmdb_id, name, poster_path, vote_average, vote_count")
    .gt("vote_count", 200)
    .not("poster_path", "is", null)
    .order("popularity", { ascending: false })
    .limit(200);

  if (!series?.length) return [];

  const pool = shuffle(series);
  const questions = [];

  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort((x, y) => y.vote_average - x.vote_average);
    const best = sorted[0];
    if (sorted[1] && best.vote_average === sorted[1].vote_average) continue;
    const correctIdx = group.findIndex((s) => s.id === best.id);

    questions.push({
      type: "guess_tv_rating",
      difficulty: "easy",
      category: "rating",
      question_text: `Dari 4 serial berikut, mana yang memiliki rating tertinggi?`,
      option_a: group[0].name,
      option_b: group[1].name,
      option_c: group[2].name,
      option_d: group[3].name,
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${best.name}" memiliki rating tertinggi yaitu ${best.vote_average.toFixed(1)}.`,
      image_url: posterUrl(best.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: null,
      series_id: best.id,
      tmdb_id: best.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── CATEGORY: AWARDS (20 soal) ──────────────────────────────────────────────
// guess_award_film: 20 hard
//
// Schema: festival_winners (award_id, lineup_id, is_winner)
//       → festival_awards  (id, edition_id, name, name_en)
//       → festival_editions (id, festival_id, year)
//       → festivals         (id, name)
//       → festival_lineup   (id, movie_id, external_title, is_winner)
//       → movies            (id, tmdb_id, title, poster_path)

async function generateGuessAward(movies: any[], count = 20) {
  // Join berantai: festival_winners → lineup → award → edition → festival
  // Supabase tidak support multi-level join langsung, jadi kita lakukan 2 query.

  // Query 1: ambil winners yang punya lineup_id dan is_winner = true
  const { data: winners } = await supabase
    .from("festival_winners")
    .select(
      `
      id,
      is_winner,
      festival_awards!inner (
        id,
        name_en,
        festival_editions!inner (
          year,
          festivals!inner ( name )
        )
      ),
      festival_lineup!festival_winners_lineup_id_fkey (
        id,
        external_title,
        movie_id,
        poster_path,
        movies ( id, tmdb_id, title, poster_path )
      )
    `,
    )
    .eq("is_winner", true)
    .not("lineup_id", "is", null)
    .limit(150);

  if (!winners?.length) {
    return generateGuessAwardFallback(movies, count);
  }

  // Filter hanya yang punya data film (linked ke movies atau punya poster sendiri)
  const validWinners = winners.filter((w: any) => {
    const lineup = w.festival_lineup;
    return lineup && (lineup.movies?.poster_path || lineup.poster_path);
  });

  if (validWinners.length < 5) {
    return generateGuessAwardFallback(movies, count);
  }

  const pool = shuffle(validWinners);
  const moviesWithPoster = movies.filter((m) => m.poster_path);
  const allMovieTitles = moviesWithPoster.map((m) => movieTitle(m));
  const titleToPoster = imageMapFromItems(
    moviesWithPoster,
    (m) => movieTitle(m),
    (m) => m.poster_path,
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const winner = pool[i];
    const lineup = winner.festival_lineup;
    const award = winner.festival_awards;
    const edition = award?.festival_editions;
    const festival = edition?.festivals;

    // Prefer data dari tabel movies jika ada, fallback ke external_title di lineup
    const filmTitle =
      lineup.movies?.title ?? lineup.external_title ?? "Unknown";
    const filmId = lineup.movies?.id ?? null;
    const tmdbId = lineup.movies?.tmdb_id ?? null;
    const poster = lineup.movies?.poster_path ?? lineup.poster_path ?? null;

    if (!poster) continue;

    const festivalName = festival?.name ?? "Festival Film";
    const awardName = award?.name_en ?? "penghargaan";
    const year = edition?.year ?? "?";

    const wrongTitles = shuffle(
      allMovieTitles.filter((t) => t !== filmTitle),
    ).slice(0, 3);

    // Jika tidak cukup pilihan dari movies table, tambah dari external_title lain
    if (wrongTitles.length < 3) continue;

    const { options, correctLabel } = buildOptions(filmTitle, wrongTitles);
    // Pastikan judul yang benar selalu mengarah ke poster aslinya, walau
    // judul tersebut tidak ada di daftar `movies` (mis. external_title).
    const optionImages = mapOptionImages(
      options,
      new Map(titleToPoster).set(filmTitle, posterUrl(poster)),
    );
    questions.push({
      type: "guess_award_film",
      difficulty: "hard",
      category: "awards",
      question_text: `Film mana yang memenangkan "${awardName}" di ${festivalName} tahun ${year}?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${filmTitle}" memenangkan penghargaan "${awardName}" di ${festivalName} pada tahun ${year}.`,
      image_url: posterUrl(poster),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: filmId,
      tmdb_id: tmdbId,
      is_manual: false,
    });
  }

  // Jika soal dari festival kurang dari count, tambahkan fallback
  if (questions.length < count) {
    const fallback = await generateGuessAwardFallback(
      movies,
      count - questions.length,
    );
    return [...questions, ...fallback];
  }

  return questions;
}

// Fallback: soal "Film mana yang mendapat rating tertinggi?" sebagai proxy awards
async function generateGuessAwardFallback(movies: any[], count = 20) {
  const questions = [];
  const highRated = shuffle(
    movies.filter(
      (m) => m.vote_average >= 7.5 && m.vote_count > 1000 && m.poster_path,
    ),
  );

  const notableAwards = [
    { name: "Academy Awards (Oscar)", category: "Film Terbaik" },
    { name: "Golden Globe", category: "Film Drama Terbaik" },
    { name: "BAFTA", category: "Film Terbaik" },
    { name: "Cannes Film Festival", category: "Palme d'Or" },
  ];

  const titleToPoster = imageMapFromItems(
    highRated,
    (m) => movieTitle(m),
    (m) => m.poster_path,
  );

  for (let i = 0; i < Math.min(count, highRated.length); i++) {
    const winner = highRated[i];
    const losers = shuffle(
      highRated.filter((m) => m.id !== winner.id).map((m) => movieTitle(m)),
    ).slice(0, 3);
    if (losers.length < 3) continue;

    const award = notableAwards[i % notableAwards.length];
    const year = releaseYear(winner) ?? "?";

    const { options, correctLabel } = buildOptions(movieTitle(winner), losers);
    const optionImages = mapOptionImages(options, titleToPoster);
    questions.push({
      type: "guess_award_film",
      difficulty: "hard",
      category: "awards",
      question_text: `Film mana yang dianggap paling layak mendapat penghargaan ${award.name} untuk ${award.category}?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${movieTitle(winner)}" dengan rating ${winner.vote_average.toFixed(1)} dan ${winner.vote_count.toLocaleString()} votes adalah yang paling diakui dari keempat pilihan.`,
      image_url: posterUrl(winner.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: winner.id,
      tmdb_id: winner.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── CATEGORY: GENRE (20 soal) ───────────────────────────────────────────────
// guess_genre: 10 easy | guess_genre_combo: 10 medium

async function generateGuessGenre(movies: any[], count = 10) {
  // Ambil data genre dari tabel movies_genres
  const { data: movieGenres } = await supabase
    .from("movie_genres")
    .select(
      `movies!inner ( id, tmdb_id, title, poster_path ), genres!inner ( id, name )`,
    )
    .not("movies.poster_path", "is", null)
    .limit(300);

  if (!movieGenres?.length) return generateGuessGenreFallback(movies, count);

  // Kelompokkan genre per film
  const filmGenreMap: Record<string, { movie: any; genres: string[] }> = {};
  for (const mg of movieGenres) {
    const movie = mg.movies as any;
    const genre = mg.genres as any;
    if (!movie || !genre) continue;

    if (!filmGenreMap[movie.id]) {
      filmGenreMap[movie.id] = { movie, genres: [] };
    }
    filmGenreMap[movie.id].genres.push(genre.name);
  }

  const allGenres = [
    ...new Set(
      movieGenres.map((mg: any) => (mg.genres as any)?.name).filter(Boolean),
    ),
  ];
  const pool = shuffle(
    Object.values(filmGenreMap).filter((fg) => fg.genres.length >= 1),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const fg = pool[i];
    const primaryGenre = fg.genres[0];
    const wrongGenres = shuffle(
      allGenres.filter((g) => !fg.genres.includes(g)),
    ).slice(0, 3);
    if (wrongGenres.length < 3) continue;

    const { options, correctLabel } = buildOptions(primaryGenre, wrongGenres);
    questions.push({
      type: "guess_genre",
      difficulty: "easy",
      category: "genre",
      question_text: `Apa genre utama dari film "${movieTitle(fg.movie)}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${movieTitle(fg.movie)}" bergenre ${fg.genres.join(", ")}.`,
      image_url: posterUrl(fg.movie.poster_path),
      option_a_image: null,
      option_b_image: null,
      option_c_image: null,
      option_d_image: null,
      movie_id: fg.movie.id,
      tmdb_id: fg.movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateGuessGenreFallback(movies: any[], count = 10) {
  // Fallback jika tidak ada tabel movie_genres: gunakan field genres jika ada
  const pool = shuffle(
    movies.filter((m) => m.genre_ids?.length && m.poster_path),
  );
  const allGenreNames = [
    "Action",
    "Comedy",
    "Drama",
    "Horror",
    "Romance",
    "Thriller",
    "Sci-Fi",
    "Animation",
    "Documentary",
    "Fantasy",
  ];
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const movie = pool[i];
    // Tidak bisa resolve genre name dari ID tanpa lookup table
    // Skip soal ini dan return empty
    break;
  }
  return questions;
}

// Film X memiliki kombinasi genre apa?
async function generateGuessGenreCombo(movies: any[], count = 10) {
  const { data: movieGenres } = await supabase
    .from("movie_genres")
    .select(
      `movies!inner ( id, tmdb_id, title, poster_path ), genres!inner ( id, name )`,
    )
    .not("movies.poster_path", "is", null)
    .limit(300);

  if (!movieGenres?.length) return [];

  const filmGenreMap: Record<string, { movie: any; genres: string[] }> = {};
  for (const mg of movieGenres) {
    const movie = mg.movies as any;
    const genre = mg.genres as any;
    if (!movie || !genre) continue;
    if (!filmGenreMap[movie.id]) filmGenreMap[movie.id] = { movie, genres: [] };
    filmGenreMap[movie.id].genres.push(genre.name);
  }

  // Cari film dengan tepat 2–3 genre
  const pool = shuffle(
    Object.values(filmGenreMap).filter(
      (fg) => fg.genres.length >= 2 && fg.genres.length <= 3,
    ),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const fg = pool[i];
    const correctCombo = fg.genres.sort().join(" & ");

    // Buat 3 kombinasi salah dari genre-genre lain
    const allGenres = [
      ...new Set(
        movieGenres.map((mg: any) => (mg.genres as any)?.name).filter(Boolean),
      ),
    ];
    const otherGenres = shuffle(
      allGenres.filter((g) => !fg.genres.includes(g)),
    );
    const wrongCombos = [
      [otherGenres[0], fg.genres[0]].sort().join(" & "),
      [otherGenres[1], otherGenres[2]].sort().join(" & "),
      [fg.genres[fg.genres.length - 1], otherGenres[3]].sort().join(" & "),
    ].filter((c, idx, arr) => arr.indexOf(c) === idx && c !== correctCombo);

    if (wrongCombos.length < 3) continue;

    const { options, correctLabel } = buildOptions(correctCombo, wrongCombos);
    questions.push({
      type: "guess_genre_combo",
      difficulty: "medium",
      category: "genre",
      question_text: `Film "${movieTitle(fg.movie)}" termasuk dalam kombinasi genre apa?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${movieTitle(fg.movie)}" bergenre ${fg.genres.join(" dan ")}.`,
      image_url: posterUrl(fg.movie.poster_path),
      option_a_image: null,
      option_b_image: null,
      option_c_image: null,
      option_d_image: null,
      movie_id: fg.movie.id,
      tmdb_id: fg.movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── CATEGORY: YEAR & TIMELINE (20 soal) ─────────────────────────────────────
// guess_year: 15 hard | guess_release_order: 5 hard

async function generateGuessYear(movies: any[], count = 15) {
  const pool = shuffle(movies.filter((m) => m.release_date && m.poster_path));
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const movie = pool[i];
    const year = parseInt(movie.release_date.substring(0, 4));
    if (isNaN(year)) continue;

    const offsets = shuffle([-4, -3, -2, -1, 1, 2, 3, 4]).slice(0, 3);
    const wrongYears = offsets.map((o) => String(year + o));
    const { options, correctLabel } = buildOptions(String(year), wrongYears);

    questions.push({
      type: "guess_year",
      difficulty: "hard",
      category: "year",
      question_text: `Tahun berapa film "${movieTitle(movie)}" dirilis?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${movieTitle(movie)}" pertama kali dirilis pada tahun ${year}.`,
      image_url: posterUrl(movie.poster_path),
      option_a_image: null,
      option_b_image: null,
      option_c_image: null,
      option_d_image: null,
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// Film mana yang dirilis paling pertama dari 4 pilihan?
async function generateGuessReleaseOrder(movies: any[], count = 5) {
  const pool = shuffle(movies.filter((m) => m.release_date && m.poster_path));
  const questions = [];

  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;

    const sorted = [...group].sort((a, b) =>
      a.release_date.localeCompare(b.release_date),
    );
    const earliest = sorted[0];
    const all = shuffle(group);
    const correctIdx = all.findIndex((m) => m.id === earliest.id);

    questions.push({
      type: "guess_release_order",
      difficulty: "hard",
      category: "year",
      question_text: `Film mana yang dirilis paling pertama?`,
      option_a: movieTitle(all[0]),
      option_b: movieTitle(all[1]),
      option_c: movieTitle(all[2]),
      option_d: movieTitle(all[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${movieTitle(earliest)}" adalah yang paling awal dirilis, yaitu pada ${earliest.release_date.substring(0, 7)}.`,
      image_url: posterUrl(earliest.poster_path),
      option_a_image: posterUrl(all[0].poster_path),
      option_b_image: posterUrl(all[1].poster_path),
      option_c_image: posterUrl(all[2].poster_path),
      option_d_image: posterUrl(all[3].poster_path),
      movie_id: earliest.id,
      tmdb_id: earliest.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── CATEGORY: CHARACTER & VILLAIN (20 soal) ─────────────────────────────────
// guess_character: 10 medium | guess_villain: 10 medium

// Karakter X muncul dalam film mana?
async function generateGuessCharacter(count = 10) {
  const { data: casts } = await supabase
    .from("movie_cast")
    .select(
      `character, movies!movie_cast_movie_id_fkey ( id, tmdb_id, title, poster_path )`,
    )
    .not("character", "is", null)
    .lte("order_index", 1)
    .not("movies.poster_path", "is", null)
    .limit(200);

  if (!casts?.length) return [];

  const pool = shuffle(
    casts.filter((c: any) => {
      const char = c.character ?? "";
      // Bersihkan suffix (voice), (uncredited), dll untuk display tapi tetap include
      return char.length > 3 && !char.toLowerCase().includes("uncredited");
    }),
  );
  const allMovieTitles = [
    ...new Set(casts.map((c: any) => movieTitle(c.movies))),
  ] as string[];
  const titleToPoster = imageMapFromItems(
    casts,
    (c: any) => movieTitle(c.movies),
    (c: any) => c.movies?.poster_path,
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const cast = pool[i];
    const movie = cast.movies;
    if (!movie?.poster_path) continue;

    const wrongTitles = shuffle(
      allMovieTitles.filter((t) => t !== movieTitle(movie)),
    ).slice(0, 3);
    if (wrongTitles.length < 3) continue;

    const { options, correctLabel } = buildOptions(
      movieTitle(movie),
      wrongTitles,
    );
    const optionImages = mapOptionImages(options, titleToPoster);
    const cleanCharName = (cast.character ?? "")
      .replace(/\s*\(voice\)\s*/i, "")
      .trim();
    questions.push({
      type: "guess_character",
      difficulty: "medium",
      category: "general",
      question_text: `Karakter "${cleanCharName}" berasal dari film mana?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `Karakter "${cleanCharName}" adalah salah satu karakter dalam film "${movieTitle(movie)}".`,
      image_url: posterUrl(movie.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// Siapa villain dalam film X? → pakai keyword di kolom `character`
async function generateGuessVillain(count = 10) {
  const { data: casts } = await supabase
    .from("movie_cast")
    .select(
      `name, character, order_index, profile_path, movies!movie_cast_movie_id_fkey ( id, tmdb_id, title, poster_path )`,
    )
    .not("character", "is", null)
    .not("name", "is", null)
    .gte("order_index", 1)
    .lte("order_index", 5)
    .not("movies.poster_path", "is", null)
    .limit(300);

  if (!casts?.length) return [];

  // map movies dari FK alias
  const allActorNames = [
    ...new Set(casts.map((c: any) => c.name).filter(Boolean)),
  ] as string[];
  if (allActorNames.length < 4) return [];

  // Map nama → foto profil (hanya nama yang punya foto)
  const nameToProfile = new Map<string, string>();
  for (const c of casts as any[]) {
    if (c.name && c.profile_path && !nameToProfile.has(c.name)) {
      nameToProfile.set(c.name, posterUrl(c.profile_path)!);
    }
  }
  const namesWithPhoto = [...nameToProfile.keys()];

  // Pendekatan praktis: karena data tidak punya tag villain eksplisit,
  // buat soal "Siapa yang memerankan karakter X?" untuk pemeran order_index 1–4
  // (bukan pemeran utama/0, agar berbeda dari generateGuessCast)
  const combined = shuffle(
    casts.filter(
      (c: any) =>
        c.order_index >= 1 && c.order_index <= 4 && c.character && c.name,
    ),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, combined.length); i++) {
    const cast = combined[i];
    const movie = cast.movies;
    const actorName: string = cast.name;
    if (!actorName || !movie?.poster_path) continue;

    const hasPhoto = nameToProfile.has(actorName);
    const candidatePool = hasPhoto ? namesWithPhoto : allActorNames;
    const wrongNames = shuffle(
      candidatePool.filter((n) => n !== actorName),
    ).slice(0, 3);
    if (wrongNames.length < 3) continue;

    const { options, correctLabel } = buildOptions(actorName, wrongNames);
    const optionImages = hasPhoto
      ? mapOptionImages(options, nameToProfile)
      : [null, null, null, null];
    const cleanVillainChar = (cast.character ?? "")
      .replace(/\s*\(voice\)\s*/i, "")
      .trim();
    questions.push({
      type: "guess_villain",
      difficulty: "medium",
      category: "general",
      question_text: `Siapa yang memerankan karakter "${cleanVillainChar}" dalam film "${movie.title}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `Karakter "${cast.character}" dalam "${movie.title}" diperankan oleh ${actorName}.`,
      image_url: posterUrl(movie.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ─── NEW GENERATORS BLOCK ─────────────────────────────────────────────────────
// Akan di-inject sebelum Main Handler

// ── PHRASING VARIANTS untuk soal existing ────────────────────────────────────
// Setiap fungsi _v2/_v3 menggunakan template kalimat berbeda agar soal terasa
// berbeda meski sumber datanya sama.

async function generateHigherRatingV2(movies: any[], count = 20) {
  const questions = [];
  const pool = shuffle(movies.filter((m) => m.vote_count > 500));
  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort((x, y) => y.vote_average - x.vote_average);
    const best = sorted[0];
    if (sorted[1] && best.vote_average === sorted[1].vote_average) continue;
    const correctIdx = group.findIndex((m) => m.id === best.id);

    questions.push({
      type: "higher_rating",
      difficulty: "easy",
      category: "rating",
      question_text: `Menurut penilaian penonton, mana yang paling bagus dari 4 film ini?`,
      option_a: movieTitle(group[0]),
      option_b: movieTitle(group[1]),
      option_c: movieTitle(group[2]),
      option_d: movieTitle(group[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${movieTitle(best)}" punya rating tertinggi, ${best.vote_average.toFixed(1)}.`,
      image_url: posterUrl(best.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: best.id,
      tmdb_id: best.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateMorePopularV2(movies: any[], count = 15) {
  const questions = [];
  const pool = shuffle(movies.filter((m) => m.popularity > 10));
  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort(
      (x, y) => (y.popularity ?? 0) - (x.popularity ?? 0),
    );
    const best = sorted[0];
    if (sorted[1] && best.popularity === sorted[1].popularity) continue;
    const correctIdx = group.findIndex((m) => m.id === best.id);

    questions.push({
      type: "more_popular",
      difficulty: "easy",
      category: "popularity",
      question_text: `Mana yang paling banyak dibicarakan orang dari 4 film ini?`,
      option_a: movieTitle(group[0]),
      option_b: movieTitle(group[1]),
      option_c: movieTitle(group[2]),
      option_d: movieTitle(group[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${movieTitle(best)}" punya skor popularitas tertinggi, ${Math.round(best.popularity ?? 0)}.`,
      image_url: posterUrl(best.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: best.id,
      tmdb_id: best.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateGuessSynopsisV2(movies: any[], count = 15) {
  const questions = [];
  const pool = shuffle(
    movies.filter((m) => (m.overview || m.overview_en) && m.poster_path),
  );
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const target = pool[i];
    const synopsis = (target.overview || target.overview_en || "").substring(
      0,
      120,
    );
    if (synopsis.length < 30) continue;
    const others = shuffle(pool.filter((m) => m.id !== target.id)).slice(0, 3);
    if (others.length < 3) continue;
    const all = shuffle([target, ...others]);
    const correctIdx = all.findIndex((o) => o.id === target.id);
    questions.push({
      type: "guess_synopsis",
      difficulty: "medium",
      category: "synopsis",
      question_text: `Film apa yang memiliki cerita berikut: "${synopsis}..."`,
      option_a: movieTitle(all[0]),
      option_b: movieTitle(all[1]),
      option_c: movieTitle(all[2]),
      option_d: movieTitle(all[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `Deskripsi tersebut adalah sinopsis dari "${movieTitle(target)}" (${releaseYear(target) ?? "?"}).`,
      image_url: posterUrl(target.poster_path),
      option_a_image: posterUrl(all[0].poster_path),
      option_b_image: posterUrl(all[1].poster_path),
      option_c_image: posterUrl(all[2].poster_path),
      option_d_image: posterUrl(all[3].poster_path),
      movie_id: target.id,
      tmdb_id: target.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateGuessDirectorV2(count = 30) {
  const { data: crews } = await supabase
    .from("movie_crew")
    .select("movie_id, name, profile_path")
    .eq("job", "Director")
    .not("name", "is", null)
    .limit(400);
  if (!crews?.length) return [];
  const movieIds = [...new Set(crews.map((c: any) => c.movie_id))];
  const { data: moviesData } = await supabase
    .from("movies")
    .select("id, tmdb_id, title, poster_path")
    .in("id", movieIds)
    .not("poster_path", "is", null);
  if (!moviesData?.length) return [];
  const movieMap = new Map(moviesData.map((m: any) => [m.id, m]));
  const combined = crews
    .map((c: any) => ({
      name: c.name,
      profile_path: c.profile_path,
      movie: movieMap.get(c.movie_id),
    }))
    .filter((c) => c.movie && c.name);
  const allNames = [...new Set(combined.map((c) => c.name))] as string[];
  if (allNames.length < 4) return [];
  const nameToProfile = new Map<string, string>();
  for (const c of combined) {
    if (c.name && c.profile_path && !nameToProfile.has(c.name)) {
      nameToProfile.set(c.name, posterUrl(c.profile_path)!);
    }
  }
  const namesWithPhoto = [...nameToProfile.keys()];
  const pool = shuffle(combined);
  const questions = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const { name: directorName, movie } = pool[i];
    if (!directorName || !movie) continue;
    const hasPhoto = nameToProfile.has(directorName);
    const candidatePool = hasPhoto ? namesWithPhoto : allNames;
    const wrongNames = shuffle(
      candidatePool.filter((n) => n !== directorName),
    ).slice(0, 3);
    if (wrongNames.length < 3) continue;
    const { options, correctLabel } = buildOptions(directorName, wrongNames);
    const optionImages = hasPhoto
      ? mapOptionImages(options, nameToProfile)
      : [null, null, null, null];
    questions.push({
      type: "guess_director",
      difficulty: "medium",
      category: "director",
      question_text: `Film "${movie.title}" digarap oleh sutradara bernama?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${movie.title}" adalah karya sutradara ${directorName}.`,
      image_url: posterUrl(movie.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateGuessCastV2(count = 20) {
  const { data: casts } = await supabase
    .from("movie_cast")
    .select(
      `name, character, order_index, profile_path, movies!movie_cast_movie_id_fkey ( id, tmdb_id, title, poster_path )`,
    )
    .eq("order_index", 0)
    .not("name", "is", null)
    .not("movies.poster_path", "is", null)
    .limit(300);
  if (!casts?.length) return [];
  const allActorNames = [
    ...new Set(casts.map((c: any) => c.name).filter(Boolean)),
  ] as string[];
  if (allActorNames.length < 4) return [];
  const nameToProfile = new Map<string, string>();
  for (const c of casts as any[]) {
    if (c.name && c.profile_path && !nameToProfile.has(c.name)) {
      nameToProfile.set(c.name, posterUrl(c.profile_path)!);
    }
  }
  const namesWithPhoto = [...nameToProfile.keys()];
  const pool = shuffle(
    casts.filter((c: any) => c.name && c.movies?.poster_path),
  );
  const questions = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const cast = pool[i];
    const movie = cast.movies;
    const actorName: string = cast.name;
    if (!actorName || !movie?.poster_path) continue;
    const hasPhoto = nameToProfile.has(actorName);
    const candidatePool = hasPhoto ? namesWithPhoto : allActorNames;
    const wrongNames = shuffle(
      candidatePool.filter((n) => n !== actorName),
    ).slice(0, 3);
    if (wrongNames.length < 3) continue;
    const { options, correctLabel } = buildOptions(actorName, wrongNames);
    const optionImages = hasPhoto
      ? mapOptionImages(options, nameToProfile)
      : [null, null, null, null];
    questions.push({
      type: "guess_cast",
      difficulty: "medium",
      category: "actor",
      question_text: `Aktor/aktris mana yang tampil sebagai bintang utama di "${movie.title}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `Bintang utama "${movie.title}" adalah ${actorName}.`,
      image_url: posterUrl(movie.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

async function generateGuessYearV2(movies: any[], count = 15) {
  const pool = shuffle(movies.filter((m) => m.release_date && m.poster_path));
  const questions = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const movie = pool[i];
    const year = parseInt(movie.release_date.substring(0, 4));
    if (isNaN(year)) continue;
    const offsets = shuffle([-5, -3, -2, 2, 3, 5]).slice(0, 3);
    const wrongYears = offsets.map((o) => String(year + o));
    const { options, correctLabel } = buildOptions(String(year), wrongYears);
    questions.push({
      type: "guess_year",
      difficulty: "hard",
      category: "year",
      question_text: `Kapan pertama kali film "${movieTitle(movie)}" tayang di bioskop?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${movieTitle(movie)}" pertama tayang pada ${year}.`,
      image_url: posterUrl(movie.poster_path),
      movie_id: movie.id,
      tmdb_id: movie.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// ── TIPE SOAL BARU ────────────────────────────────────────────────────────────

// guess_tagline: Tebak film dari tagline-nya
async function generateGuessTagline(count = 50) {
  const { data: films } = await supabase
    .from("movies")
    .select("id, tmdb_id, title, poster_path, tagline")
    .not("tagline", "is", null)
    .neq("tagline", "")
    .not("poster_path", "is", null)
    .gt("vote_count", 100)
    .order("popularity", { ascending: false })
    .limit(300);
  if (!films?.length) return [];
  const pool = shuffle(films.filter((f: any) => f.tagline?.length > 10));
  const allTitles = pool.map((f: any) => f.title);
  const titleToPoster = imageMapFromItems(
    pool,
    (f: any) => f.title,
    (f: any) => f.poster_path,
  );
  const questions = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const target = pool[i];
    const wrongTitles = shuffle(
      allTitles.filter((t) => t !== target.title),
    ).slice(0, 3);
    if (wrongTitles.length < 3) continue;
    const { options, correctLabel } = buildOptions(target.title, wrongTitles);
    const optionImages = mapOptionImages(options, titleToPoster);
    questions.push({
      type: "guess_tagline",
      difficulty: "medium",
      category: "general",
      question_text: `Film mana yang memiliki tagline: "${target.tagline}"?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `Tagline "${target.tagline}" adalah milik film "${target.title}".`,
      image_url: posterUrl(target.poster_path),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: target.id,
      tmdb_id: target.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// guess_runtime_longer: Film mana yang durasinya lebih panjang?
async function generateGuessRuntimeLonger(movies: any[], count = 40) {
  const { data: films } = await supabase
    .from("movies")
    .select("id, tmdb_id, title, poster_path, runtime")
    .not("runtime", "is", null)
    .gt("runtime", 60)
    .not("poster_path", "is", null)
    .gt("vote_count", 100)
    .order("popularity", { ascending: false })
    .limit(400);
  if (!films?.length) return [];
  const pool = shuffle(films);
  const questions = [];
  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort((x, y) => y.runtime - x.runtime);
    const longest = sorted[0];
    if (sorted[1] && Math.abs(longest.runtime - sorted[1].runtime) < 5)
      continue; // hindari yang terlalu mirip
    const correctIdx = group.findIndex((m) => m.id === longest.id);

    questions.push({
      type: "guess_runtime_longer",
      difficulty: "easy",
      category: "general",
      question_text: `Dari 4 film berikut, mana yang durasinya paling panjang?`,
      option_a: movieTitle(group[0]),
      option_b: movieTitle(group[1]),
      option_c: movieTitle(group[2]),
      option_d: movieTitle(group[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${movieTitle(longest)}" berdurasi paling panjang, yaitu ${longest.runtime} menit.`,
      image_url: posterUrl(longest.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: longest.id,
      tmdb_id: longest.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// guess_language: Film X menggunakan bahasa apa?
async function generateGuessLanguage(count = 40) {
  const languageNames: Record<string, string> = {
    en: "Inggris",
    ja: "Jepang",
    ko: "Korea",
    fr: "Prancis",
    es: "Spanyol",
    de: "Jerman",
    it: "Italia",
    zh: "Mandarin",
    hi: "Hindi",
    pt: "Portugis",
    ru: "Rusia",
    ar: "Arab",
    th: "Thailand",
    id: "Indonesia",
    tr: "Turki",
    nl: "Belanda",
    sv: "Swedia",
    da: "Denmark",
    pl: "Polandia",
    lv: "Latvia",
  };
  const { data: films } = await supabase
    .from("movies")
    .select("id, tmdb_id, title, poster_path, original_language")
    .not("original_language", "is", null)
    .not("poster_path", "is", null)
    .gt("vote_count", 200)
    .order("popularity", { ascending: false })
    .limit(400);
  if (!films?.length) return [];
  const pool = shuffle(
    films.filter((f: any) => languageNames[f.original_language]),
  );
  const allLangNames = [...new Set(Object.values(languageNames))];
  const questions = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const film = pool[i];
    const correctLang = languageNames[film.original_language];
    if (!correctLang) continue;
    const wrongLangs = shuffle(
      allLangNames.filter((l) => l !== correctLang),
    ).slice(0, 3);
    if (wrongLangs.length < 3) continue;
    const { options, correctLabel } = buildOptions(correctLang, wrongLangs);
    questions.push({
      type: "guess_language",
      difficulty: "medium",
      category: "general",
      question_text: `Film "${film.title}" menggunakan bahasa apa sebagai bahasa utamanya?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${film.title}" diproduksi dalam bahasa ${correctLang}.`,
      image_url: posterUrl(film.poster_path),
      movie_id: film.id,
      tmdb_id: film.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// guess_higher_revenue: Film mana yang pendapatannya lebih tinggi?
async function generateGuessHigherRevenue(count = 40) {
  const { data: films } = await supabase
    .from("movies")
    .select("id, tmdb_id, title, poster_path, revenue")
    .gt("revenue", 1000000)
    .not("poster_path", "is", null)
    .gt("vote_count", 100)
    .order("revenue", { ascending: false })
    .limit(300);
  if (!films?.length) return [];
  const pool = shuffle(films);
  const questions = [];
  const fmt = (n: number) =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${Math.round(n / 1e6)}M`;
  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort((x, y) => y.revenue - x.revenue);
    const winner = sorted[0];
    if (sorted[1] && winner.revenue === sorted[1].revenue) continue;
    const correctIdx = group.findIndex((m) => m.id === winner.id);

    questions.push({
      type: "guess_higher_revenue",
      difficulty: "easy",
      category: "general",
      question_text: `Dari 4 film berikut, mana yang pendapatan box office-nya paling tinggi?`,
      option_a: movieTitle(group[0]),
      option_b: movieTitle(group[1]),
      option_c: movieTitle(group[2]),
      option_d: movieTitle(group[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${movieTitle(winner)}" meraup pendapatan tertinggi, yaitu ${fmt(winner.revenue)}.`,
      image_url: posterUrl(winner.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: winner.id,
      tmdb_id: winner.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// guess_higher_budget: Film mana yang anggarannya lebih besar?
async function generateGuessHigherBudget(count = 40) {
  const { data: films } = await supabase
    .from("movies")
    .select("id, tmdb_id, title, poster_path, budget")
    .gt("budget", 1000000)
    .not("poster_path", "is", null)
    .gt("vote_count", 100)
    .order("budget", { ascending: false })
    .limit(300);
  if (!films?.length) return [];
  const pool = shuffle(films);
  const questions = [];
  const fmt = (n: number) =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${Math.round(n / 1e6)}M`;
  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort((x, y) => y.budget - x.budget);
    const winner = sorted[0];
    if (sorted[1] && winner.budget === sorted[1].budget) continue;
    const correctIdx = group.findIndex((m) => m.id === winner.id);

    questions.push({
      type: "guess_higher_budget",
      difficulty: "medium",
      category: "general",
      question_text: `Dari 4 film berikut, mana yang anggaran produksinya paling besar?`,
      option_a: movieTitle(group[0]),
      option_b: movieTitle(group[1]),
      option_c: movieTitle(group[2]),
      option_d: movieTitle(group[3]),
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${movieTitle(winner)}" punya anggaran produksi terbesar, yaitu ${fmt(winner.budget)}.`,
      image_url: posterUrl(winner.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: winner.id,
      tmdb_id: winner.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// guess_tv_seasons: Serial ini punya berapa musim?
async function generateGuessTvSeasons(count = 40) {
  const { data: series } = await supabase
    .from("tv_series")
    .select("id, tmdb_id, name, poster_path, number_of_seasons")
    .not("number_of_seasons", "is", null)
    .gt("number_of_seasons", 0)
    .not("poster_path", "is", null)
    .gt("vote_count", 100)
    .order("popularity", { ascending: false })
    .limit(300);
  if (!series?.length) return [];
  const pool = shuffle(series.filter((s: any) => s.number_of_seasons >= 1));
  const questions = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const tv = pool[i];
    const correct = String(tv.number_of_seasons);
    // Wrong options: angka berbeda yang masuk akal
    const offsets = shuffle([-2, -1, 1, 2, 3]).slice(0, 3);
    const wrongOptions = offsets
      .map((o) => String(Math.max(1, tv.number_of_seasons + o)))
      .filter((n) => n !== correct);
    if (wrongOptions.length < 3) continue;
    const { options, correctLabel } = buildOptions(
      correct,
      wrongOptions.slice(0, 3),
    );
    questions.push({
      type: "guess_tv_seasons",
      difficulty: "medium",
      category: "general",
      question_text: `Serial "${tv.name}" memiliki berapa musim (season)?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${tv.name}" memiliki ${tv.number_of_seasons} musim.`,
      image_url: posterUrl(tv.poster_path),
      movie_id: null,
      series_id: tv.id,
      tmdb_id: tv.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// guess_tv_more_seasons: Serial mana yang punya lebih banyak season?
async function generateGuessTvMoreSeasons(count = 30) {
  const { data: series } = await supabase
    .from("tv_series")
    .select("id, tmdb_id, name, poster_path, number_of_seasons")
    .not("number_of_seasons", "is", null)
    .gt("number_of_seasons", 0)
    .not("poster_path", "is", null)
    .gt("vote_count", 100)
    .order("popularity", { ascending: false })
    .limit(200);
  if (!series?.length) return [];
  const pool = shuffle(series);
  const questions = [];
  for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i++) {
    const group = pool.slice(i * 4, i * 4 + 4);
    if (group.length < 4) break;
    const sorted = [...group].sort(
      (x, y) => y.number_of_seasons - x.number_of_seasons,
    );
    const winner = sorted[0];
    if (sorted[1] && winner.number_of_seasons === sorted[1].number_of_seasons)
      continue;
    const correctIdx = group.findIndex((s) => s.id === winner.id);

    questions.push({
      type: "guess_tv_more_seasons",
      difficulty: "easy",
      category: "general",
      question_text: `Dari 4 serial berikut, mana yang memiliki musim (season) paling banyak?`,
      option_a: group[0].name,
      option_b: group[1].name,
      option_c: group[2].name,
      option_d: group[3].name,
      correct_option: OPTION_LABELS[correctIdx],
      explanation: `"${winner.name}" memiliki musim paling banyak, yaitu ${winner.number_of_seasons} musim.`,
      image_url: posterUrl(winner.poster_path),
      option_a_image: posterUrl(group[0].poster_path),
      option_b_image: posterUrl(group[1].poster_path),
      option_c_image: posterUrl(group[2].poster_path),
      option_d_image: posterUrl(group[3].poster_path),
      movie_id: null,
      series_id: winner.id,
      tmdb_id: winner.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}

// guess_festival: Film ini ditayangkan di festival mana?
async function generateGuessFestival(count = 30) {
  const { data: lineups } = await supabase
    .from("festival_lineup")
    .select(
      `id, edition_id, external_title, poster_path, movies ( id, tmdb_id, title, poster_path )`,
    )
    .not("poster_path", "is", null)
    .limit(300);
  if (!lineups?.length) return [];

  const editionIds = [...new Set(lineups.map((l: any) => l.edition_id))];
  const { data: editions } = await supabase
    .from("festival_editions")
    .select(`id, year, festivals!inner ( name )`)
    .in("id", editionIds);
  if (!editions?.length) return [];

  const editionMap = new Map(
    editions.map((e: any) => [
      e.id,
      { year: e.year, festName: e.festivals?.name },
    ]),
  );
  const allFestivalNames = [
    ...new Set(editions.map((e: any) => e.festivals?.name).filter(Boolean)),
  ] as string[];
  if (allFestivalNames.length < 4) return [];

  const pool = shuffle(
    lineups.filter((l: any) => editionMap.get(l.edition_id)?.festName),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const lineup = pool[i];
    const editionData = editionMap.get(lineup.edition_id);
    if (!editionData?.festName) continue;

    const festName = editionData.festName;
    const year = editionData.year;
    const filmTitle =
      lineup.movies?.title ?? lineup.external_title ?? "Unknown";
    const poster = lineup.movies?.poster_path ?? lineup.poster_path;
    const movieId = lineup.movies?.id ?? null;
    const tmdbId = lineup.movies?.tmdb_id ?? null;
    if (!poster) continue;

    const wrongFests = shuffle(
      allFestivalNames.filter((n) => n !== festName),
    ).slice(0, 3);
    if (wrongFests.length < 3) continue;
    const { options, correctLabel } = buildOptions(festName, wrongFests);
    questions.push({
      type: "guess_festival",
      difficulty: "hard",
      category: "awards",
      question_text: `Film "${filmTitle}" ditayangkan di festival film mana?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${filmTitle}" ditayangkan di ${festName} pada tahun ${year}.`,
      image_url: posterUrl(poster),
      option_a_image: null,
      option_b_image: null,
      option_c_image: null,
      option_d_image: null,
      movie_id: movieId,
      tmdb_id: tmdbId,
      is_manual: false,
    });
  }
  return questions;
}

// guess_oscar_contender: Film mana yang merupakan Oscar contender?
async function generateGuessOscarContender(movies: any[], count = 40) {
  const { data: contenders } = await supabase
    .from("festival_lineup")
    .select(
      `movie_id, external_title, poster_path, movies ( id, tmdb_id, title, poster_path )`,
    )
    .eq("is_oscar_contender", true)
    .not("poster_path", "is", null)
    .limit(150);
  if (!contenders?.length) return [];

  const moviesWithPoster = movies.filter((m) => m.poster_path);
  const allMovieTitles = moviesWithPoster.map((m) => movieTitle(m));
  const titleToPoster = imageMapFromItems(
    moviesWithPoster,
    (m) => movieTitle(m),
    (m) => m.poster_path,
  );
  const pool = shuffle(
    contenders.filter((c: any) => c.movies?.poster_path || c.poster_path),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const contender = pool[i];
    const filmTitle =
      contender.movies?.title ?? contender.external_title ?? "Unknown";
    const poster = contender.movies?.poster_path ?? contender.poster_path;
    const movieId = contender.movies?.id ?? null;
    const tmdbId = contender.movies?.tmdb_id ?? null;
    if (!poster) continue;

    const wrongTitles = shuffle(
      allMovieTitles.filter((t) => t !== filmTitle),
    ).slice(0, 3);
    if (wrongTitles.length < 3) continue;
    const { options, correctLabel } = buildOptions(filmTitle, wrongTitles);
    const optionImages = mapOptionImages(
      options,
      new Map(titleToPoster).set(filmTitle, posterUrl(poster)),
    );
    questions.push({
      type: "guess_oscar_contender",
      difficulty: "medium",
      category: "awards",
      question_text: `Film mana dari pilihan berikut yang masuk sebagai kandidat Oscar?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${filmTitle}" adalah salah satu film yang masuk dalam daftar kandidat Oscar.`,
      image_url: posterUrl(poster),
      option_a_image: optionImages[0],
      option_b_image: optionImages[1],
      option_c_image: optionImages[2],
      option_d_image: optionImages[3],
      movie_id: movieId,
      tmdb_id: tmdbId,
      is_manual: false,
    });
  }
  return questions;
}

// guess_world_premiere: Di mana film ini melakukan world premiere?
// Gunakan 2-query approach: lineup → editions → festivals (hindari !inner chain yang bisa gagal)
async function generateGuessWorldPremiere(count = 30) {
  // Query 1: ambil lineup world premiere
  const { data: lineups } = await supabase
    .from("festival_lineup")
    .select(
      `
      id, edition_id, external_title, poster_path,
      movies ( id, tmdb_id, title, poster_path )
    `,
    )
    .eq("is_world_premiere", true)
    .not("poster_path", "is", null)
    .limit(300);
  if (!lineups?.length) return [];

  // Query 2: ambil editions beserta festival name
  const editionIds = [...new Set(lineups.map((l: any) => l.edition_id))];
  const { data: editions } = await supabase
    .from("festival_editions")
    .select(`id, year, festivals!inner ( name )`)
    .in("id", editionIds);
  if (!editions?.length) return [];

  const editionMap = new Map(
    editions.map((e: any) => [
      e.id,
      { year: e.year, festName: e.festivals?.name },
    ]),
  );

  const allFestivalNames = [
    ...new Set(editions.map((e: any) => e.festivals?.name).filter(Boolean)),
  ] as string[];
  if (allFestivalNames.length < 4) return [];

  const pool = shuffle(
    lineups.filter((l: any) => editionMap.get(l.edition_id)?.festName),
  );
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const lineup = pool[i];
    const editionData = editionMap.get(lineup.edition_id);
    if (!editionData?.festName) continue;

    const festName = editionData.festName;
    const year = editionData.year;
    const filmTitle =
      lineup.movies?.title ?? lineup.external_title ?? "Unknown";
    const poster = lineup.movies?.poster_path ?? lineup.poster_path;
    const movieId = lineup.movies?.id ?? null;
    const tmdbId = lineup.movies?.tmdb_id ?? null;
    if (!poster) continue;

    const wrongFests = shuffle(
      allFestivalNames.filter((n) => n !== festName),
    ).slice(0, 3);
    if (wrongFests.length < 3) continue;
    const { options, correctLabel } = buildOptions(festName, wrongFests);
    questions.push({
      type: "guess_world_premiere",
      difficulty: "hard",
      category: "awards",
      question_text: `Di festival mana film "${filmTitle}" melakukan world premiere?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${filmTitle}" melakukan world premiere di ${festName} (${year}).`,
      image_url: posterUrl(poster),
      option_a_image: null,
      option_b_image: null,
      option_c_image: null,
      option_d_image: null,
      movie_id: movieId,
      tmdb_id: tmdbId,
      is_manual: false,
    });
  }
  return questions;
}

// guess_tv_episodes: Serial ini punya berapa total episode?
async function generateGuessTvEpisodes(count = 40) {
  const { data: series } = await supabase
    .from("tv_series")
    .select("id, tmdb_id, name, poster_path, number_of_episodes")
    .not("number_of_episodes", "is", null)
    .gt("number_of_episodes", 0)
    .not("poster_path", "is", null)
    .gt("vote_count", 100)
    .order("popularity", { ascending: false })
    .limit(300);
  if (!series?.length) return [];

  const pool = shuffle(series.filter((s: any) => s.number_of_episodes >= 1));
  const questions = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const tv = pool[i];
    const correct = String(tv.number_of_episodes);
    const delta = Math.max(5, Math.round(tv.number_of_episodes * 0.2));
    const offsets = shuffle([-delta * 2, -delta, delta, delta * 2]).slice(0, 3);
    const wrongOptions = offsets
      .map((o) => String(Math.max(1, tv.number_of_episodes + o)))
      .filter((n) => n !== correct);
    if (wrongOptions.length < 3) continue;
    const { options, correctLabel } = buildOptions(
      correct,
      wrongOptions.slice(0, 3),
    );
    questions.push({
      type: "guess_tv_episodes",
      difficulty: "hard",
      category: "general",
      question_text: `Serial "${tv.name}" memiliki berapa total episode?`,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctLabel,
      explanation: `"${tv.name}" memiliki total ${tv.number_of_episodes} episode.`,
      image_url: posterUrl(tv.poster_path),
      movie_id: null,
      series_id: tv.id,
      tmdb_id: tv.tmdb_id,
      is_manual: false,
    });
  }
  return questions;
}
// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    console.log(
      "[generate-trivia-questions] Starting — target: ~1000 questions",
    );

    // ── Fetch base movie data ────────────────────────────────────────────────
    const { data: movies, error: moviesErr } = await supabase
      .from("movies")
      .select(
        "id, tmdb_id, title, poster_path, vote_average, vote_count, popularity, overview, overview_en, release_date",
      )
      .eq("status", "Released")
      .gt("vote_count", 100)
      .order("popularity", { ascending: false })
      .limit(1000);

    if (moviesErr) throw new Error(`fetch movies: ${moviesErr.message}`);
    const movieList = movies ?? [];
    console.log(
      `[generate-trivia-questions] Loaded ${movieList.length} movies`,
    );

    // ── Generate semua kategori secara paralel ───────────────────────────────
    const [
      // ── Base generators ──────────────────────────────────────────────────
      ratingQs,
      popularQs,
      synopsisQs,
      directorQs,
      castQs,
      castCharQs,
      franchiseQs,
      franchiseOrdQs,
      tvRatingQs,
      tvSeriesQs,
      awardQs,
      genreQs,
      genreComboQs,
      yearQs,
      releaseOrdQs,
      characterQs,
      villainQs,
      // ── Phrasing variants ─────────────────────────────────────────────────
      ratingV2Qs,
      popularV2Qs,
      synopsisV2Qs,
      directorV2Qs,
      castV2Qs,
      yearV2Qs,
      // ── Tipe soal baru ────────────────────────────────────────────────────
      taglineQs,
      runtimeQs,
      languageQs,
      revenueQs,
      budgetQs,
      tvSeasonsQs,
      tvMoreSeasonsQs,
      tvEpisodesQs,
      festivalQs,
      oscarQs,
      premiereQs,
    ] = await Promise.all([
      // Base
      generateHigherRating(movieList, 20),
      generateMorePopular(movieList, 15),
      generateGuessSynopsis(movieList, 15),
      generateGuessDirector(30),
      generateGuessCast(20),
      generateGuessCastByCharacter(10),
      generateGuessFranchise(movieList, 20),
      generateGuessFranchiseOrder(movieList, 10),
      generateGuessTvRating(15),
      generateGuessTvSeries(15),
      generateGuessAward(movieList, 20),
      generateGuessGenre(movieList, 10),
      generateGuessGenreCombo(movieList, 10),
      generateGuessYear(movieList, 15),
      generateGuessReleaseOrder(movieList, 5),
      generateGuessCharacter(10),
      generateGuessVillain(10),
      // Variants
      generateHigherRatingV2(movieList, 20),
      generateMorePopularV2(movieList, 15),
      generateGuessSynopsisV2(movieList, 15),
      generateGuessDirectorV2(30),
      generateGuessCastV2(20),
      generateGuessYearV2(movieList, 15),
      // New types
      generateGuessTagline(100),
      generateGuessRuntimeLonger(movieList, 80),
      generateGuessLanguage(60),
      generateGuessHigherRevenue(60),
      generateGuessHigherBudget(60),
      generateGuessTvSeasons(60),
      generateGuessTvMoreSeasons(50),
      generateGuessTvEpisodes(40),
      generateGuessFestival(50),
      generateGuessOscarContender(movieList, 60),
      generateGuessWorldPremiere(50),
    ]);

    // ── Gabungkan semua soal ─────────────────────────────────────────────────
    const allQuestions = [
      // Base
      ...ratingQs,
      ...popularQs,
      ...synopsisQs,
      ...directorQs,
      ...castQs,
      ...castCharQs,
      ...franchiseQs,
      ...franchiseOrdQs,
      ...tvRatingQs,
      ...tvSeriesQs,
      ...awardQs,
      ...genreQs,
      ...genreComboQs,
      ...yearQs,
      ...releaseOrdQs,
      ...characterQs,
      ...villainQs,
      // Variants
      ...ratingV2Qs,
      ...popularV2Qs,
      ...synopsisV2Qs,
      ...directorV2Qs,
      ...castV2Qs,
      ...yearV2Qs,
      // New types
      ...taglineQs,
      ...runtimeQs,
      ...languageQs,
      ...revenueQs,
      ...budgetQs,
      ...tvSeasonsQs,
      ...tvMoreSeasonsQs,
      ...tvEpisodesQs,
      ...festivalQs,
      ...oscarQs,
      ...premiereQs,
    ];

    // ── Summary breakdown ────────────────────────────────────────────────────
    const breakdown = {
      general: {
        higher_rating: ratingQs.length + ratingV2Qs.length,
        more_popular: popularQs.length + popularV2Qs.length,
        guess_synopsis: synopsisQs.length + synopsisV2Qs.length,
        guess_tagline: taglineQs.length,
        guess_runtime_longer: runtimeQs.length,
        guess_language: languageQs.length,
        guess_higher_revenue: revenueQs.length,
        guess_higher_budget: budgetQs.length,
        subtotal:
          ratingQs.length +
          ratingV2Qs.length +
          popularQs.length +
          popularV2Qs.length +
          synopsisQs.length +
          synopsisV2Qs.length +
          taglineQs.length +
          runtimeQs.length +
          languageQs.length +
          revenueQs.length +
          budgetQs.length,
      },
      director: {
        guess_director: directorQs.length + directorV2Qs.length,
        subtotal: directorQs.length + directorV2Qs.length,
      },
      actor: {
        guess_cast: castQs.length + castV2Qs.length,
        guess_cast_by_character: castCharQs.length,
        subtotal: castQs.length + castV2Qs.length + castCharQs.length,
      },
      franchise: {
        guess_franchise: franchiseQs.length,
        guess_franchise_order: franchiseOrdQs.length,
        subtotal: franchiseQs.length + franchiseOrdQs.length,
      },
      tv_series: {
        guess_tv_rating: tvRatingQs.length,
        guess_tv_series: tvSeriesQs.length,
        guess_tv_seasons: tvSeasonsQs.length,
        guess_tv_more_seasons: tvMoreSeasonsQs.length,
        guess_tv_episodes: tvEpisodesQs.length,
        subtotal:
          tvRatingQs.length +
          tvSeriesQs.length +
          tvSeasonsQs.length +
          tvMoreSeasonsQs.length +
          tvEpisodesQs.length,
      },
      awards: {
        guess_award_film: awardQs.length,
        guess_festival: festivalQs.length,
        guess_oscar_contender: oscarQs.length,
        guess_world_premiere: premiereQs.length,
        subtotal:
          awardQs.length +
          festivalQs.length +
          oscarQs.length +
          premiereQs.length,
      },
      genre: {
        guess_genre: genreQs.length,
        guess_genre_combo: genreComboQs.length,
        subtotal: genreQs.length + genreComboQs.length,
      },
      timeline: {
        guess_year: yearQs.length + yearV2Qs.length,
        guess_release_order: releaseOrdQs.length,
        subtotal: yearQs.length + yearV2Qs.length + releaseOrdQs.length,
      },
      character: {
        guess_character: characterQs.length,
        guess_villain: villainQs.length,
        subtotal: characterQs.length + villainQs.length,
      },
    };

    const byDifficulty = {
      easy: allQuestions.filter((q) => q.difficulty === "easy").length,
      medium: allQuestions.filter((q) => q.difficulty === "medium").length,
      hard: allQuestions.filter((q) => q.difficulty === "hard").length,
    };

    console.log(
      `[generate-trivia-questions] Generated ${allQuestions.length} questions`,
      JSON.stringify({
        breakdown: Object.fromEntries(
          Object.entries(breakdown).map(([k, v]) => [k, (v as any).subtotal]),
        ),
        byDifficulty,
      }),
    );

    // ── Hapus soal auto-gen lama ─────────────────────────────────────────────
    const { error: deleteErr } = await supabase
      .from("questions")
      .delete()
      .eq("is_manual", false);

    if (deleteErr)
      throw new Error(`delete old questions: ${deleteErr.message}`);

    // ── Batch insert ─────────────────────────────────────────────────────────
    const BATCH_SIZE = 50;
    let inserted = 0;
    const insertErrors: string[] = [];

    for (let i = 0; i < allQuestions.length; i += BATCH_SIZE) {
      const batch = allQuestions.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase
        .from("questions")
        .insert(batch);

      if (insertErr) {
        console.error(
          `[generate-trivia-questions] Batch ${i / BATCH_SIZE + 1} error:`,
          insertErr.message,
        );
        insertErrors.push(insertErr.message);
        continue;
      }
      inserted += batch.length;
    }

    console.log(
      `[generate-trivia-questions] Inserted ${inserted}/${allQuestions.length} questions`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        generated: allQuestions.length,
        inserted,
        breakdown,
        by_difficulty: byDifficulty,
        insert_errors: insertErrors.length ? insertErrors : undefined,
        run_at: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-trivia-questions] Fatal error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
