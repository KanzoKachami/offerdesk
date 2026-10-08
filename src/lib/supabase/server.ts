import { createServerClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      // Данные из базы всегда свежие: Next.js не должен кэшировать ответы Supabase
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // вызов из Server Component — куки обновит middleware
          }
        },
      },
    }
  );
}
