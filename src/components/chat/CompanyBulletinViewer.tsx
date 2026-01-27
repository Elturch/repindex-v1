import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Printer, Download, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { convertMarkdownToHtml } from "@/lib/markdownToHtml";
import { technicalSheetStyles, generateTechnicalSheetHtml } from "@/lib/technicalSheetHtml";

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
  // Convert markdown to HTML using the shared premium converter
  const htmlContent = convertMarkdownToHtml(content);
  
  // Extract sections for table of contents
  const sections = extractSections(content);

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
    
    @page :first {
      margin: 0;
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
      
      .cover-page {
        page-break-after: always;
      }
      
      .toc-page {
        page-break-after: always;
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
      font-size: 10pt;
    }
    
    body {
      font-family: 'Georgia', 'Times New Roman', Times, serif;
      font-size: 1rem;
      line-height: 1.6;
      color: #1a1a1a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    /* ===========================================
       COVER PAGE - PROFESSIONAL DESIGN
       =========================================== */
    .cover-page {
      width: 210mm;
      height: 297mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: white;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .cover-page::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 70%);
      animation: none;
    }
    
    .cover-logo {
      font-size: 4rem;
      font-weight: 900;
      letter-spacing: -2px;
      margin-bottom: 10px;
      text-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    
    .cover-logo span {
      color: #e94560;
    }
    
    .cover-tagline {
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 4px;
      opacity: 0.8;
      margin-bottom: 60px;
    }
    
    .cover-divider {
      width: 120px;
      height: 3px;
      background: linear-gradient(90deg, transparent, #e94560, transparent);
      margin: 40px 0;
    }
    
    .cover-edition {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 3px;
      opacity: 0.7;
      margin-bottom: 20px;
    }
    
    .cover-company {
      font-size: 3rem;
      font-weight: 700;
      margin-bottom: 20px;
      padding: 20px 50px;
      border: 2px solid rgba(255,255,255,0.3);
      background: rgba(255,255,255,0.05);
    }
    
    .cover-date {
      font-size: 1.1rem;
      opacity: 0.9;
      margin-top: 30px;
    }
    
    .cover-footer {
      position: absolute;
      bottom: 40px;
      font-size: 0.75rem;
      opacity: 0.6;
      letter-spacing: 1px;
    }
    
    /* ===========================================
       TABLE OF CONTENTS
       =========================================== */
    .toc-page {
      padding: 50px;
      min-height: 297mm;
    }
    
    .toc-title {
      font-size: 2rem;
      font-weight: 800;
      margin-bottom: 40px;
      padding-bottom: 15px;
      border-bottom: 3px solid #1a1a1a;
    }
    
    .toc-list {
      list-style: none;
      padding: 0;
    }
    
    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 12px 0;
      border-bottom: 1px dotted #ccc;
      font-size: 1rem;
    }
    
    .toc-item:hover {
      background: #f9f9f9;
    }
    
    .toc-number {
      font-weight: 700;
      color: #e94560;
      margin-right: 15px;
      min-width: 30px;
    }
    
    .toc-text {
      flex: 1;
    }
    
    .toc-page-num {
      font-weight: 600;
      color: #666;
    }
    
    .toc-section-title {
      font-size: 1.1rem;
      font-weight: 700;
      margin-top: 25px;
      margin-bottom: 10px;
      color: #333;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    /* ===========================================
       MAIN CONTENT CONTAINER
       =========================================== */
    .print-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
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
      font-size: 2.5rem;
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
      font-size: 1.6rem;
      font-weight: 800;
      margin: 32px 0 18px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid #e0e0e0;
      page-break-after: avoid;
      line-height: 1.25;
    }
    
    .bulletin-content h2 {
      font-size: 1.3rem;
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
    
    .bulletin-content h4 {
      font-size: 1rem;
      font-weight: 600;
      margin: 18px 0 10px 0;
      color: #444;
      page-break-after: avoid;
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
      font-size: 0.85rem;
      page-break-inside: avoid;
    }
    
    .bulletin-content thead {
      background: #1a1a2e;
      color: #fff;
    }
    
    .bulletin-content th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: none;
    }
    
    .bulletin-content td {
      padding: 8px 12px;
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
      border-left: 5px solid #e94560;
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
    
    /* ===========================================
       PAGE NUMBERS
       =========================================== */
    @media print {
      .bulletin-content {
        counter-reset: page 2;
      }
    }
    
    /* ===========================================
       TECHNICAL SHEET - LEGAL FINE PRINT
       =========================================== */
    ${technicalSheetStyles}
  </style>
</head>
<body>
  <!-- COVER PAGE -->
  <div class="cover-page">
    <div class="cover-logo">Rep<span>Index</span></div>
    <p class="cover-tagline">La Autoridad en Reputación Corporativa de las IAs</p>
    
    <div class="cover-divider"></div>
    
    <p class="cover-edition">Boletín Ejecutivo Premium</p>
    <div class="cover-company">${companyName || 'Análisis Corporativo'}</div>
    
    <p class="cover-date">${formattedDate}</p>
    
    <p class="cover-footer">
      Análisis basado en ChatGPT • Perplexity • Gemini • DeepSeek
    </p>
  </div>
  
  <!-- TABLE OF CONTENTS -->
  <div class="toc-page">
    <h1 class="toc-title">Índice de Contenidos</h1>
    
    <ul class="toc-list">
      ${sections.map((section, idx) => `
        <li class="toc-item">
          <span class="toc-number">${idx + 1}.</span>
          <span class="toc-text">${section}</span>
        </li>
      `).join('')}
    </ul>
    
    <div style="margin-top: 50px; padding: 20px; background: #f9f9f9; border-left: 4px solid #e94560;">
      <h3 style="margin-bottom: 10px; font-size: 1rem;">Sobre este informe</h3>
      <p style="font-size: 0.9rem; line-height: 1.5; text-align: left;">
        Este boletín ejecutivo presenta un análisis exhaustivo de la reputación corporativa 
        de <strong>${companyName || 'la empresa'}</strong> según la percepción de cuatro 
        modelos de inteligencia artificial líderes. Los datos se actualizan semanalmente 
        y reflejan cómo las IAs construyen y comunican la narrativa de las principales corporaciones.
      </p>
    </div>
  </div>
  
  <!-- MAIN CONTENT -->
  <div class="print-container">
    <!-- Magazine Header -->
    <header class="bulletin-header">
      <div class="header-meta">
        <span>${formattedDate}</span>
        <span>Edición Premium</span>
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
      <p><strong>RepIndex Bulletin</strong> — Edición Premium</p>
      <p>Análisis basado en ChatGPT, Perplexity, Gemini y DeepSeek</p>
      <p>© ${new Date().getFullYear()} RepIndex — repindex.ai</p>
    </footer>
    
    ${generateTechnicalSheetHtml({ companyName })}
  </div>
</body>
</html>`;
}

function extractSections(markdown: string): string[] {
  const sections: string[] = [];
  const lines = markdown.split('\n');
  
  for (const line of lines) {
    // Match h1 and h2 headers
    const h1Match = line.match(/^#\s+(.+)$/);
    const h2Match = line.match(/^##\s+(.+)$/);
    
    if (h1Match) {
      sections.push(h1Match[1].replace(/[*_`]/g, '').trim());
    } else if (h2Match) {
      sections.push(h2Match[1].replace(/[*_`]/g, '').trim());
    }
  }
  
  // Limit to first 20 sections for TOC
  return sections.slice(0, 20);
}

// Using shared convertMarkdownToHtml from @/lib/markdownToHtml
