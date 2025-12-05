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

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>RepIndex - Respuesta del Chat</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              max-width: 800px;
              margin: 40px auto;
              padding: 20px;
              line-height: 1.6;
              color: #333;
            }
            h1, h2, h3, h4, h5, h6 {
              margin-top: 24px;
              margin-bottom: 16px;
              font-weight: 600;
              line-height: 1.25;
            }
            h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
            h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
            h3 { font-size: 1.25em; }
            p { margin-bottom: 16px; }
            strong { font-weight: 600; }
            em { font-style: italic; }
            code {
              background: #f6f8fa;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: 'Monaco', 'Courier New', monospace;
              font-size: 0.9em;
            }
            pre {
              background: #f6f8fa;
              padding: 16px;
              border-radius: 6px;
              overflow-x: auto;
              margin-bottom: 16px;
            }
            pre code {
              background: none;
              padding: 0;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin-bottom: 16px;
              overflow: hidden;
              border-radius: 6px;
            }
            thead {
              background: #f6f8fa;
            }
            th, td {
              border: 1px solid #dfe2e5;
              padding: 12px;
              text-align: left;
            }
            th {
              font-weight: 600;
            }
            tr:nth-child(even) {
              background: #f9fafb;
            }
            ul, ol {
              margin-bottom: 16px;
              padding-left: 2em;
            }
            li {
              margin-bottom: 8px;
            }
            blockquote {
              border-left: 4px solid #dfe2e5;
              padding-left: 16px;
              margin: 16px 0;
              color: #6a737d;
            }
            a {
              color: #0366d6;
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
            hr {
              border: none;
              border-top: 1px solid #eaecef;
              margin: 24px 0;
            }
            .header {
              background: #f6f8fa;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 30px;
              border-left: 4px solid #3b82f6;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #eaecef;
              text-align: center;
              color: #6a737d;
              font-size: 0.9em;
            }
            @media print {
              body { margin: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0 0 10px 0;">RepIndex.ai - Agente Rix</h2>
            <p style="margin: 0; color: #6a737d;">Exportado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
          ${convertMarkdownToHtml(content)}
          <div class="footer">
            <p>Este documento fue generado por RepIndex.ai</p>
          </div>
        </body>
      </html>
    `;

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
    <div className="relative group">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>,
          p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="ml-2">{children}</li>,
          code: ({ inline, children, ...props }: any) => 
            inline ? (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            ) : (
              <code className="block bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto my-2" {...props}>
                {children}
              </code>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-border rounded-lg">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
          th: ({ children }) => (
            <th className="border border-border px-4 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-4 py-2">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary pl-4 italic my-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          hr: () => <hr className="my-4 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
      
      {showDownload && (
        <Button
          variant="ghost"
          size="sm"
          onClick={downloadMessage}
          className="absolute -bottom-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity gap-2"
        >
          <Download className="h-3 w-3" />
          <span className="text-xs">Descargar</span>
        </Button>
      )}
    </div>
  );
}

// Comprehensive markdown to HTML converter for export
function convertMarkdownToHtml(markdown: string): string {
  let html = markdown;
  
  // Process tables first (before other replacements can interfere)
  html = processMarkdownTables(html);
  
  // Code blocks (before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/gm, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Headers (order matters - h6 to h1)
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
  html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br>');
  
  // Bold and italic combinations
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
  html = html.replace(/___(.*?)___/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.*?)__/gim, '<strong>$1</strong>');
  html = html.replace(/_(.*?)_/gim, '<em>$1</em>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Ordered lists
  html = processOrderedLists(html);
  
  // Unordered lists
  html = processUnorderedLists(html);
  
  // Paragraphs - split by double newlines and wrap non-special content
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inParagraph = false;
  let paragraphContent = '';
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if this is a block element
    const isBlockElement = 
      trimmedLine.startsWith('<h') ||
      trimmedLine.startsWith('<table') ||
      trimmedLine.startsWith('<ul') ||
      trimmedLine.startsWith('<ol') ||
      trimmedLine.startsWith('<pre') ||
      trimmedLine.startsWith('<blockquote') ||
      trimmedLine.startsWith('<hr') ||
      trimmedLine.startsWith('</table') ||
      trimmedLine.startsWith('</ul') ||
      trimmedLine.startsWith('</ol') ||
      trimmedLine.startsWith('</pre') ||
      trimmedLine === '';
    
    if (isBlockElement) {
      if (paragraphContent) {
        processedLines.push(`<p>${paragraphContent}</p>`);
        paragraphContent = '';
      }
      if (trimmedLine) {
        processedLines.push(line);
      }
    } else {
      if (paragraphContent) {
        paragraphContent += ' ' + trimmedLine;
      } else {
        paragraphContent = trimmedLine;
      }
    }
  }
  
  if (paragraphContent) {
    processedLines.push(`<p>${paragraphContent}</p>`);
  }
  
  html = processedLines.join('\n');
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  
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
  let inTable = false;
  let tableRows: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this is a table row (contains | and has content)
    const isTableRow = line.includes('|') && line.replace(/\|/g, '').trim().length > 0;
    const isSeparatorRow = /^\|?[\s\-:|]+\|?$/.test(line) && line.includes('-');
    
    if (isTableRow || isSeparatorRow) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        // Process accumulated table
        result.push(convertTableToHtml(tableRows));
        inTable = false;
        tableRows = [];
      }
      result.push(lines[i]);
    }
  }
  
  // Don't forget the last table if file ends with one
  if (inTable && tableRows.length > 0) {
    result.push(convertTableToHtml(tableRows));
  }
  
  return result.join('\n');
}

function convertTableToHtml(rows: string[]): string {
  if (rows.length < 2) return rows.join('\n'); // Not a valid table
  
  let html = '<table>\n';
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].trim();
    
    // Skip separator row
    if (/^\|?[\s\-:|]+\|?$/.test(row) && row.includes('-')) {
      continue;
    }
    
    // Parse cells
    const cells = row
      .replace(/^\|/, '') // Remove leading pipe
      .replace(/\|$/, '') // Remove trailing pipe
      .split('|')
      .map(cell => cell.trim());
    
    const isHeader = i === 0;
    const tag = isHeader ? 'th' : 'td';
    const wrapper = isHeader ? 'thead' : (i === 1 || (i === 2 && /^\|?[\s\-:|]+\|?$/.test(rows[1]))) ? 'tbody' : '';
    
    if (isHeader) {
      html += '<thead>\n';
    } else if (i === 1 || (i === 2 && /^\|?[\s\-:|]+\|?$/.test(rows[1]))) {
      html += '<tbody>\n';
    }
    
    html += '<tr>\n';
    for (const cell of cells) {
      html += `<${tag}>${cell}</${tag}>\n`;
    }
    html += '</tr>\n';
    
    if (isHeader) {
      html += '</thead>\n';
    }
  }
  
  html += '</tbody>\n</table>';
  return html;
}

function processOrderedLists(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  
  for (const line of lines) {
    const match = line.match(/^(\d+)\. (.*)$/);
    
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
  
  if (inList) {
    result.push('</ol>');
  }
  
  return result.join('\n');
}

function processUnorderedLists(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  
  for (const line of lines) {
    const match = line.match(/^[\*\-\+] (.*)$/);
    
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
  
  if (inList) {
    result.push('</ul>');
  }
  
  return result.join('\n');
}
