import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { TERMS_CONTENT, type LegalLanguage } from "@/lib/legalContent";

export default function TermsAndConditions() {
  const [lang, setLang] = useState<LegalLanguage>('pt');
  const content = TERMS_CONTENT[lang];
  
  const metaTitles = {
    pt: "Termos e Condições | RepIndex",
    en: "Terms and Conditions | RepIndex",
    es: "Términos y Condiciones | RepIndex"
  };
  
  const metaDescriptions = {
    pt: "Termos e Condições de utilização do website RepIndex.ai da Reputation Index, Lda.",
    en: "Terms and Conditions for using the RepIndex.ai website by Reputation Index, Lda.",
    es: "Términos y Condiciones de uso del sitio web RepIndex.ai de Reputation Index, Lda."
  };

  return (
    <>
      <Helmet>
        <title>{metaTitles[lang]}</title>
        <meta name="description" content={metaDescriptions[lang]} />
        <html lang={lang} />
      </Helmet>
      
      <LegalPageLayout 
        content={content} 
        currentLang={lang} 
        onLanguageChange={setLang}
      />
    </>
  );
}
