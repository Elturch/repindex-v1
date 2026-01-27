import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SmartSuggestion {
  text: string;
  type: 'random' | 'personalized' | 'discovery';
  icon: string;
  priority: number;
  metadata?: {
    company?: string;
    previousScore?: number;
    currentScore?: number;
    scoreDelta?: number;
    source: 'history' | 'live_data' | 'template';
  };
}

interface LiveInsights {
  topCompany: { name: string; ticker: string; score: number } | null;
  bottomCompany: { name: string; ticker: string; score: number } | null;
  topSector: string | null;
  topDivergence: { company: string; diff: number } | null;
  scores: Record<string, number>;
}

interface UserHistoryCompany {
  company: string;
  lastMentioned: string;
  ticker?: string;
}

// Expanded template pool with placeholders for live data
const getExpandedTemplatePool = (lang: string): string[] => {
  const pools: Record<string, string[]> = {
    es: [
      // Static templates (variety)
      '¿Cuáles son las 5 empresas con mejor RIX Score?',
      '¿Qué empresas del IBEX35 lideran esta semana?',
      'Compara el sector bancario vs energético',
      '¿Qué empresas han sido más volátiles?',
      '¿Qué modelo de IA es más optimista en general?',
      'Compara empresas cotizadas vs no cotizadas',
      '¿Cuáles son las empresas con peor reputación?',
      '¿Qué sectores muestran tendencia alcista?',
      'Análisis cruzado del sector telecomunicaciones',
      '¿Qué empresas small cap destacan?',
      '¿Cuál es la metodología del RIX Score?',
      '¿Qué dimensiones reputacionales son más importantes?',
      
      // Dynamic templates with placeholders
      '{{topCompany}} lidera con {{topScore}} pts — ¿Por qué destaca?',
      '{{bottomCompany}} tiene el score más bajo ({{bottomScore}}) — ¿Qué pasa?',
      'Las IAs discrepan {{divergenceDiff}} pts sobre {{divergenceCompany}}',
      '{{topSector}} es el sector mejor valorado — Analizar',
      '¿Cómo evalúan ChatGPT y Perplexity a {{topCompany}}?',
      '¿Qué factores explican el liderazgo de {{topCompany}}?',
      'Vulnerabilidades de {{bottomCompany}} — Análisis profundo',
      '¿Qué empresas compiten con {{topCompany}}?',
    ],
    en: [
      'What are the top 5 companies by RIX Score?',
      'Which IBEX35 companies lead this week?',
      'Compare the banking vs energy sector',
      'Which companies have been most volatile?',
      'Which AI model is most optimistic overall?',
      'Compare listed vs non-listed companies',
      'Which companies have the worst reputation?',
      'Which sectors show an upward trend?',
      'Cross-analysis of the telecom sector',
      'Which small cap companies stand out?',
      'What is the RIX Score methodology?',
      'Which reputation dimensions are most important?',
      
      '{{topCompany}} leads with {{topScore}} pts — Why does it stand out?',
      '{{bottomCompany}} has the lowest score ({{bottomScore}}) — What\'s happening?',
      'AIs disagree by {{divergenceDiff}} pts about {{divergenceCompany}}',
      '{{topSector}} is the best-rated sector — Analyze',
      'How do ChatGPT and Perplexity evaluate {{topCompany}}?',
      'What factors explain {{topCompany}}\'s leadership?',
      'Vulnerabilities of {{bottomCompany}} — Deep analysis',
      'Which companies compete with {{topCompany}}?',
    ],
  };
  
  return pools[lang] || pools['es'];
};

// Personalized template patterns
const getPersonalizedTemplates = (lang: string) => {
  const templates: Record<string, {
    scoreUp: string;
    scoreDown: string;
    continueAnalysis: string;
    sectorInterest: string;
  }> = {
    es: {
      scoreUp: '📈 {{company}} ha subido {{delta}} pts desde tu último análisis',
      scoreDown: '📉 {{company}} ha bajado {{delta}} pts desde tu último análisis',
      continueAnalysis: '🔄 Continúa tu análisis de {{company}}',
      sectorInterest: '💼 Novedades en {{sector}} — tu sector de interés',
    },
    en: {
      scoreUp: '📈 {{company}} is up {{delta}} pts since your last analysis',
      scoreDown: '📉 {{company}} is down {{delta}} pts since your last analysis',
      continueAnalysis: '🔄 Continue your analysis of {{company}}',
      sectorInterest: '💼 News in {{sector}} — your sector of interest',
    },
  };
  
  return templates[lang] || templates['es'];
};

