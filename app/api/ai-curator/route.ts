/**
 * app/api/ai-curator/route.ts
 *
 * Route Handler — AI Curator (Weekly Thematic Collections)
 * Runtime: Node.js (bukan edge) — kompatibel dengan supabase-js standard client.
 *
 * GET /api/ai-curator?type=movie&lang=id
 * Header: Authorization: Bearer <jwt>  (opsional — untuk personalisasi)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getCuratorCache,
  setCuratorCache,
  generateCuratorCollections,
  fetchWatchlistGems,
  currentWeekKey,
} from "@/lib/ai-curator-db";
import { fetchHiddenGems, type HiddenGem } from "@/lib/hidden-gems-db";

// !! Hapus "edge" — supabase-js standard client tidak kompatibel dengan Edge Runtime
// export const runtime = "edge";
export const dynamic = "force-dynamic";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await sb.auth.getUser(token);
    return data.user?.id ?? null;
  } catch (e) {
    console.error("[ai-curator] getUserId failed:", e);
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") ?? "movie") as "movie" | "tv";
  const lang = (searchParams.get("lang") ?? "id") as "id" | "en";

  if (!["movie", "tv"].includes(type) || !["id", "en"].includes(lang)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const steps: string[] = [];

  try {
    // ── Step 1: Env check ───────────────────────────────────────────────────
    steps.push("step1_env");
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
      throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY missing");

    // ── Step 2: Auth ────────────────────────────────────────────────────────
    steps.push("step2_auth");
    const userId = await getUserId(req);

    // ── Step 3: Cache check ─────────────────────────────────────────────────
    steps.push("step3_cache");
    const cached = await getCuratorCache(type, lang, userId);
    if (cached) {
      if (userId && !cached.personalized) {
        generatePersonalizedInBackground(type, lang, userId).catch(() => {});
      }
      return NextResponse.json({ ...cached, from_cache: true });
    }

    // ── Step 4: Hidden gems ─────────────────────────────────────────────────
    steps.push("step4_gems");
    const { movies, series } = await fetchHiddenGems(lang, null);
    const gems: HiddenGem[] = type === "movie" ? movies : series;
    console.log(`[ai-curator] gems fetched: ${gems.length} (type=${type})`);

    if (gems.length < 4) {
      return NextResponse.json({
        collections: [],
        week_key: currentWeekKey(),
        generated_at: "",
        from_cache: false,
        personalized: false,
        debug: `only ${gems.length} gems found`,
      });
    }

    // ── Step 5: Watchlist ───────────────────────────────────────────────────
    steps.push("step5_watchlist");
    const watchlistGems: HiddenGem[] = userId
      ? await fetchWatchlistGems(userId, lang)
      : [];
    console.log(`[ai-curator] watchlist gems: ${watchlistGems.length}`);

    // ── Step 6: OpenAI ──────────────────────────────────────────────────────
    steps.push("step6_llm");
    const { collections, inputHash } = await generateCuratorCollections(
      gems,
      watchlistGems,
      type,
      lang,
    );
    console.log(`[ai-curator] collections generated: ${collections.length}`);

    // ── Step 7: Save cache ──────────────────────────────────────────────────
    steps.push("step7_cache_save");
    const isPersonalized = watchlistGems.length > 0;
    if (collections.length > 0) {
      setCuratorCache(
        type,
        lang,
        collections,
        isPersonalized ? userId : null,
        inputHash,
      ).catch((e) => console.error("[ai-curator] save cache failed:", e));
      if (isPersonalized) {
        ensureGlobalCache(gems, type, lang).catch(() => {});
      }
    }

    return NextResponse.json({
      collections,
      week_key: currentWeekKey(),
      generated_at: new Date().toISOString(),
      from_cache: false,
      personalized: isPersonalized,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(`[/api/ai-curator] FAILED at ${steps.at(-1)}:`, e);
    return NextResponse.json(
      {
        collections: [],
        week_key: "",
        generated_at: "",
        from_cache: false,
        personalized: false,
        _debug: { failed_at: steps.at(-1), error: msg, stack },
      },
      { status: 500 },
    );
  }
}

// ─── Background helpers ───────────────────────────────────────────────────────

async function generatePersonalizedInBackground(
  type: "movie" | "tv",
  lang: "id" | "en",
  userId: string,
): Promise<void> {
  const [{ movies, series }, watchlistGems] = await Promise.all([
    fetchHiddenGems(lang, null),
    fetchWatchlistGems(userId, lang),
  ]);

  if (!watchlistGems.length) return;

  const gems: HiddenGem[] = type === "movie" ? movies : series;
  const { collections, inputHash } = await generateCuratorCollections(
    gems,
    watchlistGems,
    type,
    lang,
  );

  if (collections.length > 0) {
    await setCuratorCache(type, lang, collections, userId, inputHash);
  }
}

async function ensureGlobalCache(
  gems: HiddenGem[],
  type: "movie" | "tv",
  lang: "id" | "en",
): Promise<void> {
  const existing = await getCuratorCache(type, lang, null);
  if (existing) return;

  const { collections, inputHash } = await generateCuratorCollections(
    gems,
    [],
    type,
    lang,
  );

  if (collections.length > 0) {
    await setCuratorCache(type, lang, collections, null, inputHash);
  }
}
