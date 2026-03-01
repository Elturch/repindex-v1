// Premium Markdown to HTML converter with professional styling

// Premium CSS styles for tables and overall document
// Emoji result grid styles for aligned emoji+label+value blocks
export const emojiGridStyles = `
  .emoji-result-grid {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 6px 12px;
    margin: 16px 0;
    padding: 16px;
    background: #f7f9fa;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .emoji-result-row {
    display: contents;
  }

  .emoji-result-icon {
    text-align: center;
    font-size: 1.1em;
    font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif;
    line-height: 1.5;
  }

  .emoji-result-label {
    font-weight: 500;
    color: #0f1419;
    line-height: 1.5;
  }

  .emoji-result-value {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #0f1419;
    line-height: 1.5;
  }

  /* Numbered emoji metrics table */
  .emoji-metrics-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 16px 0;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    font-size: 13px;
  }

  .emoji-metrics-table td {
    padding: 8px 14px;
    border-bottom: 1px solid #f0f4f8;
    color: #0f1419;
    vertical-align: middle;
  }

  .emoji-metrics-table tr:last-child td {
    border-bottom: none;
  }

  .emoji-metrics-table tr:nth-child(even) {
    background: #f7f9fa;
  }

  .emoji-metrics-table .metric-idx {
    width: 32px;
    text-align: center;
    font-weight: 700;
    color: #1a73e8;
  }

  .emoji-metrics-table .metric-name {
    font-weight: 500;
  }

  .emoji-metrics-table .metric-value {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .emoji-metrics-table .metric-status {
    width: 32px;
    text-align: center;
    font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif;
    font-size: 1.1em;
  }

  /* Section band for decorative headers */
  .section-band {
    margin: 32px 0 20px 0;
    padding: 14px 24px;
    background: #f0f4f8;
    border-top: 2px solid #1a73e8;
    border-bottom: 2px solid #1a73e8;
    text-align: center;
  }

  .section-band-title {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #0f1419;
    margin: 0;
    line-height: 1.4;
  }

  @media print {
    .emoji-result-grid {
      break-inside: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .emoji-metrics-table {
      break-inside: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .section-band {
      break-inside: avoid;
      break-after: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

export const premiumTableStyles = `
  /* Tables - Editorial Styling */
  .table-wrapper {
    margin: 28px 0;
    overflow-x: auto;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
  
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    font-size: 13px;
  }
  
  thead {
    background: #f0f4f8;
  }
  
  th {
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #536471;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }
  
  th:first-child {
    border-top-left-radius: 8px;
  }
  
  th:last-child {
    border-top-right-radius: 8px;
  }
  
  td {
    padding: 10px 16px;
    border-bottom: 1px solid #f0f4f8;
    color: #0f1419;
    font-weight: 400;
    vertical-align: middle;
  }
  
  /* First column emphasized */
  td:first-child {
    font-weight: 500;
    color: #0f1419;
  }
  
  /* Numeric columns aligned right */
  td:not(:first-child) {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  
  th:not(:first-child) {
    text-align: right;
  }
  
  /* Zebra striping */
  tbody tr:nth-child(even) {
    background: #f7f9fa;
  }
  
  tbody tr:nth-child(odd) {
    background: white;
  }
  
  /* Hover effect */
  tbody tr:hover {
    background: rgba(26, 115, 232, 0.04);
  }
  
  tbody tr:last-child td:first-child {
    border-bottom-left-radius: 8px;
  }
  
  tbody tr:last-child td:last-child {
    border-bottom-right-radius: 8px;
  }
`;

// Base CSS styles for exported documents
export const baseExportStyles = `
  :root {
    --primary: #1a73e8;
    --primary-dark: #1a3a5c;
    --text: #0f1419;
    --text-light: #536471;
    --text-muted: #8899a6;
    --bg: #ffffff;
    --bg-alt: #f7f9fa;
    --bg-header: #f0f4f8;
    --border: #e5e7eb;
    --border-light: #f0f4f8;
  }
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  @page {
    size: A4;
    margin: 20mm 18mm;
  }
  
  body {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 24px;
    line-height: 1.75;
    color: var(--text);
    background: var(--bg);
    font-size: 14.5px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  /* Emoji styling */
  .emoji {
    font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif;
    font-size: 1.1em;
    vertical-align: middle;
    line-height: 1;
  }
  
  /* Typography */
  h1, h2, h3, h4, h5, h6 {
    margin-top: 36px;
    margin-bottom: 18px;
    line-height: 1.35;
    color: var(--text);
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  
  h1 { 
    font-size: 20px;
    font-weight: 700;
    border-bottom: 2px solid var(--primary);
    padding-bottom: 14px;
  }
  
  h2 { 
    font-size: 19px;
    font-weight: 600;
  }
  
  h3 { 
    font-size: 17px;
    font-weight: 600;
  }
  
  h4 { 
    font-size: 14.5px;
    font-weight: 600;
    color: var(--primary-dark);
  }
  
  h5 { 
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--primary);
  }
  
  h6 { 
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  
  p {
    margin: 0 0 18px 0;
    text-align: justify;
    hyphens: auto;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  
  strong { 
    font-weight: 700; 
    color: var(--text);
  }
  
  em { 
    font-style: italic;
    color: var(--text-light);
  }
  
  /* Code / Formulas */
  code {
    background: var(--bg-header);
    padding: 3px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.875em;
    color: var(--text);
  }
  
  pre {
    background: #1e293b;
    color: #e2e8f0;
    padding: 22px 24px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 24px 0;
  }
  
  pre code {
    background: none;
    padding: 0;
    color: inherit;
    font-size: 0.9em;
  }
  
  /* Lists */
  ul, ol {
    margin: 0 0 22px 0;
    padding-left: 0;
    list-style: none;
  }
  
  li {
    margin-bottom: 12px;
    padding-left: 30px;
    position: relative;
    line-height: 1.65;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  
  ul li::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 10px;
    width: 6px;
    height: 6px;
    background: var(--primary);
    border-radius: 50%;
  }
  
  ol {
    counter-reset: list-counter;
  }
  
  ol li {
    counter-increment: list-counter;
  }
  
  ol li::before {
    content: counter(list-counter);
    position: absolute;
    left: 4px;
    top: 0;
    font-weight: 700;
    color: var(--primary);
    font-size: 0.95em;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Blockquotes */
  blockquote {
    border-left: 3px solid var(--primary);
    padding: 16px 24px;
    margin: 26px 0;
    background: transparent;
    font-style: italic;
    color: var(--text-light);
    font-size: 13.8px;
  }
  
  blockquote p {
    margin: 0;
  }
  
  /* Links */
  a {
    color: var(--primary);
    text-decoration: none;
    font-weight: 600;
  }
  
  a:hover {
    text-decoration: underline;
  }
  
  /* Horizontal Rule */
  hr {
    border: none;
    height: 1px;
    background: var(--border);
    margin: 36px 0;
  }
  
  ${premiumTableStyles}
  
  /* Print Styles */
  @media print {
    body {
      padding: 0;
      max-width: 100%;
      font-size: 11pt;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid;
    }
    
    /* Allow tables to span pages but protect rows */
    table {
      page-break-inside: auto;
    }
    
    table, thead, tbody, tr, th, td {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    
    thead {
      display: table-header-group;
    }
    
    tr {
      page-break-inside: avoid;
    }
    
    blockquote {
      page-break-inside: avoid;
    }
    
    /* Hide browser extensions, TTS controls, and fixed elements */
    [class*="speech"], [class*="tts"], [class*="read-aloud"], [class*="readaloud"],
    [id*="speech"], [id*="tts"], [id*="read-aloud"], [id*="readaloud"],
    button[aria-label*="speech"], button[aria-label*="read"], button[aria-label*="play"],
    .readaloud-player, .tts-controls, #readaloud-player, #tts-wrapper,
    div[style*="position: fixed"], div[style*="position:fixed"],
    div[style*="z-index: 99"], div[style*="z-index:99"],
    iframe[style*="position: fixed"], iframe[style*="position:fixed"],
    [data-extension], [class*="extension"], [id*="extension"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
    }
  }
`;

// =============================================================================
// SMART KEYWORD HIGHLIGHTING (operates on raw markdown, before any HTML conversion)
// =============================================================================

/** Curated verdict qualifiers — only highlighted when in evaluative context (noun + adjective) */
const VERDICT_QUALIFIERS = [
  // Positive
  'sólido', 'solido', 'sólida', 'solida', 'excepcional', 'consistente', 'destacada', 'destacado',
  'robusta', 'robusto', 'líder', 'lider', 'favorable', 'óptimo', 'optimo', 'óptima', 'optima',
  'notable', 'sobresaliente', 'ejemplar', 'estable', 'fuerte',
  // Negative
  'crítico', 'critico', 'crítica', 'critica', 'vulnerable', 'débil', 'debil',
  'deficiente', 'erosionada', 'erosionado', 'frágil', 'fragil', 'negativa', 'negativo',
  'preocupante', 'insuficiente', 'deteriorada', 'deteriorado',
  // High-charge neutral
  'sin precedentes', 'estructural', 'sistémico', 'sistemico', 'sistémica', 'sistemica',
  'disruptivo', 'disruptiva', 'significativo', 'significativa', 'relevante',
];

/** Compound verdict patterns — matched as full phrases (Layer 3, highest priority) */
const VERDICT_PATTERNS: RegExp[] = [
  /\b(riesgo|exposición|exposicion|vulnerabilidad)\s+(alto|elevado|cr[ií]tico|significativo|moderado|bajo|considerable|limitado)\b/gi,
  /\b(posici[oó]n|situaci[oó]n)\s+(dominante|d[eé]bil|s[oó]lida|fr[aá]gil|favorable|desfavorable|ventajosa|comprometida)\b/gi,
  /\b(tendencia|evoluci[oó]n|trayectoria)\s+(alcista|bajista|positiva|negativa|favorable|desfavorable|ascendente|descendente|estable)\b/gi,
  /\b(gesti[oó]n|desempe[nñ]o|comportamiento)\s+(ejemplar|deficiente|notable|cr[ií]tico|sobresaliente|irregular|consistente)\b/gi,
  /\b(impacto|efecto)\s+(significativo|limitado|considerable|moderado|negativo|positivo)\b/gi,
  /\b(nivel|grado)\s+(elevado|bajo|cr[ií]tico|aceptable|insuficiente|óptimo|optimo)\b/gi,
  /\b(perspectiva|proyecci[oó]n)\s+(favorable|desfavorable|positiva|negativa|incierta|estable)\b/gi,
];

/** Context patterns for Layer 2 — qualifier must appear near a noun to be highlighted */
const CONTEXT_NOUN_PATTERNS = [
  // noun + qualifier
  /\b(posición|posicion|situación|situacion|gestión|gestion|reputación|reputacion|percepción|percepcion|evolución|evolucion|desempeño|desempeno|tendencia|trayectoria|resultado|perspectiva|proyección|proyeccion|calidad|nivel|grado|capacidad|fortaleza|debilidad|exposición|exposicion|coherencia|narrativa|evidencia|ejecución|ejecucion|gobernanza|actualidad|autoridad|comportamiento|rendimiento|impacto|efecto|solidez|fragilidad|consistencia|estabilidad|liderazgo|riesgo|puntuación|puntuacion|valoración|valoracion|cobertura|presencia)\s+/i,
  // qualifier + noun (less common but possible)
  /\s+(reputacional|corporativa|corporativo|empresarial|institucional|financiera|financiero|bursátil|bursatil|algorítmica|algoritmico|digital|mediática|mediatico|pública|publico)\b/i,
];

interface KeywordMatch {
  text: string;
  index: number;
  length: number;
  layer: 1 | 2 | 3;
  /** For layer 1, track which unique proper noun this is */
  properNounKey?: string;
}

/**
 * Intelligent keyword highlighting on raw markdown.
 * Operates BEFORE any HTML conversion to avoid breaking tags.
 * Max 12-15 unique terms per report, prioritized by layer.
 */
function highlightSmartKeywords(markdown: string): string {
  const matches: KeywordMatch[] = [];
  
  // Track which regions are already bold (inside **...**)
  const boldRegions: { start: number; end: number }[] = [];
  const boldPattern = /\*\*[^*]+\*\*/g;
  let bm: RegExpExecArray | null;
  while ((bm = boldPattern.exec(markdown)) !== null) {
    boldRegions.push({ start: bm.index, end: bm.index + bm[0].length });
  }
  
  const isInBold = (idx: number, len: number): boolean => {
    return boldRegions.some(r => idx >= r.start && idx + len <= r.end);
  };
  
  // Also skip matches inside markdown headers, links, code
  const isInSpecialContext = (idx: number, text: string): boolean => {
    // Find start of line
    const lineStart = text.lastIndexOf('\n', idx - 1) + 1;
    const linePrefix = text.substring(lineStart, idx);
    // Skip if line starts with # (header) or is inside []() or ``
    if (/^#{1,6}\s/.test(linePrefix)) return true;
    // Check if inside backticks
    const before = text.substring(Math.max(0, idx - 100), idx);
    const backtickCount = (before.match(/`/g) || []).length;
    if (backtickCount % 2 !== 0) return true;
    return false;
  };
  
  // --- Layer 3: Compound verdict expressions (highest priority) ---
  for (const pattern of VERDICT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(markdown)) !== null) {
      if (!isInBold(m.index, m[0].length) && !isInSpecialContext(m.index, markdown)) {
        matches.push({ text: m[0], index: m.index, length: m[0].length, layer: 3 });
      }
    }
  }
  
  // --- Layer 1: Proper nouns (2+ capitalized words not at sentence start) + acronyms ---
  const properNounSeen = new Set<string>();
  
  // Multi-word proper nouns (e.g., "Banco Santander", "IBEX 35")
  const properNounPattern = /(?<=[a-záéíóúñ.,;:)\s])\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ0-9]{2,}|de|del|la|los|las|el|y))+)\b/g;
  let pn: RegExpExecArray | null;
  while ((pn = properNounPattern.exec(markdown)) !== null) {
    const key = pn[1].toLowerCase();
    if (!isInBold(pn.index + (pn[0].length - pn[1].length), pn[1].length) && 
        !isInSpecialContext(pn.index, markdown) &&
        !properNounSeen.has(key)) {
      properNounSeen.add(key);
      const actualStart = pn.index + (pn[0].length - pn[1].length);
      matches.push({ text: pn[1], index: actualStart, length: pn[1].length, layer: 1, properNounKey: key });
    }
  }
  
  // Acronyms (3+ uppercase letters, word boundary) — first occurrence only
  const acronymPattern = /\b([A-ZÁÉÍÓÚÑ]{3,})\b/g;
  const acronymSeen = new Set<string>();
  let ac: RegExpExecArray | null;
  while ((ac = acronymPattern.exec(markdown)) !== null) {
    const acr = ac[1];
    // Skip common non-acronym words and already-bold
    if (['THE', 'AND', 'FOR', 'NOT', 'ALL', 'BUT', 'HAS', 'HAD', 'ARE', 'WAS', 'HIS', 'HER', 'MAS', 'POR', 'QUE', 'CON', 'UNA', 'UNO', 'LOS', 'LAS', 'DEL', 'SIN', 'SUS'].includes(acr)) continue;
    if (!isInBold(ac.index, acr.length) && !isInSpecialContext(ac.index, markdown) && !acronymSeen.has(acr)) {
      acronymSeen.add(acr);
      matches.push({ text: acr, index: ac.index, length: acr.length, layer: 1, properNounKey: acr });
    }
  }
  
  // --- Layer 2: Verdict qualifiers in evaluative context ---
  for (const qualifier of VERDICT_QUALIFIERS) {
    const escaped = qualifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const qRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
    let qm: RegExpExecArray | null;
    while ((qm = qRegex.exec(markdown)) !== null) {
      if (isInBold(qm.index, qm[0].length) || isInSpecialContext(qm.index, markdown)) continue;
      
      // Check evaluative context: nearby noun (within ~60 chars before/after)
      const contextBefore = markdown.substring(Math.max(0, qm.index - 60), qm.index);
      const contextAfter = markdown.substring(qm.index + qm[0].length, Math.min(markdown.length, qm.index + qm[0].length + 60));
      const hasContext = CONTEXT_NOUN_PATTERNS.some(np => np.test(contextBefore) || np.test(contextAfter));
      
      if (hasContext) {
        // Only first occurrence per qualifier
        matches.push({ text: qm[0], index: qm.index, length: qm[0].length, layer: 2 });
        break; // Move to next qualifier
      }
    }
  }
  
  // --- Layer 4: Density control ---
  // Remove overlapping matches (keep higher priority = lower layer number... but Layer 3 > 1 > 2 in priority)
  const priorityOrder = (layer: number) => layer === 3 ? 0 : layer === 1 ? 1 : 2;
  matches.sort((a, b) => priorityOrder(a.layer) - priorityOrder(b.layer) || a.index - b.index);
  
  // Remove overlaps
  const selected: KeywordMatch[] = [];
  const usedRanges: { start: number; end: number }[] = [];
  const uniqueTexts = new Set<string>();
  const MAX_HIGHLIGHTS = 15;
  
  for (const m of matches) {
    if (uniqueTexts.size >= MAX_HIGHLIGHTS) break;
    
    const overlaps = usedRanges.some(r => 
      (m.index >= r.start && m.index < r.end) || (m.index + m.length > r.start && m.index + m.length <= r.end)
    );
    if (overlaps) continue;
    
    const textKey = m.text.toLowerCase();
    if (uniqueTexts.has(textKey)) continue;
    
    uniqueTexts.add(textKey);
    selected.push(m);
    usedRanges.push({ start: m.index, end: m.index + m.length });
  }
  
  // Apply replacements from end to start to preserve indices
  selected.sort((a, b) => b.index - a.index);
  
  let result = markdown;
  for (const m of selected) {
    const before = result.substring(0, m.index);
    const after = result.substring(m.index + m.length);
    result = before + `**${m.text}**` + after;
  }
  
  return result;
}

