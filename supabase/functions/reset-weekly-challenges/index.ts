// supabase/functions/reset-weekly-challenges/index.ts
//
// Cleanup user_challenges weekly yang sudah lebih dari 13 minggu (~3 bulan).
// Dijalankan via GitHub Actions setiap Senin 17:00 UTC (00:00 WIB).
//
// Sama seperti daily — weekly period otomatis reset karena period_start
// menggunakan date_trunc('week', current_date). Function ini hanya cleanup.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const RETENTION_WEEKS = 13;

// ─── Cleanup Logic ────────────────────────────────────────────────────────────

async function cleanupWeeklyChallenges(): Promise<{
  deleted: number;
  cutoff: string;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_WEEKS * 7);
  const cutoffStr = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

  // Ambil challenge_id untuk weekly challenges
  const { data: weeklyIds, error: idError } = await supabase
    .from("challenges")
    .select("id")
    .eq("type", "weekly");

  if (idError)
    throw new Error(`fetch weekly challenge ids: ${idError.message}`);

  const ids = (weeklyIds ?? []).map((r: any) => r.id);
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
    const result = await cleanupWeeklyChallenges();

    console.log(
      `[reset-weekly-challenges] Deleted ${result.deleted} rows older than ${result.cutoff}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Weekly challenges cleanup completed",
        deleted: result.deleted,
        cutoff: result.cutoff,
        run_at: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[reset-weekly-challenges] Error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
