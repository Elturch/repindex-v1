/**
 * Verified Source Extractor for RepIndex Reports
 * 
 * CRITICAL PRINCIPLE: Only extract sources from models with verifiable web search:
 * - ChatGPT (with Web Search): URLs contain ?utm_source=openai parameter
 * - Perplexity: Structured citations with [n] references
 * 
 * Sources from other models (Gemini, DeepSeek, Grok, Qwen) are IGNORED
 * because they may contain fabricated/hallucinated URLs.
 * 
 * TEMPORAL CLASSIFICATION:
 * - Window Mentions: Sources within the analysis period (period_from to period_to)
 * - Reinforcement Mentions: Historical/contextual sources used by AIs
 * 
 * @see .lovable/plan.md for methodology justification
 */

export interface VerifiedSource {
  url: string;
  domain: string;
  title?: string;
  sourceModel: 'ChatGPT' | 'Perplexity';
  citationNumber?: number; // For Perplexity [n] references
  // Temporal classification fields
  temporalCategory: 'window' | 'reinforcement' | 'unknown';
  extractedDate?: string; // ISO date detected in context
  contextSnippet?: string; // Fragment where mention appears
}

// Spanish month names for date extraction
const SPANISH_MONTHS: Record<string, number> = {
  'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
  'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
  'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
};

// Perplexity section classification
const PERPLEXITY_SECTION_CLASSIFICATION: Record<string, 'window' | 'reinforcement'> = {
  // Window sections (current period)
  'periodo_busqueda_especifico': 'window',
  'menciones_recientes': 'window',
  'noticias_semana': 'window',
  'noticias_recientes': 'window',
  'eventos_recientes': 'window',
  'ultima_semana': 'window',
  // Reinforcement sections (historical/contextual)
  'informacion_general_relevante': 'reinforcement',
  'contexto_reputacional_historico': 'reinforcement',
  'perfil_corporativo': 'reinforcement',
  'datos_basicos': 'reinforcement',
  'historia': 'reinforcement',
  'contexto_general': 'reinforcement',
  'background': 'reinforcement',
};

/**
 * Extract dates from text near a URL position (within ~200 chars).
 * Returns the closest date found, if any.
 */
function extractNearestDate(text: string, urlPosition: number): Date | null {
  // Get surrounding context (200 chars before and after)
  const start = Math.max(0, urlPosition - 200);
  const end = Math.min(text.length, urlPosition + 200);
  const context = text.slice(start, end);
  
  const dates: { date: Date; distance: number }[] = [];
  
  // Pattern 1: "DD de MES de AAAA" (Spanish full date)
  const fullDatePattern = /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/gi;
  let match;
  while ((match = fullDatePattern.exec(context)) !== null) {
    const day = parseInt(match[1], 10);
    const month = SPANISH_MONTHS[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, day),
        distance: Math.abs(match.index - (urlPosition - start))
      });
    }
  }
  
  // Pattern 2: "MES de AAAA" or "MES AAAA" (month + year)
  const monthYearPattern = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/gi;
  while ((match = monthYearPattern.exec(context)) !== null) {
    const month = SPANISH_MONTHS[match[1].toLowerCase()];
    const year = parseInt(match[2], 10);
    if (month !== undefined && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, 15), // Mid-month as approximation
        distance: Math.abs(match.index - (urlPosition - start))
      });
    }
  }
  
  // Pattern 3: DD/MM/YYYY or DD-MM-YYYY
  const numericPattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  while ((match = numericPattern.exec(context)) !== null) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
    const year = parseInt(match[3], 10);
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month, day),
        distance: Math.abs(match.index - (urlPosition - start))
      });
    }
  }
  
  // Return the closest date found
  if (dates.length === 0) return null;
  dates.sort((a, b) => a.distance - b.distance);
  return dates[0].date;
}

/**
 * Classify a source temporally based on extracted date and analysis period.
 */
