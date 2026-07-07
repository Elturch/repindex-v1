import { marked } from "marked";
import type { ProfileDatapack } from "@/hooks/useProfileDatapack";
import type { ComparisonDatapack } from "@/hooks/useComparisonDatapack";
import type { RankingDatapack } from "@/hooks/useRankingDatapack";
import { generateTechnicalSheetHtml } from "@/lib/technicalSheetHtml";
import {
  wrapBrandedReport,
  escapeHtml,
  type BrandedReportMetaItem,
} from "./brandedReportShell";
import { METRIC_GLOSSARY, type MetricKey } from "./metricGlossary";
import type { AnalysisJson } from "@/components/reports/ExpertAnalysisView";
import type { ConsensusData, ConsensusSeriesPoint } from "@/hooks/useConsensus";

export interface ConsensusForPdf {
  ticker: string;
  name: string;
  data: ConsensusData | null;
  series: ConsensusSeriesPoint[];
}

type Kind = "profile" | "comparison" | "ranking";

export interface BuildDeterministicReportInput {
  kind: Kind;
  datapack: ProfileDatapack | ComparisonDatapack | RankingDatapack;
  analysisMarkdown: string | null;
  analysisJson?: AnalysisJson | null;
  consensus?: ConsensusForPdf[];
  question?: string | null;
}

// ---------- helpers ----------

// Canonical single source of truth — never define metrics locally.
const METRIC_KEYS: readonly MetricKey[] = METRIC_GLOSSARY.map((m) => m.key);
function metricDef(k: MetricKey) {
  return METRIC_GLOSSARY.find((m) => m.key === k)!;
}

function fmtNum(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n as number)) return "—";
  return (n as number).toFixed(dec);
}
function fmtDelta(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n as number)) return "—";
  const v = n as number;
  const s = v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  return s;
}
function deltaClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v as number)) return "flat";
  const n = v as number;
  if (n > 0.05) return "up";
  if (n < -0.05) return "down";
  return "flat";
}
function fmtWeek(w: string | null | undefined): string {
  if (!w) return "—";
  return w;
}
function markdownToHtml(md: string): string {
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(md) as string;
}

// ---------- Expert analysis (JSON → branded HTML) ----------

