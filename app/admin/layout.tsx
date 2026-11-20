import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import AppShell, { type NavItem } from '../components/AppShell';

const nav: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: 'LayoutDashboard', section: 'Workspace', exact: true },
  { href: '/admin/students', label: 'Students', icon: 'Users', section: 'Workspace' },
  { href: '/admin/teachers', label: 'Teachers & Assignments', icon: 'GraduationCap', section: 'Workspace' },
  { href: '/admin/classes', label: 'Classes', icon: 'School', section: 'Workspace' },
  { href: '/admin/subjects', label: 'Subjects', icon: 'BookOpen', section: 'Workspace' },
  { href: '/admin/academic-years', label: 'Academic Years', icon: 'CalendarDays', section: 'Workspace' },
  { href: '/admin/approvals', label: 'Marks Approval', icon: 'ClipboardCheck', section: 'Operations' },
  { href: '/admin/decisions', label: 'Annual Decisions', icon: 'BadgeCheck', section: 'Operations' },
  { href: '/admin/reports', label: 'Report Cards', icon: 'FileText', section: 'Operations' },
  { href: '/admin/analytics', label: 'Analytics & Insights', icon: 'BarChart3', section: 'Operations' },
  { href: '/admin/settings', label: 'School Settings', icon: 'Settings', section: 'Operations' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('school_admin');
  const sb = await createClient();
  const { data: profile } = await sb.from('profiles').select('full_name').eq('id', session.userId).maybeSingle();

  return (
    <AppShell nav={nav} roleLabel="School Admin" workspaceLabel="School workspace"
      userName={profile?.full_name ?? null}>
      {children}
    </AppShell>
  );
}
