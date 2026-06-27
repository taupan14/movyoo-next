// app/api/auth/signout/route.ts
import { createSupabaseServer } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createSupabaseServer();

  // Global signout dari server — invalidate session di Supabase + clear cookies
  await supabase.auth.signOut({ scope: "global" });

  return NextResponse.json({ success: true });
}
