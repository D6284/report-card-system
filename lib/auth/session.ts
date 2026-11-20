import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readLocalSession } from './local';

export type AppRole = 'super_admin' | 'school_admin' | 'teacher';
export interface SessionInfo { userId: string; role: AppRole; schoolId: string | null; isClassTeacher: boolean }

export async function getSession(): Promise<SessionInfo | null> {
  const local = await readLocalSession();
  if (local) return local;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('is_super_admin,is_active').eq('id', user.id).maybeSingle();
  if (!profile?.is_active) return null;
  if (profile.is_super_admin) return { userId: user.id, role: 'super_admin', schoolId: null, isClassTeacher: false };

  const { data: membership } = await supabase.from('school_memberships')
    .select('school_id,role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership || !membership.school_id) return null;

  const { count } = await supabase.from('classes').select('id', { count: 'exact', head: true })
    .eq('class_teacher_id', user.id)
    .eq('school_id', membership.school_id);

  return {
    userId: user.id,
    role: membership.role as AppRole,
    schoolId: membership.school_id,
    isClassTeacher: (count ?? 0) > 0,
  };
}

export async function requireRole(...roles: AppRole[]): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role)) redirect('/dashboard');
  return session;
}

export async function requireSchoolSession(...roles: Exclude<AppRole, 'super_admin'>[]): Promise<SessionInfo & { schoolId: string }> {
  const session = await requireRole(...roles);
  if (!session.schoolId) redirect('/dashboard');
  return session as SessionInfo & { schoolId: string };
}