// Comprehensive markdown to HTML converter
export function convertMarkdownToHtml(markdown: string): string {
  // Smart keyword highlighting on raw markdown (before any HTML conversion)
  let html = highlightSmartKeywords(markdown);
  
  // Process tables first
  html = processMarkdownTables(html);
  
  // Code blocks (before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/gm, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Headers (h6 to h1)
  html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
  html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Horizontal rules
  html = html.replace(/^---$/gim, '<hr>');
  html = html.replace(/^\*\*\*$/gim, '<hr>');
  html = html.replace(/^___$/gim, '<hr>');
  
  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote><p>$1</p></blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '');
  
  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
  html = html.replace(/___(.*?)___/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.*?)__/gim, '<strong>$1</strong>');
  html = html.replace(/_(.*?)_/gim, '<em>$1</em>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Lists
  html = processOrderedLists(html);
  html = processUnorderedLists(html);
  
  // Decorative section headers (════ TITLE ════)
  html = processDecorativeSectionHeaders(html);
  
  // Emoji result blocks (before paragraph wrapping)
  html = processEmojiResultBlocks(html);
  
  // Numbered metric lines with trailing emojis
  html = processNumberedMetricBlocks(html);
  
  // Wrap remaining text in paragraphs
  html = wrapInParagraphs(html);
  
  return html;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function processMarkdownTables(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let tableRows: string[] = [];
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableRow = line.includes('|') && line.replace(/\|/g, '').trim().length > 0;
    const isSeparator = /^\|?[\s\-:|]+\|?$/.test(line) && line.includes('-');
    
    if (isTableRow || isSeparator) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable && tableRows.length > 0) {
        result.push(buildTableHtml(tableRows));
        tableRows = [];
        inTable = false;
      }
      result.push(lines[i]);
    }
  }
  
  if (inTable && tableRows.length > 0) {
    result.push(buildTableHtml(tableRows));
  }
  
  return result.join('\n');
}

