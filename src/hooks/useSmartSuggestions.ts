import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SmartSuggestion {
  text: string;
  type: 'random' | 'personalized' | 'discovery' | 'vector_insight';
  icon: string;
  priority: number;
  metadata?: {
    company?: string;
    previousScore?: number;
    currentScore?: number;
    scoreDelta?: number;
    source: 'history' | 'live_data' | 'template' | 'vector_store';
  };
}

interface VectorSuggestion {
  text: string;
  type: 'vector_insight';
  icon: string;
  source: string;
}

// Cache for vector suggestions (5 min TTL)
let vectorCache: { data: VectorSuggestion[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// Fallback template pool
const getFallbackTemplates = (lang: string): string[] => {
  const pools: Record<string, string[]> = {
    es: [
      '¿Cuáles son las 5 empresas con mejor RIX Score?',
      '¿Qué empresas del IBEX35 lideran esta semana?',
      'Compara el sector bancario vs energético',
      '¿Qué modelo de IA es más optimista en general?',
      '¿Cuáles son las empresas con peor reputación?',
      '¿Qué sectores muestran tendencia alcista?',
      '¿Qué dimensiones reputacionales son más importantes?',
      '¿Cuál es la metodología del RIX Score?',
      '¿Qué empresas small cap destacan?',
      'Análisis cruzado del sector telecomunicaciones',
    ],
    en: [
      'What are the top 5 companies by RIX Score?',
      'Which IBEX35 companies lead this week?',
      'Compare the banking vs energy sector',
      'Which AI model is most optimistic overall?',
      'Which companies have the worst reputation?',
      'Which sectors show an upward trend?',
      'Which reputation dimensions are most important?',
      'What is the RIX Score methodology?',
      'Which small cap companies stand out?',
      'Cross-analysis of the telecom sector',
    ],
  };
  return pools[lang] || pools['es'];
};

export function useSmartSuggestions(
  userId: string | null,
  languageCode: string,
  count: number = 4
) {
  const [vectorSuggestions, setVectorSuggestions] = useState<VectorSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchingRef = useRef(false);

  // Fetch vector-powered suggestions from Edge Function
  useEffect(() => {
    const fetchVectorSuggestions = async () => {
      // Check cache first
      if (
        refreshKey === 0 &&
        vectorCache &&
        Date.now() - vectorCache.timestamp < CACHE_TTL
      ) {
        setVectorSuggestions(vectorCache.data);
        setIsLoading(false);
        return;
      }

      if (fetchingRef.current) return;
      fetchingRef.current = true;

      try {
        const response = await fetch(
          `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/fetch-smart-suggestions?lang=${languageCode}&count=${count + 2}`,
          {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU',
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.suggestions && result.suggestions.length > 0) {
            setVectorSuggestions(result.suggestions);
            vectorCache = { data: result.suggestions, timestamp: Date.now() };
          }
        }
      } catch (error) {
        console.error('Error fetching vector suggestions:', error);
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
      }
    };

    fetchVectorSuggestions();
  }, [languageCode, count, refreshKey]);

  // Build final suggestions list
  const suggestions = useMemo((): SmartSuggestion[] => {
    const result: SmartSuggestion[] = [];

    // Priority 0: Vector Store insights
    for (const vs of vectorSuggestions) {
      result.push({
        text: vs.text,
        type: 'vector_insight',
        icon: vs.icon,
        priority: 0,
        metadata: { source: 'vector_store' },
      });
    }

    // Fill remaining with fallback templates
    const remaining = count - result.length;
    if (remaining > 0) {
      const pool = getFallbackTemplates(languageCode);
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const text of shuffled.slice(0, remaining)) {
        if (result.some((s) => s.text === text)) continue;
        result.push({
          text,
          type: 'random',
          icon: '💡',
          priority: 3,
          metadata: { source: 'template' },
        });
      }
    }

    return result.sort((a, b) => a.priority - b.priority).slice(0, count);
  }, [vectorSuggestions, languageCode, count]);

  const refresh = useCallback(() => {
    vectorCache = null;
    setIsLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const hasPersonalized = vectorSuggestions.length > 0;

  return {
    suggestions,
    isLoading,
    refresh,
    hasPersonalized,
  };
}
