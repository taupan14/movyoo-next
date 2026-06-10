// lib/supabase-server.ts — FILE BARU
// Untuk digunakan di API Routes (Edge Functions) dan Server Components

import { createServerClient } from "@supabase/ssr";
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
