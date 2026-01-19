// Available languages for Agente Rix chat
export interface ChatLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  speechCode: string; // For speech recognition
}

export const CHAT_LANGUAGES: ChatLanguage[] = [
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', speechCode: 'es-ES' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', speechCode: 'en-US' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', speechCode: 'fr-FR' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', speechCode: 'de-DE' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', speechCode: 'pt-PT' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', speechCode: 'it-IT' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', speechCode: 'ar-SA' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', speechCode: 'zh-CN' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', speechCode: 'ja-JP' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', speechCode: 'ko-KR' },
];

export const DEFAULT_LANGUAGE = CHAT_LANGUAGES[0]; // Spanish

export function getLanguageByCode(code: string): ChatLanguage {
  return CHAT_LANGUAGES.find(l => l.code === code) || DEFAULT_LANGUAGE;
}

// Local storage key for language preference
export const LANGUAGE_STORAGE_KEY = 'agente_rix_language';

export function getSavedLanguage(): ChatLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved) {
    return getLanguageByCode(saved);
  }
  return DEFAULT_LANGUAGE;
}

export function saveLanguagePreference(code: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  }
}