const EXPERT_STYLES = `
.expert-panel{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#fff;margin:0 0 8px;}
.expert-panel .er-ribbon{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 20px;background:linear-gradient(90deg,#12343f 0%,#20808d 100%);color:#fff;font-family:'DM Sans',sans-serif;}
.expert-panel .er-badge{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;font-weight:600;text-transform:uppercase;padding:4px 9px;background:rgba(255,255,255,.14);border-radius:6px;color:#eafcff;}
.expert-panel .er-title{font-size:13px;font-weight:600;letter-spacing:.02em;}
.expert-panel .er-lock{font-size:11px;font-weight:500;color:#eafcff;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);padding:5px 10px;border-radius:999px;}
.expert-panel .er-body{padding:20px 22px 8px;}
.expert-panel .er-sec{padding:16px 0;border-top:1px solid #f0f4f8;}
.expert-panel .er-sec:first-child{border-top:none;padding-top:2px;}
.expert-panel .er-eyebrow{font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:#20808d;margin-bottom:10px;}
.expert-panel .er-headline{font-size:20px;line-height:1.35;font-weight:700;color:#1a3a5c;letter-spacing:-.01em;}
.expert-panel .er-tldr{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.expert-panel .er-kpi{position:relative;background:#fff;border:1px solid #e5e7eb;border-radius:11px;padding:12px 12px 11px;overflow:hidden;}
.expert-panel .er-kpi::before{content:"";position:absolute;left:0;top:0;right:0;height:3px;background:#1a73e8;}
.expert-panel .er-kpi.t-verde::before{background:#10a37f;} .expert-panel .er-kpi.t-rojo::before{background:#dc2626;} .expert-panel .er-kpi.t-ambar::before{background:#f97316;} .expert-panel .er-kpi.t-azul::before{background:#1a73e8;}
.expert-panel .er-kpi-k{font-size:12px;font-weight:700;color:#0f1419;margin-bottom:4px;}
.expert-panel .er-kpi-t{font-size:12px;color:#536471;line-height:1.5;}
.expert-panel .er-prose p{font-size:13px;color:#0f1419;line-height:1.7;margin:0 0 8px;}
.expert-panel .er-metric{border:1px solid #e5e7eb;border-radius:11px;padding:12px 14px;margin-bottom:10px;background:#fff;}
.expert-panel .er-m-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.expert-panel .er-m-code{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;padding:3px 7px;border-radius:6px;background:#1a3a5c;color:#fff;letter-spacing:.03em;}
.expert-panel .er-m-name{font-size:12.5px;font-weight:700;color:#0f1419;}
.expert-panel .er-m-score{display:flex;align-items:baseline;gap:8px;margin-bottom:6px;}
.expert-panel .er-m-num{font-size:22px;font-weight:700;line-height:1;color:#0f1419;}
.expert-panel .er-m-band{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:6px;background:#f0f4f8;color:#536471;}
.expert-panel .er-m-ctx{font-size:11px;color:#8899a6;}
.expert-panel .er-m-gauge{height:6px;background:#eef2f6;border-radius:999px;overflow:hidden;margin-bottom:8px;}
.expert-panel .er-m-gauge>i{display:block;height:100%;border-radius:999px;background:#1a73e8;}
.expert-panel .er-m-desc{font-size:12px;color:#536471;line-height:1.55;}
.expert-panel .b-green .er-m-num,.expert-panel .b-green .er-m-band{color:#10a37f;} .expert-panel .b-green .er-m-band{background:#ecfdf5;} .expert-panel .b-green .er-m-gauge>i{background:#10a37f;}
.expert-panel .b-blue .er-m-num,.expert-panel .b-blue .er-m-band{color:#1a73e8;} .expert-panel .b-blue .er-m-band{background:#eff6ff;} .expert-panel .b-blue .er-m-gauge>i{background:#1a73e8;}
.expert-panel .b-amber .er-m-num,.expert-panel .b-amber .er-m-band{color:#f97316;} .expert-panel .b-amber .er-m-band{background:#fff7ed;} .expert-panel .b-amber .er-m-gauge>i{background:#f97316;}
.expert-panel .b-red .er-m-num,.expert-panel .b-red .er-m-band{color:#dc2626;} .expert-panel .b-red .er-m-band{background:#fef2f2;} .expert-panel .b-red .er-m-gauge>i{background:#dc2626;}
.expert-panel .er-ro{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.expert-panel .er-ro h4{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;margin-bottom:10px;}
.expert-panel .er-ro .risk h4{color:#dc2626;} .expert-panel .er-ro .opp h4{color:#10a37f;}
.expert-panel .er-item{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff;font-size:12px;color:#0f1419;line-height:1.55;}
.expert-panel .er-ro .risk .er-item{border-left:3px solid #dc2626;} .expert-panel .er-ro .opp .er-item{border-left:3px solid #10a37f;}
.expert-panel .er-recs{display:flex;flex-direction:column;gap:10px;}
.expert-panel .er-rec{display:grid;grid-template-columns:36px 1fr;gap:12px;align-items:start;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;background:#fff;}
.expert-panel .er-rec.p1{background:linear-gradient(120deg,#eff6ff,#fff);border-color:#bfdbfe;}
.expert-panel .er-rec-n{width:36px;height:36px;border-radius:9px;background:#1a3a5c;color:#fff;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:16px;}
.expert-panel .er-rec.p1 .er-rec-n{background:#1a73e8;}
.expert-panel .er-rec-title{font-size:13.5px;font-weight:700;color:#0f1419;margin-bottom:6px;line-height:1.35;}
.expert-panel .er-rec-why{display:flex;gap:8px;padding:8px 11px;background:#f7f9fa;border-left:3px solid #20808d;border-radius:0 8px 8px 0;}
.expert-panel .er-rec-why b{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#20808d;padding-top:1px;white-space:nowrap;}
.expert-panel .er-rec-why span{font-size:12px;color:#536471;line-height:1.5;}

/* Consensus */
.consensus-panel{border:1px solid #e5e7eb;border-radius:14px;padding:20px 22px;background:#fff;}
.consensus-panel .co-card{border:1px solid #e5e7eb;border-radius:11px;padding:14px 16px;margin-bottom:12px;background:#fff;}
.consensus-panel .co-card:last-child{margin-bottom:0;}
.consensus-panel .co-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:8px;}
.consensus-panel .co-name{font-size:14px;font-weight:700;color:#0f1419;}
.consensus-panel .co-ticker{font-size:11px;color:#8899a6;font-family:'JetBrains Mono',monospace;}
.consensus-panel .co-val{font-size:26px;font-weight:700;color:#0f1419;line-height:1;}
.consensus-panel .co-val small{font-size:11px;color:#8899a6;margin-left:4px;font-weight:400;}
.consensus-panel .co-lvl{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:3px 9px;border-radius:6px;border:1px solid transparent;}
.consensus-panel .lvl-unanime{color:#10a37f;background:#ecfdf5;border-color:rgba(16,163,127,.35);}
.consensus-panel .lvl-fuerte{color:#1a73e8;background:#eff6ff;border-color:rgba(26,115,232,.35);}
.consensus-panel .lvl-debil{color:#f97316;background:#fff7ed;border-color:rgba(249,115,22,.35);}
.consensus-panel .lvl-disperso{color:#dc2626;background:#fef2f2;border-color:rgba(220,38,38,.35);}
.consensus-panel .co-gauge{height:6px;background:#eef2f6;border-radius:999px;overflow:hidden;margin:6px 0 10px;}
.consensus-panel .co-gauge>i{display:block;height:100%;border-radius:999px;}
.consensus-panel .co-meta{font-size:11px;color:#8899a6;margin-bottom:8px;}
.consensus-panel .co-blk{margin-top:10px;}
.consensus-panel .co-blk h5{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#8899a6;margin-bottom:6px;}
.consensus-panel .co-chips{display:flex;flex-wrap:wrap;gap:6px;}
.consensus-panel .co-chip{font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid rgba(26,115,232,.3);background:#eff6ff;color:#0f1419;}
.consensus-panel .co-chip .n{color:#1a73e8;font-family:'JetBrains Mono',monospace;font-weight:600;margin-left:4px;}
.consensus-panel .co-list{list-style:none;padding:0;margin:0;}
.consensus-panel .co-list li{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:6px;font-size:12px;color:#0f1419;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;}
.consensus-panel .co-list li .m{font-size:10.5px;color:#8899a6;white-space:nowrap;}
.consensus-panel .co-badge{display:inline-block;font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:5px;margin-left:6px;}
.consensus-panel .co-badge.ok{background:#ecfdf5;color:#10a37f;border:1px solid rgba(16,163,127,.35);}
.consensus-panel .co-badge.ko{background:#fff7ed;color:#f97316;border:1px solid rgba(249,115,22,.35);}
.consensus-panel .co-spark{margin:6px 0 4px;}
`;

