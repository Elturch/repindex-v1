import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from './button';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface MarkdownMessageProps {
  content: string;
  showDownload?: boolean;
}

export function MarkdownMessage({ content, showDownload = false }: MarkdownMessageProps) {
  const { toast } = useToast();

  const downloadMessage = () => {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const fileName = `repindex_respuesta_${timestamp}.html`;

    const htmlContent = generateExportHtml(content);

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Respuesta exportada',
      description: 'Archivo HTML descargado exitosamente',
    });
  };

  return (
    <div className="relative group markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headers with visual hierarchy
          h1: ({ children }) => (
            <h1 className="text-2xl md:text-3xl font-bold mt-8 mb-5 pb-3 border-b-2 border-primary/30 text-foreground flex items-center gap-3">
              <span className="w-1.5 h-8 bg-gradient-to-b from-primary to-primary/50 rounded-full flex-shrink-0" />
              <span>{children}</span>
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl md:text-2xl font-bold mt-7 mb-4 pb-2 border-b border-border/50 text-foreground flex items-center gap-2">
              <span className="w-1 h-6 bg-primary/70 rounded-full flex-shrink-0" />
              <span>{children}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg md:text-xl font-semibold mt-6 mb-3 text-foreground flex items-center gap-2">
              <span className="w-2 h-2 bg-primary/60 rounded-full flex-shrink-0" />
              <span>{children}</span>
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base md:text-lg font-semibold mt-5 mb-2 text-foreground/90">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-sm md:text-base font-semibold mt-4 mb-2 text-foreground/80 uppercase tracking-wide">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-sm font-medium mt-3 mb-2 text-muted-foreground uppercase tracking-wider">
              {children}
            </h6>
          ),
          
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-4 leading-relaxed text-foreground/90 text-[15px]">
              {children}
            </p>
          ),
          
          // Text emphasis
          strong: ({ children }) => (
            <strong className="font-bold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/80">{children}</em>
          ),
          
          // Lists
          ul: ({ children }) => (
            <ul className="mb-5 space-y-2 pl-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-5 space-y-2 pl-0 counter-reset-item">
              {children}
            </ol>
          ),
          li: ({ children, ordered, index, ...props }: any) => (
            <li className="flex items-start gap-3 text-[15px] leading-relaxed text-foreground/90 pl-0">
              <span className="mt-2 w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
              <span className="flex-1">{children}</span>
            </li>
          ),
          
          // Code
          code: ({ inline, children, ...props }: any) => {
            if (inline) {
              return (
                <code 
                  className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-sm font-mono font-medium" 
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code 
                className="block bg-muted/50 border border-border/50 p-4 rounded-lg text-sm font-mono overflow-x-auto my-4 text-foreground/90" 
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-muted/30 border border-border/30 rounded-lg overflow-hidden my-4">
              {children}
            </pre>
          ),
          
          // Professional tables with excellent styling
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm bg-card rounded-xl overflow-hidden shadow-lg border border-border/40">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="bg-card">
              {children}
            </tbody>
          ),
          tr: ({ children, isHeader, ...props }: any) => (
            <tr className="border-b border-border/30 hover:bg-muted/40 transition-colors even:bg-muted/20">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3.5 text-left font-bold text-foreground text-xs uppercase tracking-wider border-b-2 border-primary/30 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-foreground/90 border-b border-border/20">
              {children}
            </td>
          ),
          
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="my-5 pl-5 py-3 border-l-4 border-primary/50 bg-primary/5 rounded-r-lg italic text-foreground/80">
              {children}
            </blockquote>
          ),
          
          // Links
          a: ({ children, href }) => (
            <a 
              href={href} 
              className="text-primary font-medium hover:underline underline-offset-2 transition-colors" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          
          // Horizontal rules
          hr: () => (
            <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          ),
          
          // Images
          img: ({ src, alt }) => (
            <img 
              src={src} 
              alt={alt} 
              className="max-w-full h-auto rounded-lg my-4 shadow-md" 
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      
      {showDownload && (
        <Button
          variant="ghost"
          size="sm"
          onClick={downloadMessage}
          className="absolute -bottom-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity gap-2 text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Descargar</span>
        </Button>
      )}
    </div>
  );
}

