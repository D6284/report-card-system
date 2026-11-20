import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

// Role-based landing. Destinations re-check the role with requireRole().
export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.role === 'super_admin') redirect('/super');
  if (s.role === 'school_admin') redirect('/admin');
  redirect(s.isClassTeacher ? '/teacher/class' : '/teacher');
}
