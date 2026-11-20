import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const requested = searchParams.get('next') ?? '/dashboard';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';

  if (!code) return NextResponse.redirect(`${origin}/login?error=Invalid%20reset%20link`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=Unable%20to%20verify%20link`);

  return NextResponse.redirect(`${origin}${next}`);
}
