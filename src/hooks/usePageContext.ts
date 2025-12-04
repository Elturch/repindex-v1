import { useLocation } from "react-router-dom";
import { useMemo } from "react";

interface PageContextSuggestions {
  name: string;
  description: string;
  suggestions: string[];
}

const pageContexts: Record<string, PageContextSuggestions> = {
  '/': {
    name: 'Inicio',
    description: 'Página de bienvenida de RepIndex',
    suggestions: [
      '¿Qué es el RIX Score y cómo se calcula?',
      '¿Cuáles son las empresas mejor valoradas esta semana?',
      'Genera un boletín de Telefónica',
      '¿Cómo funciona RepIndex?',
    ]
  },
  '/dashboard': {
    name: 'Dashboard',
    description: 'Tabla de resultados RIX semanal',
    suggestions: [
      '¿Qué empresas han mejorado más esta semana?',
      'Genera un boletín de Inditex y sus competidores',
      '¿Qué empresas del IBEX35 lideran el ranking?',
      'Compara empresas cotizadas vs no cotizadas',
    ]
  },
  '/market-evolution': {
    name: 'Evolución del Mercado',
    description: 'Gráficos de tendencias temporales',
    suggestions: [
      '¿Qué sectores muestran tendencia alcista?',
      'Genera un boletín de Iberdrola',
      '¿Qué empresas han sido más volátiles?',
      'Analiza la evolución del sector bancario',
    ]
  },
  '/noticias': {
    name: 'Boletín Semanal',
    description: 'Noticias y análisis de reputación',
    suggestions: [
      '¿Cuáles son las principales noticias de esta semana?',
      'Genera un boletín ejecutivo de Repsol',
      '¿Cuál es la calidad de los datos recogidos?',
      'Resume las tendencias más importantes',
    ]
  },
  '/chat': {
    name: 'Chat Inteligente',
    description: 'Análisis conversacional de datos',
    suggestions: [
      '¿Cuáles son las 5 empresas con mejor RIX Score?',
      'Genera un boletín de Banco Santander y competidores',
      'Compara la evolución de Telefónica e Iberdrola',
      '¿Cómo evalúan las IAs a BBVA?',
    ]
  },
};

export interface DynamicPageContext {
  name: string;
  description: string;
  suggestions: string[];
  path: string;
}

export function usePageContext(dynamicData?: Record<string, any>): DynamicPageContext {
  const location = useLocation();
  
  return useMemo(() => {
    const path = location.pathname;
    const baseContext = pageContexts[path] || pageContexts['/'];
    
    let suggestions = [...baseContext.suggestions];
    
    // Add dynamic suggestions based on page and data
    if (path === '/dashboard' && dynamicData) {
      if (dynamicData.selectedCompany) {
        suggestions.unshift(`¿Por qué ${dynamicData.selectedCompany} tiene este RIX Score?`);
        suggestions.unshift(`¿Cómo evalúan las IAs a ${dynamicData.selectedCompany}?`);
      }
      if (dynamicData.selectedSector) {
        suggestions.unshift(`Análisis del sector ${dynamicData.selectedSector}`);
        suggestions.unshift(`¿Qué empresas lideran en ${dynamicData.selectedSector}?`);
      }
      if (dynamicData.selectedAIModel && dynamicData.selectedAIModel !== 'comparison') {
        suggestions.unshift(`¿Por qué ${dynamicData.selectedAIModel} da estas puntuaciones?`);
      }
      if (dynamicData.selectedIbexFamily) {
        suggestions.unshift(`Análisis de empresas ${dynamicData.selectedIbexFamily}`);
      }
    }
    
    if (path === '/market-evolution' && dynamicData?.selectedCompanies?.length > 1) {
      const companyList = dynamicData.selectedCompanies.slice(0, 3).join(' vs ');
      suggestions.unshift(`Compara la evolución de ${companyList}`);
      suggestions.unshift(`¿Qué modelo de IA es más optimista con ${dynamicData.selectedCompanies[0]}?`);
    }
    
    if (path === '/market-evolution' && dynamicData?.selectedCompanies?.length === 1) {
      suggestions.unshift(`Analiza la tendencia de ${dynamicData.selectedCompanies[0]}`);
      suggestions.unshift(`¿Cómo ha variado el RIX de ${dynamicData.selectedCompanies[0]} este mes?`);
    }
    
    if (path === '/market-evolution' && dynamicData?.selectedSector) {
      suggestions.unshift(`¿Qué empresas de ${dynamicData.selectedSector} tienen mejor tendencia?`);
    }
    
    if (path === '/noticias' && dynamicData?.weekLabel) {
      suggestions.unshift(`Resumen de la semana ${dynamicData.weekLabel}`);
    }
    
    // Handle RIX run detail pages
    if (path.startsWith('/rix-run/') && dynamicData?.companyName) {
      return {
        name: `Detalle: ${dynamicData.companyName}`,
        description: `Análisis detallado de ${dynamicData.companyName}`,
        path,
        suggestions: [
          `¿Cuál es la tendencia histórica de ${dynamicData.companyName}?`,
          `¿Qué modelo de IA es más crítico con ${dynamicData.companyName}?`,
          dynamicData.sector ? `Compara ${dynamicData.companyName} con otras empresas de ${dynamicData.sector}` : `Compara ${dynamicData.companyName} con sus competidores`,
          `¿Qué factores influyen en el RIX de ${dynamicData.companyName}?`,
          dynamicData.modelName ? `¿Por qué ${dynamicData.modelName} le da ${dynamicData.rixScore} puntos?` : null,
        ].filter(Boolean) as string[],
      };
    }
    
    return {
      ...baseContext,
      suggestions: suggestions.slice(0, 5), // Max 5 suggestions
      path,
    };
  }, [location.pathname, dynamicData]);
}