// Discovery templates
const getDiscoveryTemplates = (lang: string) => {
  const templates: Record<string, {
    divergence: string;
    newLeader: string;
    bigDrop: string;
  }> = {
    es: {
      divergence: '🤖 Las IAs discrepan {{diff}} pts sobre {{company}}',
      newLeader: '🏆 Nuevo líder en {{sector}}: {{company}} ({{score}} pts)',
      bigDrop: '⚠️ {{company}} ha caído {{delta}} puntos esta semana',
    },
    en: {
      divergence: '🤖 AIs disagree by {{diff}} pts on {{company}}',
      newLeader: '🏆 New leader in {{sector}}: {{company}} ({{score}} pts)',
      bigDrop: '⚠️ {{company}} dropped {{delta}} points this week',
    },
  };
  
  return templates[lang] || templates['es'];
};

// Inject live data into templates
const injectLiveData = (template: string, liveData: LiveInsights): string => {
  let result = template;
  
  if (liveData.topCompany) {
    result = result.replace(/\{\{topCompany\}\}/g, liveData.topCompany.name);
    result = result.replace(/\{\{topScore\}\}/g, String(liveData.topCompany.score));
  }
  
  if (liveData.bottomCompany) {
    result = result.replace(/\{\{bottomCompany\}\}/g, liveData.bottomCompany.name);
    result = result.replace(/\{\{bottomScore\}\}/g, String(liveData.bottomCompany.score));
  }
  
  if (liveData.topSector) {
    result = result.replace(/\{\{topSector\}\}/g, liveData.topSector);
  }
  
  if (liveData.topDivergence) {
    result = result.replace(/\{\{divergenceCompany\}\}/g, liveData.topDivergence.company);
    result = result.replace(/\{\{divergenceDiff\}\}/g, String(liveData.topDivergence.diff));
  }
  
  return result;
};

// Check if template still has unresolved placeholders
const hasUnresolvedPlaceholders = (text: string): boolean => {
  return /\{\{[^}]+\}\}/.test(text);
};

