import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupabasePublicConfigured, resolveSupabasePublicConfig } from '../lib/supabase/public-config.ts';

test('public Supabase config falls back to the committed project config when env vars are absent', () => {
  const fallback = resolveSupabasePublicConfig(undefined, undefined);
  assert.equal(isSupabasePublicConfigured(), true);
  assert.match(fallback.url, /^https:\/\/[a-z0-9-]+\.supabase\.co$/);
  assert.match(fallback.anonKey, /^sb_publishable_/);
  assert.deepEqual(resolveSupabasePublicConfig('https://new-project.supabase.co', undefined), fallback);
});
