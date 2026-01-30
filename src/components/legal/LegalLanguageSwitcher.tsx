import { Button } from "@/components/ui/button";
import { LANGUAGE_NAMES, type LegalLanguage } from "@/lib/legalContent";

interface LegalLanguageSwitcherProps {
  currentLang: LegalLanguage;
  onLanguageChange: (lang: LegalLanguage) => void;
}

export function LegalLanguageSwitcher({ currentLang, onLanguageChange }: LegalLanguageSwitcherProps) {
  const languages: LegalLanguage[] = ['pt', 'en', 'es'];
  
  return (
    <div className="flex items-center gap-2 mb-6">
      {languages.map((lang) => (
        <Button
          key={lang}
          variant={currentLang === lang ? "default" : "outline"}
          size="sm"
          onClick={() => onLanguageChange(lang)}
          className="gap-1.5"
        >
          <span>{LANGUAGE_NAMES[lang].flag}</span>
          <span className="hidden sm:inline">{LANGUAGE_NAMES[lang].native}</span>
        </Button>
      ))}
    </div>
  );
}
