'use server';
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabasePublicConfigured, SUPABASE_SETUP_MESSAGE } from '@/lib/supabase/config';
import { isLocalAuthEnabled, LOCAL_AUTH_COOKIE, verifyLocalCredentials, writeLocalSession } from '@/lib/auth/local';

function siteOrigin(hostValue: string | null, protoValue: string | null) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (!hostValue) return 'http://localhost:3000';
  return `${protoValue ?? 'http'}://${hostValue}`;
}

export async function signIn(fd: FormData) {
  const email = String(fd.get('email') ?? '').trim();
  const password = String(fd.get('password') ?? '');
  if (!email || !password) redirect('/login?error=Email%20and%20password%20are%20required');
  if (isLocalAuthEnabled()) {
    const session = verifyLocalCredentials(email, password);
    if (session) {
      await writeLocalSession(session);
      redirect('/dashboard');
    }
  }
  if (!isSupabasePublicConfigured()) redirect(`/login?error=${encodeURIComponent(SUPABASE_SETUP_MESSAGE)}`);

  (await cookies()).delete(LOCAL_AUTH_COOKIE);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=Invalid%20email%20or%20password');

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', user!.id).maybeSingle();
  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    redirect('/login?error=This%20account%20is%20inactive');
  }
  redirect('/dashboard');
}

export async function requestPasswordReset(fd: FormData) {
  const email = String(fd.get('email') ?? '').trim();
  if (!email) redirect('/reset-password?error=Email%20is%20required');
  if (isLocalAuthEnabled()) redirect('/reset-password?error=Password%20reset%20is%20unavailable%20in%20local%20sign-in%20mode');
  if (!isSupabasePublicConfigured()) redirect(`/reset-password?error=${encodeURIComponent(SUPABASE_SETUP_MESSAGE)}`);
  const h = await headers();
  const origin = siteOrigin(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'));
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  });
  if (error) redirect('/reset-password?error=Unable%20to%20send%20reset%20email');
  redirect('/reset-password?sent=1');
}

export async function updatePassword(fd: FormData) {
  const password = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirm') ?? '');
  const next = String(fd.get('next') ?? '/change-password');
  if (password.length < 8) redirect(`${next}?error=Password%20must%20be%20at%20least%208%20characters`);
  if (password !== confirm) redirect(`${next}?error=Passwords%20do%20not%20match`);
  if (isLocalAuthEnabled()) redirect('/login?error=Password%20update%20is%20unavailable%20in%20local%20sign-in%20mode');
  if (!isSupabasePublicConfigured()) redirect(`/login?error=${encodeURIComponent(SUPABASE_SETUP_MESSAGE)}`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?error=Session%20expired.%20Request%20a%20new%20reset%20link');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`${next}?error=Unable%20to%20update%20password`);
  redirect(`${next}?updated=1`);
}
