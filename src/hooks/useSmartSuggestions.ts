import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRixUniverse } from '@/hooks/useRixUniverse';
import { validateSuggestion } from '@/lib/chat/suggestionWhitelist';

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
      'Top 5 del IBEX 35 por reputación esta semana',
      'Analiza la reputación de Telefónica',
      'Compara BBVA con Banco Santander',
      'Evolución de Repsol en las últimas 4 semanas',
      'Ranking del sector Banca y Servicios Financieros',
      'Analiza la divergencia entre IAs sobre Iberdrola',
      'Desglose de métricas de Inditex',
      'Compara sector Energía y Gas vs Telecomunicaciones',
      'Top empresas del BME Growth esta semana',
      'Evolución del sector banca últimas 6 semanas',
    ],
    en: [
      'Top 5 IBEX 35 companies by reputation this week',
      'Analyze the reputation of Telefónica',
      'Compare BBVA with Banco Santander',
      'Evolution of Repsol over the last 4 weeks',
      'Ranking of the Banking sector',
      'Analyze AI divergence on Iberdrola',
      'Metric breakdown for Inditex',
      'Compare Energy vs Telecom sector',
      'Top BME Growth companies this week',
      'Banking sector evolution over the last 6 weeks',
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
  const { data: universe } = useRixUniverse();

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

    // Priority 0: Vector Store insights — whitelist-filtered against the
    // live RIX universe to drop any company that no longer has data.
    for (const vs of vectorSuggestions) {
      const v = validateSuggestion(vs.text, universe);
      if (!v.valid) continue;
      result.push({
        text: v.text,
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
      // Apply same whitelist filter to hardcoded fallbacks.
      const validated = pool
        .map((t) => validateSuggestion(t, universe))
        .filter((v) => v.valid)
        .map((v) => v.text);
      const shuffled = [...validated].sort(() => Math.random() - 0.5);
      for (const text of shuffled) {
        if (result.length - vectorSuggestions.length >= remaining) break;
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
  }, [vectorSuggestions, languageCode, count, universe]);

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
