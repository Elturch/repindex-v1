import { Building2, Calendar, Clock, Brain, Database, MessageCircle, Theater } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es, enUS } from "date-fns/locale";

export interface ReportContext {
  company?: string | null;
  sector?: string | null;
  user_question?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  timezone?: string;
  models?: string[];
  sample_size?: number;
  models_count?: number;
  weeks_analyzed?: number;
}

interface ReportInfoBarProps {
  context: ReportContext;
  compact?: boolean;
  languageCode?: string;
}

function formatDate(dateStr: string | null | undefined, lang: string): string {
  if (!dateStr) return "–";
  try {
    const d = parseISO(dateStr);
    return format(d, "d MMM yyyy", { locale: lang === "es" ? es : enUS });
  } catch {
    return dateStr.slice(0, 10);
  }
}

export function ReportInfoBar({ context, compact = false, languageCode = "es" }: ReportInfoBarProps) {
  if (!context) return null;

  const hasDateRange = context.date_from || context.date_to;
  const label = context.company || context.sector || null;
  const hasQuestion = !!context.user_question;
  if (!label && !hasDateRange && !hasQuestion) return null;

  const modelNames = (context.models || []).map(m =>
    m.replace("Google Gemini", "Gemini")
  );

  const periodLabel = languageCode === "en" ? "Period" : "Período";
  const weeksLabel = languageCode === "en" ? "weeks" : "semanas";
  const modelsLabel = languageCode === "en" ? "models" : "modelos";
  const obsLabel = languageCode === "en" ? "observations" : "observaciones";
  const questionLabel = languageCode === "en" ? "Query" : "Consulta";

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/60 bg-muted/40 ${compact ? "px-2.5 py-1.5 text-[10px]" : "px-3 py-2 text-xs"} text-muted-foreground mb-3`}>
      {/* User question */}
      {hasQuestion && (
        <span className="flex items-center gap-1 font-medium text-foreground/80 w-full mb-1">
          <MessageCircle className="h-3 w-3 shrink-0" />
          {questionLabel}: <span className="italic font-normal">{context.user_question}</span>
        </span>
      )}

      {/* Company / Sector */}
      {label && (
        <span className="flex items-center gap-1 font-medium text-foreground/80">
          <Building2 className="h-3 w-3 shrink-0" />
          {label}
        </span>
      )}

      {/* Period */}
      {hasDateRange && (
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          {periodLabel}: {formatDate(context.date_from, languageCode)} – {formatDate(context.date_to, languageCode)}
          {context.timezone && !compact && (
            <span className="opacity-60">({context.timezone.split(" ")[0]})</span>
          )}
        </span>
      )}

      {/* Weeks */}
      {(context.weeks_analyzed ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" />
          {context.weeks_analyzed} {weeksLabel}
        </span>
      )}

      {/* Models */}
      {(context.models_count ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Brain className="h-3 w-3 shrink-0" />
          {context.models_count} {modelsLabel}{!compact && modelNames.length > 0 && `: ${modelNames.join(", ")}`}
        </span>
      )}

      {/* Sample size */}
      {(context.sample_size ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Database className="h-3 w-3 shrink-0" />
          {context.sample_size} {obsLabel}
        </span>
      )}
    </div>
  );
}

/** Generate static HTML for the info bar (used in PDF/HTML export) */
export function generateInfoBarHtml(context: ReportContext | null | undefined, languageCode: string = "es"): string {
  if (!context) return "";
  const label = context.company || context.sector || null;
  const hasDateRange = context.date_from || context.date_to;
  const hasQuestion = !!context.user_question;
  if (!label && !hasDateRange && !hasQuestion) return "";

  const periodLabel = languageCode === "en" ? "Period" : "Período";
  const weeksLabel = languageCode === "en" ? "weeks" : "semanas";
  const modelsLabel = languageCode === "en" ? "models" : "modelos";
  const obsLabel = languageCode === "en" ? "observations" : "observaciones";
  const questionLabel = languageCode === "en" ? "Query" : "Consulta";

  const modelNames = (context.models || []).map(m => m.replace("Google Gemini", "Gemini"));

  const items: string[] = [];

  if (hasQuestion) {
    items.push(`<span style="display:flex;align-items:center;gap:4px;font-weight:600;color:#0f1419;width:100%;margin-bottom:4px;">💬 ${questionLabel}: <span style="font-weight:400;font-style:italic;">${context.user_question}</span></span>`);
  }
  if (label) {
    items.push(`<span style="display:inline-flex;align-items:center;gap:4px;font-weight:600;color:#0f1419;">🏢 ${label}</span>`);
  }
  if (hasDateRange) {
    const from = context.date_from ? context.date_from.slice(0, 10) : "–";
    const to = context.date_to ? context.date_to.slice(0, 10) : "–";
    items.push(`<span>📅 ${periodLabel}: ${from} — ${to}</span>`);
  }
  if ((context.weeks_analyzed ?? 0) > 0) {
    items.push(`<span>🕐 ${context.weeks_analyzed} ${weeksLabel}</span>`);
  }
  if ((context.models_count ?? 0) > 0) {
    items.push(`<span>🧠 ${context.models_count} ${modelsLabel}${modelNames.length > 0 ? ": " + modelNames.join(", ") : ""}</span>`);
  }
  if ((context.sample_size ?? 0) > 0) {
    items.push(`<span>🗄️ ${context.sample_size} ${obsLabel}</span>`);
  }

  return `
    <div style="display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;padding:10px 16px;margin-bottom:24px;border-radius:8px;border:1px solid #e5e7eb;background:#f7f9fa;font-size:12px;color:#536471;line-height:1.6;">
      ${items.join("\n      ")}
    </div>`;
}