// ---------- Deterministic block styles (print-safe, same design language) ----------
const DET_STYLES = `
.det-headline{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #e5e7eb;border-left:4px solid #1a73e8;background:linear-gradient(135deg,#f0f4f8 0%,#ffffff 60%);border-radius:10px;padding:14px 18px;margin:0 0 14px;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.det-headline .h-l{min-width:0;}
.det-headline .h-eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#8899a6;margin-bottom:4px;}
.det-headline .h-val{font-size:34px;font-weight:700;color:#0f1419;line-height:1;letter-spacing:-.02em;}
.det-headline .h-delta{font-size:13px;font-weight:600;margin-left:10px;}
.det-headline .h-delta.up{color:#10a37f;} .det-headline .h-delta.down{color:#dc2626;} .det-headline .h-delta.flat{color:#8899a6;}
.det-headline .h-r{text-align:right;font-size:12px;color:#536471;}
.det-headline .h-rank{font-size:20px;font-weight:700;color:#1a3a5c;}

.det-metrics{display:block;}
.det-metric{border:1px solid #e5e7eb;border-radius:11px;padding:12px 14px;margin-bottom:10px;background:#fff;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.det-metric .dm-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.det-metric .dm-code{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;padding:3px 7px;border-radius:6px;background:#1a3a5c;color:#fff;letter-spacing:.03em;}
.det-metric .dm-name{font-size:12.5px;font-weight:700;color:#0f1419;}
.det-metric .dm-desc{font-size:11.5px;color:#8899a6;margin-left:auto;max-width:55%;text-align:right;line-height:1.35;}
.det-metric .dm-row{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;}
.det-metric .dm-val{font-size:22px;font-weight:700;line-height:1;color:#0f1419;min-width:52px;text-align:right;}
.det-metric .dm-bar-wrap{position:relative;height:10px;}
.det-metric .dm-bar{position:absolute;inset:0;height:10px;background:#eef2f6;border-radius:999px;overflow:hidden;}
.det-metric .dm-bar>i{display:block;height:100%;border-radius:999px;background:#1a73e8;}
.det-metric .dm-mark{position:absolute;top:-3px;bottom:-3px;width:2px;background:#0f1419;border-radius:2px;}
.det-metric .dm-mark::after{content:"";position:absolute;left:50%;top:-4px;transform:translateX(-50%);width:6px;height:6px;background:#0f1419;border-radius:50%;}
.det-metric .dm-diff{font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;min-width:56px;text-align:right;}
.det-metric .dm-diff.up{color:#10a37f;} .det-metric .dm-diff.down{color:#dc2626;} .det-metric .dm-diff.flat{color:#8899a6;}
.det-metric .dm-scale{display:flex;justify-content:space-between;font-size:9.5px;color:#8899a6;font-family:'JetBrains Mono',monospace;margin-top:4px;letter-spacing:.06em;}
.det-metric .dm-legend{font-size:10.5px;color:#8899a6;margin-top:6px;}
.det-metric .dm-legend b{color:#0f1419;font-family:'JetBrains Mono',monospace;font-weight:600;}
.det-metric.b-green .dm-bar>i{background:#10a37f;} .det-metric.b-green .dm-val{color:#10a37f;}
.det-metric.b-blue .dm-bar>i{background:#1a73e8;}   .det-metric.b-blue .dm-val{color:#1a73e8;}
.det-metric.b-amber .dm-bar>i{background:#f97316;}  .det-metric.b-amber .dm-val{color:#f97316;}
.det-metric.b-red .dm-bar>i{background:#dc2626;}    .det-metric.b-red .dm-val{color:#dc2626;}

/* Divergence per-model horizontal bars */
.det-div{border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fff;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.det-div .dv-row{display:grid;grid-template-columns:110px 1fr 44px;gap:10px;align-items:center;padding:7px 0;border-top:1px solid #f0f4f8;}
.det-div .dv-row:first-child{border-top:none;}
.det-div .dv-name{font-size:12px;font-weight:600;color:#0f1419;}
.det-div .dv-bar{position:relative;height:9px;background:#eef2f6;border-radius:999px;overflow:hidden;}
.det-div .dv-bar>i{display:block;height:100%;border-radius:999px;background:#1a73e8;}
.det-div .dv-val{font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;color:#0f1419;text-align:right;}
.det-div .dv-row.max .dv-bar>i{background:#10a37f;} .det-div .dv-row.max .dv-val{color:#10a37f;}
.det-div .dv-row.min .dv-bar>i{background:#dc2626;} .det-div .dv-row.min .dv-val{color:#dc2626;}
.det-div .dv-foot{margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11.5px;color:#536471;}
.det-div .dv-foot b{color:#f97316;font-family:'JetBrains Mono',monospace;}

/* Evolution sparkline */
.det-evo{border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fff;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.det-evo svg{display:block;width:100%;height:auto;}
.det-evo .ev-legend{display:flex;justify-content:space-between;font-size:10.5px;color:#8899a6;font-family:'JetBrains Mono',monospace;margin-top:6px;letter-spacing:.06em;}

/* Citations grid grouped by domain */
.det-cites{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
.det-cite{border:1px solid #e5e7eb;border-radius:10px;padding:9px 12px;background:#fff;page-break-inside:avoid;}
.det-cite .dc-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:3px;}
.det-cite .dc-dom{font-size:12px;font-weight:700;color:#0f1419;word-break:break-word;}
.det-cite .dc-n{font-size:10.5px;font-weight:600;font-family:'JetBrains Mono',monospace;color:#1a73e8;background:#eff6ff;border:1px solid rgba(26,115,232,.25);padding:1px 6px;border-radius:5px;white-space:nowrap;}
.det-cite .dc-mods{font-size:10.5px;color:#8899a6;line-height:1.4;}
`;

// ---------- Inline SVG icons (print-safe, replace emoji) ----------
const IC_CAL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const IC_BOT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 14h.01M15 14h.01M2 14h2M20 14h2"/></svg>';
const IC_CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

