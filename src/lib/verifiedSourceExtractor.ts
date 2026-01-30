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
 * @see .lovable/plan.md for methodology justification
 */

export interface VerifiedSource {
  url: string;
  domain: string;
  title?: string;
  sourceModel: 'ChatGPT' | 'Perplexity';
  citationNumber?: number; // For Perplexity [n] references
  mentionDate?: string; // Extracted date from context if available
  temporalGroup?: 'window' | 'reinforcement';
}

export interface SegmentedSources {
  windowSources: VerifiedSource[];      // Mentions within analysis window
  reinforcementSources: VerifiedSource[]; // Historical/contextual mentions
  periodLabel?: string;
}

/**
 * Extract verified URLs from ChatGPT raw response.
 * Only extracts URLs that contain utm_source=openai, which indicates
 * the URL came from OpenAI's verified web search, not hallucination.
 * 
 * Pattern detected: [display text](https://domain.com/path?utm_source=openai)
 */
function extractChatGptSources(rawText: string | null): VerifiedSource[] {
  if (!rawText) return [];
  
  const sources: VerifiedSource[] = [];
  
  // Pattern: [link text](URL?utm_source=openai...)
  // The utm_source=openai parameter indicates a verified web search result
  const chatGptUrlPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+utm_source=openai[^)]*)\)/g;
  
  let match;
  while ((match = chatGptUrlPattern.exec(rawText)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      // Avoid duplicates
      if (!sources.some(s => s.url === url)) {
        sources.push({
          url,
          domain,
          title: title || undefined,
          sourceModel: 'ChatGPT',
        });
      }
    } catch {
      // Invalid URL, skip
    }
  }
  
  return sources;
}

/**
 * Extract verified citations from Perplexity raw response.
 * Perplexity uses numbered citations [1], [2], etc. and includes
 * a sources section in the response.
 * 
 * We look for both inline [n] references and structured source lists.
 */
