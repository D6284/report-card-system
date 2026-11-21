import { isSupabasePublicConfigured } from './public-config.ts';

export { isSupabasePublicConfigured };

export const SUPABASE_SETUP_MESSAGE = 'Supabase public configuration is invalid. Check the project settings in lib/supabase/public-config.ts.';
export const TEACHER_SETUP_MESSAGE = 'Teacher accounts and assignments require the server-only SUPABASE_SERVICE_ROLE_KEY in the hosting environment.';
export const TEACHER_SCHEMA_MESSAGE = 'The Supabase database schema is missing or incomplete. Run supabase/migrations/001_core_schema.sql through 006_assessment_weights.sql in order using the Supabase SQL Editor.';