function buildTableHtml(rows: string[]): string {
  if (rows.length < 2) return rows.join('\n');
  
  // Find separator index
  let separatorIdx = rows.findIndex(row => 
    /^\|?[\s\-:|]+\|?$/.test(row.trim()) && row.includes('-')
  );
  
  if (separatorIdx === -1) separatorIdx = 1;
  
  const headerRows = rows.slice(0, separatorIdx);
  const bodyRows = rows.slice(separatorIdx + 1).filter(row => 
    row.trim().length > 0 && !/^\|?[\s\-:|]+\|?$/.test(row.trim())
  );
  
  let html = '<div class="table-wrapper">\n<table>\n';
  
  // Thead
  if (headerRows.length > 0) {
    html += '<thead>\n';
    for (const row of headerRows) {
      const cells = parseTableCells(row);
      html += '<tr>';
      for (const cell of cells) {
        const processedCell = processEmojis(cell);
        html += `<th>${processedCell}</th>`;
      }
      html += '</tr>\n';
    }
    html += '</thead>\n';
  }
  
  // Tbody
  if (bodyRows.length > 0) {
    html += '<tbody>\n';
    for (const row of bodyRows) {
      const cells = parseTableCells(row);
      html += '<tr>';
      for (const cell of cells) {
        const processedCell = processEmojis(cell);
        html += `<td>${processedCell}</td>`;
      }
      html += '</tr>\n';
    }
    html += '</tbody>\n';
  }
  
  html += '</table>\n</div>';
  return html;
}