export function useSmartSuggestions(
  userId: string | null,
  languageCode: string,
  count: number = 4
) {
  const [liveData, setLiveData] = useState<LiveInsights>({
    topCompany: null,
    bottomCompany: null,
    topSector: null,
    topDivergence: null,
    scores: {},
  });
  const [userHistory, setUserHistory] = useState<UserHistoryCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch live RIX data
  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        // Get latest scores
        const { data: latestRuns } = await supabase
          .from('rix_runs')
          .select('"03_target_name", "05_ticker", "09_rix_score", "02_model_name"')
          .not('09_rix_score', 'is', null)
          .order('batch_execution_date', { ascending: false })
          .limit(200);

        if (latestRuns && latestRuns.length > 0) {
          // Build scores map and find extremes
          const scoresByCompany: Record<string, number[]> = {};
          const scoresMap: Record<string, number> = {};
          
          latestRuns.forEach(run => {
            const name = run['03_target_name'];
            const score = run['09_rix_score'];
            if (name && score) {
              if (!scoresByCompany[name]) scoresByCompany[name] = [];
              scoresByCompany[name].push(score);
            }
          });

          // Calculate averages
          Object.entries(scoresByCompany).forEach(([name, scores]) => {
            scoresMap[name] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          });

          // Find top and bottom
          const sorted = Object.entries(scoresMap).sort((a, b) => b[1] - a[1]);
          const topEntry = sorted[0];
          const bottomEntry = sorted[sorted.length - 1];

          // Find divergence (max difference between AI models for same company)
          let maxDivergence = { company: '', diff: 0 };
          Object.entries(scoresByCompany).forEach(([name, scores]) => {
            if (scores.length >= 2) {
              const diff = Math.max(...scores) - Math.min(...scores);
              if (diff > maxDivergence.diff) {
                maxDivergence = { company: name, diff };
              }
            }
          });

          setLiveData({
            topCompany: topEntry ? { name: topEntry[0], ticker: '', score: topEntry[1] } : null,
            bottomCompany: bottomEntry ? { name: bottomEntry[0], ticker: '', score: bottomEntry[1] } : null,
            topSector: 'Energía', // Could be derived from sector data
            topDivergence: maxDivergence.diff >= 5 ? maxDivergence : null,
            scores: scoresMap,
          });
        }
      } catch (error) {
        console.error('Error fetching live data:', error);
      }
    };

    fetchLiveData();
  }, [refreshKey]);

  // Fetch user history if authenticated
  useEffect(() => {
    const fetchUserHistory = async () => {
      if (!userId) {
        setUserHistory([]);
        setIsLoading(false);
        return;
      }

      try {
        const { data: sessions } = await supabase
          .from('chat_intelligence_sessions')
          .select('company, created_at')
          .eq('user_id', userId)
          .eq('role', 'user')
          .not('company', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20);

        if (sessions) {
          // Deduplicate by company
          const seen = new Set<string>();
          const unique: UserHistoryCompany[] = [];
          
          sessions.forEach(s => {
            if (s.company && !seen.has(s.company)) {
              seen.add(s.company);
              unique.push({
                company: s.company,
                lastMentioned: s.created_at || '',
              });
            }
          });
          
          setUserHistory(unique.slice(0, 5));
        }
      } catch (error) {
        console.error('Error fetching user history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserHistory();
  }, [userId, refreshKey]);

  // Generate suggestions
  const suggestions = useMemo((): SmartSuggestion[] => {
    const pool = getExpandedTemplatePool(languageCode);
    const personalizedTemplates = getPersonalizedTemplates(languageCode);
    const discoveryTemplates = getDiscoveryTemplates(languageCode);
    const result: SmartSuggestion[] = [];

    // If user has history, generate personalized suggestions
    if (userId && userHistory.length > 0) {
      // Add personalized suggestions based on history
      for (const historyItem of userHistory.slice(0, 2)) {
        const currentScore = liveData.scores[historyItem.company];
        
        if (currentScore !== undefined) {
          // For now, suggest continuing analysis (we don't track previous scores yet)
          const template = personalizedTemplates.continueAnalysis
            .replace(/\{\{company\}\}/g, historyItem.company);
          
          result.push({
            text: template,
            type: 'personalized',
            icon: '🔄',
            priority: 1,
            metadata: {
              company: historyItem.company,
              currentScore,
              source: 'history',
            },
          });
        }
      }
    }

    // Add discovery suggestion if there's interesting divergence
    if (liveData.topDivergence && liveData.topDivergence.diff >= 5) {
      const text = discoveryTemplates.divergence
        .replace(/\{\{company\}\}/g, liveData.topDivergence.company)
        .replace(/\{\{diff\}\}/g, String(liveData.topDivergence.diff));
      
      result.push({
        text,
        type: 'discovery',
        icon: '🤖',
        priority: 2,
        metadata: {
          company: liveData.topDivergence.company,
          source: 'live_data',
        },
      });
    }

    // Fill remaining with random templates
    const remaining = count - result.length;
    if (remaining > 0) {
      // Shuffle pool
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      
      for (const template of shuffled) {
        if (result.length >= count) break;
        
        const text = injectLiveData(template, liveData);
        
        // Skip if still has unresolved placeholders
        if (hasUnresolvedPlaceholders(text)) continue;
        
        // Skip duplicates
        if (result.some(s => s.text === text)) continue;
        
        // Determine icon based on content
        let icon = '💡';
        if (text.includes('lidera') || text.includes('leads')) icon = '🏆';
        else if (text.includes('bajo') || text.includes('lowest')) icon = '📉';
        else if (text.includes('sector')) icon = '📊';
        else if (text.includes('compara') || text.includes('Compare')) icon = '⚡';
        
        result.push({
          text,
          type: 'random',
          icon,
          priority: 3,
          metadata: {
            source: 'template',
          },
        });
      }
    }

    // Sort by priority and return
    return result.sort((a, b) => a.priority - b.priority).slice(0, count);
  }, [userId, userHistory, liveData, languageCode, count, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const hasPersonalized = suggestions.some(s => s.type === 'personalized');

  return {
    suggestions,
    isLoading,
    refresh,
    hasPersonalized,
  };
}
