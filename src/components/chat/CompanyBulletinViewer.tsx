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

      {/* Footer Actions */}
      <div className="flex items-center justify-center gap-2 pt-4 mt-4 border-t border-border/50">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleDownload}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" />
          Descargar HTML
        </Button>
        <Button 
          variant="default" 
          size="sm" 
          onClick={handlePrint}
          className="gap-1.5"
        >
          <Printer className="h-4 w-4" />
          Imprimir / PDF
        </Button>
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
  <title>RepIndex Bulletin - ${companyName || 'Empresa'}</title>
  <style>
    /* ===========================================
       PRINT MARGINS - CRITICAL FOR PDF
       =========================================== */
    @page {
      size: A4;
      margin: 20mm 20mm 20mm 20mm;
    }
    
    @media print {
      html, body {
        width: 210mm;
        height: 297mm;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      .print-container {
        padding: 0 !important;
        margin: 0 !important;
      }
    }
    
    /* ===========================================
       BASE STYLES
       =========================================== */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    html {
      font-size: 11pt;
    }
    
    body {
      font-family: 'Georgia', 'Times New Roman', Times, serif;
      font-size: 1rem;
      line-height: 1.65;
      color: #1a1a1a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    /* Container with fallback margins for screen view */
    .print-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 40px;
    }
    
    /* ===========================================
       MAGAZINE HEADER
       =========================================== */
    .bulletin-header {
      text-align: center;
      padding-bottom: 24px;
      margin-bottom: 28px;
      border-bottom: 3px solid #1a1a1a;
    }
    
    .header-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 2.5px;
      color: #666;
    }
    
    .masthead-title {
      font-size: 3rem;
      font-weight: 900;
      letter-spacing: -1px;
      margin: 0 0 4px 0;
      font-family: 'Georgia', serif;
    }
    
    .masthead-subtitle {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 5px;
      color: #555;
      margin: 0;
    }
    
    .company-focus {
      display: inline-block;
      padding: 10px 28px;
      background: linear-gradient(135deg, #f8f8f8, #eeeeee);
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
      font-weight: 700;
      margin-top: 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    /* ===========================================
       CONTENT TYPOGRAPHY
       =========================================== */
    .bulletin-content h1 {
      font-size: 1.75rem;
      font-weight: 800;
      margin: 32px 0 18px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid #e0e0e0;
      page-break-after: avoid;
      line-height: 1.25;
    }
    
    .bulletin-content h2 {
      font-size: 1.35rem;
      font-weight: 700;
      margin: 28px 0 14px 0;
      color: #222;
      page-break-after: avoid;
      line-height: 1.3;
    }
    
    .bulletin-content h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 22px 0 12px 0;
      color: #333;
      page-break-after: avoid;
      line-height: 1.35;
    }
    
    .bulletin-content p {
      margin: 0 0 14px 0;
      text-align: justify;
      text-justify: inter-word;
      orphans: 3;
      widows: 3;
    }
    
    .bulletin-content ul, .bulletin-content ol {
      margin: 12px 0 18px 0;
      padding-left: 28px;
    }
    
    .bulletin-content li {
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    
    .bulletin-content strong {
      font-weight: 700;
    }
    
    .bulletin-content em {
      font-style: italic;
    }
    
    /* ===========================================
       TABLES - Professional Styling
       =========================================== */
    .bulletin-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 18px 0 24px 0;
      font-size: 0.9rem;
      page-break-inside: avoid;
    }
    
    .bulletin-content thead {
      background: #2a2a2a;
      color: #fff;
    }
    
    .bulletin-content th {
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: none;
    }
    
    .bulletin-content td {
      padding: 10px 14px;
      border-bottom: 1px solid #e5e5e5;
      vertical-align: top;
    }
    
    .bulletin-content tbody tr:nth-child(even) {
      background: #f9f9f9;
    }
    
    .bulletin-content tbody tr:hover {
      background: #f0f0f0;
    }
    
    /* ===========================================
       BLOCKQUOTES - Pull Quotes
       =========================================== */
    .bulletin-content blockquote {
      margin: 24px 0;
      padding: 20px 24px;
      border-left: 5px solid #1a1a1a;
      background: #f7f7f7;
      font-style: italic;
      font-size: 1.05rem;
      page-break-inside: avoid;
    }
    
    .bulletin-content blockquote p {
      margin: 0;
      text-align: left;
    }
    
    /* ===========================================
       HORIZONTAL RULES - Section Separators
       =========================================== */
    .bulletin-content hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 28px 0;
    }
    
    /* ===========================================
       CODE / DATA HIGHLIGHTS
       =========================================== */
    .bulletin-content code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.9rem;
      background: #f4f4f4;
      padding: 3px 6px;
      border-radius: 3px;
    }
    
    .bulletin-content pre {
      background: #f4f4f4;
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.85rem;
      page-break-inside: avoid;
      margin: 16px 0;
    }
    
    /* ===========================================
       FOOTER
       =========================================== */
    .bulletin-footer {
      margin-top: 36px;
      padding-top: 18px;
      border-top: 2px solid #1a1a1a;
      text-align: center;
      font-size: 0.75rem;
      color: #666;
    }
    
    .bulletin-footer p {
      margin: 4px 0;
      text-align: center;
    }
    
    /* ===========================================
       PAGE BREAK CONTROLS
       =========================================== */
    .page-break-before {
      page-break-before: always;
    }
    
    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid;
    }
    
    table, blockquote, pre, figure {
      page-break-inside: avoid;
    }
    
    /* Keep sections together */
    h2 + *, h3 + * {
      page-break-before: avoid;
    }
  </style>
</head>
<body>
  <div class="print-container">
    <!-- Magazine Header -->
    <header class="bulletin-header">
      <div class="header-meta">
        <span>${formattedDate}</span>
        <span>Edición Especial</span>
      </div>
      <h1 class="masthead-title">RepIndex</h1>
      <p class="masthead-subtitle">La Autoridad en Reputación Corporativa de las IAs</p>
      ${companyName ? `<div class="company-focus">${companyName}</div>` : ''}
    </header>
    
    <!-- Main Content -->
    <main class="bulletin-content">
      ${htmlContent}
    </main>
    
    <!-- Footer -->
    <footer class="bulletin-footer">
      <p><strong>RepIndex Bulletin</strong> — Edición Especial</p>
      <p>Análisis basado en ChatGPT, Perplexity, Gemini y DeepSeek</p>
      <p>© ${new Date().getFullYear()} RepIndex — repindex.ai</p>
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