function extractPerplexitySources(rawText: string | null): VerifiedSource[] {
  if (!rawText) return [];
  
  const sources: VerifiedSource[] = [];
  
  // Try to parse as JSON first (Perplexity sometimes returns structured data)
  try {
    const parsed = JSON.parse(rawText);
    
    // Check for citations array
    if (parsed.citations && Array.isArray(parsed.citations)) {
      parsed.citations.forEach((citation: string, index: number) => {
        if (citation && citation.startsWith('http')) {
          try {
            const urlObj = new URL(citation);
            const domain = urlObj.hostname.replace(/^www\./, '');
            sources.push({
              url: citation,
              domain,
              sourceModel: 'Perplexity',
              citationNumber: index + 1,
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
              });
            }
          } catch {
            // Invalid URL
          }
        }
      });
    }
  } catch {
    // Not JSON, try regex extraction
  }
  
  // If no JSON structure, try to extract URLs with citation pattern
  // Pattern: [n] followed by URL or "Source: URL"
  const urlPattern = /\[(\d+)\][:\s]*(?:Source:?\s*)?(https?:\/\/[^\s\)]+)/gi;
  let match;
  while ((match = urlPattern.exec(rawText)) !== null) {
    const citationNumber = parseInt(match[1], 10);
    const url = match[2].replace(/[.,;:]+$/, ''); // Remove trailing punctuation
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      if (!sources.some(s => s.url === url)) {
        sources.push({
          url,
          domain,
          sourceModel: 'Perplexity',
          citationNumber,
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
    
    // Skip if already captured or if it's an internal/generic link
    if (sources.some(s => s.url === url)) continue;
    if (url.includes('perplexity.ai')) continue;
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      sources.push({
        url,
        domain,
        title: title || undefined,
        sourceModel: 'Perplexity',
      });
    } catch {
      // Invalid URL
    }
  }
  
  return sources;
}

/**
 * Main extraction function.
 * Combines sources from ChatGPT and Perplexity only.
 * 
 * @param chatGptRaw - Raw text from 20_res_gpt_bruto field
 * @param perplexityRaw - Raw text from 21_res_perplex_bruto field
 * @returns Array of verified sources, deduplicated by URL
 */
export function extractVerifiedSources(
  chatGptRaw: string | null,
  perplexityRaw: string | null
): VerifiedSource[] {
  const chatGptSources = extractChatGptSources(chatGptRaw);
  const perplexitySources = extractPerplexitySources(perplexityRaw);
  
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
 * Extract sources from multiple RIX run records.
 * Aggregates all verified sources from the raw AI responses.
 */
export function extractSourcesFromRixRuns(
  rixRuns: Array<{
    '20_res_gpt_bruto'?: string | null;
    '21_res_perplex_bruto'?: string | null;
  }>
): VerifiedSource[] {
  const allSources: VerifiedSource[] = [];
  
  for (const run of rixRuns) {
    const sources = extractVerifiedSources(
      run['20_res_gpt_bruto'] ?? null,
      run['21_res_perplex_bruto'] ?? null
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
 * Segment sources by temporal window.
 * Sources within the analysis period go to "window", others to "reinforcement".
 * 
 * @param sources - All verified sources
 * @param windowStart - Start of analysis period (YYYY-MM-DD)
 * @param windowEnd - End of analysis period (YYYY-MM-DD)
 * @returns Segmented sources object
 */
export function segmentSourcesByWindow(
  sources: VerifiedSource[],
  windowStart: string | null,
  windowEnd: string | null
): SegmentedSources {
  // If no window defined, all sources go to reinforcement
  if (!windowStart || !windowEnd) {
    return {
      windowSources: [],
      reinforcementSources: sources,
      periodLabel: undefined,
    };
  }

  const windowSources: VerifiedSource[] = [];
  const reinforcementSources: VerifiedSource[] = [];
  
  // Parse window dates
  const startDate = new Date(windowStart);
  const endDate = new Date(windowEnd);
  
  // Format period label (e.g., "20-27 ene 2026")
  const formatPeriodLabel = () => {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const startStr = startDate.toLocaleDateString('es-ES', options);
    const endStr = endDate.toLocaleDateString('es-ES', { ...options, year: 'numeric' });
    return `${startStr} - ${endStr}`;
  };

  for (const source of sources) {
    // Try to extract date from URL or title context
    const extractedDate = extractDateFromContext(source.url, source.title);
    
    if (extractedDate) {
      source.mentionDate = extractedDate;
      const mentionDate = new Date(extractedDate);
      
      // Check if within window (with 1 day buffer)
      const bufferMs = 24 * 60 * 60 * 1000;
      if (mentionDate >= new Date(startDate.getTime() - bufferMs) && 
          mentionDate <= new Date(endDate.getTime() + bufferMs)) {
        source.temporalGroup = 'window';
        windowSources.push(source);
      } else {
        source.temporalGroup = 'reinforcement';
        reinforcementSources.push(source);
      }
    } else {
      // No date extracted - use heuristics based on source model
      // ChatGPT with utm_source=openai tends to be more current
      // Default to window for recent-looking sources
      if (source.sourceModel === 'ChatGPT') {
        source.temporalGroup = 'window';
        windowSources.push(source);
      } else {
        // Perplexity sources without dates go to reinforcement
        source.temporalGroup = 'reinforcement';
        reinforcementSources.push(source);
      }
    }
  }

  return {
    windowSources,
    reinforcementSources,
    periodLabel: formatPeriodLabel(),
  };
}

/**
 * Try to extract a date from URL or title context.
 * Common patterns: /2026/01/, -2026-01-20, "January 2026", etc.
 */
function extractDateFromContext(url: string, title?: string): string | null {
  const text = `${url} ${title || ''}`;
  
  // Pattern 1: YYYY/MM/DD or YYYY-MM-DD in URL
  const isoMatch = text.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime())) {
      return `${year}-${month}-${day}`;
    }
  }
  
  // Pattern 2: YYYY/MM in URL (assume day 15)
  const yearMonthMatch = text.match(/(\d{4})[-\/](\d{2})(?:[\/\-]|$)/);
  if (yearMonthMatch) {
    const [, year, month] = yearMonthMatch;
    return `${year}-${month}-15`;
  }
  
  // Pattern 3: Month name + year in title
  const monthNames: Record<string, string> = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
  };
  
  const monthPattern = new RegExp(
    `(${Object.keys(monthNames).join('|')})\\s+(\\d{4})`,
    'i'
  );
  const monthMatch = text.match(monthPattern);
  if (monthMatch) {
    const monthNum = monthNames[monthMatch[1].toLowerCase()];
    const year = monthMatch[2];
    return `${year}-${monthNum}-15`;
  }
  
  return null;
}

/**
 * Generate HTML for bibliography section in exported reports.
 * Only called when there are verified sources to display.
 */
export function generateBibliographyHtml(sources: VerifiedSource[]): string {
  if (!sources || sources.length === 0) {
    return '';
  }
  
  // Group by source model
  const chatGptSources = sources.filter(s => s.sourceModel === 'ChatGPT');
  const perplexitySources = sources.filter(s => s.sourceModel === 'Perplexity');
  
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
        Las siguientes referencias han sido citadas por modelos de IA con 
        capacidad de búsqueda web verificable (ChatGPT con Web Search, Perplexity).
        RepIndex ha verificado la existencia de estas URLs al momento de la consulta,
        pero no garantiza su permanencia futura ni el contenido de terceros.
      </p>
  `;
  
  // ChatGPT sources
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
  
  // Perplexity sources
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
