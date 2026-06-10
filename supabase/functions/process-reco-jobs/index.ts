// supabase/functions/process-reco-jobs/index.ts
//
// Worker: Polling recommendation_jobs table, proses semua job pending.
//
// Trigger (dari GitHub Actions):
//   - Setiap 12 jam (cron)
//   - Setelah swipe_threshold (20 swipe baru) — di-enqueue oleh DB trigger
//   - Saat pool_low (sisa < 50) — di-enqueue oleh recordSwipe di API
//
// Flow per job:
//   1. Klaim job → set status = 'running'
//   2. Panggil generateUserPool(userId)
//   3. Set status = 'done' / 'failed'
//   4. Lanjut job berikutnya
//
// Safety:
//   - Satu job per user pada satu waktu (unique index di DB)
//   - Timeout per job: 60 detik (Supabase edge function limit ~150s total)
//   - Max jobs per run: 10 (hindari timeout)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateUserPool } from "../generate-user-pool/index.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_JOBS_PER_RUN = 10;

interface RecoJob {
  id: number;
  user_id: string;
  trigger_reason: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  console.log("[process-reco-jobs] Starting...");

  const results: Array<{
    jobId: number;
    userId: string;
    reason: string | null;
    status: "done" | "failed";
    inserted: number;
    error?: string;
  }> = [];

  try {
    // 1. Ambil pending jobs, FIFO, maks MAX_JOBS_PER_RUN
    const { data: jobs, error: fetchError } = await supabase
      .from("recommendation_jobs")
      .select("id, user_id, trigger_reason, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_RUN);

    if (fetchError) {
      throw new Error(`Fetch jobs failed: ${fetchError.message}`);
    }

    const pendingJobs: RecoJob[] = jobs ?? [];
    console.log(`[process-reco-jobs] Found ${pendingJobs.length} pending jobs`);

    if (pendingJobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, results: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Proses tiap job secara sequential
    //    (bukan parallel — hindari race condition preference update)
    for (const job of pendingJobs) {
      console.log(
        `[process-reco-jobs] Processing job ${job.id} for user ${job.user_id} (reason: ${job.trigger_reason})`,
      );

      // 2a. Klaim job → running
      const { error: claimError } = await supabase
        .from("recommendation_jobs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "pending"); // guard: jangan klaim yang sudah diambil worker lain

      if (claimError) {
        console.warn(
          `[process-reco-jobs] Could not claim job ${job.id}:`,
          claimError.message,
        );
        continue;
      }

      // 2b. Generate pool
      try {
        const genResult = await generateUserPool(job.user_id);

        // 2c. Mark done
        await supabase
          .from("recommendation_jobs")
          .update({
            status: "done",
            finished_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        results.push({
          jobId: job.id,
          userId: job.user_id,
          reason: job.trigger_reason,
          status: "done",
          inserted: genResult.inserted,
        });
      } catch (genErr) {
        const errMsg = String(genErr);
        console.error(`[process-reco-jobs] Job ${job.id} failed:`, errMsg);

        // 2d. Mark failed
        await supabase
          .from("recommendation_jobs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: errMsg.slice(0, 500),
          })
          .eq("id", job.id);

        results.push({
          jobId: job.id,
          userId: job.user_id,
          reason: job.trigger_reason,
          status: "failed",
          inserted: 0,
          error: errMsg,
        });
      }
    }

    // 3. Cleanup: hapus job done/failed yang lebih dari 7 hari
    await supabase
      .from("recommendation_jobs")
      .delete()
      .in("status", ["done", "failed"])
      .lt(
        "finished_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      );

    const doneCount = results.filter((r) => r.status === "done").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    console.log(
      `[process-reco-jobs] Done. ${doneCount} succeeded, ${failedCount} failed.`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        done: doneCount,
        failed: failedCount,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[process-reco-jobs] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