function classifyTemporally(
  extractedDate: Date | null,
  periodFrom: Date | null,
  periodTo: Date | null
): 'window' | 'reinforcement' | 'unknown' {
  if (!extractedDate) return 'unknown';
  if (!periodFrom || !periodTo) return 'unknown';
  
  // Extend window by 3 days on each side to account for timezone issues
  const windowStart = new Date(periodFrom);
  windowStart.setDate(windowStart.getDate() - 3);
  const windowEnd = new Date(periodTo);
  windowEnd.setDate(windowEnd.getDate() + 3);
  
  if (extractedDate >= windowStart && extractedDate <= windowEnd) {
    return 'window';
  } else if (extractedDate < periodFrom) {
    return 'reinforcement';
  }
  
  return 'unknown';
}

/**
 * Get snippet context around URL position
 */
function getContextSnippet(text: string, urlPosition: number, maxLength: number = 100): string {
  const start = Math.max(0, urlPosition - maxLength / 2);
  const end = Math.min(text.length, urlPosition + maxLength / 2);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

/**
 * Extract verified URLs from ChatGPT raw response with temporal classification.
 * Only extracts URLs that contain utm_source=openai, which indicates
 * the URL came from OpenAI's verified web search, not hallucination.
 */
function extractChatGptSourcesWithTemporal(
  rawText: string | null,
  periodFrom: Date | null,
  periodTo: Date | null
): VerifiedSource[] {
  if (!rawText) return [];
  
  const sources: VerifiedSource[] = [];
  
  // Pattern: [link text](URL?utm_source=openai...)
  const chatGptUrlPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+utm_source=openai[^)]*)\)/g;
  
  let match;
  while ((match = chatGptUrlPattern.exec(rawText)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    const urlPosition = match.index;
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      // Avoid duplicates
      if (!sources.some(s => s.url === url)) {
        const extractedDate = extractNearestDate(rawText, urlPosition);
        const temporalCategory = classifyTemporally(extractedDate, periodFrom, periodTo);
        
        sources.push({
          url,
          domain,
          title: title || undefined,
          sourceModel: 'ChatGPT',
          temporalCategory,
          extractedDate: extractedDate?.toISOString(),
          contextSnippet: getContextSnippet(rawText, urlPosition),
        });
      }
    } catch {
      // Invalid URL, skip
    }
  }
  
  return sources;
}

/**
 * Extract verified citations from Perplexity raw response with temporal classification.
 * Perplexity uses numbered citations [1], [2], etc. and includes a sources section.
 */
