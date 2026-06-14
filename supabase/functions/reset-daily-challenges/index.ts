// supabase/functions/reset-daily-challenges/index.ts
//
// Cleanup user_challenges daily yang sudah lebih dari 30 hari.
// Dijalankan via GitHub Actions setiap hari 17:00 UTC (00:00 WIB).
//
// Catatan: tier reset TIDAK perlu dilakukan manual — get_active_challenges
// dan increment_challenge_progress sudah filter by period_start = current_date,
// sehingga setiap hari otomatis mulai dari tier 5 lagi.
// Function ini hanya membersihkan data lama agar tabel tidak membengkak.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const RETENTION_DAYS = 30;

// ─── Cleanup Logic ────────────────────────────────────────────────────────────

async function cleanupDailyChallenges(): Promise<{
  deleted: number;
  cutoff: string;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

  // Ambil challenge_id untuk daily challenges
  const { data: dailyIds, error: idError } = await supabase
    .from("challenges")
    .select("id")
    .eq("type", "daily");

  if (idError) throw new Error(`fetch daily challenge ids: ${idError.message}`);

  const ids = (dailyIds ?? []).map((r: any) => r.id);
  if (ids.length === 0) return { deleted: 0, cutoff: cutoffStr };

  const { data: deleted, error: deleteError } = await supabase
    .from("user_challenges")
    .delete()
    .lt("period_start", cutoffStr)
    .in("challenge_id", ids)
    .select("id");

  if (deleteError)
    throw new Error(`delete user_challenges: ${deleteError.message}`);

  return {
    deleted: deleted?.length ?? 0,
    cutoff: cutoffStr,
  };
}

// ─── Edge Function Handler ────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await cleanupDailyChallenges();

    console.log(
      `[reset-daily-challenges] Deleted ${result.deleted} rows older than ${result.cutoff}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Daily challenges cleanup completed",
        deleted: result.deleted,
        cutoff: result.cutoff,
        run_at: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[reset-daily-challenges] Error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
