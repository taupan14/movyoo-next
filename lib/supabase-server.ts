// lib/supabase-server.ts
// Untuk digunakan di API Routes (Edge Functions) dan Server Components

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll dipanggil dari Server Component — bisa diabaikan
          }
        },
      },
    },
  );
}

// Untuk server-to-server calls yang tidak punya session user
// (webhook, background jobs, cron, dsb.)
// Menggunakan service role key → bypass RLS sepenuhnya
// ⚠️  Jangan pernah expose ke client-side
export function createSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "[supabase-server] NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum di-set",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// Untuk middleware (sync version)
export function createSupabaseMiddleware(request: Request, response: Response) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return (request as any).cookies?.getAll?.() ?? [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            (response as any).cookies?.set?.(name, value, options);
          });
        },
      },
    },
  );
}
