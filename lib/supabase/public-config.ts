const deploymentPublicConfig = {
  url: 'https://sasekvhjjiunynekrlfd.supabase.co',
  anonKey: 'sb_publishable_gZvlt4QVbHIGlHOPTtW7Uw_0kMxXfyb',
};

type PublicConfig = { url: string; anonKey: string };

function isValidPublicConfig(config: { url: string | undefined; anonKey: string | undefined }): config is PublicConfig {
  return Boolean(
    config.url
      && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url)
      && config.anonKey
      && config.anonKey.length > 20
      && !/your-|placeholder/i.test(config.anonKey),
  );
}

export function resolveSupabasePublicConfig(url: string | undefined, anonKey: string | undefined) {
  const config = { url, anonKey };
  return isValidPublicConfig(config) ? config : deploymentPublicConfig;
}

/** Public Supabase project settings; the publishable key is intentionally safe for client use. */
export const SUPABASE_PUBLIC_CONFIG = resolveSupabasePublicConfig(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export function isSupabasePublicConfigured() {
  return isValidPublicConfig(SUPABASE_PUBLIC_CONFIG);
}
