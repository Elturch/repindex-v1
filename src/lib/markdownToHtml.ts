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

  @media print {
    .emoji-result-grid {
      break-inside: avoid;
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
  
  // Emoji result blocks (before paragraph wrapping)
  html = processEmojiResultBlocks(html);
  
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
          const colonIdx = rest.indexOf(':');
          if (colonIdx !== -1) {
            const label = rest.substring(0, colonIdx).trim();
            const value = rest.substring(colonIdx + 1).trim();
            grid += `<div class="emoji-result-row"><span class="emoji-result-icon">${emoji}</span><span class="emoji-result-label">${label}</span><span class="emoji-result-value">${value}</span></div>`;
          } else {
            grid += `<div class="emoji-result-row"><span class="emoji-result-icon">${emoji}</span><span class="emoji-result-label">${rest}</span><span class="emoji-result-value"></span></div>`;
          }
        }
      }
      grid += '</div>';
      result.push(grid);
    } else {
      // Single emoji line — keep as-is
      result.push(...emojiBuffer);
    }
    emojiBuffer = [];
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip lines that are already HTML tags
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

function wrapInParagraphs(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let paragraphBuffer = '';
  
  // Extended list of block-level tags and their closings
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
    
    // Check if line is a block element or empty
    const isBlock = blockTags.some(tag => trimmed.toLowerCase().startsWith(tag)) || trimmed === '';
    
    if (isBlock) {
      // Flush paragraph buffer before adding block element
      if (paragraphBuffer) {
        result.push(`<p>${paragraphBuffer}</p>`);
        paragraphBuffer = '';
      }
      if (trimmed) result.push(line);
    } else {
      // Accumulate text for paragraph
      paragraphBuffer += (paragraphBuffer ? ' ' : '') + trimmed;
    }
  }
  
  // Flush any remaining paragraph content
  if (paragraphBuffer) {
    result.push(`<p>${paragraphBuffer}</p>`);
  }
  
  // Clean up empty paragraphs
  return result.join('\n').replace(/<p>\s*<\/p>/g, '');
}
