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
  const href = window.location.href;
  
  // Check for Lovable preview/development environments
  const isLovableEnv = 
    hostname.includes('localhost') ||
    hostname.includes('preview') ||
    hostname.includes('lovable.app') ||
    hostname.includes('lovable.dev') ||
    hostname.includes('lovableproject.com') ||
    href.includes('__lovable_token'); // Lovable preview token in URL
  
  // Log for debugging (remove in production)
  if (isLovableEnv) {
    console.log('[DEV MODE] Bypassing authentication - Lovable environment detected:', hostname);
  }
  
  return isLovableEnv;
};

/**
 * Check if we're in a production environment
 */
export const isProduction = (): boolean => {
  return !isDevOrPreview();
};
