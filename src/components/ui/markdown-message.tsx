import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Button } from './button';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { getChatTranslations, t, type ChatUITranslations } from '@/lib/chatTranslations';
import { technicalSheetStyles, generateTechnicalSheetHtml } from '@/lib/technicalSheetHtml';
import { VerifiedSource, generateBibliographyHtml } from '@/lib/verifiedSourceExtractor';
import { convertMarkdownToHtml as sharedConvertMarkdownToHtml, premiumTableStyles, emojiGridStyles } from '@/lib/markdownToHtml';
import { generateInfoBarHtml } from '@/components/chat/ReportInfoBar';
import { stripSourcesFromVisibleMarkdown } from '@/lib/chat/v2/visibleFilter';

interface MarkdownMessageProps {
  content: string;
  showDownload?: boolean;
  languageCode?: string;
  roleName?: string; // Role name for PDF header (e.g., "CEO / Alta Dirección")
  verifiedSources?: VerifiedSource[];
  periodFrom?: string;
  periodTo?: string;
  /**
   * Engine that produced this message. When `'v2'`, the visible markdown is
   * post-filtered to remove the trailing Sources/Fuentes block, URL dumps
   * and inline `[n]` citations — V1 already hides these from the bubble.
   * The export path always uses the raw `content`, so the downloaded PDF
   * still contains the full Sources section.
   */
  agentVersion?: 'v1' | 'v2';
}

