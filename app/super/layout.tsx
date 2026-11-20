import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import AppShell, { type NavItem } from '../components/AppShell';

const nav: NavItem[] = [
  { href: '/super', label: 'Schools', icon: 'Building2', section: 'System', exact: true },
  { href: '/super/activity', label: 'System activity', icon: 'Activity', section: 'System' },
];

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('super_admin');
  const sb = await createClient();
  const { data: profile } = await sb.from('profiles').select('full_name').eq('id', session.userId).maybeSingle();

  return (
    <AppShell nav={nav} roleLabel="Super Admin" workspaceLabel="System administration"
      userName={profile?.full_name ?? null}>
      {children}
    </AppShell>
  );
}
