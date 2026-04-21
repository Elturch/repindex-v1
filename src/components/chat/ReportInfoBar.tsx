import { Building2, Calendar, Clock, Brain, Database, MessageCircle, Theater } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es, enUS } from "date-fns/locale";

export interface ReportContext {
  company?: string | null;
  sector?: string | null;
  user_question?: string | null;
  perspective?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  timezone?: string;
  models?: string[];
  sample_size?: number;
  models_count?: number;
  weeks_analyzed?: number;
  // PHASE 1.8b — top-N / bottom-N quantifier metadata
  quantifier_label?: string;
  quantifier_count?: number;
  quantifier_mode?: "top" | "bottom";
  quantifier_total?: number;
  // PHASE 1.9 — A2/A3 metadata
  model_ranking_for_entity?: boolean;
  period_weeks_label?: string;
  requested_weeks_back?: number;
  // PHASE 1.14 — Temporal Window Guard metadata
  temporal_disclaimer?: string | null;
  temporal_window_requested?: { from?: string | null; to?: string | null; label?: string | null } | null;
  temporal_window_real?: { from?: string | null; to?: string | null; n?: number; expected_n?: number } | null;
  temporal_first_available?: string | null;
  temporal_last_available?: string | null;
  temporal_next_snapshot?: string | null;
  temporal_is_open_ended?: boolean;
  // PHASE 1.14c — last sweep day (batch_execution_date), shown as
  // technical metadata next to the canonical "Período" so users can
  // tell apart "evaluated week" (period_from→period_to) from "sweep
  // day" (the Sunday the pipeline ran).
  last_batch_date?: string | null;
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
  // PHASE 1.8e — When a quantifier is active and we have a sector (no company),
  // surface the chip as "Sector: {sector} · {quantifier_label}" to avoid
  // showing the leader company as if it were the entity of analysis.
  const sectorLabel = languageCode === "en" ? "Sector" : "Sector";
  const baseLabel = context.company || context.sector || null;
  const isAggregatedWithQuantifier = !context.company && !!context.sector && !!context.quantifier_label;
  const label = isAggregatedWithQuantifier
    ? `${sectorLabel}: ${context.sector} · ${context.quantifier_label}`
    : baseLabel;
  const hasQuestion = !!context.user_question;
  if (!label && !hasDateRange && !hasQuestion) return null;

  const modelNames = (context.models || []).map(m =>
    m.replace("Google Gemini", "Gemini")
  );

  const periodLabel = languageCode === "en" ? "Period" : "Período";
  const weeksLabel = languageCode === "en" ? "weeks" : "semanas";
  const modelsLabelPlural = languageCode === "en" ? "models" : "modelos";
  const modelsLabelSingular = languageCode === "en" ? "model" : "modelo";
  const modelsLabel = (n: number) => (n === 1 ? modelsLabelSingular : modelsLabelPlural);
  const obsLabel = languageCode === "en" ? "observations" : "observaciones";
  const questionLabel = languageCode === "en" ? "Query" : "Consulta";
  const perspectiveLabel = languageCode === "en" ? "Perspective" : "Perspectiva";

