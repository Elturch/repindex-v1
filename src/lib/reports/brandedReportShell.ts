/**
 * Branded report shell — reuses EXACTLY the same CSS / classes / header /
 * footer scaffold as `downloadAsHtml` in ChatContext (report-header,
 * report-footer, premium tables, technical-sheet). The only entry point is
 * `wrapBrandedReport`, which returns a full standalone HTML document.
 */
import { premiumTableStyles, emojiGridStyles } from "@/lib/markdownToHtml";
import { technicalSheetStyles } from "@/lib/technicalSheetHtml";

export interface BrandedReportMetaItem {
  icon?: string; // small emoji or symbol
  iconHtml?: string; // optional raw SVG/HTML that replaces `icon`
  label: string; // full label text
}

export interface WrapBrandedReportInput {
  title: string;
  subtitle?: string;
  metaItems?: BrandedReportMetaItem[];
  badgeText?: string;
  bodyHtml: string;
  documentTitle?: string;
}

export function brandedReportStyles(): string {
  return `
    :root {
      --primary: #1a73e8;
      --primary-dark: #1a3a5c;
      --text: #0f1419;
      --text-light: #536471;
      --text-muted: #8899a6;
      --bg: #ffffff;
      --bg-alt: #f7f9fa;
      --border: #e5e7eb;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 20mm 18mm; }
    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px;
      line-height: 1.7;
      color: var(--text);
      background: var(--bg);
      font-size: 13.5px;
      -webkit-font-smoothing: antialiased;
    }

    /* Report header (float-based, html2canvas-safe) */
    .report-header{background:#f0f4f8;color:#0f1419;padding:34px 36px 28px;border-radius:12px;margin-bottom:36px;border:1px solid #e5e7eb;-webkit-print-color-adjust:exact;print-color-adjust:exact;page-break-inside:avoid;break-inside:avoid;page-break-after:avoid;break-after:avoid;}
    .report-header .header-top{overflow:hidden;margin-bottom:22px;}
    .report-header .header-badge{float:right;display:inline-block;background:#fff;border:1px solid #1a73e8;color:#1a73e8;padding:7px 14px;border-radius:6px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;line-height:1;}
    .report-header .logo{font-size:26px;font-weight:700;color:#0f1419;letter-spacing:-.02em;line-height:1.15;margin-bottom:5px;}
    .report-header .logo span{color:#8899a6;}
    .report-header .company-tagline{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#8899a6;font-weight:500;line-height:1.45;}
    .report-header .divider{height:1px;background:#e5e7eb;margin:0 0 18px;clear:both;}
    .report-header .report-title{font-size:22px;font-weight:600;color:#0f1419;margin-bottom:4px;line-height:1.3;}
    .report-header .subtitle{font-size:13px;color:#536471;font-weight:400;margin-bottom:18px;}
    .report-header .meta{font-size:12px;color:#536471;font-weight:400;line-height:1.8;}
    .report-header .meta-item{display:inline-block;background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:5px 12px;margin:0 8px 6px 0;vertical-align:middle;line-height:1;}
    .report-header .meta-ico{display:inline-block;vertical-align:middle;color:#1a73e8;width:14px;height:14px;margin-right:6px;position:relative;top:-1px;}
    .report-header .meta-ico svg{display:inline-block;width:14px;height:14px;vertical-align:middle;}
    .report-header .meta-label{display:inline-block;vertical-align:middle;line-height:1;}

    /* Editorial sections */
    .report-section { margin: 32px 0; }
    .report-section > h2 {
      font-size: 18px;
      font-weight: 700;
      color: #0f1419;
      border-bottom: 2px solid #1a73e8;
      padding-bottom: 8px;
      margin-bottom: 16px;
      letter-spacing: -0.01em;
      page-break-after: avoid;
      break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .report-section > h3 {
      font-size: 15px;
      font-weight: 600;
      color: #1a3a5c;
      margin: 20px 0 10px 0;
      page-break-after: avoid;
      break-after: avoid;
    }
    .rr-eyebrow {
      page-break-after: avoid;
      break-after: avoid;
    }
    .report-section p { margin: 8px 0 12px 0; }
    .report-section ul, .report-section ol { margin: 8px 0 14px 22px; }
    .report-section li { margin: 4px 0; }
    .report-section strong { color: #0f1419; }

    /* Analysis (markdown) block — real title hierarchy */
    .expert-analysis h1,
    .expert-analysis h2 {
      font-size: 18px;
      font-weight: 700;
      color: #0f1419;
      margin: 22px 0 10px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
    }
    .expert-analysis h3 {
      font-size: 14.5px;
      font-weight: 600;
      color: #1a3a5c;
      margin: 18px 0 8px 0;
    }
    .expert-analysis h4 {
      font-size: 13px;
      font-weight: 600;
      color: #1a73e8;
      margin: 14px 0 6px 0;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .expert-analysis p { margin: 8px 0 12px 0; line-height: 1.75; }
    .expert-analysis ul, .expert-analysis ol { margin: 8px 0 14px 24px; }
    .expert-analysis li { margin: 4px 0; }
    .expert-analysis blockquote {
      border-left: 3px solid #1a73e8;
      padding: 4px 14px;
      margin: 12px 0;
      color: #536471;
      background: #f7f9fa;
    }
    .expert-analysis code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      background: #f0f4f8;
      padding: 1px 5px;
      border-radius: 3px;
    }

    /* Verdict / headline callout */
    .headline-callout {
      background: linear-gradient(135deg, #f0f4f8 0%, #ffffff 100%);
      border: 1px solid #e5e7eb;
      border-left: 4px solid #1a73e8;
      padding: 18px 22px;
      border-radius: 6px;
      margin: 18px 0;
    }
    .headline-callout .kpi {
      font-size: 28px;
      font-weight: 700;
      color: #0f1419;
      letter-spacing: -0.02em;
    }
    .headline-callout .kpi-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #8899a6;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .headline-callout .kpi-delta {
      font-size: 13px;
      font-weight: 600;
      margin-left: 10px;
    }
    .headline-callout .kpi-delta.up { color: #059669; }
    .headline-callout .kpi-delta.down { color: #dc2626; }
    .headline-callout .kpi-delta.flat { color: #8899a6; }

    /* Simple citation list */
    .citations-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .citations-list li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px dotted #e5e7eb;
      font-size: 12.5px;
    }
    .citations-list li a {
      color: #1a73e8;
      text-decoration: none;
      word-break: break-all;
    }
    .citations-list li .cite-models {
      color: #8899a6;
      font-size: 11px;
      white-space: nowrap;
    }

    /* Footer */
    .report-footer {
      margin-top: 50px;
      padding-top: 24px;
      border-top: 2px solid var(--border);
      text-align: center;
    }
    .report-footer .logo {
      font-size: 16px;
      font-weight: 700;
      color: #0f1419;
      margin-bottom: 8px;
    }
    .report-footer p { margin: 4px 0; }
    .report-footer .disclaimer {
      margin-top: 16px;
      font-size: 10px;
      color: #8899a6;
      font-weight: 400;
    }

    /* Print / PDF adjustments */
    @media print {
      body {
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .report-header {
        break-after: avoid;
        page-break-after: avoid;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .report-section > h2,
      .report-section > h3,
      .rr-eyebrow {
        break-after: avoid;
        page-break-after: avoid;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .report-footer { break-before: avoid; }
      table { page-break-inside: auto; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }

    /* Shared premium table styles */
    ${premiumTableStyles}
    /* Emoji grids (unused but kept for parity) */
    ${emojiGridStyles}
    /* Technical sheet — legal fine print */
    ${technicalSheetStyles}
  `;
}

