const PLACEHOLDER_MARKERS = ['YOUR-PROJECT', 'your-project', 'your-anon-key', 'your-service-role-key', 'example', 'placeholder'];

function isMissing(value: string | undefined) {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker.toLowerCase()));
}

export const SUPABASE_SETUP_MESSAGE = 'Sign-in is unavailable because the school account system is not configured. Set the Supabase environment variables and rebuild the app.';
export const TEACHER_SETUP_MESSAGE = 'Teacher accounts and assignments require the Supabase project URL, anon key, and server-only service-role key in .env.local.';
export const TEACHER_SCHEMA_MESSAGE = 'The Supabase database schema is missing or incomplete. Run supabase/migrations/001_core_schema.sql through 006_assessment_weights.sql in order using the Supabase SQL Editor.';

export function isSupabasePublicConfigured() {
  return !isMissing(process.env.NEXT_PUBLIC_SUPABASE_URL) && !isMissing(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isSupabaseAdminConfigured() {
  return isSupabasePublicConfigured() && !isMissing(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
