// app/api/rewards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const featured = searchParams.get("featured");
  const search = searchParams.get("q");

  const supabase = await createSupabaseServer();

  let query = supabase
    .from("rewards_with_stats")
    .select("*")
    .neq("status", "archived")
    .order("sort_order", { ascending: true });

  if (category && category !== "all") {
    query = query.eq("category", category);
  }
  if (featured === "true") {
    query = query.eq("is_featured", true);
  }
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[api/rewards]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
