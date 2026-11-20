import 'server-only';
import { cookies } from 'next/headers';
import type { AppRole, SessionInfo } from './session';
import { decodeLocalSession, encodeLocalSession, isLocalAuthEnabled, localAuthConfigurationError, LOCAL_AUTH_COOKIE } from './local-token';

export { isLocalAuthEnabled, localAuthConfigurationError, LOCAL_AUTH_COOKIE } from './local-token';

const ROLES: AppRole[] = ['super_admin', 'school_admin', 'teacher'];

function enabled(value: string | undefined) {
  return value === 'true' || value === '1';
}

function getAccount(): SessionInfo & { email: string; password: string } {
  const roleValue = process.env.LOCAL_AUTH_ROLE ?? 'school_admin';
  const role = ROLES.includes(roleValue as AppRole) ? roleValue as AppRole : 'school_admin';
  const schoolId = process.env.LOCAL_AUTH_SCHOOL_ID ?? '00000000-0000-0000-0000-000000000001';
  const userIds: Record<AppRole, string> = {
    super_admin: '00000000-0000-0000-0000-0000000000a1',
    school_admin: '00000000-0000-0000-0000-0000000000a2',
    teacher: '00000000-0000-0000-0000-0000000000a3',
  };
  return {
    email: (process.env.LOCAL_AUTH_EMAIL ?? 'admin@school.edu').trim().toLowerCase(),
    password: process.env.LOCAL_AUTH_PASSWORD ?? 'Admin12345!',
    userId: userIds[role],
    role,
    schoolId: role === 'super_admin' ? null : schoolId,
    isClassTeacher: enabled(process.env.LOCAL_AUTH_IS_CLASS_TEACHER),
  };
}

export function verifyLocalCredentials(email: string, password: string): SessionInfo | null {
  if (!isLocalAuthEnabled() || localAuthConfigurationError()) return null;
  const account = getAccount();
  if (email.trim().toLowerCase() !== account.email || password !== account.password) return null;
  return {
    userId: account.userId,
    role: account.role,
    schoolId: account.schoolId,
    isClassTeacher: account.isClassTeacher,
  };
}

export async function writeLocalSession(session: SessionInfo) {
  const store = await cookies();
  store.set(LOCAL_AUTH_COOKIE, await encodeLocalSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function readLocalSession(): Promise<SessionInfo | null> {
  if (!isLocalAuthEnabled() || localAuthConfigurationError()) return null;
  const store = await cookies();
  return decodeLocalSession(store.get(LOCAL_AUTH_COOKIE)?.value);
}
