import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Dev-only auto-login for the Lovable preview environment.
 *
 * Behaviour:
 *  - Runs ONLY on Lovable preview hostnames (*.lovable.dev, *.lovableproject.com)
 *    or local development (localhost / 127.0.0.1). Any other hostname is a no-op,
 *    so this is safe to call from production builds.
 *  - If a session already exists, returns immediately.
 *  - Reads VITE_DEV_ADMIN_EMAIL / VITE_DEV_ADMIN_PASSWORD from import.meta.env.
 *    Credentials are NEVER hardcoded.
 *  - On successful sign-in, reloads the page so the rest of the app mounts
 *    with an authenticated session from the start.
 */
export async function tryDevAutoLogin(supabase: SupabaseClient): Promise<void> {
  if (typeof window === 'undefined') return;

  const host = window.location.hostname;
  const isPreview =
    host.endsWith('.lovable.dev') ||
    host.endsWith('.lovableproject.com') ||
    host === 'localhost' ||
    host === '127.0.0.1';

  if (!isPreview) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) return;

    const email = import.meta.env.VITE_DEV_ADMIN_EMAIL as string | undefined;
    const password = import.meta.env.VITE_DEV_ADMIN_PASSWORD as string | undefined;

    if (!email || !password) {
      console.warn('dev auto-login skipped: env vars missing');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('dev auto-login failed:', error);
      return;
    }

    console.info('dev auto-login OK as', email);
    window.location.reload();
  } catch (err) {
    console.error('dev auto-login exception:', err);
  }
}