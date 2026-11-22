import { requireRole } from '@/lib/auth/session';
import AppShell, { type NavItem } from '../components/AppShell';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('teacher');

  const nav: NavItem[] = [
    { href: '/teacher', label: 'My assignments', icon: 'ClipboardList', section: 'Teaching', exact: true },
    { href: '/teacher/submissions', label: 'My submissions', icon: 'Send', section: 'Teaching' },
    ...(session.isClassTeacher
      ? [{ href: '/teacher/class', label: 'My class', icon: 'School', section: 'Teaching' }]
      : []),
  ];

  return (
    <AppShell nav={nav} roleLabel="Teacher" workspaceLabel="Teacher workspace"
      userName={session.fullName ?? null}>
      {children}
    </AppShell>
  );
}