// Process emojis to ensure proper rendering
function processEmojis(text: string): string {
  const emojiPattern = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
  return text.replace(emojiPattern, '<span class="emoji">$1</span>');
}

function parseTableCells(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function processOrderedLists(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+(.*)$/);
    if (match) {
      if (!inList) {
        result.push('<ol>');
        inList = true;
      }
      result.push(`<li>${match[2]}</li>`);
    } else {
      if (inList) {
        result.push('</ol>');
        inList = false;
      }
      result.push(line);
    }
  }
  
  if (inList) result.push('</ol>');
  return result.join('\n');
}

function processUnorderedLists(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  
  for (const line of lines) {
    const match = line.match(/^[\*\-\+]\s+(.*)$/);
    if (match) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li>${match[1]}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(line);
    }
  }
  
  if (inList) result.push('</ul>');
  return result.join('\n');
}

// Detect decorative section headers: line of repeated chars, title, line of repeated chars
function processDecorativeSectionHeaders(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  // Pattern for decorative separator lines (═, =, ─, -, *, ~) repeated 4+ times
  const separatorPattern = /^[═=─\-\*~☰▬■□▪▫●○◆◇►◄▲▼]{4,}\s*$/;
  
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    
    // Check for 3-line pattern: separator / title / separator
    if (separatorPattern.test(trimmed) && i + 2 < lines.length) {
      const titleLine = lines[i + 1].trim();
      const bottomLine = lines[i + 2].trim();
      
      // Title must be non-empty text (not another separator, not HTML)
      if (
        titleLine.length > 0 &&
        !separatorPattern.test(titleLine) &&
        !titleLine.startsWith('<') &&
        separatorPattern.test(bottomLine)
      ) {
        result.push(`<div class="section-band"><p class="section-band-title">${processEmojis(titleLine)}</p></div>`);
        i += 3;
        continue;
      }
    }
    
    // Also convert standalone separator lines to <hr> to avoid raw character overflow
    if (separatorPattern.test(trimmed) && trimmed.length >= 6) {
      result.push('<hr>');
      i++;
      continue;
    }
    
    result.push(lines[i]);
    i++;
  }
  
  return result.join('\n');
}

