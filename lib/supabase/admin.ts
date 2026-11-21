import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLIC_CONFIG } from './public-config.ts';

/** Service-role client. Server code only; bypasses RLS, so authorize in code before every use. */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side administrative operations.');
  }
  return createClient(SUPABASE_PUBLIC_CONFIG.url, serviceRoleKey, { auth: { persistSession: false } });
}

export function isSupabaseAdminConfigured() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(key && key !== 'your-service-role-key');
}
