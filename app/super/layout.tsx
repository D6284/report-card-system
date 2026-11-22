import { requireRole } from '@/lib/auth/session';
import AppShell, { type NavItem } from '../components/AppShell';

const nav: NavItem[] = [
  { href: '/super', label: 'Schools', icon: 'Building2', section: 'System', exact: true },
  { href: '/super/activity', label: 'System activity', icon: 'Activity', section: 'System' },
];

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('super_admin');

  return (
    <AppShell nav={nav} roleLabel="Super Admin" workspaceLabel="System administration"
      userName={session.fullName ?? null}>
      {children}
    </AppShell>
  );
}