// Detect and convert consecutive emoji-prefixed lines into aligned grid
function processEmojiResultBlocks(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let emojiBuffer: string[] = [];
  
  const emojiLinePattern = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s+(.+)$/u;
  
  const flushBuffer = () => {
    if (emojiBuffer.length >= 2) {
      let grid = '<div class="emoji-result-grid">';
      for (const line of emojiBuffer) {
        const match = line.match(emojiLinePattern);
        if (match) {
          const emoji = match[1];
          const rest = match[2];
          // Try colon separator first, then em-dash
          let colonIdx = rest.indexOf(':');
          if (colonIdx === -1) colonIdx = rest.indexOf('—');
          if (colonIdx === -1) colonIdx = rest.indexOf(' - ');
          if (colonIdx !== -1) {
            const sep = rest[colonIdx] === ' ' ? colonIdx + 3 : colonIdx + 1;
            const label = rest.substring(0, colonIdx).trim();
            const value = rest.substring(sep).trim();
            grid += `<div class="emoji-result-row"><span class="emoji-result-icon">${emoji}</span><span class="emoji-result-label">${label}</span><span class="emoji-result-value">${value}</span></div>`;
          } else {
            grid += `<div class="emoji-result-row"><span class="emoji-result-icon">${emoji}</span><span class="emoji-result-label">${rest}</span><span class="emoji-result-value"></span></div>`;
          }
        }
      }
      grid += '</div>';
      result.push(grid);
    } else {
      result.push(...emojiBuffer);
    }
    emojiBuffer = [];
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('<') && !trimmed.startsWith('<strong') && !trimmed.startsWith('<em')) {
      flushBuffer();
      result.push(line);
      continue;
    }
    if (emojiLinePattern.test(trimmed)) {
      emojiBuffer.push(trimmed);
    } else {
      flushBuffer();
      result.push(line);
    }
  }
  flushBuffer();
  
  return result.join('\n');
}

