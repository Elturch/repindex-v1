/**
 * Environment detection utilities
 */

/**
 * Check if we're in development/preview mode (not production)
 * This includes:
 * - localhost
 * - Lovable preview environments (*.lovableproject.com, id--*.lovable.app)
 * 
 * Production domains (NOT dev/preview):
 * - Direct lovable.app subdomains without "preview" (e.g., project-name.lovable.app)
 * - Custom domains
 */
export const isDevOrPreview = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const hostname = window.location.hostname;
  
  // Always allow localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return true;
  }
  
  // Allow lovableproject.com (development project hosting)
  if (hostname.includes('lovableproject.com')) {
    return true;
  }
  
  // Allow preview subdomains on lovable.app (contain "preview" in subdomain)
  // Example: id--preview--project.lovable.app
  if (hostname.includes('lovable.app') && hostname.includes('preview')) {
    return true;
  }
  
  // Allow lovable.dev (development tools/docs)
  if (hostname.includes('lovable.dev')) {
    return true;
  }
  
  // Everything else is production
  return false;
};

/**
 * Check if we're in a production environment
 */
export const isProduction = (): boolean => {
  return !isDevOrPreview();
};