// Generate complete HTML document for export with premium styling
function generateExportHtml(markdown: string): string {
  const now = format(new Date(), 'dd/MM/yyyy HH:mm');
  
  const styles = `
    :root {
      --primary: #3b82f6;
      --primary-light: #60a5fa;
      --primary-dark: #2563eb;
      --text: #1f2937;
      --text-light: #6b7280;
      --bg: #ffffff;
      --bg-alt: #f9fafb;
      --border: #e5e7eb;
      --shadow: rgba(0, 0, 0, 0.1);
    }
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px;
      line-height: 1.7;
      color: var(--text);
      background: var(--bg);
      font-size: 15px;
    }
    
    /* Header */
    .document-header {
      background: linear-gradient(135deg, var(--primary), var(--primary-dark));
      color: white;
      padding: 28px 32px;
      border-radius: 16px;
      margin-bottom: 40px;
      box-shadow: 0 10px 40px rgba(59, 130, 246, 0.2);
    }
    
    .document-header h1 {
      margin: 0 0 8px 0;
      font-size: 1.75em;
      font-weight: 700;
      border: none;
      padding: 0;
    }
    
    .document-header .subtitle {
      margin: 0;
      opacity: 0.9;
      font-size: 0.95em;
    }
    
    /* Typography */
    h1, h2, h3, h4, h5, h6 {
      margin-top: 32px;
      margin-bottom: 16px;
      font-weight: 700;
      line-height: 1.3;
      color: var(--text);
    }
    
    h1 { 
      font-size: 2em; 
      border-bottom: 3px solid var(--primary);
      padding-bottom: 12px;
    }
    
    h2 { 
      font-size: 1.6em; 
      border-bottom: 2px solid var(--border);
      padding-bottom: 10px;
    }
    
    h3 { 
      font-size: 1.35em;
      color: var(--primary-dark);
    }
    
    h4 { font-size: 1.15em; }
    h5 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.5px; }
    h6 { font-size: 0.9em; color: var(--text-light); text-transform: uppercase; }
    
    p {
      margin: 0 0 16px 0;
      text-align: justify;
    }
    
    strong { 
      font-weight: 700; 
      color: var(--text);
    }
    
    em { 
      font-style: italic; 
    }
    
    /* Code */
    code {
      background: #f1f5f9;
      padding: 3px 8px;
      border-radius: 6px;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.875em;
      color: var(--primary-dark);
    }
    
    pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 20px;
      border-radius: 12px;
      overflow-x: auto;
      margin: 20px 0;
      box-shadow: 0 4px 12px var(--shadow);
    }
    
    pre code {
      background: none;
      padding: 0;
      color: inherit;
      font-size: 0.9em;
    }
    
    /* Tables - Premium Styling */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 24px 0;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--border);
    }
    
    thead {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    }
    
    thead tr {
      border-bottom: 2px solid var(--primary);
    }
    
    th {
      padding: 14px 16px;
      text-align: left;
      font-weight: 700;
      font-size: 0.75em;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text);
      border-bottom: 2px solid var(--primary);
      white-space: nowrap;
    }
    
    td {
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      color: var(--text);
      vertical-align: top;
    }
    
    tbody tr:nth-child(even) {
      background: #fafbfc;
    }
    
    tbody tr:hover {
      background: #f0f9ff;
    }
    
    tbody tr:last-child td {
      border-bottom: none;
    }
    
    /* Lists */
    ul, ol {
      margin: 0 0 20px 0;
      padding-left: 0;
      list-style: none;
    }
    
    li {
      margin-bottom: 10px;
      padding-left: 28px;
      position: relative;
      line-height: 1.6;
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
      content: counter(list-counter) '.';
      position: absolute;
      left: 4px;
      top: 0;
      font-weight: 700;
      color: var(--primary);
    }
    
    /* Blockquotes */
    blockquote {
      border-left: 4px solid var(--primary);
      padding: 16px 24px;
      margin: 24px 0;
      background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
      border-radius: 0 12px 12px 0;
      font-style: italic;
      color: var(--text-light);
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
      transition: border-color 0.2s;
    }
    
    a:hover {
      border-bottom-color: var(--primary);
    }
    
    /* Horizontal Rule */
    hr {
      border: none;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--border), transparent);
      margin: 32px 0;
    }
    
    /* Footer */
    .document-footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 2px solid var(--border);
      text-align: center;
      color: var(--text-light);
      font-size: 0.9em;
    }
    
    .document-footer a {
      color: var(--primary);
    }
    
    /* Print Styles */
    @media print {
      body {
        padding: 20px;
        max-width: 100%;
      }
      
      .document-header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
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
    }
  `;

  const bodyContent = convertMarkdownToHtml(markdown);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RepIndex - Respuesta del Agente Rix</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body>
  <div class="document-header">
    <h1>RepIndex.ai — Agente Rix</h1>
    <p class="subtitle">Documento exportado el ${now}</p>
  </div>
  
  <main class="content">
    ${bodyContent}
  </main>
  
  <div class="document-footer">
    <p>Este documento fue generado automáticamente por <a href="https://repindex.ai">RepIndex.ai</a></p>
  </div>
</body>
</html>`;
}

// Comprehensive markdown to HTML converter
function convertMarkdownToHtml(markdown: string): string {
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

function escapeHtml(text: string): string {
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
  
  let html = '<table>\n';
  
  // Thead
  if (headerRows.length > 0) {
    html += '<thead>\n';
    for (const row of headerRows) {
      const cells = parseTableCells(row);
      html += '<tr>';
      for (const cell of cells) {
        html += `<th>${cell}</th>`;
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
        html += `<td>${cell}</td>`;
      }
      html += '</tr>\n';
    }
    html += '</tbody>\n';
  }
  
  html += '</table>';
  return html;
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
  
  const blockTags = ['<h', '<table', '<ul', '<ol', '<pre', '<blockquote', '<hr', '</table', '</ul', '</ol', '</pre', '</blockquote'];
  
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
