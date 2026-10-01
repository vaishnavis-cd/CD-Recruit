/**
 * Disallowed free and personal email domain providers for B2B tenant onboarding.
 */
export const DISALLOWED_PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.com.br',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
  'rediffmail.com',
  'fastmail.com',
  'inbox.com',
  'tutanota.com',
  'tutamail.com',
]);

/**
 * Normalizes a corporate domain string.
 * Strips whitespace, converts to lowercase, removes leading '@' and 'www.'.
 */
export function normalizeDomain(rawDomain: string): string {
  if (!rawDomain) return '';
  let domain = rawDomain.trim().toLowerCase();
  if (domain.startsWith('@')) {
    domain = domain.slice(1);
  }
  if (domain.startsWith('www.')) {
    domain = domain.slice(4);
  }
  return domain;
}

/**
 * Basic domain syntax validation regex.
 */
export const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
