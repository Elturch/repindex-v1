// List of non-corporate email domains that should be rejected
export const NON_CORPORATE_DOMAINS = [
  // Gmail
  'gmail.com',
  'googlemail.com',
  
  // Microsoft consumer
  'hotmail.com',
  'hotmail.es',
  'hotmail.co.uk',
  'hotmail.fr',
  'hotmail.de',
  'hotmail.it',
  'outlook.com',
  'outlook.es',
  'outlook.fr',
  'outlook.de',
  'live.com',
  'live.es',
  'msn.com',
  
  // Yahoo
  'yahoo.com',
  'yahoo.es',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.it',
  'ymail.com',
  
  // Apple
  'icloud.com',
  'me.com',
  'mac.com',
  
  // Privacy-focused
  'protonmail.com',
  'protonmail.ch',
  'proton.me',
  'tutanota.com',
  'tutanota.de',
  'tutamail.com',
  
  // Other popular free providers
  'aol.com',
  'mail.com',
  'gmx.com',
  'gmx.es',
  'gmx.de',
  'gmx.net',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
  'mail.ru',
  'inbox.com',
  'fastmail.com',
  'hushmail.com',
  
  // Spanish ISPs (consumer email)
  'telefonica.net',
  'terra.es',
  'ono.com',
  'orange.es',
  'vodafone.es',
  'movistar.es',
  'ya.com',
  
  // Temp/disposable email patterns
  'tempmail.com',
  'guerrillamail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
];

/**
 * Check if an email domain is a corporate domain
 * @param email The email address to check
 * @returns true if the email is from a corporate domain, false otherwise
 */
export function isCorporateEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  
  return !NON_CORPORATE_DOMAINS.includes(domain);
}

/**
 * Extract the domain from an email address
 * @param email The email address
 * @returns The domain part of the email
 */
export function getEmailDomain(email: string): string {
  if (!email || !email.includes('@')) return '';
  return email.split('@')[1]?.toLowerCase() || '';
}

/**
 * List of executive role types for scoring purposes
 */
export const EXECUTIVE_ROLES = [
  'ceo',
  'cfo',
  'dircom',
  'estratega_interno',
  'estratega_externo',
  'rsc_esg',
  'legal',
  'rrhh',
];

/**
 * Check if a role is considered executive for scoring
 * @param roleId The role ID to check
 * @returns true if the role is executive
 */
export function isExecutiveRole(roleId: string): boolean {
  return EXECUTIVE_ROLES.includes(roleId);
}
