import type { NextRequest } from 'next/server';

export const LOCAL_AUTH_COOKIE = 'local_auth_session';

const ROLES = ['super_admin', 'school_admin', 'teacher'];

export function isLocalAuthEnabled() {
  return process.env.LOCAL_AUTH_ENABLED === 'true' || process.env.LOCAL_AUTH_ENABLED === '1';
}

function secret() {
  return process.env.LOCAL_AUTH_SECRET ?? 'local-auth-dev-secret-change-me';
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
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function decodeLocalSession(token: string | undefined): Promise<any | null> {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), new TextEncoder().encode(body));
    if (!valid) return null;
    const value = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!ROLES.includes(value.role)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function readLocalSessionFromRequest(req: NextRequest) {
  if (!isLocalAuthEnabled()) return null;
  return decodeLocalSession(req.cookies.get(LOCAL_AUTH_COOKIE)?.value);
}
