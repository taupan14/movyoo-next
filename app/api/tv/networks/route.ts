/**
 * GET /api/tv/networks
 *
 * Query params:
 *   q     — search string (optional, filter nama)
 *   limit — integer (default: 100)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const limit = Math.min(200, parseInt(sp.get("limit") ?? "100"));

  let query = supabase
    .from("tv_networks")
    .select("id, tmdb_network_id, name")
    .order("name", { ascending: true })
    .limit(limit);

  if (q.length > 0) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[/api/tv/networks]", error.message);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
