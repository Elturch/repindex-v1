/**
 * Environment detection utilities
 */

/**
 * Check if we're in development/preview mode (not production)
 * This includes:
 * - localhost
 * - Lovable preview environments (*.lovableproject.com)
 * - Other preview/staging domains
 */
export const isDevOrPreview = (): boolean => {
  if (typeof window === 'undefined') return true;
  const hostname = window.location.hostname;
  return (
    hostname.includes('localhost') ||
    hostname.includes('preview') ||
    hostname.includes('lovable.app') ||
    hostname.includes('lovable.dev') ||
    hostname.includes('lovableproject.com')
  );
};

/**
 * Check if we're in a production environment
 */
export const isProduction = (): boolean => {
  return !isDevOrPreview();
};
