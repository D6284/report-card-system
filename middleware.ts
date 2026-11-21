import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabasePublicConfigured, SUPABASE_SETUP_MESSAGE } from '@/lib/supabase/config';
import { SUPABASE_PUBLIC_CONFIG } from '@/lib/supabase/public-config';
import { isLocalAuthEnabled, readLocalSessionFromRequest } from '@/lib/auth/local-token';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const path = req.nextUrl.pathname;
  const open = path.startsWith('/login') || path.startsWith('/reset-password') || path.startsWith('/auth/callback');
  if (isLocalAuthEnabled()) {
    const local = await readLocalSessionFromRequest(req);
    if (local && path === '/login') return NextResponse.redirect(new URL('/dashboard', req.url));
    if (local) return res;
  }
  if (!isSupabasePublicConfigured()) {
    if (path === '/login') return res;
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(SUPABASE_SETUP_MESSAGE)}`, req.url));
  }
  const supabase = createServerClient(SUPABASE_PUBLIC_CONFIG.url, SUPABASE_PUBLIC_CONFIG.anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !open) return NextResponse.redirect(new URL('/login', req.url));
  if (user && path === '/login') return NextResponse.redirect(new URL('/dashboard', req.url));
  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
