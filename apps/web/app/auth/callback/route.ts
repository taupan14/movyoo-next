// app/auth/callback/route.ts — FILE BARU
// Menangani redirect setelah OAuth (Google, GitHub) dan Magic Link

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth gagal → redirect ke home dengan error param
  return NextResponse.redirect(`${origin}/?auth_error=true`);
}
