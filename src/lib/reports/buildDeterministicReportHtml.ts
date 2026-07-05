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

type Kind = "profile" | "comparison" | "ranking";

export interface BuildDeterministicReportInput {
  kind: Kind;
  datapack: ProfileDatapack | ComparisonDatapack | RankingDatapack;
  analysisMarkdown: string | null;
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

// ---------- PROFILE ----------

function buildProfileBody(dp: ProfileDatapack, analysisMarkdown: string | null): string {
  const { entity, snapshot, sector, permodel, evolution } = dp;
  const citations = dp.citations ?? { total_sources: 0, items: [] };
  const delta = snapshot.rixc - (snapshot.rixc_prev ?? snapshot.rixc);

  const analysisSection = analysisMarkdown
    ? `<section class="report-section">
        <h2>Análisis del experto</h2>
        <div class="expert-analysis">${markdownToHtml(analysisMarkdown)}</div>
       </section>`
    : `<section class="report-section">
        <h2>Análisis del experto</h2>
        <p style="color:#536471;font-style:italic;">Análisis no disponible en el momento de la exportación.</p>
       </section>`;

  // Headline callout
  const rankLine = sector.size
    ? `#${sector.rank} de ${sector.size} en ${escapeHtml(sector.name || entity.sector || "su sector")}`
    : "—";
  const headline = `
    <div class="headline-callout">
      <div class="kpi-label">RIXc semana ${escapeHtml(fmtWeek(dp.latest_week))}</div>
      <div>
        <span class="kpi">${fmtNum(snapshot.rixc)}</span>
        <span class="kpi-delta ${deltaClass(delta)}">${fmtDelta(delta)}</span>
      </div>
      <div style="font-size:12px;color:#536471;margin-top:6px;">${rankLine}</div>
    </div>`;

  // Sector comparison table (8 metrics)
  const sectorRows = METRIC_KEYS.map((k) => {
    const info = metricDef(k);
    const mine = (snapshot as any)[k] as number | null;
    const avg = (sector as any)[`avg_${k}`] as number | null;
    const diff =
      mine !== null && mine !== undefined && avg !== null && avg !== undefined
        ? mine - avg
        : null;
    return `<tr>
      <td><strong>${info.code}</strong> · ${escapeHtml(info.name)}</td>
      <td style="color:#536471;">${escapeHtml(info.what)}</td>
      <td style="text-align:right;">${fmtNum(mine)}</td>
      <td style="text-align:right;color:#536471;">${fmtNum(avg)}</td>
      <td style="text-align:right;color:${
        diff === null ? "#8899a6" : diff > 0 ? "#059669" : diff < 0 ? "#dc2626" : "#8899a6"
      };font-weight:600;">${fmtDelta(diff)}</td>
    </tr>`;
  }).join("");

  const sectorTable = `
    <section class="report-section">
      <h2>La empresa frente a su sector</h2>
      ${headline}
      <table>
        <thead>
          <tr>
            <th>Métrica</th>
            <th>Qué mide</th>
            <th style="text-align:right;">${escapeHtml(entity.name)}</th>
            <th style="text-align:right;">Media del sector</th>
            <th style="text-align:right;">Diferencia</th>
          </tr>
        </thead>
        <tbody>${sectorRows}</tbody>
      </table>
    </section>`;

  // Divergence
  const rixVals = permodel.map((p) => p.rix).filter((v) => Number.isFinite(v));
  const range = rixVals.length ? Math.max(...rixVals) - Math.min(...rixVals) : 0;
  const permodelRows = permodel
    .map(
      (p) => `<tr>
        <td><strong>${escapeHtml(p.model)}</strong></td>
        <td style="text-align:right;">${fmtNum(p.rix)}</td>
      </tr>`,
    )
    .join("");
  const divergence = `
    <section class="report-section">
      <h2>Divergencia entre los 6 modelos</h2>
      <p style="font-size:12px;color:#536471;">Rango entre modelo más alto y más bajo: <strong>${fmtNum(range)}</strong> puntos.</p>
      <table>
        <thead>
          <tr><th>Modelo</th><th style="text-align:right;">RIX</th></tr>
        </thead>
        <tbody>${permodelRows}</tbody>
      </table>
    </section>`;

  // Evolution
  const evoRows = evolution
    .slice()
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.week)}</td>
        <td style="text-align:right;">${fmtNum(r.rixc)}</td>
      </tr>`,
    )
    .join("");
  const evoSection = evolution.length
    ? `<section class="report-section">
        <h2>Evolución semanal</h2>
        <table>
          <thead><tr><th>Semana</th><th style="text-align:right;">RIXc</th></tr></thead>
          <tbody>${evoRows}</tbody>
        </table>
      </section>`
    : "";

  // Citations
  const citeSection = buildCitationsSection(citations.items || []);

  return [
    analysisSection,
    sectorTable,
    divergence,
    evoSection,
    citeSection,
    generateTechnicalSheetHtml(),
  ].join("\n");
}

// ---------- COMPARISON ----------

function buildComparisonBody(dp: ComparisonDatapack, analysisMarkdown: string | null): string {
  const { entities, snapshot, permodel, evolution, citations } = dp;
  const ranked = [...snapshot].sort((a, b) => (b.rixc ?? 0) - (a.rixc ?? 0));

  const analysisSection = analysisMarkdown
    ? `<section class="report-section">
        <h2>Análisis del experto</h2>
        <div class="expert-analysis">${markdownToHtml(analysisMarkdown)}</div>
       </section>`
    : `<section class="report-section">
        <h2>Análisis del experto</h2>
        <p style="color:#536471;font-style:italic;">Análisis no disponible en el momento de la exportación.</p>
       </section>`;

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
  const citeSection = buildCitationsSection(unique);

  return [
    analysisSection,
    rankingTable,
    metricsTable,
    divTable,
    evoSection,
    citeSection,
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

// ---------- Entry point ----------

export function buildDeterministicReportHtml(
  input: BuildDeterministicReportInput,
): string {
  const { kind, datapack, analysisMarkdown, question } = input;

  let title: string;
  let subtitle = "Informe de Reputación Algorítmica";
  let bodyHtml: string;
  let latestWeek: string;

  if (kind === "profile") {
    const dp = datapack as ProfileDatapack;
    title = dp.entity.name;
    latestWeek = dp.latest_week;
    bodyHtml = buildProfileBody(dp, analysisMarkdown);
  } else {
    const dp = datapack as ComparisonDatapack;
    title = `Comparativa: ${dp.entities.map((e) => e.name).join(" · ")}`;
    latestWeek = dp.latest_week;
    bodyHtml = buildComparisonBody(dp, analysisMarkdown);
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
    bodyHtml: questionSection + bodyHtml,
    documentTitle: `RepIndex — ${title}`,
  });
}