// ---------- Deterministic block renderers ----------
function renderMetricGauge(opts: {
  code: string;
  name: string;
  what: string;
  mine: number | null;
  avg: number | null;
  na?: boolean;
  entityLabel: string;
  avgLabel: string;
}): string {
  const { code, name, what, mine, avg, entityLabel, avgLabel } = opts;
  const na = opts.na || mine === null || mine === undefined || !Number.isFinite(mine);
  const v = na ? 0 : (mine as number);
  const band = na ? "" : bandOf(v);
  const width = na ? 0 : Math.max(0, Math.min(100, v));
  const diff =
    !na && avg !== null && avg !== undefined && Number.isFinite(avg)
      ? v - (avg as number)
      : null;
  const diffCls = diff === null ? "flat" : diff > 0.05 ? "up" : diff < -0.05 ? "down" : "flat";
  const diffTxt = diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`;
  const markPct =
    avg !== null && avg !== undefined && Number.isFinite(avg)
      ? Math.max(0, Math.min(100, avg as number))
      : null;
  return `<div class="det-metric ${band}">
    <div class="dm-head">
      <span class="dm-code">${escapeHtml(code)}</span>
      <span class="dm-name">${escapeHtml(name)}</span>
      <span class="dm-desc">${escapeHtml(what)}</span>
    </div>
    <div class="dm-row">
      <div class="dm-val">${na ? "N/A" : Math.round(v)}</div>
      <div class="dm-bar-wrap">
        <div class="dm-bar"><i style="width:${width}%;"></i></div>
        ${markPct !== null ? `<div class="dm-mark" style="left:${markPct}%;" title="Media del sector"></div>` : ""}
      </div>
      <div class="dm-diff ${diffCls}">${diffTxt}</div>
    </div>
    <div class="dm-scale"><span>0</span><span>50</span><span>100</span></div>
    <div class="dm-legend">
      <b>${escapeHtml(entityLabel)}</b> ${na ? "sin dato" : Math.round(v)} ·
      marcador negro = media <b>${escapeHtml(avgLabel)}</b>
      ${avg !== null && avg !== undefined && Number.isFinite(avg) ? Math.round(avg as number) : "—"}
    </div>
  </div>`;
}

function renderDivergenceBars(
  permodel: { model: string; rix: number }[],
): string {
  const vals = permodel.map((p) => p.rix).filter((v) => Number.isFinite(v));
  if (!vals.length) return "";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  const sorted = [...permodel].sort((a, b) => (b.rix ?? 0) - (a.rix ?? 0));
  const rows = sorted
    .map((p) => {
      const v = Number.isFinite(p.rix) ? Math.max(0, Math.min(100, p.rix)) : 0;
      const cls =
        p.rix === max && range > 0.5 ? " max" : p.rix === min && range > 0.5 ? " min" : "";
      return `<div class="dv-row${cls}">
        <div class="dv-name">${escapeHtml(p.model)}</div>
        <div class="dv-bar"><i style="width:${v}%;"></i></div>
        <div class="dv-val">${Number.isFinite(p.rix) ? Math.round(p.rix) : "—"}</div>
      </div>`;
    })
    .join("");
  return `<div class="det-div">
    ${rows}
    <div class="dv-foot">
      <span>Rango entre máximo y mínimo</span>
      <span><b>${range.toFixed(1)}</b> puntos</span>
    </div>
  </div>`;
}

function renderEvolutionSpark(
  evolution: { week: string; rixc: number }[],
): string {
  const pts = evolution
    .slice()
    .sort((a, b) => a.week.localeCompare(b.week))
    .filter((r) => Number.isFinite(r.rixc));
  if (pts.length < 2) return "";
  const W = 720;
  const H = 160;
  const PL = 34, PR = 12, PT = 12, PB = 22;
  const vals = pts.map((p) => p.rixc);
  let vMin = Math.min(...vals);
  let vMax = Math.max(...vals);
  const pad = Math.max(2, (vMax - vMin) * 0.15);
  vMin = Math.max(0, vMin - pad);
  vMax = Math.min(100, vMax + pad);
  if (vMax - vMin < 4) { vMax = Math.min(100, vMax + 2); vMin = Math.max(0, vMin - 2); }
  const xFor = (i: number) => PL + (i * (W - PL - PR)) / (pts.length - 1);
  const yFor = (v: number) => PT + (H - PT - PB) * (1 - (v - vMin) / (vMax - vMin));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.rixc).toFixed(1)}`).join(" ");
  const areaD = `${d} L${xFor(pts.length - 1).toFixed(1)},${(H - PB).toFixed(1)} L${xFor(0).toFixed(1)},${(H - PB).toFixed(1)} Z`;
  const dots = pts
    .map((p, i) => `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(p.rixc).toFixed(1)}" r="2.4" fill="#1a73e8" />`)
    .join("");
  const yTicks = 4;
  const gridLines: string[] = [];
  const yLabels: string[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = vMin + ((vMax - vMin) * i) / yTicks;
    const y = yFor(v);
    gridLines.push(`<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="#eef2f6" stroke-width="1" />`);
    yLabels.push(`<text x="${PL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#8899a6" font-family="JetBrains Mono,monospace">${v.toFixed(0)}</text>`);
  }
  const xLabelIdx = pts.length <= 8 ? pts.map((_, i) => i) : [0, Math.floor(pts.length / 4), Math.floor(pts.length / 2), Math.floor((pts.length * 3) / 4), pts.length - 1];
  const xLabels = xLabelIdx
    .map((i) => {
      const w = pts[i].week;
      const short = w.length >= 10 ? w.slice(5) : w;
      return `<text x="${xFor(i).toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="middle" font-size="9" fill="#8899a6" font-family="JetBrains Mono,monospace">${escapeHtml(short)}</text>`;
    })
    .join("");
  return `<div class="det-evo">
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${gridLines.join("")}
      <path d="${areaD}" fill="rgba(26,115,232,0.10)" />
      <path d="${d}" fill="none" stroke="#1a73e8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${yLabels.join("")}
      ${xLabels}
    </svg>
    <div class="ev-legend">
      <span>${escapeHtml(pts[0].week)}</span>
      <span>${pts.length} semanas · RIXc</span>
      <span>${escapeHtml(pts[pts.length - 1].week)}</span>
    </div>
  </div>`;
}

function renderCitationsGrid(
  items: { url: string; domain: string; models: string[] }[],
): string {
  if (!items || !items.length) return "";
  const byDom = new Map<string, { count: number; models: Set<string> }>();
  for (const it of items) {
    const dom = it.domain || (() => {
      try { return new URL(it.url).hostname.replace(/^www\./, ""); } catch { return it.url; }
    })();
    if (!byDom.has(dom)) byDom.set(dom, { count: 0, models: new Set() });
    const bucket = byDom.get(dom)!;
    bucket.count += 1;
    (it.models || []).forEach((m) => bucket.models.add(m));
  }
  const rows = Array.from(byDom.entries())
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(
      ([dom, info]) => `<div class="det-cite">
        <div class="dc-head">
          <div class="dc-dom">${escapeHtml(dom)}</div>
          <span class="dc-n">${info.count}</span>
        </div>
        <div class="dc-mods">${escapeHtml(Array.from(info.models).join(" · ") || "—")}</div>
      </div>`,
    )
    .join("");
  return `<div class="det-cites">${rows}</div>`;
}

const LEVEL_LABEL: Record<string, string> = {
  unanime: "Unánime",
  fuerte: "Fuerte",
  debil: "Débil",
  disperso: "Disperso",
};
const LEVEL_BAR: Record<string, string> = {
  unanime: "#10a37f",
  fuerte: "#1a73e8",
  debil: "#f97316",
  disperso: "#dc2626",
};

function bandOf(v: number): "b-green" | "b-blue" | "b-amber" | "b-red" {
  if (v >= 80) return "b-green";
  if (v >= 60) return "b-blue";
  if (v >= 40) return "b-amber";
  return "b-red";
}
function bandLbl(v: number): string {
  if (v >= 80) return "Fuerte";
  if (v >= 60) return "Sólido";
  if (v >= 40) return "Atención";
  return "Crítico";
}

function inlineBold(text: string): string {
  const esc = escapeHtml(text);
  return esc.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
}

