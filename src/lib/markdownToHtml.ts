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
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #0f1419;
    margin: 0;
    line-height: 1.4;
  }

  /* Emoji status indicators in tables */
  .emoji-status {
    margin-left: 6px;
    vertical-align: middle;
    font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif;
    font-size: 1em;
    display: inline-block;
  }

  .emoji-metrics-table .metric-status .emoji-status {
    margin-left: 0;
  }

  td .emoji-status {
    margin-left: 4px;
    vertical-align: middle;
  }

  /* Subsection titles for internal headings */
  .subsection-title {
    font-size: 15px;
    font-weight: 600;
    color: #0f1419;
    margin: 28px 0 14px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
    letter-spacing: 0.01em;
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
    .subsection-title {
      break-after: avoid;
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
  
  /* Neutralize counter for sources bibliography lists */
  ol.sources-list { counter-reset: none; }
  ol.sources-list li { counter-increment: none; }
  ol.sources-list li::before { content: none; display: none; }
  
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
  
  // Words that commonly start sentences and should NOT be treated as proper nouns
  const SENTENCE_START_EXCLUSIONS = new Set([
    'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'suba', 'baje', 'solo', 'visión', 'vision', 'según', 'segun',
    'promedio', 'durante', 'desde', 'entre', 'sobre', 'todas', 'todos',
    'ninguna', 'ninguno', 'algunas', 'algunos', 'mientras', 'aunque',
    'además', 'ademas', 'también', 'tambien', 'incluso', 'apenas',
  ]);
  
  // Check if a match is near a date pattern or decorative line
  const isNearDateOrHeader = (idx: number, text: string): boolean => {
    const surroundingText = text.substring(Math.max(0, idx - 5), Math.min(text.length, idx + 40));
    // Date pattern: 2026-03-01 or similar
    if (/\d{4}-\d{2}/.test(surroundingText)) return true;
    // Near decorative lines
    const lineStart = text.lastIndexOf('\n', idx - 1) + 1;
    const lineEnd = text.indexOf('\n', idx);
    const fullLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    if (/^[═=─\-\*~]{3,}/.test(fullLine.trim()) || /[═=─]{3,}$/.test(fullLine.trim())) return true;
    return false;
  };
  
  // Multi-word proper nouns (e.g., "Banco Santander", "IBEX 35")
  // IMPORTANT: match must END on a capitalized word or acronym, never on a connector
  const properNounPattern = /(?<=[a-záéíóúñ.,;:)\s])\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ0-9]{2,}|de|del|la|los|las|el|y))+)\b/g;
  const CONNECTORS = new Set(['de', 'del', 'la', 'los', 'las', 'el', 'y', 'e', 'o', 'u']);
  let pn: RegExpExecArray | null;
  while ((pn = properNounPattern.exec(markdown)) !== null) {
    const key = pn[1].toLowerCase();
    if (!isInBold(pn.index + (pn[0].length - pn[1].length), pn[1].length) && 
        !isInSpecialContext(pn.index, markdown) &&
        !properNounSeen.has(key) &&
        !isNearDateOrHeader(pn.index, markdown)) {
      // Check for sentence-start false positives
      const words = pn[1].split(/\s+/);
      const firstWord = words[0].toLowerCase();
      if (SENTENCE_START_EXCLUSIONS.has(firstWord)) continue;
      
      // Trim trailing connectors from match
      while (words.length > 1 && CONNECTORS.has(words[words.length - 1].toLowerCase())) {
        words.pop();
      }
      if (words.length < 2) continue; // Need at least 2 words
      
      const trimmedText = words.join(' ');
      const trimmedKey = trimmedText.toLowerCase();
      if (properNounSeen.has(trimmedKey)) continue;
      
      // Require all significant words to have 3+ chars
      const significantWords = words.filter(w => !CONNECTORS.has(w.toLowerCase()));
      if (significantWords.some(w => w.length < 3)) continue;
      
      // Skip all-uppercase text that looks like a section title
      if (/^[A-ZÁÉÍÓÚÑ\s]+$/.test(trimmedText) && trimmedText.length > 15) continue;
      
      properNounSeen.add(trimmedKey);
      const actualStart = pn.index + (pn[0].length - pn[1].length);
      matches.push({ text: trimmedText, index: actualStart, length: trimmedText.length, layer: 1, properNounKey: trimmedKey });
    }
  }
  
  // Acronyms (5+ uppercase letters, word boundary) — first occurrence only
  // Skip short acronyms (2-4 chars like PILAR, III, FEB, EBA, BCE) to avoid noise
  const acronymPattern = /\b([A-ZÁÉÍÓÚÑ]{5,})\b/g;
  const acronymSeen = new Set<string>();
  // Also skip section-title words entirely
  const SECTION_TITLE_WORDS = new Set(['PILAR', 'CIERRE', 'RESUMEN', 'EJECUTIVO', 'DICTAMEN', 'PERICIAL']);
  let ac: RegExpExecArray | null;
  while ((ac = acronymPattern.exec(markdown)) !== null) {
    const acr = ac[1];
    // Skip common non-acronym words, section titles, and already-bold
    if (['THE', 'AND', 'FOR', 'NOT', 'ALL', 'BUT', 'HAS', 'HAD', 'ARE', 'WAS', 'HIS', 'HER', 'MAS', 'POR', 'QUE', 'CON', 'UNA', 'UNO', 'LOS', 'LAS', 'DEL', 'SIN', 'SUS'].includes(acr)) continue;
    if (SECTION_TITLE_WORDS.has(acr)) continue;
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
  
  // --- Layer 4: Density control with block-based distribution ---
  const MAX_HIGHLIGHTS = 25;
  const priorityOrder = (layer: number) => layer === 3 ? 0 : layer === 1 ? 1 : 2;

  // Split markdown into logical blocks and compute character ranges
  const blockSplitRegex = /\n\n+/g;
  const blocks: { start: number; end: number }[] = [];
  let bStart = 0;
  let splitMatch: RegExpExecArray | null;
  while ((splitMatch = blockSplitRegex.exec(markdown)) !== null) {
    if (splitMatch.index > bStart) blocks.push({ start: bStart, end: splitMatch.index });
    bStart = splitMatch.index + splitMatch[0].length;
  }
  if (bStart < markdown.length) blocks.push({ start: bStart, end: markdown.length });
  if (blocks.length === 0) blocks.push({ start: 0, end: markdown.length });

  // Classify each match into its block
  const matchesByBlock: KeywordMatch[][] = blocks.map(() => []);
  for (const m of matches) {
    const bi = blocks.findIndex(b => m.index >= b.start && m.index < b.end);
    if (bi >= 0) matchesByBlock[bi].push(m);
  }

  // Sort each block's matches by priority
  for (const bm of matchesByBlock) {
    bm.sort((a, b) => priorityOrder(a.layer) - priorityOrder(b.layer) || a.index - b.index);
  }

  // Calculate budget per block — proportional to block CHARACTER SIZE (not just candidate count)
  const totalDocLength = markdown.length;
  const blocksWithCandidates = matchesByBlock.filter(bm => bm.length > 0).length;
  const guaranteed = Math.min(blocksWithCandidates, MAX_HIGHLIGHTS);
  const surplus = MAX_HIGHLIGHTS - guaranteed;

  const budgets = matchesByBlock.map((bm, bi) => {
    if (bm.length === 0) return 0;
    const blockSize = blocks[bi].end - blocks[bi].start;
    const sizeRatio = totalDocLength > 0 ? blockSize / totalDocLength : 0;
    const extra = Math.floor(surplus * sizeRatio);
    return Math.min(1 + extra, bm.length); // cap at available candidates
  });

  // Distribute any rounding remainder to blocks with the most candidates
  let assigned = budgets.reduce((s, b) => s + b, 0);
  if (assigned < MAX_HIGHLIGHTS) {
    const sortedIdxs = matchesByBlock.map((bm, i) => ({ i, len: bm.length }))
      .filter(x => x.len > 0)
      .sort((a, b) => b.len - a.len);
    for (const { i } of sortedIdxs) {
      if (assigned >= MAX_HIGHLIGHTS) break;
      if (budgets[i] < matchesByBlock[i].length) { budgets[i]++; assigned++; }
    }
  }

  // Guarantee at least 2 highlights in the last 30% of the document
  const tail30Start = Math.floor(blocks.length * 0.7);
  let tailGuaranteed = 0;
  for (let bi = tail30Start; bi < blocks.length; bi++) {
    if (matchesByBlock[bi].length > 0 && budgets[bi] === 0 && tailGuaranteed < 2) {
      budgets[bi] = 1;
      tailGuaranteed++;
    }
  }

  // Select within each block respecting overlaps and uniqueness globally
  const selected: KeywordMatch[] = [];
  const usedRanges: { start: number; end: number }[] = [];
  const uniqueTexts = new Set<string>();

  for (let bi = 0; bi < blocks.length; bi++) {
    let blockCount = 0;
    for (const m of matchesByBlock[bi]) {
      if (blockCount >= budgets[bi]) break;

      const overlaps = usedRanges.some(r =>
        (m.index >= r.start && m.index < r.end) || (m.index + m.length > r.start && m.index + m.length <= r.end)
      );
      if (overlaps) continue;

      const textKey = m.text.toLowerCase();
      if (uniqueTexts.has(textKey)) continue;

      uniqueTexts.add(textKey);
      selected.push(m);
      usedRanges.push({ start: m.index, end: m.index + m.length });
      blockCount++;
    }
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

// =============================================================================
// PRE-PROCESSING: isolate inline structural elements before any conversion
// =============================================================================

/**
 * Preprocesses raw markdown to isolate inline structural elements:
 * 1a) Em-dash decorated headers inline with text
 * 1b) Inline bullets (• item1 • item2) into separate lines
 * 1c) Numbered subsections inline (e.g., "1.1 Alcance") 
 */
function preprocessRawMarkdown(markdown: string): string {
  let text = markdown;
  
  // 1a) Isolate em-dash decorated headers that are inline with other text
  // Pattern: text before ——————TITLE—————— text after → separate into 3 lines
  text = text.replace(/([^—\n])(—{6,})\s*([^—\n]+?)\s*(—{6,})([^—\n])/g, '$1\n$2\n$3\n$4\n$5');
  
  // Also handle em-dash headers at the start of a line (no preceding text)
  text = text.replace(/^(—{6,})\s*([^—\n]+?)\s*(—{6,})/gm, '$1\n$2\n$3');
  
  // 1b) Convert inline bullets to separate lines
  // Only when there are 2+ bullet markers on the same line
  text = text.split('\n').map(line => {
    const bulletCount = (line.match(/•/g) || []).length;
    if (bulletCount >= 2) {
      // Split on bullet markers, keeping the bullet
      return line.replace(/\s*•\s*/g, '\n• ').replace(/^\n/, '');
    }
    return line;
  }).join('\n');
  
  // 1c) Isolate numbered subsections inline (e.g., "...texto. 1.1 Alcance del informe")
  // Only when preceded by sentence-ending punctuation + space
  text = text.replace(/([.;:!?])\s+(\d+\.\d+\s+[A-ZÁÉÍÓÚÑ])/g, '$1\n$2');
  
  return text;
}

// Comprehensive markdown to HTML converter
export function convertMarkdownToHtml(markdown: string): string {
  // Step 0: Preprocess raw markdown to isolate inline structural elements
  let html = preprocessRawMarkdown(markdown);
  
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
  
  // Convert <hr>+<p>TITLE</p>+<hr> patterns to section-band (post-conversion unification)
  html = unifyHrTitleHeaders(html);
  
  // Emoji result blocks (before paragraph wrapping)
  html = processEmojiResultBlocks(html);
  
  // Numbered metric lines with trailing emojis
  html = processNumberedMetricBlocks(html);
  
  // Regroup isolated single-item <ol> metric blocks separated by text
  html = regroupIsolatedMetrics(html);
  
  // Detect subsection titles (short lines acting as internal headings)
  html = processSubsectionTitles(html);
  
  // Wrap remaining text in paragraphs
  html = wrapInParagraphs(html);
  
  // Apply smart keyword highlights ONLY to <p> content (after all structural processing)
  html = applyHighlightsToParas(html);
  
  return html;
}

/**
 * Apply highlightSmartKeywords only to the text inside <p>...</p> tags,
 * so that titles, metrics, section-bands, and other structural elements
 * are never broken by auto-bolding.
 */
function applyHighlightsToParas(html: string): string {
  // Collect all <p>...</p> contents, concatenate as pseudo-markdown for unified budget
  const paraPattern = /<p>([\s\S]*?)<\/p>/g;
  const paraMatches: { fullMatch: string; content: string; index: number }[] = [];
  let pm: RegExpExecArray | null;
  while ((pm = paraPattern.exec(html)) !== null) {
    paraMatches.push({ fullMatch: pm[0], content: pm[1], index: pm.index });
  }
  
  if (paraMatches.length === 0) return html;
  
  // Build a single pseudo-markdown string from all paragraphs (separated by double newlines)
  // so the highlighter can distribute highlights evenly across the whole document
  const separator = '\n\n';
  const combinedMarkdown = paraMatches.map(p => {
    // Strip existing <strong> tags to get clean text for the highlighter,
    // then convert back from HTML bold to markdown bold for the highlighter
    return p.content
      .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
      .replace(/<em>(.*?)<\/em>/g, '*$1*');
  }).join(separator);
  
  // Run highlighter on combined text
  const highlighted = highlightSmartKeywords(combinedMarkdown);
  
  // Split back into individual paragraph contents
  const highlightedParas = highlighted.split(separator);
  
  // Reconstruct HTML, replacing each <p> with the highlighted version
  let result = html;
  // Replace from end to start to preserve indices
  for (let i = paraMatches.length - 1; i >= 0; i--) {
    const para = paraMatches[i];
    let newContent = highlightedParas[i] || para.content;
    // Convert markdown bold back to HTML
    newContent = newContent.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    newContent = newContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const newPara = `<p>${newContent}</p>`;
    result = result.substring(0, para.index) + newPara + result.substring(para.index + para.fullMatch.length);
  }
  
  return result;
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
// Status circle emojis get special .emoji-status class for alignment
function processEmojis(text: string): string {
  const statusEmojis = /([🟢🔴🟡🟠🔵⚪⚫🟤🟣])/gu;
  const generalEmoji = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
  // First, tag status circles with .emoji-status
  let result = text.replace(statusEmojis, '<span class="emoji emoji-status">$1</span>');
  // Then tag remaining emojis (that weren't already wrapped)
  result = result.replace(/(?<!<span class="emoji[^"]*">)(\p{Emoji_Presentation}|\p{Extended_Pictographic})(?!<\/span>)/gu, '<span class="emoji">$1</span>');
  return result;
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
    const match = line.match(/^[\*\-\+•]\s+(.*)$/);
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
  const separatorPattern = /^[═=─—\-\*~☰▬■□▪▫●○◆◇►◄▲▼]{4,}\s*$/;
  
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
  const metricInLiPattern = /^<li>(?:<strong>)?(.+?)(?:<\/strong>)?\s*[—\-–:]\s*(.+?)\s*((?:<span[^>]*>)?[\p{Emoji_Presentation}\p{Extended_Pictographic}](?:<\/span>)?(?:\s*→?\s*(?:<span[^>]*>)?[\p{Emoji_Presentation}\p{Extended_Pictographic}](?:<\/span>)?)?)\s*<\/li>$/u;
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
    if (trimmed === '<ol>' || trimmed === '<ul>') {
      insideOl = true;
      olCounter = 0;
      result.push(line);
      continue;
    }
    if (trimmed === '</ol>' || trimmed === '</ul>') {
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

// Convert <hr> + short uppercase text + <hr> sequences into section-band
function unifyHrTitleHeaders(html: string): string {
  // Match: <hr> followed by a short text line (possibly wrapped in <p> or not), followed by <hr>
  // This catches the pattern where --- markdown becomes <hr> and the title sits between two <hr>s
  const lines = html.split('\n');
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    
    if (trimmed === '<hr>' && i + 2 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const afterLine = lines[i + 2].trim();
      
      // Extract text from potential <p>TEXT</p> or raw TEXT
      let titleText = nextLine;
      const pMatch = nextLine.match(/^<p>(.*?)<\/p>$/);
      if (pMatch) titleText = pMatch[1];
      
      // Strip any inline HTML tags (strong, em, etc.) that auto-bold may have added
      titleText = titleText.replace(/<\/?(?:strong|em|b|i|span)[^>]*>/gi, '').trim();
      
      if (afterLine === '<hr>' && titleText.length > 0) {
        // Short title (<80 chars) that looks like a section header → section-band
        const isShortTitle = titleText.length < 80;
        const isSectionTitle = /^[A-ZÁÉÍÓÚÑ\s\d—\-:()]+$/.test(titleText) || 
                                /^(RESUMEN|PILAR|CIERRE|FUENTES|CONCLUSI[OÓ]N|AN[AÁ]LISIS|EXECUTIVE|SUMMARY|DICTAMEN|IDENTIFICACI[OÓ]N)/i.test(titleText);
        
        if (isShortTitle && isSectionTitle) {
          result.push(`<div class="section-band"><p class="section-band-title">${processEmojis(titleText.trim())}</p></div>`);
          i += 3;
          continue;
        }
        
        // Long title (>80 chars) — extract first uppercase segment as section-band, rest as paragraph
        if (titleText.length >= 80) {
          // Try to split at first lowercase word or line break
          const uppercaseMatch = titleText.match(/^([A-ZÁÉÍÓÚÑ\s]+?)(?=\s+[a-záéíóúñ])/);
          if (uppercaseMatch && uppercaseMatch[1].length >= 10) {
            const bandTitle = uppercaseMatch[1].trim();
            const remainder = titleText.substring(uppercaseMatch[1].length).trim();
            result.push(`<div class="section-band"><p class="section-band-title">${processEmojis(bandTitle)}</p></div>`);
            if (remainder) result.push(`<p>${remainder}</p>`);
          } else {
            // Fallback: use full text as a styled header block
            result.push(`<div class="section-band"><p class="section-band-title" style="font-size:11px;letter-spacing:1px;">${processEmojis(titleText.trim())}</p></div>`);
          }
          i += 3;
          continue;
        }
      }
    }
    
    result.push(lines[i]);
    i++;
  }
  
  return result.join('\n');
}

// Regroup isolated single-item <ol> blocks that contain metric+emoji, separated by <p> text
function regroupIsolatedMetrics(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  
  // Pattern: <ol>\n<li>MetricName — value emoji</li>\n</ol>
  // We collect these when separated by <p>...</p> blocks
  // Accept both raw emojis AND emojis already wrapped in <span class="emoji-status">
  const singleMetricOlPattern = /^<[ou]l>\s*$/;
  const metricLiPattern = /^<li>(?:<strong>)?(.+?)(?:<\/strong>)?\s*[—\-–:]\s*(.+?)\s*((?:<span[^>]*>)?[\p{Emoji_Presentation}\p{Extended_Pictographic}](?:<\/span>)?(?:\s*→?\s*(?:<span[^>]*>)?[\p{Emoji_Presentation}\p{Extended_Pictographic}](?:<\/span>)?)?)\s*<\/li>$/u;
  const closeOlPattern = /^<\/[ou]l>\s*$/;
  
  interface MetricEntry { name: string; value: string; emojiHtml: string; explanations: string[] }
  let metricBuffer: MetricEntry[] = [];
  let explanationBuffer: string[] = [];
  let expectingMetric = false;
  let i = 0;
  
  const flushMetricBuffer = () => {
    if (metricBuffer.length >= 2) {
      let table = '<table class="emoji-metrics-table">';
      let idx = 1;
      for (const m of metricBuffer) {
        table += `<tr><td class="metric-idx">${idx}</td><td class="metric-name">${m.name}</td><td class="metric-value">${m.value}</td><td class="metric-status">${m.emojiHtml}</td></tr>`;
        idx++;
      }
      table += '</table>';
      result.push(table);
      // Add explanations after the table
      for (const m of metricBuffer) {
        for (const exp of m.explanations) {
          result.push(exp);
        }
      }
    } else {
      // Re-emit original
      for (const m of metricBuffer) {
        result.push('<ol>');
        result.push(`<li>${m.name} — ${m.value} ${m.emojiHtml}</li>`);
        result.push('</ol>');
        for (const exp of m.explanations) {
          result.push(exp);
        }
      }
    }
    metricBuffer = [];
    explanationBuffer = [];
    expectingMetric = false;
  };
  
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    
    // Detect start of a single-item <ol> with metric
    if (singleMetricOlPattern.test(trimmed) && i + 2 < lines.length) {
      const liLine = lines[i + 1].trim();
      const closeLine = lines[i + 2].trim();
      const liMatch = liLine.match(metricLiPattern);
      
      if (liMatch && closeOlPattern.test(closeLine)) {
        metricBuffer.push({
          name: liMatch[1].trim(),
          value: liMatch[2].trim(),
          emojiHtml: liMatch[3],
          explanations: [],
        });
        expectingMetric = true;
        i += 3;
        continue;
      }
    }
    
    // If we're collecting metrics and hit a <p>, store as explanation for last metric
    if (expectingMetric && metricBuffer.length > 0 && /^<p>/.test(trimmed)) {
      metricBuffer[metricBuffer.length - 1].explanations.push(lines[i]);
      i++;
      continue;
    }
    
    // If we hit anything else while expecting metrics, flush
    if (expectingMetric && !singleMetricOlPattern.test(trimmed)) {
      flushMetricBuffer();
    }
    
    result.push(lines[i]);
    i++;
  }
  flushMetricBuffer();
  
  return result.join('\n');
}

// Detect short text lines that act as subsection titles
function processSubsectionTitles(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  
  // Patterns for subsection titles:
  // - Start with a number + word: "3 Hallazgos", "5 Mensajes para la Dirección"
  // - Short label lines: "Las 8 Métricas (promedio ponderado)"
  // - Roman numerals: "I. IDENTIFICACIÓN DEL OBJETO", "IV. ANÁLISIS POR MÉTRICA"
  const subtitlePatterns = [
    /^\d+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]+$/,  // "3 Hallazgos"
    /^Las?\s+\d+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s()]+$/i, // "Las 8 Métricas (promedio ponderado)"
    /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+(para|de|del)\s+(la|el|los|las)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]+$/i, // "Mensajes para la Dirección"
    /^(I{1,3}|IV|VI{0,3}|IX|X)[.\s]+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑA-Záéíóúña-z\s]+$/,  // "IV. ANÁLISIS POR MÉTRICA"
    /^PILAR\s+\d+\s*[–—]\s*.+$/i,  // "PILAR 1 – DEFINIR"
    /^CIERRE$/i,  // "CIERRE"
    /^RESUMEN\s+EJECUTIVO$/i,  // "RESUMEN EJECUTIVO"
    /^\d+\.\d+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]+$/,  // "2.3 Benchmark competitivo"
  ];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip lines that are block-level HTML tags (but allow inline tags like <strong>)
    if (trimmed === '' || /^<(div|table|ol|ul|h[1-6]|pre|blockquote|hr|thead|tbody|tr|td|th|\/)/i.test(trimmed)) {
      result.push(line);
      continue;
    }
    
    // Strip inline HTML tags for pattern matching
    const textOnly = trimmed.replace(/<\/?(?:strong|em|b|i|span)[^>]*>/gi, '').trim();
    if (textOnly.length > 3 && textOnly.length < 60 && !/[;,!?]$/.test(textOnly)) {
      const isSubtitle = subtitlePatterns.some(p => p.test(textOnly));
      if (isSubtitle) {
        result.push(`<div class="subsection-title">${trimmed}</div>`);
        continue;
      }
    }
    
    result.push(line);
  }
  
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