export function MarkdownMessage({ content, showDownload = false, languageCode = 'es', roleName, verifiedSources, periodFrom, periodTo, agentVersion }: MarkdownMessageProps) {
  const { toast } = useToast();
  const tr = getChatTranslations(languageCode);
  // `cleanedContent` is the meta-commentary-free version used as the canonical
  // payload for export (PDF/HTML download keeps Sources, by design).
  const cleanedContent = stripLlmMetaCommentary(content);
  // `visibleContent` is what we actually render in the chat bubble. For V2 we
  // additionally hide the Sources block so the in-app experience matches V1.
  const visibleContent =
    agentVersion === 'v2'
      ? stripSourcesFromVisibleMarkdown(cleanedContent)
      : cleanedContent;

  const downloadMessage = () => {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const fileName = `repindex_respuesta_${timestamp}.html`;

    // Export ALWAYS uses the unfiltered cleaned content so the PDF retains
    // its Sources / Fuentes section regardless of `agentVersion`.
    const htmlContent = generateExportHtml(cleanedContent, tr, languageCode, roleName, verifiedSources, periodFrom, periodTo);

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: tr.pdfExported,
      description: tr.pdfExportedDesc,
    });
  };

  return (
    <div className="relative group markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
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
          
          // Premium tables with elegant styling
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              <table className="w-full border-collapse text-sm bg-card rounded-xl overflow-hidden shadow-medium border border-border/50 backdrop-blur-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gradient-to-r from-primary/20 via-primary/15 to-primary/10 sticky top-0">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="bg-card divide-y divide-border/30">
              {children}
            </tbody>
          ),
          tr: ({ children, isHeader, ...props }: any) => (
            <tr className="group border-b border-border/20 hover:bg-primary/5 transition-all duration-200 even:bg-muted/30">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-4 text-left font-bold text-foreground text-xs uppercase tracking-wider border-b-2 border-primary/40 whitespace-nowrap first:rounded-tl-xl last:rounded-tr-xl">
              <span className="flex items-center gap-1.5">
                {children}
              </span>
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3.5 text-foreground/90 group-hover:text-foreground transition-colors font-medium">
              <span className="block">{children}</span>
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
        {visibleContent}
      </ReactMarkdown>
      
      {showDownload && (
        <div className="mt-3 pt-3 border-t border-border/30 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadMessage}
            className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">{tr.downloadReport}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

/** Strip LLM meta-commentary blocks that add no value to the report */
function stripLlmMetaCommentary(text: string): string {
  // Remove bracketed meta-text at the start (e.g. "[La respuesta completa se ha entregado...]")
  let cleaned = text.replace(/^\s*\[.*?(?:respuesta\s+completa|longitud|extensi[oó]n|profundidad\s+requerida|lectura\s+puede\s+requerir).*?\]\s*/is, '');
  // "Elaboración en progreso" variant
  cleaned = cleaned.replace(/^\s*\[.*?(?:elaboraci[oó]n\s+en\s+progreso|l[ií]mite\s+de\s+generaci[oó]n|pr[oó]xima\s+respuesta).*?\]\s*/is, '');
  // Also catch unbracketed variants
  cleaned = cleaned.replace(/^\s*La\s+respuesta\s+completa\s+se\s+ha\s+entregado[^.]*\.\s*/i, '');
  cleaned = cleaned.replace(/^\s*Debido\s+a\s+la\s+longitud[^.]*\.\s*/i, '');
  cleaned = cleaned.replace(/^\s*Si\s+necesita\s+aclaraciones\s+sobre\s+alguna\s+secci[oó]n[^.]*\.\s*/i, '');
  cleaned = cleaned.replace(/^\s*Elaboraci[oó]n\s+en\s+progreso[^.]*\.\s*/i, '');
  return cleaned;
}

// Generate complete HTML document for export with premium RepIndex report styling
export function generateExportHtml(markdown: string, tr: ChatUITranslations, languageCode: string, roleName?: string, verifiedSources?: VerifiedSource[], periodFrom?: string, periodTo?: string, reportContext?: Record<string, unknown> | null): string {
  // Prioritize reportContext dates (real data dates) over periodFrom/periodTo (which may come from user request)
  const effectivePeriodFrom = (reportContext?.date_from as string) || periodFrom;
  const effectivePeriodTo = (reportContext?.date_to as string) || periodTo;
  const now = format(new Date(), 'dd/MM/yyyy HH:mm');
  const dateForFile = format(new Date(), 'yyyy-MM-dd');
  
  const styles = `
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
    
    /* Report Header - Editorial Corporate Style */
    .report-header {
      background: #f0f4f8;
      color: #0f1419;
      padding: 44px 40px;
      border-radius: 12px;
      margin-bottom: 40px;
      border: 1px solid #e5e7eb;
    }
    
    .report-header .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    
    .report-header .logo-section {
    }
    
    .report-header .logo {
      font-size: 28px;
      font-weight: 700;
      color: #0f1419;
      letter-spacing: -0.02em;
      margin-bottom: 4px;
    }
    
    .report-header .logo span {
      color: #8899a6;
    }
    
    .report-header .company-tagline {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #8899a6;
      font-weight: 500;
    }
    
    .report-header .header-badge {
      background: transparent;
      border: 1px solid #1a73e8;
      color: #1a73e8;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .report-header .divider {
      height: 1px;
      background: #e5e7eb;
      margin-bottom: 20px;
    }
    
    .report-header .report-title {
      font-size: 20px;
      font-weight: 600;
      color: #0f1419;
      margin-bottom: 4px;
    }
    
    .report-header .report-subtitle {
      font-size: 13px;
      color: #536471;
      font-weight: 400;
      margin-bottom: 20px;
    }
    
    .report-header .meta {
      display: flex;
      gap: 28px;
      font-size: 12px;
      color: #536471;
      font-weight: 400;
    }
    
    .report-header .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
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
      border: 1px solid var(--border);
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
    
    th:first-child { border-top-left-radius: 8px; }
    th:last-child { border-top-right-radius: 8px; }
    
    td {
      padding: 10px 16px;
      border-bottom: 1px solid #f0f4f8;
      color: #0f1419;
      font-weight: 400;
      vertical-align: middle;
    }
    
    td:first-child { font-weight: 500; }
    
    td:not(:first-child) {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    
    th:not(:first-child) { text-align: right; }
    
    tbody tr:nth-child(even) { background: #f7f9fa; }
    tbody tr:nth-child(odd) { background: white; }
    tbody tr:hover { background: rgba(26, 115, 232, 0.04); }
    
    tbody tr:last-child td:first-child { border-bottom-left-radius: 8px; }
    tbody tr:last-child td:last-child { border-bottom-right-radius: 8px; }
    
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
    
    ol { counter-reset: list-counter; }
    ol li { counter-increment: list-counter; }
    
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
    
    blockquote p { margin: 0; }
    
    /* Links */
    a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 600;
    }
    
    a:hover { text-decoration: underline; }
    
    /* Horizontal Rule */
    hr {
      border: none;
      height: 1px;
      background: var(--border);
      margin: 36px 0;
    }
    
    /* Report Footer - Corporate Style */
    .report-footer {
      margin-top: 56px;
      padding-top: 28px;
      border-top: 2px solid var(--border);
      text-align: center;
    }
    
    .report-footer .footer-logo {
      font-size: 16px;
      font-weight: 700;
      color: #0f1419;
      margin-bottom: 8px;
    }
    
    .report-footer .footer-tagline {
      font-size: 11px;
      color: #536471;
      font-weight: 400;
      margin-bottom: 8px;
    }
    
    .report-footer .footer-url {
      font-size: 12px;
      color: #1a73e8;
      font-weight: 600;
      margin-bottom: 16px;
    }
    
    .report-footer .disclaimer {
      font-size: 10px;
      color: #8899a6;
      font-weight: 400;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.5;
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      body { padding: 24px 16px; font-size: 14px; }
      .report-header { padding: 28px 24px; }
      .report-header .logo { font-size: 22px; }
      h1 { font-size: 18px; }
      h2 { font-size: 17px; }
      h3 { font-size: 15px; }
      table { font-size: 12px; }
      th, td { padding: 8px 12px; }
    }
    
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
      
      .report-header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        page-break-after: avoid;
        margin-bottom: 24px;
      }
      
      h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      table, thead, tbody, tr, th, td {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      blockquote { page-break-inside: avoid; }
      .report-footer { page-break-before: avoid; }
      
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
    
    /* Emoji Result Grids + Section Bands + Metric Tables */
    ${emojiGridStyles}
    
    /* Tables - Premium Styling */
    ${premiumTableStyles}
    
    /* Technical Sheet - Legal Fine Print */
    ${technicalSheetStyles}
  `;

  const bodyContent = sharedConvertMarkdownToHtml(markdown);

  return `<!DOCTYPE html>
<html lang="${languageCode}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tr.pdfTitle} - ${dateForFile}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body>
  <header class="report-header">
    <div class="header-top">
      <div class="logo-section">
        <div class="logo">Rep<span>Index</span></div>
        <div class="company-tagline">${tr.pdfTagline}</div>
      </div>
      <div class="header-badge">${tr.pdfConfidential}</div>
    </div>
    <div class="divider"></div>
    <div class="report-title">${tr.pdfReportTitle}</div>
    <div class="report-subtitle">${tr.pdfReportSubtitle}</div>
    ${roleName ? `<div class="report-role" style="margin-top: 12px; padding: 8px 14px; background: rgba(26, 115, 232, 0.08); border-radius: 6px; border: 1px solid rgba(26, 115, 232, 0.2); display: inline-block;"><span style="font-size: 12px; font-weight: 600; color: #1a73e8; letter-spacing: 0.5px;">👤 ${t(tr.pdfPreparedFor, { role: roleName })}</span></div>` : ''}
    <div class="meta">
      <div class="meta-item">📅 ${now}</div>
      <div class="meta-item">📊 ${tr.pdfAnalysis}</div>
      <div class="meta-item">🔐 ${tr.pdfInternalUse}</div>
    </div>
  </header>
  
  <main class="content">
    ${generateInfoBarHtml(reportContext as any, languageCode)}
    ${bodyContent}
  </main>
  
  ${generateBibliographyHtml(verifiedSources || [], effectivePeriodFrom, effectivePeriodTo)}

  ${generateFuentesSectionHtml({
    periodFrom: effectivePeriodFrom,
    periodTo: effectivePeriodTo,
    observationsCount: typeof reportContext?.sample_size === 'number' ? reportContext.sample_size : undefined,
    modelsUsed: Array.isArray(reportContext?.models) ? reportContext.models as string[] : undefined,
    languageCode,
  })}

  <footer class="report-footer">
    <div class="footer-logo">RepIndex</div>
    <div class="footer-tagline">${tr.pdfFooterTagline}</div>
    <div class="footer-url">🌐 repindex.ai</div>
    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p class="disclaimer">
        © ${new Date().getFullYear()} RepIndex. ${tr.pdfDisclaimer}
      </p>
    </div>
  </footer>
  
  ${generateTechnicalSheetHtml()}
</body>
</html>`;
}

/**
 * PROBLEMA 5 — Fuentes section for HTML/PDF exports.
 * Lists the 6 AI models, source table, period, observations, methodology
 * note and generation date. Rendered between the bibliography and the
 * technical sheet. Pure presentation: no business logic.
 */
function generateFuentesSectionHtml(opts: {
  periodFrom?: string;
  periodTo?: string;
  observationsCount?: number;
  modelsUsed?: string[];
  languageCode: string;
}): string {
  const isES = (opts.languageCode || 'es').startsWith('es');
  const generatedAt = format(new Date(), 'dd/MM/yyyy HH:mm');
  const period = opts.periodFrom && opts.periodTo
    ? `${opts.periodFrom} → ${opts.periodTo}`
    : (isES ? 'No especificado' : 'Not specified');
  const obsLabel = isES ? 'Observaciones totales utilizadas' : 'Total observations used';
  const titleLabel = isES ? 'Fuentes' : 'Sources';
  const modelsHeader = isES ? 'Modelos de IA consultados' : 'AI models consulted';
  const tableHeader = isES ? 'Tabla de origen de datos' : 'Source data table';
  const periodLabel = isES ? 'Período de extracción' : 'Extraction period';
  const noteLabel = isES ? 'Nota metodológica' : 'Methodological note';
  const note = isES
    ? 'Los datos RIX se generan mediante consultas sistemáticas a 6 modelos de IA, evaluando 9 dimensiones reputacionales. Cada observación es un score 0-100 por modelo, empresa y semana. Frecuencia: semanal (domingos). Temperatura: 0 (determinismo máximo). Sin contexto de usuario ni historial conversacional.'
    : 'RIX data is generated via systematic queries to 6 AI models, evaluating 9 reputational dimensions. Each observation is a 0-100 score per model, company and week. Frequency: weekly (Sundays). Temperature: 0 (maximum determinism). No user context or conversational history.';
  const generatedLabel = isES ? 'Fecha de generación del informe' : 'Report generation date';

  const canonicalModels: Array<{ name: string; provider: string; method: string }> = [
    { name: 'GPT-4.1',         provider: 'OpenAI',          method: 'Web Search Preview' },
    { name: 'Gemini 2.5 Pro',  provider: 'Google',          method: 'Google Search Grounding' },
    { name: 'Perplexity Sonar', provider: 'Perplexity AI',  method: 'Native search + citations' },
    { name: 'DeepSeek Chat',   provider: 'DeepSeek + Tavily', method: 'RAG with Tavily API' },
    { name: 'Grok-3',          provider: 'xAI',             method: 'Live Search + X' },
    { name: 'Qwen Max',        provider: 'Alibaba',         method: 'DashScope Web Search' },
  ];
  const usedSet = new Set((opts.modelsUsed || []).map((m) => String(m).toLowerCase()));
  const modelRow = (m: { name: string; provider: string; method: string }) => {
    const inUse = usedSet.size === 0
      ? true
      : [...usedSet].some((u) => m.name.toLowerCase().includes(u) || u.includes(m.name.split(' ')[0].toLowerCase()) || u.includes(m.provider.toLowerCase()));
    const badge = inUse
      ? '<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:#d1fae5;color:#065f46;font-size:7px;font-weight:700;margin-left:6px;">EN USO</span>'
      : '<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:#f3f4f6;color:#6b7280;font-size:7px;font-weight:600;margin-left:6px;">DISPONIBLE</span>';
    return `<tr>
      <td><strong>${m.name}</strong>${badge}</td>
      <td>${m.provider}</td>
      <td>${m.method}</td>
    </tr>`;
  };

  return `
    <section class="fuentes" style="margin-top:48px;padding:24px 28px;border:1px solid #e5e7eb;border-radius:8px;background:#fafbfc;font-family:'DM Sans',sans-serif;color:#1f2937;page-break-before:always;">
      <h2 style="font-size:18px;font-weight:700;margin:0 0 6px 0;color:#0f1419;border:none;display:flex;align-items:center;gap:8px;">
        📚 ${titleLabel}
      </h2>
      <div style="font-size:11px;color:#6b7280;margin-bottom:18px;">
        ${generatedLabel}: <strong>${generatedAt}</strong>
      </div>

      <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;margin:18px 0 8px 0;">${modelsHeader}</h3>
      <table style="width:100%;font-size:11px;border-collapse:collapse;background:#fff;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 10px;border:1px solid #e5e7eb;text-align:left;font-weight:600;">Modelo</th>
            <th style="padding:8px 10px;border:1px solid #e5e7eb;text-align:left;font-weight:600;">Proveedor</th>
            <th style="padding:8px 10px;border:1px solid #e5e7eb;text-align:left;font-weight:600;">Método de grounding</th>
          </tr>
        </thead>
        <tbody>
          ${canonicalModels.map(modelRow).join('\n')}
        </tbody>
      </table>

      <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;margin:20px 0 6px 0;">${tableHeader}</h3>
      <p style="margin:0 0 6px 0;font-size:11px;"><code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;font-family:'JetBrains Mono',monospace;">rix_runs_v2</code> (Supabase) — ~9.300 filas/Q × 130 emisores activos × 6 modelos.</p>

      <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;margin:20px 0 6px 0;">${periodLabel}</h3>
      <p style="margin:0;font-size:11px;">${period}</p>
      ${typeof opts.observationsCount === 'number' ? `<p style="margin:6px 0 0 0;font-size:11px;"><strong>${obsLabel}:</strong> ${opts.observationsCount.toLocaleString('es-ES')}</p>` : ''}

      <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;margin:20px 0 6px 0;">${noteLabel}</h3>
      <p style="margin:0;font-size:11px;line-height:1.55;color:#4b5563;">${note}</p>
    </section>
  `;
}

// Local converter removed — using shared convertMarkdownToHtml from @/lib/markdownToHtml