function renderExpertJson(json: AnalysisJson): string {
  const parts: string[] = [];
  if (json.titular) {
    parts.push(`
      <div class="er-sec">
        <div class="er-eyebrow">Titular ejecutivo</div>
        <div class="er-headline">${inlineBold(json.titular)}</div>
      </div>`);
  }
  if (json.esencial && json.esencial.length) {
    const cards = json.esencial
      .map(
        (it) => `
        <div class="er-kpi t-${escapeHtml(it.tono ?? "azul")}">
          ${it.etiqueta ? `<div class="er-kpi-k">${escapeHtml(it.etiqueta)}</div>` : ""}
          <div class="er-kpi-t">${inlineBold(it.texto)}</div>
        </div>`,
      )
      .join("");
    parts.push(`
      <div class="er-sec">
        <div class="er-eyebrow">Lo esencial en 20 segundos</div>
        <div class="er-tldr">${cards}</div>
      </div>`);
  }
  if (json.que_pasa && json.que_pasa.length) {
    parts.push(`
      <div class="er-sec">
        <div class="er-eyebrow">Qué está pasando y por qué</div>
        <div class="er-prose">${json.que_pasa.map((p) => `<p>${inlineBold(p)}</p>`).join("")}</div>
      </div>`);
  }
  if (json.metricas && json.metricas.length) {
    const rows = json.metricas
      .map((m) => {
        const na = m.valor == null || !Number.isFinite(m.valor as number);
        const v = na ? 0 : (m.valor as number);
        const band = na ? "" : bandOf(v);
        const width = na ? 100 : Math.max(0, Math.min(100, v));
        return `
          <div class="er-metric ${band}">
            <div class="er-m-head">
              <span class="er-m-code">${escapeHtml(m.code)}</span>
              <span class="er-m-name">${escapeHtml(m.nombre ?? m.code)}</span>
            </div>
            <div class="er-m-score">
              <span class="er-m-num">${na ? "N/A" : Math.round(v)}</span>
              <span class="er-m-band">${na ? "No aplica" : bandLbl(v)}</span>
              ${m.contexto && !na ? `<span class="er-m-ctx">${escapeHtml(m.contexto)}</span>` : ""}
            </div>
            <div class="er-m-gauge"><i style="width:${width}%;"></i></div>
            ${m.texto ? `<div class="er-m-desc">${inlineBold(m.texto)}</div>` : ""}
          </div>`;
      })
      .join("");
    parts.push(`
      <div class="er-sec">
        <div class="er-eyebrow">Lectura por métrica</div>
        ${rows}
      </div>`);
  }
  if ((json.riesgos && json.riesgos.length) || (json.oportunidades && json.oportunidades.length)) {
    const risks = (json.riesgos ?? []).map((r) => `<div class="er-item">${inlineBold(r)}</div>`).join("");
    const opps = (json.oportunidades ?? []).map((o) => `<div class="er-item">${inlineBold(o)}</div>`).join("");
    parts.push(`
      <div class="er-sec">
        <div class="er-eyebrow">Riesgos y oportunidades</div>
        <div class="er-ro">
          <div class="risk"><h4>Riesgos</h4>${risks || '<div style="font-size:12px;color:#8899a6;">Sin riesgos destacados.</div>'}</div>
          <div class="opp"><h4>Oportunidades</h4>${opps || '<div style="font-size:12px;color:#8899a6;">Sin oportunidades destacadas.</div>'}</div>
        </div>
      </div>`);
  }
  if (json.recomendaciones && json.recomendaciones.length) {
    const cards = json.recomendaciones
      .map(
        (it, i) => `
        <div class="er-rec${i === 0 ? " p1" : ""}">
          <div class="er-rec-n">${i + 1}</div>
          <div>
            <div class="er-rec-title">${inlineBold(it.accion)}</div>
            ${it.porque ? `<div class="er-rec-why"><b>Por qué</b><span>${inlineBold(it.porque)}</span></div>` : ""}
          </div>
        </div>`,
      )
      .join("");
    parts.push(`
      <div class="er-sec">
        <div class="er-eyebrow">Recomendaciones priorizadas</div>
        <div class="er-recs">${cards}</div>
      </div>`);
  }
  return `
    <div class="expert-panel">
      <div class="er-ribbon">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="er-badge">Agente Rix</span>
          <span class="er-title">Análisis del experto · Agente Rix</span>
        </div>
        <span class="er-lock">Universo cerrado · sin fuentes externas</span>
      </div>
      <div class="er-body">${parts.join("")}</div>
    </div>`;
}

function buildExpertSection(
  json: AnalysisJson | null | undefined,
  md: string | null,
): string {
  const inner = json
    ? renderExpertJson(json)
    : md
      ? `<div class="expert-analysis">${markdownToHtml(md)}</div>`
      : `<p style="color:#536471;font-style:italic;">Análisis no disponible en el momento de la exportación.</p>`;
  return `<section class="report-section">
      <h2>Análisis del experto</h2>
      ${inner}
    </section>`;
}

