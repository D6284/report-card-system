import test from 'node:test';
import assert from 'node:assert/strict';
import { localAuthConfigurationError } from '../lib/auth/local-token.ts';

test('production local sign-in requires private strong credentials and school configuration', () => {
  const keys = [
    'NODE_ENV',
    'LOCAL_AUTH_ENABLED',
    'LOCAL_AUTH_EMAIL',
    'LOCAL_AUTH_PASSWORD',
    'LOCAL_AUTH_SECRET',
    'LOCAL_AUTH_SCHOOL_ID',
    'LOCAL_AUTH_ROLE',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ] as const;
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    process.env.LOCAL_AUTH_ENABLED = 'true';
    process.env.LOCAL_AUTH_EMAIL = 'admin@example.test';
    process.env.LOCAL_AUTH_PASSWORD = 'a-unique-password-with-20-chars';
    process.env.LOCAL_AUTH_SECRET = 'random-signing-secret-with-at-least-32-chars';
    process.env.LOCAL_AUTH_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
    process.env.LOCAL_AUTH_ROLE = 'school_admin';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://school.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    assert.equal(localAuthConfigurationError(), null);

    process.env.LOCAL_AUTH_PASSWORD = 'short';
    assert.match(localAuthConfigurationError() ?? '', /at least 16 characters/);
    process.env.LOCAL_AUTH_PASSWORD = 'a-unique-password-with-20-chars';

    process.env.LOCAL_AUTH_ROLE = 'super_admin';
    assert.match(localAuthConfigurationError() ?? '', /restricted to the school_admin role/);
    process.env.LOCAL_AUTH_ROLE = 'school_admin';

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.match(localAuthConfigurationError() ?? '', /server-only service-role key/);
  } finally {
    for (const key of keys) {
      const value = original.get(key);
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
});

test('local sign-in remains optional when disabled', () => {
  const enabled = process.env.LOCAL_AUTH_ENABLED;
  const nodeEnv = process.env.NODE_ENV;
  try {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    process.env.LOCAL_AUTH_ENABLED = 'false';
    assert.equal(localAuthConfigurationError(), null);
  } finally {
    if (enabled === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = enabled;
    if (nodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', nodeEnv);
  }
});
