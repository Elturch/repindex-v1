import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { 
  getFooterLanguage, 
  FOOTER_TRANSLATIONS, 
  type FooterLanguage 
} from "@/lib/footerTranslations";

export function Footer() {
  const [lang, setLang] = useState<FooterLanguage>('en');
  
  useEffect(() => {
    setLang(getFooterLanguage());
  }, []);
  
  const t = FOOTER_TRANSLATIONS[lang];
  
  return (
    <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm print:hidden">
      <div className="container mx-auto px-4 py-4 space-y-4">
        {/* Data update notice */}
        <p className="text-xs text-center text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">{t.dataUpdate}:</span>{' '}
          {t.dataUpdateText}
        </p>
        
        {/* Copyright and legal links */}
        <div className="text-center text-sm text-muted-foreground space-y-3">
          <p>{t.copyright}</p>
          
          {/* Legal Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs">
            <Link to="/termos" className="hover:text-foreground transition-colors">
              {t.terms}
            </Link>
            <span className="text-border">|</span>
            <Link to="/privacidade" className="hover:text-foreground transition-colors">
              {t.privacy}
            </Link>
            <span className="text-border">|</span>
            <Link to="/cookies" className="hover:text-foreground transition-colors">
              {t.cookies}
            </Link>
            <span className="text-border">|</span>
            <Link to="/rgpd" className="hover:text-foreground transition-colors">
              {t.gdpr}
            </Link>
            <span className="text-border">|</span>
            <Link to="/reclamacoes" className="hover:text-foreground transition-colors">
              {t.complaints}
            </Link>
            <span className="text-border">|</span>
            <a 
              href="/#contacto" 
              className="text-primary hover:underline"
            >
              {t.contact}
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
