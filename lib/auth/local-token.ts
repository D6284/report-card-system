import type { NextRequest } from 'next/server';

export const LOCAL_AUTH_COOKIE = 'local_auth_session';

const ROLES = ['super_admin', 'school_admin', 'teacher'];

export function isLocalAuthEnabled() {
  return process.env.LOCAL_AUTH_ENABLED === 'true' || process.env.LOCAL_AUTH_ENABLED === '1';
}

function hasValue(value: string | undefined) {
  return Boolean(value && !['your-anon-key', 'your-service-role-key', 'YOUR-PROJECT'].some((placeholder) =>
    value.toLowerCase().includes(placeholder.toLowerCase())));
}

export function localAuthConfigurationError(): string | null {
  if (process.env.NODE_ENV !== 'production' || !isLocalAuthEnabled()) return null;

  if (!process.env.LOCAL_AUTH_EMAIL?.includes('@')) return 'Set a valid LOCAL_AUTH_EMAIL in the hosting environment.';
  if (!process.env.LOCAL_AUTH_PASSWORD || process.env.LOCAL_AUTH_PASSWORD.length < 16) {
    return 'Set a unique LOCAL_AUTH_PASSWORD of at least 16 characters in the hosting environment.';
  }
  if (!process.env.LOCAL_AUTH_SECRET || process.env.LOCAL_AUTH_SECRET.length < 32) {
    return 'Set a random LOCAL_AUTH_SECRET of at least 32 characters in the hosting environment.';
  }
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(process.env.LOCAL_AUTH_SCHOOL_ID ?? '')) {
    return 'Set LOCAL_AUTH_SCHOOL_ID to the UUID of an existing school workspace.';
  }
  if ((process.env.LOCAL_AUTH_ROLE ?? 'school_admin') !== 'school_admin') {
    return 'Production local sign-in is restricted to the school_admin role.';
  }
  const missingSupabaseVariables = [
    ['NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
  ].filter(([, value]) => !hasValue(value)).map(([name]) => name);
  if (missingSupabaseVariables.length) {
    return `Vercel is not providing these Supabase variables to this deployment: ${missingSupabaseVariables.join(', ')}. Check the Production environment and redeploy.`;
  }
  return null;
}

function secret() {
  return process.env.LOCAL_AUTH_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'local-auth-dev-secret-change-me');
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function encodeLocalSession(session: unknown) {
  const configError = localAuthConfigurationError();
  if (configError) throw new Error(configError);
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function decodeLocalSession(token: string | undefined): Promise<any | null> {
  if (!token || localAuthConfigurationError()) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), new TextEncoder().encode(body));
    if (!valid) return null;
    const value = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!ROLES.includes(value.role)) return null;
    if (process.env.NODE_ENV === 'production'
      && (value.role !== 'school_admin'
        || value.userId !== '00000000-0000-0000-0000-0000000000a2'
        || value.schoolId !== process.env.LOCAL_AUTH_SCHOOL_ID
        || value.isClassTeacher !== false)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function readLocalSessionFromRequest(req: NextRequest) {
  if (!isLocalAuthEnabled()) return null;
  return decodeLocalSession(req.cookies.get(LOCAL_AUTH_COOKIE)?.value);
}