function extractPerplexitySourcesWithTemporal(
  rawText: string | null,
  periodFrom: Date | null,
  periodTo: Date | null
): VerifiedSource[] {
  if (!rawText) return [];
  
  const sources: VerifiedSource[] = [];
  let currentSection = '';
  
  // Try to parse as JSON first (Perplexity sometimes returns structured data)
  try {
    const parsed = JSON.parse(rawText);
    
    // Check for citations array with section context
    if (parsed.citations && Array.isArray(parsed.citations)) {
      parsed.citations.forEach((citation: string, index: number) => {
        if (citation && citation.startsWith('http')) {
          try {
            const urlObj = new URL(citation);
            const domain = urlObj.hostname.replace(/^www\./, '');
            
            // Determine temporal category from section name in JSON structure
            let temporalCategory: 'window' | 'reinforcement' | 'unknown' = 'unknown';
            
            // Check if there's section info in the JSON structure
            for (const [sectionKey, category] of Object.entries(PERPLEXITY_SECTION_CLASSIFICATION)) {
              if (JSON.stringify(parsed).toLowerCase().includes(sectionKey)) {
                temporalCategory = category;
                break;
              }
            }
            
            sources.push({
              url: citation,
              domain,
              sourceModel: 'Perplexity',
              citationNumber: index + 1,
              temporalCategory,
            });
          } catch {
            // Invalid URL
          }
        }
      });
    }
    
    // Check for sources field
    if (parsed.sources && Array.isArray(parsed.sources)) {
      parsed.sources.forEach((source: { url?: string; title?: string }, index: number) => {
        if (source.url && source.url.startsWith('http')) {
          try {
            const urlObj = new URL(source.url);
            const domain = urlObj.hostname.replace(/^www\./, '');
            if (!sources.some(s => s.url === source.url)) {
              sources.push({
                url: source.url,
                domain,
                title: source.title,
                sourceModel: 'Perplexity',
                citationNumber: index + 1,
                temporalCategory: 'unknown', // Can't determine from JSON structure alone
              });
            }
          } catch {
            // Invalid URL
          }
        }
      });
    }
    
    // Check structured sections for temporal classification
    for (const [key, value] of Object.entries(parsed)) {
      const sectionCategory = PERPLEXITY_SECTION_CLASSIFICATION[key.toLowerCase()];
      if (sectionCategory && value && typeof value === 'object') {
        // Mark sources from this section with appropriate category
        const sectionJson = JSON.stringify(value);
        const urlPattern = /https?:\/\/[^\s"]+/g;
        let match;
        while ((match = urlPattern.exec(sectionJson)) !== null) {
          const sourceIndex = sources.findIndex(s => s.url.includes(match[0].replace(/[",]/g, '')));
          if (sourceIndex >= 0) {
            sources[sourceIndex].temporalCategory = sectionCategory;
          }
        }
      }
    }
  } catch {
    // Not JSON, try regex extraction with date-based classification
  }
  
  // If no JSON structure, extract URLs with date-based classification
  const urlPattern = /\[(\d+)\][:\s]*(?:Source:?\s*)?(https?:\/\/[^\s\)]+)/gi;
  let match;
  while ((match = urlPattern.exec(rawText)) !== null) {
    const citationNumber = parseInt(match[1], 10);
    const url = match[2].replace(/[.,;:]+$/, ''); // Remove trailing punctuation
    const urlPosition = match.index;
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      if (!sources.some(s => s.url === url)) {
        const extractedDate = extractNearestDate(rawText, urlPosition);
        const temporalCategory = classifyTemporally(extractedDate, periodFrom, periodTo);
        
        sources.push({
          url,
          domain,
          sourceModel: 'Perplexity',
          citationNumber,
          temporalCategory,
          extractedDate: extractedDate?.toISOString(),
          contextSnippet: getContextSnippet(rawText, urlPosition),
        });
      }
    } catch {
      // Invalid URL
    }
  }
  
  // Also look for plain markdown links in Perplexity output
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  while ((match = markdownLinkPattern.exec(rawText)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    const urlPosition = match.index;
    
    // Skip if already captured or if it's an internal/generic link
    if (sources.some(s => s.url === url)) continue;
    if (url.includes('perplexity.ai')) continue;
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      const extractedDate = extractNearestDate(rawText, urlPosition);
      const temporalCategory = classifyTemporally(extractedDate, periodFrom, periodTo);
      
      sources.push({
        url,
        domain,
        title: title || undefined,
        sourceModel: 'Perplexity',
        temporalCategory,
        extractedDate: extractedDate?.toISOString(),
        contextSnippet: getContextSnippet(rawText, urlPosition),
      });
    } catch {
      // Invalid URL
    }
  }
  
  return sources;
}

/**
 * Main extraction function WITH temporal classification.
 * Combines sources from ChatGPT and Perplexity only.
 * 
 * @param chatGptRaw - Raw text from 20_res_gpt_bruto field
 * @param perplexityRaw - Raw text from 21_res_perplex_bruto field
 * @param periodFrom - Start of analysis window (ISO string or Date)
 * @param periodTo - End of analysis window (ISO string or Date)
 * @returns Array of verified sources with temporal classification
 */
export function extractVerifiedSourcesWithTemporal(
  chatGptRaw: string | null,
  perplexityRaw: string | null,
  periodFrom: string | null | Date,
  periodTo: string | null | Date
): VerifiedSource[] {
  // Parse period dates
  const periodFromDate = periodFrom ? new Date(periodFrom) : null;
  const periodToDate = periodTo ? new Date(periodTo) : null;
  
  const chatGptSources = extractChatGptSourcesWithTemporal(chatGptRaw, periodFromDate, periodToDate);
  const perplexitySources = extractPerplexitySourcesWithTemporal(perplexityRaw, periodFromDate, periodToDate);
  
  // Combine and deduplicate by URL
  const allSources = [...chatGptSources, ...perplexitySources];
  const uniqueUrls = new Set<string>();
  
  return allSources.filter(source => {
    if (uniqueUrls.has(source.url)) {
      return false;
    }
    uniqueUrls.add(source.url);
    return true;
  });
}

/**
 * Legacy extraction function (without temporal classification).
 * Maintained for backwards compatibility.
 */
export function extractVerifiedSources(
  chatGptRaw: string | null,
  perplexityRaw: string | null
): VerifiedSource[] {
  return extractVerifiedSourcesWithTemporal(chatGptRaw, perplexityRaw, null, null);
}

/**
 * Extract sources from multiple RIX run records with temporal classification.
 */
export function extractSourcesFromRixRuns(
  rixRuns: Array<{
    '20_res_gpt_bruto'?: string | null;
    '21_res_perplex_bruto'?: string | null;
    '06_period_from'?: string | null;
    '07_period_to'?: string | null;
  }>
): VerifiedSource[] {
  const allSources: VerifiedSource[] = [];
  
  for (const run of rixRuns) {
    const sources = extractVerifiedSourcesWithTemporal(
      run['20_res_gpt_bruto'] ?? null,
      run['21_res_perplex_bruto'] ?? null,
      run['06_period_from'] ?? null,
      run['07_period_to'] ?? null
    );
    allSources.push(...sources);
  }
  
  // Deduplicate across all runs
  const uniqueUrls = new Set<string>();
  return allSources.filter(source => {
    if (uniqueUrls.has(source.url)) {
      return false;
    }
    uniqueUrls.add(source.url);
    return true;
  });
}

/**
 * Format period for display (e.g., "18-25 ene 2026")
 */
function formatPeriodDisplay(periodFrom: string | null, periodTo: string | null): string {
  if (!periodFrom || !periodTo) return '';
  
  try {
    const from = new Date(periodFrom);
    const to = new Date(periodTo);
    
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    
    const dayFrom = from.getDate();
    const dayTo = to.getDate();
    const month = months[to.getMonth()];
    const year = to.getFullYear();
    
    if (from.getMonth() === to.getMonth()) {
      return `${dayFrom}-${dayTo} ${month} ${year}`;
    }
    
    const monthFrom = months[from.getMonth()];
    return `${dayFrom} ${monthFrom} - ${dayTo} ${month} ${year}`;
  } catch {
    return '';
  }
}

/**
 * Generate HTML for divided bibliography section in exported reports.
 * Separates sources into Window Mentions and Reinforcement Mentions.
 */
export function generateBibliographyHtml(
  sources: VerifiedSource[],
  periodFrom?: string | null,
  periodTo?: string | null
): string {
  if (!sources || sources.length === 0) {
    return '';
  }
  
  // Separate sources by temporal category
  const windowSources = sources.filter(s => s.temporalCategory === 'window');
  const reinforcementSources = sources.filter(s => s.temporalCategory === 'reinforcement');
  const unknownSources = sources.filter(s => s.temporalCategory === 'unknown');
  
  // If all sources are unknown (no temporal data), fall back to model-based grouping
  const useTemporalClassification = windowSources.length > 0 || reinforcementSources.length > 0;
  
  const periodDisplay = formatPeriodDisplay(periodFrom ?? null, periodTo ?? null);
  
  let html = `
    <section class="bibliography-verified" style="
      margin-top: 40px;
      padding: 24px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      page-break-inside: avoid;
    ">
      <h2 style="
        font-size: 16px;
        font-weight: 700;
        color: #1e293b;
        margin: 0 0 12px 0;
        display: flex;
        align-items: center;
        gap: 8px;
      ">
        📚 Anexo: Referencias Citadas por las IAs
      </h2>
      
      <p style="
        font-size: 11px;
        color: #64748b;
        margin: 0 0 20px 0;
        line-height: 1.6;
        padding: 12px;
        background: #ffffff;
        border-radius: 8px;
        border-left: 3px solid #3b82f6;
      ">
        <strong>Política de Cero Invención:</strong> Esta bibliografía incluye únicamente 
        fuentes con URLs verificables provenientes de modelos con búsqueda web activa 
        (ChatGPT con Web Search, Perplexity). ${useTemporalClassification ? 
          'Las <strong>Menciones de Ventana</strong> corresponden al período analizado; ' +
          'las <strong>Menciones de Refuerzo</strong> son citas históricas o contextuales.' : ''}
        Las afirmaciones de otros modelos (Gemini, DeepSeek, Grok, Qwen) no se incluyen 
        por no poder verificar su procedencia documental.
      </p>
  `;

  // WINDOW SOURCES SECTION
  if (useTemporalClassification && windowSources.length > 0) {
    html += `
      <div style="
        margin-bottom: 20px;
        padding: 16px;
        background: #f0fdf4;
        border: 1px solid #22c55e;
        border-radius: 10px;
      ">
        <h3 style="
          font-size: 13px;
          font-weight: 600;
          color: #166534;
          margin: 0 0 12px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          🗓️ Menciones de Ventana${periodDisplay ? ` (${periodDisplay})` : ''}
          <span style="
            font-size: 11px;
            font-weight: 400;
            color: #15803d;
            background: #dcfce7;
            padding: 2px 8px;
            border-radius: 10px;
          ">${windowSources.length} fuentes</span>
        </h3>
        <p style="
          font-size: 10px;
          color: #166534;
          margin: 0 0 12px 0;
          font-style: italic;
        ">
          Fuentes contemporáneas al período de análisis
        </p>
        <ol style="
          font-size: 11px;
          list-style: decimal;
          padding-left: 20px;
          margin: 0;
          color: #374151;
        ">
    `;
    
    windowSources.forEach(source => {
      const modelBadge = source.sourceModel === 'ChatGPT' 
        ? '<span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #10a37f; color: white; border-radius: 3px; font-size: 9px; font-weight: 700; margin-right: 6px;">G</span>'
        : '<span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #20808d; color: white; border-radius: 3px; font-size: 9px; font-weight: 700; margin-right: 6px;">P</span>';
      const dateNote = source.extractedDate 
        ? ` <span style="color: #059669; font-size: 10px;">(${new Date(source.extractedDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })})</span>` 
        : '';
      
      html += `
        <li style="padding: 6px 0; border-bottom: 1px solid #dcfce7;">
          ${modelBadge}
          <span style="font-weight: 500; color: #166534;">${source.domain}</span>${dateNote}
          ${source.title ? `<br><span style="color: #4b5563; margin-left: 22px;">"${source.title}"</span>` : ''}
          <br>
          <a href="${source.url}" target="_blank" rel="noopener noreferrer" style="
            color: #15803d;
            text-decoration: none;
            word-break: break-all;
            font-size: 10px;
            margin-left: 22px;
          ">${source.url.length > 70 ? source.url.substring(0, 70) + '...' : source.url}</a>
        </li>
      `;
    });
    
    html += `</ol></div>`;
  }

  // REINFORCEMENT SOURCES SECTION
  if (useTemporalClassification && reinforcementSources.length > 0) {
    html += `
      <div style="
        margin-bottom: 20px;
        padding: 16px;
        background: #fef9c3;
        border: 1px solid #eab308;
        border-radius: 10px;
      ">
        <h3 style="
          font-size: 13px;
          font-weight: 600;
          color: #854d0e;
          margin: 0 0 12px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          📚 Menciones de Refuerzo
          <span style="
            font-size: 11px;
            font-weight: 400;
            color: #a16207;
            background: #fef08a;
            padding: 2px 8px;
            border-radius: 10px;
          ">${reinforcementSources.length} fuentes</span>
        </h3>
        <p style="
          font-size: 10px;
          color: #854d0e;
          margin: 0 0 12px 0;
          font-style: italic;
        ">
          Fuentes históricas o contextuales usadas por las IAs
        </p>
        <ol style="
          font-size: 11px;
          list-style: decimal;
          padding-left: 20px;
          margin: 0;
          color: #374151;
        ">
    `;
    
    reinforcementSources.forEach(source => {
      const modelBadge = source.sourceModel === 'ChatGPT' 
        ? '<span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #10a37f; color: white; border-radius: 3px; font-size: 9px; font-weight: 700; margin-right: 6px;">G</span>'
        : '<span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #20808d; color: white; border-radius: 3px; font-size: 9px; font-weight: 700; margin-right: 6px;">P</span>';
      const dateNote = source.extractedDate 
        ? ` <span style="color: #ca8a04; font-size: 10px;">(${new Date(source.extractedDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })})</span>` 
        : '';
      
      html += `
        <li style="padding: 6px 0; border-bottom: 1px solid #fef08a;">
          ${modelBadge}
          <span style="font-weight: 500; color: #854d0e;">${source.domain}</span>${dateNote}
          ${source.title ? `<br><span style="color: #4b5563; margin-left: 22px;">"${source.title}"</span>` : ''}
          <br>
          <a href="${source.url}" target="_blank" rel="noopener noreferrer" style="
            color: #a16207;
            text-decoration: none;
            word-break: break-all;
            font-size: 10px;
            margin-left: 22px;
          ">${source.url.length > 70 ? source.url.substring(0, 70) + '...' : source.url}</a>
        </li>
      `;
    });
    
    html += `</ol></div>`;
  }

  // UNKNOWN/UNCLASSIFIED SOURCES (or all sources if no temporal classification)
  const sourcesToShowAsMixed = useTemporalClassification ? unknownSources : sources;
  
  if (sourcesToShowAsMixed.length > 0) {
    // Group by model
    const chatGptSources = sourcesToShowAsMixed.filter(s => s.sourceModel === 'ChatGPT');
    const perplexitySources = sourcesToShowAsMixed.filter(s => s.sourceModel === 'Perplexity');
    
    if (!useTemporalClassification) {
      // Show original two-section layout when no temporal data available
      if (chatGptSources.length > 0) {
        html += `
          <h3 style="
            font-size: 13px;
            font-weight: 600;
            color: #334155;
            margin: 16px 0 8px 0;
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #10a37f; color: white; border-radius: 4px; font-size: 10px;">G</span>
            Fuentes verificadas por ChatGPT (${chatGptSources.length})
          </h3>
          <ol style="
            font-size: 11px;
            list-style: decimal;
            padding-left: 24px;
            margin: 0 0 16px 0;
            color: #475569;
          ">
        `;
        
        chatGptSources.forEach(source => {
          html += `
            <li style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-weight: 500; color: #1e40af;">${source.domain}</span>
              ${source.title ? `<br><span style="color: #64748b;">"${source.title}"</span>` : ''}
              <br>
              <a href="${source.url}" target="_blank" rel="noopener noreferrer" style="
                color: #3b82f6;
                text-decoration: none;
                word-break: break-all;
                font-size: 10px;
              ">${source.url.length > 80 ? source.url.substring(0, 80) + '...' : source.url}</a>
            </li>
          `;
        });
        
        html += `</ol>`;
      }
      
      if (perplexitySources.length > 0) {
        html += `
          <h3 style="
            font-size: 13px;
            font-weight: 600;
            color: #334155;
            margin: 16px 0 8px 0;
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #20808d; color: white; border-radius: 4px; font-size: 10px;">P</span>
            Fuentes verificadas por Perplexity (${perplexitySources.length})
          </h3>
          <ol style="
            font-size: 11px;
            list-style: decimal;
            padding-left: 24px;
            margin: 0 0 16px 0;
            color: #475569;
          ">
        `;
        
        perplexitySources.forEach(source => {
          const citationLabel = source.citationNumber ? ` [${source.citationNumber}]` : '';
          html += `
            <li style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-weight: 500; color: #1e40af;">${source.domain}${citationLabel}</span>
              ${source.title ? `<br><span style="color: #64748b;">"${source.title}"</span>` : ''}
              <br>
              <a href="${source.url}" target="_blank" rel="noopener noreferrer" style="
                color: #3b82f6;
                text-decoration: none;
                word-break: break-all;
                font-size: 10px;
              ">${source.url.length > 80 ? source.url.substring(0, 80) + '...' : source.url}</a>
            </li>
          `;
        });
        
        html += `</ol>`;
      }
    } else if (unknownSources.length > 0) {
      // Show unclassified section when temporal classification is available
      html += `
        <div style="
          margin-bottom: 20px;
          padding: 16px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
        ">
          <h3 style="
            font-size: 13px;
            font-weight: 600;
            color: #475569;
            margin: 0 0 12px 0;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            📎 Otras Referencias
            <span style="
              font-size: 11px;
              font-weight: 400;
              color: #64748b;
              background: #e2e8f0;
              padding: 2px 8px;
              border-radius: 10px;
            ">${unknownSources.length} fuentes</span>
          </h3>
          <p style="
            font-size: 10px;
            color: #64748b;
            margin: 0 0 12px 0;
            font-style: italic;
          ">
            Fuentes sin clasificación temporal determinada
          </p>
          <ol style="
            font-size: 11px;
            list-style: decimal;
            padding-left: 20px;
            margin: 0;
            color: #374151;
          ">
      `;
      
      unknownSources.forEach(source => {
        const modelBadge = source.sourceModel === 'ChatGPT' 
          ? '<span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #10a37f; color: white; border-radius: 3px; font-size: 9px; font-weight: 700; margin-right: 6px;">G</span>'
          : '<span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #20808d; color: white; border-radius: 3px; font-size: 9px; font-weight: 700; margin-right: 6px;">P</span>';
        
        html += `
          <li style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
            ${modelBadge}
            <span style="font-weight: 500; color: #475569;">${source.domain}</span>
            ${source.title ? `<br><span style="color: #6b7280; margin-left: 22px;">"${source.title}"</span>` : ''}
            <br>
            <a href="${source.url}" target="_blank" rel="noopener noreferrer" style="
              color: #6b7280;
              text-decoration: none;
              word-break: break-all;
              font-size: 10px;
              margin-left: 22px;
            ">${source.url.length > 70 ? source.url.substring(0, 70) + '...' : source.url}</a>
          </li>
        `;
      });
      
      html += `</ol></div>`;
    }
  }
  
  // Methodology note
  html += `
      <div style="
        margin-top: 20px;
        padding: 12px;
        background: #fffbeb;
        border: 1px solid #fcd34d;
        border-radius: 8px;
        font-size: 10px;
        color: #78350f;
        line-height: 1.6;
      ">
        <strong>📋 Nota metodológica:</strong> Esta lista incluye únicamente 
        fuentes con URLs verificables provenientes de modelos con búsqueda 
        web activa (ChatGPT, Perplexity). Las afirmaciones de otros modelos 
        (Gemini, DeepSeek, Grok, Qwen) no se incluyen en esta sección por 
        no poder verificar su procedencia documental, previniendo así la 
        inclusión de URLs potencialmente alucinadas.
      </div>
    </section>
  `;
  
  return html;
}
