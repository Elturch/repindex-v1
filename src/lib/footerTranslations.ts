// Footer translations based on user location
export type FooterLanguage = 'es' | 'pt' | 'en';

export const FOOTER_TRANSLATIONS: Record<FooterLanguage, {
  dataUpdate: string;
  dataUpdateText: string;
  copyright: string;
  terms: string;
  privacy: string;
  cookies: string;
  gdpr: string;
  complaints: string;
  contact: string;
}> = {
  es: {
    dataUpdate: 'Actualización de Datos',
    dataUpdateText: 'Los análisis RIX se ejecutan automáticamente cada domingo, garantizando información actualizada semanalmente y asegurando la solidez y confiabilidad de los datos reputacionales.',
    copyright: '© 2025 Reputation Index, Lda.',
    terms: 'Términos y Condiciones',
    privacy: 'Privacidad',
    cookies: 'Cookies',
    gdpr: 'RGPD',
    complaints: 'Reclamaciones',
    contact: 'Contacto',
  },
  pt: {
    dataUpdate: 'Atualização de Dados',
    dataUpdateText: 'As análises RIX são executadas automaticamente todos os domingos, garantindo informação atualizada semanalmente e assegurando a solidez e fiabilidade dos dados reputacionais.',
    copyright: '© 2025 Reputation Index, Lda.',
    terms: 'Termos e Condições',
    privacy: 'Privacidade',
    cookies: 'Cookies',
    gdpr: 'RGPD',
    complaints: 'Reclamações',
    contact: 'Contacto',
  },
  en: {
    dataUpdate: 'Data Update',
    dataUpdateText: 'RIX analyses run automatically every Sunday, ensuring weekly updated information and guaranteeing the reliability and robustness of reputational data.',
    copyright: '© 2025 Reputation Index, Lda.',
    terms: 'Terms & Conditions',
    privacy: 'Privacy',
    cookies: 'Cookies',
    gdpr: 'GDPR',
    complaints: 'Complaints',
    contact: 'Contact',
  },
};

// Detect language based on browser locale/timezone
export function detectFooterLanguage(): FooterLanguage {
  if (typeof window === 'undefined') return 'en';
  
  // Try to detect from browser language
  const browserLang = navigator.language?.toLowerCase() || '';
  
  // Spanish locales
  if (browserLang.startsWith('es')) {
    return 'es';
  }
  
  // Portuguese locales
  if (browserLang.startsWith('pt')) {
    return 'pt';
  }
  
  // Try timezone as fallback
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes('Madrid') || tz.includes('Canary')) {
      return 'es';
    }
    if (tz.includes('Lisbon') || tz.includes('Azores')) {
      return 'pt';
    }
  } catch {
    // Ignore timezone detection errors
  }
  
  // Default to English for all other countries
  return 'en';
}

// Storage key for manual override
export const FOOTER_LANG_KEY = 'repindex_footer_lang';

export function getSavedFooterLanguage(): FooterLanguage | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(FOOTER_LANG_KEY);
  if (saved === 'es' || saved === 'pt' || saved === 'en') {
    return saved;
  }
  return null;
}

export function getFooterLanguage(): FooterLanguage {
  return getSavedFooterLanguage() || detectFooterLanguage();
}