// Detect numbered metric lines with trailing emoji: "1. Metric Name — 61 pts 🟡"
function processNumberedMetricBlocks(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let metricBuffer: { idx: string; name: string; value: string; emoji: string }[] = [];
  
  // Pattern: inside <li>...</li> or raw numbered line with trailing emoji
  // Matches: "Metric Name — 61 pts 🟡" or "Metric Name: 78.2 ✅"
  const metricInLiPattern = /^<li>(.+?)\s*[—\-:]\s*(.+?)\s*(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*<\/li>$/u;
  const rawNumberedPattern = /^(\d+)\.\s+(.+?)\s*[—\-:]\s*(.+?)\s*(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*$/u;
  
  const flushMetrics = () => {
    if (metricBuffer.length >= 2) {
      let table = '<table class="emoji-metrics-table">';
      for (const m of metricBuffer) {
        table += `<tr><td class="metric-idx">${m.idx}</td><td class="metric-name">${m.name}</td><td class="metric-value">${m.value}</td><td class="metric-status">${m.emoji}</td></tr>`;
      }
      table += '</table>';
      result.push(table);
    } else {
      // Re-emit original lines
      for (const m of metricBuffer) {
        result.push(`<li>${m.name} — ${m.value} ${m.emoji}</li>`);
      }
    }
    metricBuffer = [];
  };
  
  let insideOl = false;
  let olCounter = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Track <ol> context
    if (trimmed === '<ol>') {
      insideOl = true;
      olCounter = 0;
      result.push(line);
      continue;
    }
    if (trimmed === '</ol>') {
      flushMetrics();
      insideOl = false;
      olCounter = 0;
      result.push(line);
      continue;
    }
    
    if (insideOl) {
      const liMatch = trimmed.match(metricInLiPattern);
      if (liMatch) {
        olCounter++;
        metricBuffer.push({
          idx: String(olCounter),
          name: liMatch[1].trim(),
          value: liMatch[2].trim(),
          emoji: liMatch[3],
        });
        continue;
      } else {
        flushMetrics();
        result.push(line);
        continue;
      }
    }
    
    // Raw numbered lines outside <ol>
    const rawMatch = trimmed.match(rawNumberedPattern);
    if (rawMatch) {
      metricBuffer.push({
        idx: rawMatch[1],
        name: rawMatch[2].trim(),
        value: rawMatch[3].trim(),
        emoji: rawMatch[4],
      });
      continue;
    }
    
    flushMetrics();
    result.push(line);
  }
  flushMetrics();
  
  return result.join('\n');
}

function wrapInParagraphs(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let paragraphBuffer = '';
  
  const blockTags = [
    '<h1', '<h2', '<h3', '<h4', '<h5', '<h6',
    '</h1', '</h2', '</h3', '</h4', '</h5', '</h6',
    '<table', '</table',
    '<thead', '</thead',
    '<tbody', '</tbody',
    '<tr', '</tr',
    '<th', '</th',
    '<td', '</td',
    '<ul', '</ul',
    '<ol', '</ol',
    '<li', '</li',
    '<pre', '</pre',
    '<blockquote', '</blockquote',
    '<hr',
    '<div', '</div',
    '<br'
  ];
  
  for (const line of lines) {
    const trimmed = line.trim();
    const isBlock = blockTags.some(tag => trimmed.toLowerCase().startsWith(tag)) || trimmed === '';
    
    if (isBlock) {
      if (paragraphBuffer) {
        result.push(`<p>${paragraphBuffer}</p>`);
        paragraphBuffer = '';
      }
      if (trimmed) result.push(line);
    } else {
      paragraphBuffer += (paragraphBuffer ? ' ' : '') + trimmed;
    }
  }
  
  if (paragraphBuffer) {
    result.push(`<p>${paragraphBuffer}</p>`);
  }
  
  return result.join('\n').replace(/<p>\s*<\/p>/g, '');
}
