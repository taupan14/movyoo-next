/**
 * supabase/functions/generate-articles/index.ts
 * Edge Function — Auto-generate artikel SEO menggunakan Groq
 *
 * Trigger: manual via Supabase Dashboard / cron job
 *
 * ENV required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GROQ_API_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ─── Template topics untuk auto-generate ─────────────────────────────────────
// Setiap item akan menghasilkan 1 artikel.
// Expand list ini untuk mencapai 500–5000 artikel.

const TOPIC_TEMPLATES: Array<{
  topic_type: string;
  topic_value: string;
  title: string;
  title_en?: string;
  prompt: string; // instruksi untuk Groq
  genre_filter?: number[]; // tmdb_genre_ids untuk query film
  platform_filter?: string[]; // platform slugs
  sort?: "popular" | "top_rated" | "latest";
}> = [
  {
    topic_type: "genre",
    topic_value: "Action",
    title: "Film Action Terbaik 2025 yang Wajib Ditonton",
    prompt:
      "Tulis intro editorial bahasa Indonesia (3-4 paragraf, ~300 kata) tentang film action terbaik 2025. Bahas mengapa genre action sangat digemari, tren CGI terkini, dan apa yang membuat film action berkesan. Jangan tulis daftar filmnya di sini, hanya editorial.",
    genre_filter: [28],
    sort: "top_rated",
  },
  {
    topic_type: "genre",
    topic_value: "Horror Korea",
    title: "Film Horor Korea Terbaik yang Bikin Merinding",
    prompt:
      "Tulis intro editorial bahasa Indonesia (3-4 paragraf, ~300 kata) tentang film horor Korea (K-Horror). Bahas keunikan horor Korea dibanding horor barat, elemen budaya yang dipakai, dan kenapa K-Horror semakin populer global.",
    genre_filter: [27],
    sort: "top_rated",
  },
  {
    topic_type: "platform",
    topic_value: "Netflix",
    title: "Film Terbaik di Netflix Indonesia yang Sayang Dilewatkan",
    prompt:
      "Tulis intro editorial bahasa Indonesia (3-4 paragraf, ~300 kata) tentang film-film unggulan di Netflix Indonesia. Bahas keberagaman konten Netflix, original Netflix yang berhasil, dan cara memilih tontonan terbaik.",
    platform_filter: ["netflix"],
    sort: "popular",
  },
  {
    topic_type: "genre",
    topic_value: "Zombie",
    title: "Film Zombie Terbaik Sepanjang Masa: Dari Klasik Hingga Modern",
    prompt:
      "Tulis intro editorial bahasa Indonesia (3-4 paragraf, ~300 kata) tentang film zombie. Bahas evolusi genre zombie dari Romero hingga sekarang, variasi interpretasi zombie, dan daya tariknya sebagai metafora sosial.",
    genre_filter: [27, 28],
    sort: "top_rated",
  },
  {
    topic_type: "genre",
    topic_value: "Thriller Psikologi",
    title: "Film Thriller Psikologi Terbaik yang Membuatmu Berpikir",
    prompt:
      "Tulis intro editorial bahasa Indonesia (3-4 paragraf, ~300 kata) tentang film thriller psikologi. Bahas elemen twist ending, permainan ketegangan mental, dan sutradara-sutradara ahli genre ini.",
    genre_filter: [53, 9648],
    sort: "top_rated",
  },
  // ── Tambahkan lebih banyak template di sini untuk reach 500–5000 artikel ──
  // Contoh ekspansi otomatis: loop tahun 2010–2025 × genre = ratusan artikel
];

// ─── Groq completion ──────────────────────────────────────────────────────────

async function groqComplete(prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah editor film Indonesia profesional yang menulis konten SEO berkualitas tinggi. Tulis dalam bahasa Indonesia yang natural, informatif, dan menarik. Tidak perlu markdown heading.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

// ─── Fetch matching movies from DB ───────────────────────────────────────────

async function fetchMovieIds(
  genreFilter?: number[],
  platformFilter?: string[],
  sort = "popular",
  limit = 20,
): Promise<number[]> {
  let movieIds: number[] | null = null;

  // Genre filter
  if (genreFilter?.length) {
    const { data: genreRows } = await supabase
      .from("genres")
      .select("id")
      .in("tmdb_genre_id", genreFilter);

    const gids = (genreRows ?? []).map((r: any) => r.id);
    if (gids.length) {
      const { data } = await supabase
        .from("movie_genres")
        .select("movie_id")
        .in("genre_id", gids)
        .limit(3000);
      movieIds = [...new Set((data ?? []).map((r: any) => r.movie_id))];
    }
  }

  // Platform filter
  if (platformFilter?.length) {
    const { data: platRows } = await supabase
      .from("platforms")
      .select("id")
      .in("slug", platformFilter);
    const pids = (platRows ?? []).map((r: any) => r.id);
    if (pids.length) {
      const { data } = await supabase
        .from("movie_platforms")
        .select("movie_id")
        .in("platform_id", pids)
        .eq("region", "ID")
        .limit(3000);
      const pMovieIds = new Set((data ?? []).map((r: any) => r.movie_id));
      movieIds = movieIds
        ? movieIds.filter((id) => pMovieIds.has(id))
        : Array.from(pMovieIds);
    }
  }

  // Main query
  let q = supabase
    .from("movies")
    .select("id")
    .not("poster_path", "is", null)
    .gt("vote_count", 100);

  if (movieIds?.length) q = q.in("id", movieIds);

  const orderCol =
    sort === "top_rated"
      ? "vote_average"
      : sort === "latest"
        ? "release_date"
        : "popularity";
  q = q.order(orderCol, { ascending: false }).limit(limit);

  const { data } = await q;
  return (data ?? []).map((r: any) => r.id);
}

// ─── Slugify ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const results: { title: string; status: string; slug?: string }[] = [];

  for (const tpl of TOPIC_TEMPLATES) {
    const slug = slugify(tpl.title);

    // Skip kalau sudah ada
    const { data: existing } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      results.push({
        title: tpl.title,
        status: "skipped (already exists)",
        slug,
      });
      continue;
    }

    try {
      // 1. Generate editorial body via Groq
      const body = await groqComplete(tpl.prompt);

      // 2. Fetch movie IDs
      const movieIds = await fetchMovieIds(
        tpl.genre_filter,
        tpl.platform_filter,
        tpl.sort,
        15,
      );

      // 3. Ambil cover dari film pertama
      const { data: firstMovie } = await supabase
        .from("movies")
        .select("backdrop_path")
        .in("id", movieIds.slice(0, 1))
        .single();

      // 4. Insert artikel
      const { data: article, error: articleErr } = await supabase
        .from("articles")
        .insert({
          slug,
          title: tpl.title,
          title_en: tpl.title_en ?? null,
          excerpt: body.slice(0, 200).replace(/\n/g, " ") + "…",
          body: `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
          cover_path: firstMovie?.backdrop_path ?? null,
          lang: "id",
          status: "published",
          source: "auto",
          topic_type: tpl.topic_type,
          topic_value: tpl.topic_value,
          published_at: new Date().toISOString(),
          meta_title: `${tpl.title} — Movyoo`,
          meta_desc: body.slice(0, 155),
        })
        .select("id")
        .single();

      if (articleErr || !article)
        throw new Error(articleErr?.message ?? "insert failed");

      // 5. Insert article_movies
      if (movieIds.length) {
        await supabase.from("article_movies").insert(
          movieIds.map((movie_id, i) => ({
            article_id: article.id,
            movie_id,
            sort_order: i,
          })),
        );
      }

      results.push({ title: tpl.title, status: "created", slug });
    } catch (err: any) {
      results.push({ title: tpl.title, status: `error: ${err.message}` });
    }
  }

  return Response.json({ ok: true, results });
});