// Consensus block for PDF
function sparklineSvg(series: { week: string; consenso: number }[]): string {
  if (!series || series.length < 2) return "";
  const W = 320;
  const H = 44;
  const P = 4;
  const xs = series.map((_, i) => P + (i * (W - P * 2)) / (series.length - 1));
  const ys = series.map((s) => {
    const v = Math.max(0, Math.min(100, s.consenso));
    return H - P - (v / 100) * (H - P * 2);
  });
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const dots = xs
    .map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="2" fill="#1a73e8" />`)
    .join("");
  return `<svg class="co-spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#e5e7eb" stroke-dasharray="3 3" />
    <path d="${d}" fill="none" stroke="#1a73e8" stroke-width="1.8" />
    ${dots}
  </svg>`;
}

function renderConsensusCard(c: ConsensusForPdf): string {
  const d = c.data;
  if (!d) {
    return `<div class="co-card">
      <div class="co-head"><div><div class="co-name">${escapeHtml(c.name)}</div><div class="co-ticker">${escapeHtml(c.ticker)}</div></div></div>
      <div style="font-size:12px;color:#8899a6;font-style:italic;">Consenso no disponible esta semana.</div>
    </div>`;
  }
  const value = Math.max(0, Math.min(100, Math.round(d.consenso)));
  const lvl = String(d.level);
  const barColor = LEVEL_BAR[lvl] ?? "#8899a6";
  const lvlLabel = LEVEL_LABEL[lvl] ?? lvl;
  const core = (d.core ?? [])
    .map(
      (c2) =>
        `<span class="co-chip">${escapeHtml(c2.theme)}<span class="n">${c2.coverage}/${d.models_count}</span></span>`,
    )
    .join("");
  const shared = (d.shared_events ?? [])
    .map(
      (ev) => `<li>
        <div style="min-width:0;">
          <div>${escapeHtml(ev.label)}</div>
          ${ev.theme ? `<div style="font-size:10.5px;color:#8899a6;margin-top:2px;">${escapeHtml(ev.theme)}</div>` : ""}
        </div>
        <span class="m">${escapeHtml((ev.models ?? []).join(", "))}</span>
      </li>`,
    )
    .join("");
  const blind = (d.blind_spots ?? [])
    .map((bs) => {
      const ok = bs.corroboration === "corroborado";
      const badge = `<span class="co-badge ${ok ? "ok" : "ko"}">${ok ? "corroborado" : "no verificado"}</span>`;
      return `<li>
        <div style="min-width:0;">
          <div>${escapeHtml(bs.label)} ${badge}</div>
          ${bs.theme ? `<div style="font-size:10.5px;color:#8899a6;margin-top:2px;">${escapeHtml(bs.theme)}</div>` : ""}
        </div>
        <span class="m">${escapeHtml(bs.model)}</span>
      </li>`;
    })
    .join("");
  const spark = c.series && c.series.length >= 2 ? sparklineSvg(c.series) : "";

  return `<div class="co-card">
    <div class="co-head">
      <div><div class="co-name">${escapeHtml(c.name)}</div><div class="co-ticker">${escapeHtml(c.ticker)}</div></div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="co-val">${value}<small>/100</small></div>
        <span class="co-lvl lvl-${escapeHtml(lvl)}">${escapeHtml(lvlLabel)}</span>
      </div>
    </div>
    <div class="co-gauge"><i style="width:${value}%;background:${barColor};"></i></div>
    <div class="co-meta">Dispersión ${d.dispersion} pts · ${d.distinct_themes} temas · ${d.models_count} IAs</div>
    ${core ? `<div class="co-blk"><h5>Núcleo de coincidencia</h5><div class="co-chips">${core}</div></div>` : ""}
    ${shared ? `<div class="co-blk"><h5>Hechos compartidos</h5><ul class="co-list">${shared}</ul></div>` : ""}
    ${blind ? `<div class="co-blk"><h5>Puntos ciegos</h5><ul class="co-list">${blind}</ul></div>` : ""}
    ${spark ? `<div class="co-blk"><h5>Evolución del consenso</h5>${spark}</div>` : ""}
  </div>`;
}

function buildConsensusSection(consensus: ConsensusForPdf[] | undefined): string {
  if (!consensus || consensus.length === 0) return "";
  const cards = consensus.map(renderConsensusCard).join("");
  return `<section class="report-section">
    <h2>Consenso de las IAs</h2>
    <p style="font-size:12px;color:#536471;margin-bottom:10px;">En qué grado las 6 IAs coinciden temáticamente sobre cada empresa esta semana. No es una media de notas.</p>
    <div class="consensus-panel">${cards}</div>
  </section>`;
}

// ---------- PROFILE ----------

function buildProfileBody(
  dp: ProfileDatapack,
  analysisMarkdown: string | null,
  analysisJson: AnalysisJson | null | undefined,
  consensus: ConsensusForPdf[] | undefined,
): string {
  const { entity, snapshot, sector, permodel, evolution } = dp;
  const citations = dp.citations ?? { total_sources: 0, items: [] };
  const delta = snapshot.rixc - (snapshot.rixc_prev ?? snapshot.rixc);

  const analysisSection = buildExpertSection(analysisJson, analysisMarkdown);

  // Headline
  const rankLine = sector.size
    ? `#<span class="h-rank">${sector.rank}</span> <span style="color:#8899a6;">de ${sector.size}</span><br/><span style="font-size:11px;">${escapeHtml(sector.name || entity.sector || "su sector")}</span>`
    : "—";
  const headline = `
    <div class="det-headline">
      <div class="h-l">
        <div class="h-eyebrow">RIXc · semana ${escapeHtml(fmtWeek(dp.latest_week))}</div>
        <div>
          <span class="h-val">${fmtNum(snapshot.rixc, 1)}</span>
          <span class="h-delta ${deltaClass(delta)}">${fmtDelta(delta)}</span>
        </div>
      </div>
      <div class="h-r">${rankLine}</div>
    </div>`;

  // Sector comparison — gauge cards for the 8 metrics + RIXc
  const metricCards = METRIC_KEYS.map((k) => {
    const info = metricDef(k);
    const mine = (snapshot as any)[k] as number | null;
    const avg = (sector as any)[`avg_${k}`] as number | null;
    return renderMetricGauge({
      code: info.code,
      name: info.name,
      what: info.what,
      mine,
      avg,
      entityLabel: entity.name,
      avgLabel: sector.name || entity.sector || "sector",
    });
  }).join("");

  const sectorTable = `
    <section class="report-section">
      <h2>La empresa frente a su sector</h2>
      ${headline}
      <div class="det-metrics">${metricCards}</div>
    </section>`;

  // Divergence — horizontal bar per model
  const divergence = `
    <section class="report-section">
      <h2>Divergencia entre los 6 modelos</h2>
      <p style="font-size:12px;color:#536471;margin-bottom:10px;">Cada IA responde con su propia lectura. Verde = máximo · rojo = mínimo.</p>
      ${renderDivergenceBars(permodel)}
    </section>`;

  // Evolution sparkline
  const evoSection = evolution.length >= 2
    ? `<section class="report-section">
        <h2>Evolución semanal del RIXc</h2>
        ${renderEvolutionSpark(evolution)}
      </section>`
    : "";

  // Citations grid
  const citeItems = citations.items || [];
  const citeSection = citeItems.length
    ? `<section class="report-section">
        <h2>Menciones y fuentes citadas</h2>
        <p style="font-size:12px;color:#536471;margin-bottom:10px;">${citeItems.length} fuentes citadas por los modelos, agrupadas por dominio.</p>
        ${renderCitationsGrid(citeItems)}
      </section>`
    : "";

  const consensusSection = buildConsensusSection(consensus);

  return [
    analysisSection,
    sectorTable,
    divergence,
    evoSection,
    citeSection,
    consensusSection,
    generateTechnicalSheetHtml(),
  ].join("\n");
}

// ---------- COMPARISON ----------

