import Link from 'next/link';
import { ArrowLeft, ArrowRight, KeyRound } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { updatePassword } from '@/lib/auth/actions';
import AuthShell from '../components/AuthShell';
import PasswordInput from '../components/PasswordInput';
import { Alert } from '../components/ui';

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const { error, updated } = await searchParams;
  await getSession();

  return (
    <AuthShell
      title="Change password"
      description="Keep your account secure with a password at least eight characters long."
      footer={<Link href="/dashboard" className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 transition hover:text-indigo-800"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to dashboard</Link>}>
      <form action={updatePassword} className="space-y-5">
        {error && <Alert tone="error" role="alert">{error}</Alert>}
        {updated && <Alert tone="success" title="Password changed">Your new password is active.</Alert>}
        <PasswordInput name="password" label="New password" autoComplete="new-password" minLength={8} />
        <PasswordInput name="confirm" label="Confirm password" autoComplete="new-password" minLength={8} />
        <button className="btn btn-primary btn-block" type="submit">
          <KeyRound className="h-4 w-4" aria-hidden="true" /> Update password <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </AuthShell>
  );
}