export function wrapBrandedReport(input: WrapBrandedReportInput): string {
  const {
    title,
    subtitle = "Informe de Reputación Algorítmica",
    metaItems = [],
    badgeText = "Documento Confidencial",
    bodyHtml,
    documentTitle,
  } = input;

  const metaHtml = metaItems
    .map(
      (m) => {
        const ico = m.iconHtml
          ? `<span class="meta-ico">${m.iconHtml}</span>`
          : m.icon
            ? `${escapeHtml(m.icon)} `
            : "";
        return `<span class="meta-item">${ico}<span class="meta-label">${escapeHtml(m.label)}</span></span>`;
      },
    )
    .join("");

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(documentTitle ?? title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>${brandedReportStyles()}</style>
</head>
<body>
  <style>${brandedReportStyles()}</style>
  <header class="report-header">
    <div class="header-top">
      <span class="header-badge">${escapeHtml(badgeText)}</span>
      <div class="logo">Rep<span>Index</span></div>
      <div class="company-tagline">Inteligencia Reputacional Corporativa</div>
    </div>
    <div class="divider"></div>
    <div class="report-title">${escapeHtml(title)}</div>
    <div class="subtitle">${escapeHtml(subtitle)}</div>
    ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ""}
  </header>

  <main>${bodyHtml}</main>

  <footer class="report-footer">
    <div class="logo">RepIndex</div>
    <p style="font-size: 11px; color: #536471; font-weight: 400; margin: 8px 0;">Inteligencia de Reputación Corporativa</p>
    <p style="font-size: 12px; color: #1a73e8; font-weight: 600; margin: 8px 0;">repindex.ai</p>
    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p class="disclaimer">
        © ${year} RepIndex. Este documento es confidencial y ha sido generado automáticamente.
        Los datos se basan en la medición determinista de los 6 modelos de IA analizados por RepIndex.
        Queda prohibida su reproducción o distribución sin autorización expresa.
      </p>
    </div>
  </footer>
</body>
</html>`;
}

export function escapeHtml(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}