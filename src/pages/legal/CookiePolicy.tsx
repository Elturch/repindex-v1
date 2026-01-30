import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { COOKIES_CONTENT, type LegalLanguage } from "@/lib/legalContent";

export default function CookiePolicy() {
  const [lang, setLang] = useState<LegalLanguage>('pt');
  const content = COOKIES_CONTENT[lang];
  
  const metaTitles = {
    pt: "Política de Cookies | RepIndex",
    en: "Cookie Policy | RepIndex",
    es: "Política de Cookies | RepIndex"
  };
  
  const metaDescriptions = {
    pt: "Política de Cookies do website RepIndex.ai da Reputation Index, Lda.",
    en: "Cookie Policy for the RepIndex.ai website by Reputation Index, Lda.",
    es: "Política de Cookies del sitio web RepIndex.ai de Reputation Index, Lda."
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
