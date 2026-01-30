import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { PRIVACY_CONTENT, type LegalLanguage } from "@/lib/legalContent";

export default function PrivacyPolicy() {
  const [lang, setLang] = useState<LegalLanguage>('pt');
  const content = PRIVACY_CONTENT[lang];
  
  const metaTitles = {
    pt: "Política de Protecção de Dados e Privacidade | RepIndex",
    en: "Data Protection and Privacy Policy | RepIndex",
    es: "Política de Protección de Datos y Privacidad | RepIndex"
  };
  
  const metaDescriptions = {
    pt: "Política de Protecção de Dados Pessoais e Privacidade (RGPD) do website RepIndex.ai.",
    en: "Data Protection and Privacy Policy (GDPR) for the RepIndex.ai website.",
    es: "Política de Protección de Datos Personales y Privacidad (RGPD) del sitio web RepIndex.ai."
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
