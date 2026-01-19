// Premium Markdown to HTML converter with professional styling

// Premium CSS styles for tables and overall document
export const premiumTableStyles = `
  /* Tables - Premium Styling */
  .table-wrapper {
    margin: 28px 0;
    overflow-x: auto;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  }
  
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: white;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--border);
    font-size: 0.95em;
  }
  
  thead {
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
  }
  
  th {
    padding: 16px 18px;
    text-align: left;
    font-weight: 700;
    font-size: 0.72em;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text);
    border-bottom: 2px solid var(--primary);
    white-space: nowrap;
    position: relative;
  }
  
  th:first-child {
    border-top-left-radius: 16px;
  }
  
  th:last-child {
    border-top-right-radius: 16px;
  }
  
  td {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-light);
    color: var(--text);
    vertical-align: middle;
    transition: background-color 0.15s ease;
  }
  
  /* First column emphasized */
  td:first-child {
    font-weight: 600;
    color: var(--text);
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
    background: linear-gradient(90deg, #fafbfc 0%, #f8fafc 100%);
  }
  
  tbody tr:nth-child(odd) {
    background: white;
  }
  
  /* Hover effect */
  tbody tr:hover {
    background: linear-gradient(90deg, #eff6ff 0%, #f0f9ff 100%);
  }
  
  tbody tr:last-child td:first-child {
    border-bottom-left-radius: 16px;
  }
  
  tbody tr:last-child td:last-child {
    border-bottom-right-radius: 16px;
  }
`;

// Base CSS styles for exported documents
export const baseExportStyles = `
  :root {
    --primary: #3b82f6;
    --primary-light: #60a5fa;
    --primary-dark: #1e40af;
    --primary-glow: #93c5fd;
    --text: #1f2937;
    --text-light: #6b7280;
    --text-muted: #9ca3af;
    --bg: #ffffff;
    --bg-alt: #f8fafc;
    --bg-muted: #f3f4f6;
    --border: #e5e7eb;
    --border-light: #f1f5f9;
    --shadow: rgba(0, 0, 0, 0.1);
    --shadow-primary: rgba(59, 130, 246, 0.15);
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
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 24px;
    line-height: 1.75;
    color: var(--text);
    background: var(--bg);
    font-size: 15px;
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
    font-weight: 700;
    line-height: 1.35;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  
  h1 { 
    font-size: 1.85em; 
    border-bottom: 3px solid var(--primary);
    padding-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  h1::before {
    content: '';
    display: inline-block;
    width: 5px;
    height: 28px;
    background: linear-gradient(180deg, var(--primary), var(--primary-light));
    border-radius: 3px;
    flex-shrink: 0;
  }
  
  h2 { 
    font-size: 1.5em; 
    border-bottom: 2px solid var(--border);
    padding-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  h2::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 22px;
    background: var(--primary);
    opacity: 0.8;
    border-radius: 2px;
    flex-shrink: 0;
  }
  
  h3 { 
    font-size: 1.3em;
    color: var(--primary-dark);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  h3::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    background: var(--primary);
    opacity: 0.7;
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  h4 { font-size: 1.15em; }
  h5 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-light); }
  h6 { font-size: 0.9em; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; }
  
  p {
    margin: 0 0 18px 0;
    text-align: justify;
    hyphens: auto;
  }
  
  strong { 
    font-weight: 700; 
    color: var(--text);
  }
  
  em { 
    font-style: italic;
    color: var(--text-light);
  }
  
  /* Code */
  code {
    background: linear-gradient(135deg, #eff6ff 0%, #f1f5f9 100%);
    padding: 3px 8px;
    border-radius: 6px;
    font-family: 'SF Mono', Monaco, 'Fira Code', 'Courier New', monospace;
    font-size: 0.875em;
    color: var(--primary-dark);
    border: 1px solid rgba(59, 130, 246, 0.15);
  }
  
  pre {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    color: #e2e8f0;
    padding: 22px 24px;
    border-radius: 14px;
    overflow-x: auto;
    margin: 24px 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.05);
  }
  
  pre code {
    background: none;
    padding: 0;
    color: inherit;
    font-size: 0.9em;
    border: none;
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
  }
  
  ul li::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 10px;
    width: 7px;
    height: 7px;
    background: linear-gradient(135deg, var(--primary), var(--primary-light));
    border-radius: 50%;
    box-shadow: 0 2px 4px var(--shadow-primary);
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
    background: rgba(59, 130, 246, 0.1);
    border-radius: 50%;
  }
  
  /* Blockquotes */
  blockquote {
    border-left: 4px solid var(--primary);
    padding: 18px 26px;
    margin: 26px 0;
    background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 50%, #f8fafc 100%);
    border-radius: 0 14px 14px 0;
    font-style: italic;
    color: var(--text-light);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.06);
  }
  
  blockquote p {
    margin: 0;
  }
  
  /* Links */
  a {
    color: var(--primary);
    text-decoration: none;
    font-weight: 500;
    border-bottom: 1px solid transparent;
    transition: all 0.2s ease;
  }
  
  a:hover {
    border-bottom-color: var(--primary);
    color: var(--primary-dark);
  }
  
  /* Horizontal Rule */
  hr {
    border: none;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, var(--border) 20%, var(--primary) 50%, var(--border) 80%, transparent 100%);
    margin: 36px 0;
    border-radius: 1px;
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
    
    table {
      page-break-inside: avoid;
    }
    
    table, thead, tbody, tr, th, td {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
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

// Comprehensive markdown to HTML converter
export function convertMarkdownToHtml(markdown: string): string {
  let html = markdown;
  
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
        // Process emoji in cell content
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
        // Process emoji in cell content
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
  // Emoji unicode ranges pattern
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

function wrapInParagraphs(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let paragraphBuffer = '';
  
  const blockTags = ['<h', '<table', '<ul', '<ol', '<pre', '<blockquote', '<hr', '</table', '</ul', '</ol', '</pre', '</blockquote', '<div'];
  
  for (const line of lines) {
    const trimmed = line.trim();
    const isBlock = blockTags.some(tag => trimmed.startsWith(tag)) || trimmed === '';
    
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