function buildComparisonBody(
  dp: ComparisonDatapack,
  analysisMarkdown: string | null,
  analysisJson: AnalysisJson | null | undefined,
  consensus: ConsensusForPdf[] | undefined,
): string {
  const { entities, snapshot, permodel, evolution, citations } = dp;
  const ranked = [...snapshot].sort((a, b) => (b.rixc ?? 0) - (a.rixc ?? 0));

  const analysisSection = buildExpertSection(analysisJson, analysisMarkdown);

  // Ranking table
  const rankingRows = ranked
    .map((r, i) => {
      const d = (r.rixc ?? 0) - (r.rixc_prev ?? r.rixc ?? 0);
      return `<tr>
        <td style="text-align:center;font-weight:700;color:#1a73e8;">#${i + 1}</td>
        <td><strong>${escapeHtml(r.name)}</strong> <span style="color:#8899a6;">${escapeHtml(r.tk)}</span></td>
        <td style="text-align:right;font-weight:600;">${fmtNum(r.rixc)}</td>
        <td style="text-align:right;color:${
          d > 0.05 ? "#059669" : d < -0.05 ? "#dc2626" : "#8899a6"
        };font-weight:600;">${fmtDelta(d)}</td>
      </tr>`;
    })
    .join("");
  const rankingTable = `
    <section class="report-section">
      <h2>Marcador semanal</h2>
      <table>
        <thead>
          <tr>
            <th style="text-align:center;">Posición</th>
            <th>Empresa</th>
            <th style="text-align:right;">RIXc</th>
            <th style="text-align:right;">Δ semana</th>
          </tr>
        </thead>
        <tbody>${rankingRows}</tbody>
      </table>
    </section>`;

  // 8 metrics per company
  const headTks = ranked
    .map((r) => `<th style="text-align:right;">${escapeHtml(r.tk)}</th>`)
    .join("");
  const metricsBody = METRIC_KEYS.map((k) => {
    const info = metricDef(k);
    const cells = ranked
      .map(
        (r) =>
          `<td style="text-align:right;">${fmtNum((r as any)[k] as number | null)}</td>`,
      )
      .join("");
    return `<tr>
      <td><strong>${info.code}</strong> · ${escapeHtml(info.name)}</td>
      ${cells}
    </tr>`;
  }).join("");
  const metricsTable = `
    <section class="report-section">
      <h2>Las 8 métricas RIX, empresa a empresa</h2>
      <table>
        <thead>
          <tr><th>Métrica</th>${headTks}</tr>
        </thead>
        <tbody>${metricsBody}</tbody>
      </table>
    </section>`;

  // Divergence (models × tickers + range)
  const modelSet = Array.from(new Set(permodel.map((p) => p.model)));
  const byPair = new Map<string, number>();
  permodel.forEach((p) => byPair.set(`${p.model}|${p.tk}`, p.rix));
  const divRows = modelSet
    .map((model) => {
      const vals: number[] = [];
      const cells = ranked
        .map((r) => {
          const v = byPair.get(`${model}|${r.tk}`);
          if (typeof v === "number") vals.push(v);
          return `<td style="text-align:right;">${fmtNum(v ?? null)}</td>`;
        })
        .join("");
      const rng = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
      return `<tr>
        <td><strong>${escapeHtml(model)}</strong></td>
        ${cells}
        <td style="text-align:right;color:#8899a6;">${fmtNum(rng)}</td>
      </tr>`;
    })
    .join("");
  const divTable = `
    <section class="report-section">
      <h2>Divergencia entre los 6 modelos</h2>
      <table>
        <thead>
          <tr><th>Modelo</th>${headTks}<th style="text-align:right;">Rango</th></tr>
        </thead>
        <tbody>${divRows}</tbody>
      </table>
    </section>`;

  // Evolution
  const weeks = Array.from(new Set(evolution.map((e) => e.week))).sort();
  const evoLookup = new Map<string, number>();
  evolution.forEach((e) => evoLookup.set(`${e.week}|${e.tk}`, e.rixc));
  const evoBody = weeks
    .map(
      (w) => `<tr>
        <td>${escapeHtml(w)}</td>
        ${ranked
          .map(
            (r) =>
              `<td style="text-align:right;">${fmtNum(evoLookup.get(`${w}|${r.tk}`) ?? null)}</td>`,
          )
          .join("")}
      </tr>`,
    )
    .join("");
  const evoSection = weeks.length
    ? `<section class="report-section">
        <h2>Evolución semanal (RIXc)</h2>
        <table>
          <thead><tr><th>Semana</th>${headTks}</tr></thead>
          <tbody>${evoBody}</tbody>
        </table>
      </section>`
    : "";

  // Citations (flatten all)
  const flatCites = (citations ?? []).flatMap((c) =>
    (c.items || []).map((it) => ({ ...it, tk: c.tk })),
  );
  // Dedup by URL
  const seen = new Set<string>();
  const unique = flatCites.filter((it) => {
    if (seen.has(it.url)) return false;
    seen.add(it.url);
    return true;
  });
  const citeSection = unique.length
    ? `<section class="report-section">
        <h2>Menciones y fuentes citadas</h2>
        <p style="font-size:12px;color:#536471;margin-bottom:10px;">${unique.length} fuentes únicas citadas por los modelos, agrupadas por dominio.</p>
        ${renderCitationsGrid(unique)}
      </section>`
    : "";

  const consensusSection = buildConsensusSection(consensus);

  return [
    analysisSection,
    rankingTable,
    metricsTable,
    divTable,
    evoSection,
    citeSection,
    consensusSection,
    generateTechnicalSheetHtml(),
  ].join("\n");
}

// ---------- Shared: citations ----------

function buildCitationsSection(
  items: { url: string; domain: string; models: string[]; models_count?: number }[],
): string {
  if (!items.length) return "";
  const rows = items
    .map(
      (it) => `<li>
        <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.domain || it.url)}</a>
        <span class="cite-models">${escapeHtml((it.models || []).join(", "))}</span>
      </li>`,
    )
    .join("");
  return `<section class="report-section">
    <h2>Menciones y fuentes citadas</h2>
    <p style="font-size:12px;color:#536471;">Total fuentes únicas: <strong>${items.length}</strong>.</p>
    <ul class="citations-list">${rows}</ul>
  </section>`;
}

// ---------- RANKING ----------

