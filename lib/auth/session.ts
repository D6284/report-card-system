import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readLocalSession } from './local';

export type AppRole = 'super_admin' | 'school_admin' | 'teacher';
export interface SessionInfo {
  userId: string;
  role: AppRole;
  schoolId: string | null;
  isClassTeacher: boolean;
  fullName?: string | null;
}

export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const local = await readLocalSession();
  if (local) return local;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('full_name,is_super_admin,is_active').eq('id', user.id).maybeSingle(),
    supabase.from('school_memberships')
      .select('school_id,role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!profile?.is_active) return null;
  if (profile.is_super_admin) {
    return { userId: user.id, role: 'super_admin', schoolId: null, isClassTeacher: false, fullName: profile.full_name };
  }

  if (!membership || !membership.school_id) return null;

  let isClassTeacher = false;
  if (membership.role === 'teacher') {
    const { data: classTeacher } = await supabase.from('classes').select('id')
      .eq('class_teacher_id', user.id)
      .eq('school_id', membership.school_id)
      .limit(1)
      .maybeSingle();
    isClassTeacher = Boolean(classTeacher);
  }

  return {
    userId: user.id,
    role: membership.role as AppRole,
    schoolId: membership.school_id,
    isClassTeacher,
    fullName: profile.full_name,
  };
});

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
