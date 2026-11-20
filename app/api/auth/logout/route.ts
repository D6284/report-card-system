import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LOCAL_AUTH_COOKIE } from '@/lib/auth/local';

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.delete(LOCAL_AUTH_COOKIE);
  const supabase = await createClient();
  await supabase.auth.signOut();
  req.cookies.getAll().forEach(({ name }) => {
    if (name.startsWith('sb-')) res.cookies.delete(name);
  });
  return res;
}
