import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_PUBLIC_CONFIG } from './public-config.ts';

/** Per-request client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_PUBLIC_CONFIG.url, SUPABASE_PUBLIC_CONFIG.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component */
        }
      },
    },
  });
}
