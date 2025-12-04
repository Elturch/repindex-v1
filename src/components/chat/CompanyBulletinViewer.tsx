import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Printer, Download, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/ui/markdown-message";

interface CompanyBulletinViewerProps {
  content: string;
  companyName?: string;
  generatedAt?: string;
}

export function CompanyBulletinViewer({ content, companyName, generatedAt }: CompanyBulletinViewerProps) {
  const formattedDate = generatedAt 
    ? format(new Date(generatedAt), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
    : format(new Date(), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });

  const handlePrint = () => {
    // Create a new window for printing with proper styles
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = generatePrintHtml(content, companyName, formattedDate);
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  const handleDownload = () => {
    const htmlContent = generatePrintHtml(content, companyName, formattedDate);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `boletin_${companyName?.toLowerCase().replace(/\s+/g, '_') || 'empresa'}_${format(new Date(), 'yyyy-MM-dd')}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Bulletin Header with Actions */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-primary/20">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-primary">Boletín Ejecutivo</h4>
            <p className="text-xs text-muted-foreground">{formattedDate}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownload}
            className="gap-1.5 h-8"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Descargar</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handlePrint}
            className="gap-1.5 h-8"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Imprimir</span>
          </Button>
        </div>
      </div>

      {/* Bulletin Content */}
      <div className="bulletin-content">
        <MarkdownMessage content={content} showDownload={false} />
      </div>
    </div>
  );
}

function generatePrintHtml(content: string, companyName?: string, formattedDate?: string): string {
  // Convert markdown to HTML (basic conversion)
  const htmlContent = convertMarkdownToHtml(content);

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Boletín Ejecutivo - ${companyName || 'Empresa'} | RepIndex</title>
  <style>
    @page {
      size: A4;
      margin: 2.5cm 2cm 2.5cm 2cm;
    }
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .container {
      max-width: 100%;
      padding: 0;
    }
    
    /* Magazine Header */
    .header {
      text-align: center;
      padding-bottom: 20px;
      margin-bottom: 25px;
      border-bottom: 2px solid #1a1a1a;
    }
    
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #666;
    }
    
    .masthead {
      margin-bottom: 10px;
    }
    
    .masthead h1 {
      font-size: 42pt;
      font-weight: 900;
      letter-spacing: -1px;
      margin: 0;
      font-family: 'Georgia', serif;
    }
    
    .tagline {
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 4px;
      color: #666;
      margin-top: 5px;
    }
    
    .company-badge {
      display: inline-block;
      padding: 8px 20px;
      background: #f0f0f0;
      border-radius: 4px;
      font-size: 12pt;
      font-weight: 600;
      margin-top: 15px;
    }
    
    /* Content Styles */
    .content {
      column-count: 1;
    }
    
    .content h1 {
      font-size: 20pt;
      font-weight: 700;
      margin: 25px 0 15px 0;
      border-bottom: 1px solid #ddd;
      padding-bottom: 8px;
      page-break-after: avoid;
    }
    
    .content h2 {
      font-size: 16pt;
      font-weight: 700;
      margin: 20px 0 12px 0;
      color: #333;
      page-break-after: avoid;
    }
    
    .content h3 {
      font-size: 13pt;
      font-weight: 600;
      margin: 18px 0 10px 0;
      color: #444;
      page-break-after: avoid;
    }
    
    .content p {
      margin: 0 0 12px 0;
      text-align: justify;
      orphans: 3;
      widows: 3;
    }
    
    .content ul, .content ol {
      margin: 10px 0 15px 0;
      padding-left: 25px;
    }
    
    .content li {
      margin-bottom: 6px;
      page-break-inside: avoid;
    }
    
    .content strong {
      font-weight: 700;
    }
    
    .content em {
      font-style: italic;
    }
    
    /* Tables */
    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0 20px 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    
    .content th {
      background: #f5f5f5;
      padding: 10px 12px;
      text-align: left;
      font-weight: 700;
      border: 1px solid #ddd;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .content td {
      padding: 8px 12px;
      border: 1px solid #ddd;
      vertical-align: top;
    }
    
    .content tr:nth-child(even) {
      background: #fafafa;
    }
    
    /* Blockquotes / Highlights */
    .content blockquote {
      margin: 20px 0;
      padding: 15px 20px;
      border-left: 4px solid #1a1a1a;
      background: #f9f9f9;
      font-style: italic;
      page-break-inside: avoid;
    }
    
    .content blockquote p {
      margin: 0;
    }
    
    /* Footer */
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    
    .footer p {
      margin: 3px 0;
    }
    
    /* Code blocks (for data) */
    .content code {
      font-family: 'Courier New', monospace;
      font-size: 10pt;
      background: #f4f4f4;
      padding: 2px 5px;
      border-radius: 3px;
    }
    
    .content pre {
      background: #f4f4f4;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 9pt;
      page-break-inside: avoid;
    }
    
    /* Page breaks */
    .page-break {
      page-break-before: always;
    }
    
    /* Prevent orphan headings */
    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid;
    }
    
    /* Keep related content together */
    table, figure, .data-box {
      page-break-inside: avoid;
    }
    
    /* Print specific */
    @media print {
      body {
        background: white;
      }
      
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Magazine Header -->
    <header class="header">
      <div class="header-top">
        <span>${formattedDate}</span>
        <span>Boletín Ejecutivo</span>
      </div>
      <div class="masthead">
        <h1>RepIndex</h1>
        <p class="tagline">La Autoridad en Reputación Corporativa de las IAs</p>
      </div>
      ${companyName ? `<div class="company-badge">${companyName}</div>` : ''}
    </header>
    
    <!-- Main Content -->
    <main class="content">
      ${htmlContent}
    </main>
    
    <!-- Footer -->
    <footer class="footer">
      <p>© ${new Date().getFullYear()} RepIndex — Análisis generado con Inteligencia Artificial</p>
      <p>Este documento ha sido generado automáticamente a partir de datos de ChatGPT, Perplexity, Gemini y DeepSeek</p>
      <p>Para más información: repindex.ai</p>
    </footer>
  </div>
</body>
</html>`;
}

function convertMarkdownToHtml(markdown: string): string {
  let html = markdown;
  
  // Escape HTML first
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Blockquotes
  html = html.replace(/^\&gt; (.*$)/gim, '<blockquote><p>$1</p></blockquote>');
  
  // Unordered lists
  html = html.replace(/^\s*[-*+] (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Ordered lists
  html = html.replace(/^\s*\d+\. (.*$)/gim, '<li>$1</li>');
  
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Tables (basic conversion)
  const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, header, rows) => {
    const headerCells = header.split('|').filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join('');
    const bodyRows = rows.trim().split('\n').map((row: string) => {
      const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  });
  
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  
  // Clean up empty paragraphs and fix nested elements
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ol>)/g, '$1');
  html = html.replace(/(<\/ol>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<table>)/g, '$1');
  html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  
  // Fix list continuity (merge consecutive <ul> or <ol> tags)
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/<\/ol>\s*<ol>/g, '');
  
  // Fix line breaks in paragraphs
  html = html.replace(/([^>])\n([^<])/g, '$1<br>$2');
  
  return html;
}
