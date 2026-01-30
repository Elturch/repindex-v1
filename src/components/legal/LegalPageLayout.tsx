import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LegalLanguageSwitcher } from "./LegalLanguageSwitcher";
import type { LegalLanguage, LegalPageContent } from "@/lib/legalContent";

interface LegalPageLayoutProps {
  content: LegalPageContent;
  currentLang: LegalLanguage;
  onLanguageChange: (lang: LegalLanguage) => void;
  children?: React.ReactNode;
}

export function LegalPageLayout({ 
  content, 
  currentLang, 
  onLanguageChange,
  children 
}: LegalPageLayoutProps) {
  const backLabel = {
    pt: "Voltar",
    en: "Back",
    es: "Volver"
  };
  
  const lastUpdatedLabel = {
    pt: "Última actualização",
    en: "Last updated",
    es: "Última actualización"
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backLabel[currentLang]}
            </Link>
          </Button>
          
          <LegalLanguageSwitcher 
            currentLang={currentLang} 
            onLanguageChange={onLanguageChange} 
          />
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-2"
          >
            {content.title}
          </motion.h1>
          
          <p className="text-sm text-muted-foreground">
            {lastUpdatedLabel[currentLang]}: {content.lastUpdated}
          </p>
        </div>
        
        {/* Content */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="prose prose-slate dark:prose-invert max-w-none"
        >
          {content.sections.map((section, idx) => (
            <section key={idx} className="mb-8">
              {section.heading && (
                <h2 className="text-xl font-semibold text-foreground mb-4">
                  {section.heading}
                </h2>
              )}
              {section.content.map((paragraph, pIdx) => (
                <p 
                  key={pIdx} 
                  className="text-muted-foreground leading-relaxed mb-3"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
          
          {children}
        </motion.div>
        
        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground text-center">
            © 2025 Reputation Index, Lda. (NIF 519 229 185)
          </p>
        </div>
      </div>
    </div>
  );
}
