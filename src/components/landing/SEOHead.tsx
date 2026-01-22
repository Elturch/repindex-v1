import { Helmet } from "react-helmet-async";
import { getFAQSchema } from "./FAQSection";
import { useIssuerCount, formatIssuerCount } from "@/hooks/useIssuerCount";

export function SEOHead() {
  const { data: issuerCount = 160 } = useIssuerCount();
  const issuerCountFormatted = formatIssuerCount(issuerCount);
  
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://repindex.ai/#organization",
    "name": "RepIndex",
    "alternateName": "RepIndex.ai",
    "url": "https://repindex.ai",
    "logo": "https://repindex.ai/favicon.png",
    "description": "El primer índice de reputación corporativa basado en inteligencia artificial. Analiza cómo ChatGPT, Perplexity, Gemini y DeepSeek perciben a las empresas.",
    "foundingDate": "2025",
    "sameAs": [
      "https://twitter.com/repindex_ai"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "url": "https://repindex.ai"
    }
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://repindex.ai/#website",
    "url": "https://repindex.ai",
    "name": "RepIndex.ai",
    "description": "AI Corporate Reputation Authority - La autoridad reputacional corporativa de las IAs",
    "publisher": {
      "@id": "https://repindex.ai/#organization"
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://repindex.ai/dashboard?search={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  };

  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": "https://repindex.ai/#dataset",
    "name": "RepIndex Corporate Reputation Index",
    "alternateName": "RIX Score Dataset",
    "description": `Índice semanal de reputación corporativa basado en análisis de 4 modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek) sobre más de ${issuerCountFormatted} empresas españolas, incluyendo IBEX-35, IBEX Medium Cap e IBEX Small Cap.`,
    "url": "https://repindex.ai",
    "keywords": [
      "reputación corporativa",
      "corporate reputation",
      "inteligencia artificial",
      "AI perception",
      "IBEX-35",
      "empresas españolas",
      "ChatGPT",
      "Perplexity",
      "Gemini",
      "DeepSeek",
      "RIX score"
    ],
    "creator": {
      "@id": "https://repindex.ai/#organization"
    },
    "temporalCoverage": "2025/..",
    "spatialCoverage": {
      "@type": "Place",
      "name": "Spain"
    },
    "variableMeasured": [
      {
        "@type": "PropertyValue",
        "name": "RIX Score",
        "description": "Puntuación de reputación corporativa de 0 a 100",
        "minValue": 0,
        "maxValue": 100
      },
      {
        "@type": "PropertyValue",
        "name": "NVM",
        "description": "Narrativa y Visibilidad Mediática"
      },
      {
        "@type": "PropertyValue",
        "name": "DRM",
        "description": "Desempeño y Resultados Empresariales"
      },
      {
        "@type": "PropertyValue",
        "name": "SIM",
        "description": "Sostenibilidad e Impacto Ambiental"
      },
      {
        "@type": "PropertyValue",
        "name": "RMM",
        "description": "Reputación de Marca y Marketing"
      },
      {
        "@type": "PropertyValue",
        "name": "CEM",
        "description": "Comportamiento Ético y Gobierno"
      },
      {
        "@type": "PropertyValue",
        "name": "GAM",
        "description": "Gestión y Atracción del Talento"
      },
      {
        "@type": "PropertyValue",
        "name": "DCM",
        "description": "Digital y Capacidad de Innovación"
      },
      {
        "@type": "PropertyValue",
        "name": "CXM",
        "description": "Experiencia del Cliente"
      }
    ],
    "measurementTechnique": "Análisis semanal de respuestas de 4 modelos de IA líderes sobre reputación corporativa",
    "distribution": {
      "@type": "DataDownload",
      "encodingFormat": "application/json",
      "contentUrl": "https://repindex.ai/dashboard"
    }
  };

  const faqSchema = getFAQSchema(issuerCountFormatted);

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>RepIndex.ai - El Índice de Reputación Corporativa de las IAs</title>
      <meta 
        name="description" 
        content={`RepIndex es el primer índice mundial que mide la reputación corporativa según la percepción de ChatGPT, Perplexity, Gemini y DeepSeek. Analiza ${issuerCountFormatted} empresas españolas con 8 métricas semanalmente.`} 
      />
      <meta 
        name="keywords" 
        content="reputación corporativa, corporate reputation, inteligencia artificial, AI reputation index, IBEX-35, ChatGPT perception, Perplexity, Gemini, DeepSeek, RIX score, empresas españolas" 
      />
      <meta name="author" content="RepIndex.ai" />
      <meta name="robots" content="index, follow" />
      
      {/* Canonical URL */}
      <link rel="canonical" href="https://repindex.ai/" />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://repindex.ai/" />
      <meta property="og:title" content="RepIndex.ai - La Autoridad Reputacional Corporativa de las IAs" />
      <meta property="og:description" content={`El primer índice mundial que mide cómo ChatGPT, Perplexity, Gemini y DeepSeek perciben a las empresas. ${issuerCountFormatted} compañías analizadas semanalmente.`} />
      <meta property="og:image" content="https://repindex.ai/favicon.png" />
      <meta property="og:image:width" content="512" />
      <meta property="og:image:height" content="512" />
      <meta property="og:image:alt" content="RepIndex.ai - AI Corporate Reputation Authority" />
      <meta property="og:site_name" content="RepIndex.ai" />
      <meta property="og:locale" content="es_ES" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content="https://repindex.ai/" />
      <meta name="twitter:title" content="RepIndex.ai - La Autoridad Reputacional Corporativa de las IAs" />
      <meta name="twitter:description" content={`El primer índice mundial que mide cómo las IAs perciben a las empresas. ${issuerCountFormatted} compañías, 8 métricas, actualización semanal.`} />
      <meta name="twitter:image" content="https://repindex.ai/favicon.png" />
      <meta name="twitter:site" content="@repindex_ai" />
      <meta name="twitter:creator" content="@repindex_ai" />
      
      {/* Additional SEO */}
      <meta name="geo.region" content="ES" />
      <meta name="geo.placename" content="Spain" />
      <meta name="language" content="Spanish" />
      
      {/* Schema.org JSON-LD */}
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(websiteSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(datasetSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </script>
    </Helmet>
  );
}