  return (
    <>
      {/* PHASE 1.14 — Temporal Window Guard disclaimer (renders above the InfoBar
         when the requested temporal window doesn't perfectly match the real
         data window — partial coverage, late-onboarded company, YTD with cutoff,
         etc.). Amber/warning style to signal "read me before the headline". */}
      {context.temporal_disclaimer && (
        <div className={`flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 ${compact ? "px-2.5 py-1.5 text-[10px]" : "px-3 py-2 text-xs"} text-amber-900 dark:text-amber-200 mb-2`}>
          <Clock className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="leading-snug">
            <span className="font-semibold mr-1">{languageCode === "en" ? "Temporal window:" : "Ventana temporal:"}</span>
            {context.temporal_disclaimer}
          </span>
        </div>
      )}
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

      {/* Perspective / Role */}
      {context.perspective && (
        <span className="flex items-center gap-1 font-medium text-foreground/80">
          <Theater className="h-3 w-3 shrink-0" />
          {perspectiveLabel}: {context.perspective}
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

      {/* PHASE 1.14c — secondary technical metadata: last sweep day. */}
      {context.last_batch_date && (
        <span className="flex items-center gap-1 opacity-70">
          <Clock className="h-3 w-3 shrink-0" />
          {languageCode === "en" ? "Last sweep" : "Último barrido"}: {formatDate(context.last_batch_date, languageCode)}
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
          {context.models_count} {modelsLabel(context.models_count ?? 0)}{!compact && modelNames.length > 0 && `: ${modelNames.join(", ")}`}
        </span>
      )}

      {/* Sample size */}
      {(context.sample_size ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Database className="h-3 w-3 shrink-0" />
          {context.sample_size} {obsLabel}
        </span>
      )}

      {/* Top-N / Bottom-N quantifier (PHASE 1.8b) */}
      {context.quantifier_label && !isAggregatedWithQuantifier && (
        <span className="flex items-center gap-1 font-medium text-foreground/80">
          <Building2 className="h-3 w-3 shrink-0" />
          {context.quantifier_label}
        </span>
      )}
      </div>
    </>
  );
}

/** Generate static HTML for the info bar (used in PDF/HTML export) */
export function generateInfoBarHtml(context: ReportContext | null | undefined, languageCode: string = "es"): string {
  if (!context) return "";
  const sectorLabel = "Sector";
  const baseLabel = context.company || context.sector || null;
  const isAggregatedWithQuantifier = !context.company && !!context.sector && !!context.quantifier_label;
  const label = isAggregatedWithQuantifier
    ? `${sectorLabel}: ${context.sector} · ${context.quantifier_label}`
    : baseLabel;
  const hasDateRange = context.date_from || context.date_to;
  const hasQuestion = !!context.user_question;
  if (!label && !hasDateRange && !hasQuestion) return "";

  const periodLabel = languageCode === "en" ? "Period" : "Período";
  const weeksLabel = languageCode === "en" ? "weeks" : "semanas";
  const modelsLabelPlural = languageCode === "en" ? "models" : "modelos";
  const modelsLabelSingular = languageCode === "en" ? "model" : "modelo";
  const modelsLabelHtml = (n: number) => (n === 1 ? modelsLabelSingular : modelsLabelPlural);
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
  if (context.perspective) {
    const perspectiveLabel = languageCode === "en" ? "Perspective" : "Perspectiva";
    items.push(`<span style="display:inline-flex;align-items:center;gap:4px;font-weight:600;color:#0f1419;">🎭 ${perspectiveLabel}: ${context.perspective}</span>`);
  }
  if (hasDateRange) {
    const from = context.date_from ? context.date_from.slice(0, 10) : "–";
    const to = context.date_to ? context.date_to.slice(0, 10) : "–";
    items.push(`<span>📅 ${periodLabel}: ${from} — ${to}</span>`);
  }
  if (context.last_batch_date) {
    const lb = context.last_batch_date.slice(0, 10);
    const label = languageCode === "en" ? "Last sweep" : "Último barrido";
    items.push(`<span style="opacity:0.7;">🕐 ${label}: ${lb}</span>`);
  }
  if ((context.weeks_analyzed ?? 0) > 0) {
    items.push(`<span>🕐 ${context.weeks_analyzed} ${weeksLabel}</span>`);
  }
  if ((context.models_count ?? 0) > 0) {
    items.push(`<span>🧠 ${context.models_count} ${modelsLabelHtml(context.models_count ?? 0)}${modelNames.length > 0 ? ": " + modelNames.join(", ") : ""}</span>`);
  }
  if ((context.sample_size ?? 0) > 0) {
    items.push(`<span>🗄️ ${context.sample_size} ${obsLabel}</span>`);
  }
  if (context.quantifier_label && !isAggregatedWithQuantifier) {
    items.push(`<span style="display:inline-flex;align-items:center;gap:4px;font-weight:600;color:#0f1419;">🏢 ${context.quantifier_label}</span>`);
  }

  // PHASE 1.14 — Render the temporal disclaimer above the standard info-bar
  // when present, with an amber/warning style so it reads as a precondition.
  const disclaimerHtml = context.temporal_disclaimer
    ? `<div style="display:flex;align-items:flex-start;gap:6px;padding:8px 12px;margin-bottom:8px;border-radius:8px;border:1px solid #fcd34d;background:#fffbeb;color:#78350f;font-size:12px;line-height:1.5;"><span>⏱️</span><span><strong>${languageCode === "en" ? "Temporal window:" : "Ventana temporal:"}</strong> ${context.temporal_disclaimer}</span></div>`
    : "";
  return `
    ${disclaimerHtml}
    <div style="display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;padding:10px 16px;margin-bottom:24px;border-radius:8px;border:1px solid #e5e7eb;background:#f7f9fa;font-size:12px;color:#536471;line-height:1.6;">
      ${items.join("\n      ")}
    </div>`;
}
