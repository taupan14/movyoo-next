/**
 * lib/ai-curator-db.ts
 *
 * Semua operasi Supabase pakai `supabase` (anon client) dari ./supabase.
 * Tidak butuh SUPABASE_SERVICE_ROLE_KEY.
 *
 * RLS di tabel ai_curator_cache:
 *  - SELECT: publik (global) atau auth.uid() = user_id (per-user)
 *  - INSERT/DELETE: dikontrol via route server-side — RLS dimatikan untuk
 *    operasi write dengan mengandalkan bahwa route hanya berjalan di server.
 *    Alternatif: tambahkan policy "allow insert for authenticated" di Supabase.
 */

import { supabase } from "./supabase";
import type { HiddenGem } from "./hidden-gems-db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CuratorCollection {
  title: string;
  title_en: string;
  theme: string;
  ids: number[];
}

export interface CuratorPayload {
  collections: CuratorCollection[];
  week_key: string;
  generated_at: string;
  personalized: boolean;
}

interface GemSummary {
  tmdb_id: number;
  title: string;
  genres: number[];
  vote_average: number;
  source: "gem" | "watchlist";
  overview: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function currentWeekKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const week = Math.ceil(
    ((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function hashIds(ids: number[]): string {
  const str = [...ids].sort((a, b) => a - b).join(",");
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// ─── Read Cache ───────────────────────────────────────────────────────────────

export async function getCuratorCache(
  type: "movie" | "tv",
  lang: string,
  userId: string | null,
): Promise<CuratorPayload | null> {
  const weekKey = currentWeekKey();

  // Coba per-user dulu
  if (userId) {
    const { data } = await supabase
      .from("ai_curator_cache")
      .select("payload, generated_at")
      .eq("week_key", weekKey)
      .eq("type", type)
      .eq("lang", lang)
      .eq("user_id", userId)
      .single();

    if (data) {
      return {
        collections: (data as any).payload as CuratorCollection[],
        week_key: weekKey,
        generated_at: (data as any).generated_at,
        personalized: true,
      };
    }
  }

  // Fallback: global cache
  const { data: globalData } = await supabase
    .from("ai_curator_cache")
    .select("payload, generated_at")
    .eq("week_key", weekKey)
    .eq("type", type)
    .eq("lang", lang)
    .is("user_id", null)
    .single();

  if (!globalData) return null;

  return {
    collections: (globalData as any).payload as CuratorCollection[],
    week_key: weekKey,
    generated_at: (globalData as any).generated_at,
    personalized: false,
  };
}

// ─── Write Cache ──────────────────────────────────────────────────────────────

export async function setCuratorCache(
  type: "movie" | "tv",
  lang: string,
  collections: CuratorCollection[],
  userId: string | null,
  inputHash: string,
): Promise<void> {
  const weekKey = currentWeekKey();

  // Hapus baris lama (jika ada) — delete-then-insert karena partial unique index
  const deleteQuery = supabase
    .from("ai_curator_cache")
    .delete()
    .eq("week_key", weekKey)
    .eq("type", type)
    .eq("lang", lang);

  if (userId) {
    await deleteQuery.eq("user_id", userId);
  } else {
    await deleteQuery.is("user_id", null);
  }

  // Insert baru
  const { error } = await supabase.from("ai_curator_cache").insert({
    week_key: weekKey,
    type,
    lang,
    user_id: userId ?? null,
    payload: collections,
    input_hash: inputHash,
    generated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[ai-curator-db] setCuratorCache:", error.message);
  }
}

// ─── Fetch Watchlist Films ────────────────────────────────────────────────────

export async function fetchWatchlistGems(
  userId: string,
  lang: string,
): Promise<HiddenGem[]> {
  // 1. Ambil movie_id dari watchlist
  const { data: wl, error: wErr } = await supabase
    .from("user_watchlist")
    .select("movie_id")
    .eq("user_id", userId)
    .eq("media_type", "movie")
    .not("movie_id", "is", null)
    .limit(50);

  if (wErr || !wl?.length) return [];

  const movieIds = wl.map((r: any) => r.movie_id as number);

  // 2. Ambil detail film
  const { data: movies, error: mErr } = await supabase
    .from("movies")
    .select(
      "id, tmdb_id, title, poster_path, backdrop_path, vote_average, vote_count, popularity, overview, overview_en, release_date",
    )
    .in("id", movieIds)
    .gte("vote_average", 6.0)
    .not("poster_path", "is", null)
    .order("vote_average", { ascending: false })
    .limit(20);

  if (mErr || !movies?.length) return [];

  // 3. Ambil genre
  const ids = movies.map((m: any) => m.id);
  const { data: genreLinks } = await supabase
    .from("movie_genres")
    .select("movie_id, genres(tmdb_genre_id)")
    .in("movie_id", ids);

  const genreMap = new Map<number, number[]>();
  for (const link of (genreLinks ?? []) as any[]) {
    const gid = link.genres?.tmdb_genre_id;
    if (!gid) continue;
    const arr = genreMap.get(link.movie_id) ?? [];
    arr.push(gid);
    genreMap.set(link.movie_id, arr);
  }

  const pickOverview = (m: any) =>
    lang === "id"
      ? m.overview || m.overview_en || ""
      : m.overview_en || m.overview || "";

  return movies.map((m: any) => ({
    id: m.id,
    tmdb_id: m.tmdb_id,
    title: m.title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    vote_average: Number(m.vote_average),
    vote_count: Number(m.vote_count ?? 0),
    popularity: Number(m.popularity ?? 0),
    overview: pickOverview(m),
    release_date: m.release_date,
    genre_ids: genreMap.get(m.id) ?? [],
    media_type: "movie" as const,
    gem_score: 0,
  }));
}

// ─── OpenRouter LLM Grouping ────────────────────────────────────────────────

export async function generateCuratorCollections(
  gems: HiddenGem[],
  watchlistGems: HiddenGem[],
  type: "movie" | "tv",
  lang: "id" | "en",
): Promise<{ collections: CuratorCollection[]; inputHash: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = "llama-3.3-70b-versatile";

  if (!apiKey) {
    console.error("[ai-curator] GROQ_API_KEY not set");
    return { collections: [], inputHash: "" };
  }

  const gemTmdbIds = new Set(gems.map((g) => g.tmdb_id));

  const uniqueWatchlist = watchlistGems.filter(
    (w) => !gemTmdbIds.has(w.tmdb_id),
  );

  const allItems: GemSummary[] = [
    ...gems.map((g) => ({
      tmdb_id: g.tmdb_id,
      title: g.title,
      genres: g.genre_ids,
      vote_average: g.vote_average,
      source: "gem" as const,
      overview: g.overview.slice(0, 180),
    })),
    ...uniqueWatchlist.map((w) => ({
      tmdb_id: w.tmdb_id,
      title: w.title,
      genres: w.genre_ids,
      vote_average: w.vote_average,
      source: "watchlist" as const,
      overview: w.overview.slice(0, 180),
    })),
  ];

  if (allItems.length < 4) {
    return { collections: [], inputHash: "" };
  }

  const inputHash = hashIds(allItems.map((i) => i.tmdb_id));

  const isPersonalized = uniqueWatchlist.length > 0;

  const mediaLabel = type === "movie" ? "films" : "TV series";

  const idLang = lang === "id" ? "Indonesian" : "English";

  const prompt = `
You are a professional film curator assistant.

Group the following ${mediaLabel} into thematic collections.

RULES:
- Create exactly 3 to 4 collections
- Each collection contains 2 to 6 items
- Every item must appear exactly once
- Collections should feel cinematic and curated
- Theme can be mood, genre, era, emotional tone, setting, or storytelling style
- Avoid generic titles
- Return ONLY valid JSON

JSON format:
{
  "collections": [
    {
      "title": "localized title",
      "title_en": "english title",
      "theme": "one sentence theme",
      "ids": [1,2,3]
    }
  ]
}

Items:
${JSON.stringify(allItems, null, 2)}
`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Cinema Discovery AI Curator",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content:
              "You are a cinematic AI curator that only returns valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error(
        "[ai-curator] OpenRouter error:",
        res.status,
        await res.text(),
      );

      return {
        collections: [],
        inputHash,
      };
    }

    const json = await res.json();

    const raw = json.choices?.[0]?.message?.content ?? "{}";

    const parsed = JSON.parse(raw) as {
      collections: CuratorCollection[];
    };

    const validTmdbIds = new Set(allItems.map((i) => i.tmdb_id));

    const validated = (parsed.collections ?? [])
      .filter(
        (c) =>
          typeof c.title === "string" &&
          typeof c.title_en === "string" &&
          typeof c.theme === "string" &&
          Array.isArray(c.ids),
      )
      .map((c) => ({
        ...c,
        ids: c.ids.filter(
          (id) => typeof id === "number" && validTmdbIds.has(id),
        ),
      }))
      .filter((c) => c.ids.length > 0);

    console.log(`[ai-curator] generated ${validated.length} collections`);

    return {
      collections: validated,
      inputHash,
    };
  } catch (e) {
    console.error("[ai-curator] generateCuratorCollections:", e);

    return {
      collections: [],
      inputHash,
    };
  }
}