function buildRankingBody(
  dp: RankingDatapack,
  analysisMarkdown: string | null,
  analysisJson: AnalysisJson | null | undefined,
): string {
  const rows = dp.ranking ?? [];
  const avg = dp.sector_avg;
  const dist = dp.distribution ?? { fuerte: 0, solido: 0, atencion: 0, critico: 0 };
  const scopeLabel =
    dp.scope?.sector ||
    dp.scope?.subsector ||
    (dp.scope?.universe && dp.scope.universe.length > 0
      ? dp.scope.universe.join(" · ")
      : "Alcance");
  const nTotal = dp.scope?.n_entities ?? rows.length;
  const topLabel = dp.scope?.limit ? ` · Top ${dp.scope.limit}` : "";

  const analysisSection = buildExpertSection(analysisJson, analysisMarkdown);

  const best = rows[0];
  const worst = rows[rows.length - 1];
  const headline = `
    <div class="headline-callout">
      <div class="kpi-label">Media del sector · RIXc semana ${escapeHtml(fmtWeek(dp.latest_week))}</div>
      <div><span class="kpi">${fmtNum(avg?.rixc)}</span></div>
      <div style="font-size:12px;color:#536471;margin-top:6px;">
        ${escapeHtml(scopeLabel)} · ${nTotal} empresas${topLabel}
        ${best ? ` · Líder: <strong>${escapeHtml(best.name)}</strong> (${fmtNum(best.rixc)})` : ""}
        ${worst && rows.length > 1 ? ` · Cola: <strong>${escapeHtml(worst.name)}</strong> (${fmtNum(worst.rixc)})` : ""}
      </div>
    </div>`;

  // Ranking table with 8 sub-metrics
  const metricHeads = METRIC_KEYS.map(
    (k) => `<th style="text-align:right;">${metricDef(k).code}</th>`,
  ).join("");
  const rankingRows = rows
    .map((r) => {
      const d = r.delta;
      const dColor =
        d === null || d === undefined
          ? "#8899a6"
          : d > 0.05
            ? "#059669"
            : d < -0.05
              ? "#dc2626"
              : "#8899a6";
      const cells = METRIC_KEYS.map(
        (k) =>
          `<td style="text-align:right;">${fmtNum((r as any)[k] as number | null, 0)}</td>`,
      ).join("");
      return `<tr>
        <td style="text-align:center;font-weight:700;color:#1a73e8;">#${r.rank}</td>
        <td><strong>${escapeHtml(r.name)}</strong> <span style="color:#8899a6;">${escapeHtml(r.tk)}</span></td>
        <td style="text-align:right;font-weight:600;">${fmtNum(r.rixc)}</td>
        <td style="text-align:right;color:${dColor};font-weight:600;">${fmtDelta(d)}</td>
        ${cells}
      </tr>`;
    })
    .join("");
  const rankingTable = `
    <section class="report-section">
      <h2>Ranking del sector</h2>
      ${headline}
      <table>
        <thead>
          <tr>
            <th style="text-align:center;">#</th>
            <th>Empresa</th>
            <th style="text-align:right;">RIXc</th>
            <th style="text-align:right;">Δ sem.</th>
            ${metricHeads}
          </tr>
        </thead>
        <tbody>${rankingRows}</tbody>
      </table>
    </section>`;

  // Sector average per metric
  const avgCards = avg
    ? METRIC_KEYS.map((k) => {
        const info = metricDef(k);
        const v = (avg as any)[k] as number | null;
        return renderMetricGauge({
          code: info.code,
          name: info.name,
          what: info.what,
          mine: v,
          avg: null,
          entityLabel: "Media",
          avgLabel: "—",
        });
      }).join("")
    : "";
  const avgTable = avg
    ? `<section class="report-section">
        <h2>Huella del sector · media por métrica</h2>
        <div class="det-metrics">${avgCards}</div>
       </section>`
    : "";

  // Distribution
  const distTotal = dist.fuerte + dist.solido + dist.atencion + dist.critico;
  const distSection = distTotal > 0
    ? `<section class="report-section">
        <h2>Distribución por banda</h2>
        <table>
          <thead>
            <tr>
              <th>Banda</th>
              <th style="text-align:right;">Empresas</th>
              <th style="text-align:right;">%</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><span style="color:#059669;font-weight:700;">■</span> Fuerte (80–100)</td><td style="text-align:right;">${dist.fuerte}</td><td style="text-align:right;color:#536471;">${((dist.fuerte / distTotal) * 100).toFixed(0)}%</td></tr>
            <tr><td><span style="color:#1a73e8;font-weight:700;">■</span> Sólido (60–79)</td><td style="text-align:right;">${dist.solido}</td><td style="text-align:right;color:#536471;">${((dist.solido / distTotal) * 100).toFixed(0)}%</td></tr>
            <tr><td><span style="color:#d97706;font-weight:700;">■</span> Atención (40–59)</td><td style="text-align:right;">${dist.atencion}</td><td style="text-align:right;color:#536471;">${((dist.atencion / distTotal) * 100).toFixed(0)}%</td></tr>
            <tr><td><span style="color:#dc2626;font-weight:700;">■</span> Crítico (0–39)</td><td style="text-align:right;">${dist.critico}</td><td style="text-align:right;color:#536471;">${((dist.critico / distTotal) * 100).toFixed(0)}%</td></tr>
          </tbody>
        </table>
       </section>`
    : "";

  return [
    analysisSection,
    rankingTable,
    avgTable,
    distSection,
    generateTechnicalSheetHtml(),
  ].join("\n");
}

// ---------- Entry point ----------

export function buildDeterministicReportHtml(
  input: BuildDeterministicReportInput,
): string {
  const { kind, datapack, analysisMarkdown, analysisJson, consensus, question } = input;

  let title: string;
  let subtitle = "Informe de Reputación Algorítmica";
  let bodyHtml: string;
  let latestWeek: string;

  if (kind === "profile") {
    const dp = datapack as ProfileDatapack;
    title = dp.entity.name;
    latestWeek = dp.latest_week;
    bodyHtml = buildProfileBody(dp, analysisMarkdown, analysisJson, consensus);
  } else if (kind === "comparison") {
    const dp = datapack as ComparisonDatapack;
    title = `Comparativa: ${dp.entities.map((e) => e.name).join(" · ")}`;
    latestWeek = dp.latest_week;
    bodyHtml = buildComparisonBody(dp, analysisMarkdown, analysisJson, consensus);
  } else {
    const dp = datapack as RankingDatapack;
    const scopeLabel =
      dp.scope?.sector ||
      dp.scope?.subsector ||
      (dp.scope?.universe && dp.scope.universe.length > 0
        ? dp.scope.universe.join(" · ")
        : "Ranking");
    title = `Ranking del sector: ${scopeLabel}`;
    latestWeek = dp.latest_week;
    bodyHtml = buildRankingBody(dp, analysisMarkdown, analysisJson);
  }

  const metaItems: BrandedReportMetaItem[] = [
    { icon: "📅", label: `Semana: ${latestWeek}` },
    { icon: "🤖", label: "6 modelos de IA" },
    { icon: "✓", label: "Datos deterministas · sin IA generativa" },
  ];

  const questionSection = question && question.trim()
    ? `<section class="report-section" style="margin-top:0;">
        <div style="border:1px solid #e5e7eb;border-left:4px solid #1a73e8;background:#f7f9fa;padding:14px 18px;border-radius:6px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#8899a6;font-weight:600;margin-bottom:6px;">Pregunta del informe</div>
          <div style="font-size:13px;color:#0f1419;line-height:1.55;">${escapeHtml(question.trim())}</div>
        </div>
       </section>`
    : "";

  return wrapBrandedReport({
    title,
    subtitle,
    metaItems,
    bodyHtml: `<style>${EXPERT_STYLES}</style>` + questionSection + bodyHtml,
    documentTitle: `RepIndex — ${title}`,
  });
}