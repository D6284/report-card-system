import Link from 'next/link';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import { signIn } from '@/lib/auth/actions';
import AuthShell from '../components/AuthShell';
import PasswordInput from '../components/PasswordInput';
import { Alert } from '../components/ui';
import { isSupabasePublicConfigured, SUPABASE_SETUP_MESSAGE } from '@/lib/supabase/config';
import { isLocalAuthEnabled } from '@/lib/auth/local';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const localAuth = isLocalAuthEnabled();
  const configured = localAuth || isSupabasePublicConfigured();
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in with the account created by your school administrator."
      footer={<p className="text-slate-500">Need access? Contact your school administrator.</p>}>
      <form action={signIn} className="space-y-5">
        {localAuth && <Alert tone="warning" role="status">Local admin sign-in is active. Use the configured local credentials for the administrator, or sign out first and use a teacher account created by your school administrator.</Alert>}
        {!configured && <Alert tone="warning" role="status">{SUPABASE_SETUP_MESSAGE}</Alert>}
        {error && error !== SUPABASE_SETUP_MESSAGE && <Alert tone="error" role="alert">{error}</Alert>}
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@school.edu" className="input pl-10" />
          </div>
        </div>
        <PasswordInput name="password" label="Password" />
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> Secure access
          </span>
          {!localAuth && <Link href="/reset-password" className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 hover:underline">
            Forgot password?
          </Link>}
        </div>
        <button className="btn btn-primary btn-block" type="submit">
          Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </AuthShell>
  );
}
