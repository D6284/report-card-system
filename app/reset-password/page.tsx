import Link from 'next/link';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requestPasswordReset, updatePassword } from '@/lib/auth/actions';
import AuthShell from '../components/AuthShell';
import PasswordInput from '../components/PasswordInput';
import { Alert } from '../components/ui';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; updated?: string }> }) {
  const { error, sent, updated } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <AuthShell
      title={user ? 'Set a new password' : 'Reset your password'}
      description={user
        ? 'Choose a strong password for your account. Use at least eight characters.'
        : 'Enter your account email and we will send you a secure reset link.'}
      footer={<Link href="/login" className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 transition hover:text-indigo-800"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to sign in</Link>}>
      <div className="space-y-4">
        {error && <Alert tone="error" role="alert">{error}</Alert>}
        {sent && <Alert tone="success" title="Check your inbox">If that email exists, a reset link has been sent.</Alert>}
        {updated && <Alert tone="success" title="Password updated">You can now sign in with your new password.</Alert>}

        {user ? (
          <form action={updatePassword} className="space-y-5">
            <input type="hidden" name="next" value="/reset-password" />
            <PasswordInput name="password" label="New password" autoComplete="new-password" minLength={8} />
            <PasswordInput name="confirm" label="Confirm password" autoComplete="new-password" minLength={8} />
            <button className="btn btn-primary btn-block" type="submit">
              Set new password <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <form action={requestPasswordReset} className="space-y-5">
            <div>
              <label className="label" htmlFor="email">Account email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@school.edu" className="input pl-10" />
              </div>
            </div>
            <button className="btn btn-primary btn-block" type="submit">
              Send reset link <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
