import type {
  ComparisonDatapack,
  ComparisonSnapshotRow,
} from "@/hooks/useComparisonDatapack";

export interface Recommendation {
  severity: "alta" | "media" | "oportunidad";
  title: string;
  detail: string;
}

type MetricKey = "nvm" | "rmm" | "cem" | "dcm" | "gam" | "sim" | "cxm";

const METRIC_LABEL: Record<MetricKey, string> = {
  nvm: "visibilidad (NVM)",
  rmm: "menciones (RMM)",
  cem: "evidencias (CEM)",
  dcm: "cobertura (DCM)",
  gam: "gobernanza (GAM)",
  sim: "sentimiento (SIM)",
  cxm: "experiencia de cliente (CXM)",
};

const WEAK_ACTION: Record<MetricKey, string> = {
  sim: "Sentimiento débil: trabajar tono y contenidos positivos verificables.",
  rmm: "Menciones de baja calidad: reforzar presencia en medios de autoridad.",
  nvm: "Baja visibilidad en las IAs: aumentar contenidos indexables.",
  cem: "Pocas evidencias citables: publicar datos/informes/notas verificables.",
  dcm: "Cobertura poco diversa: ampliar variedad de fuentes y temáticas.",
  gam: "Gobernanza/ESG mejorable: comunicar buen gobierno y sostenibilidad.",
  cxm: "Experiencia de cliente floja: reforzar señales de satisfacción y servicio.",
};

const METRICS: MetricKey[] = ["nvm", "rmm", "cem", "dcm", "gam", "sim", "cxm"];

const SEVERITY_ORDER: Record<Recommendation["severity"], number> = {
  alta: 0,
  media: 1,
  oportunidad: 2,
};

function val(row: ComparisonSnapshotRow, k: MetricKey): number | null {
  const v = row[k];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

export function buildRecommendations(
  dp: ComparisonDatapack,
): Record<string, Recommendation[]> {
  const out: Record<string, Recommendation[]> = {};
  const snap = dp.snapshot ?? [];
  if (snap.length === 0) return out;

  // Per-metric basket averages and leaders.
  const basketAvg: Partial<Record<MetricKey, number>> = {};
  const leaderTk: Partial<Record<MetricKey, string>> = {};
  for (const m of METRICS) {
    const vals: Array<{ tk: string; v: number }> = [];
    for (const r of snap) {
      const v = val(r, m);
      if (v !== null) vals.push({ tk: r.tk, v });
    }
    if (vals.length === 0) continue;
    basketAvg[m] = vals.reduce((a, b) => a + b.v, 0) / vals.length;
    const best = vals.reduce((a, b) => (b.v > a.v ? b : a));
    leaderTk[m] = best.tk;
  }

  // Ticker with lowest num_citas.
  let minCitasTk: string | null = null;
  let minCitas = Infinity;
  for (const r of snap) {
    if (typeof r.num_citas === "number" && r.num_citas < minCitas) {
      minCitas = r.num_citas;
      minCitasTk = r.tk;
    }
  }

  for (const r of snap) {
    const recs: Recommendation[] = [];
    const range = (r.rix_max ?? 0) - (r.rix_min ?? 0);

    // Divergence
    if (range >= 25) {
      recs.push({
        severity: "alta",
        title: "Narrativa algorítmica inestable",
        detail: `Los 6 modelos te puntúan de ${r.rix_min.toFixed(1)} a ${r.rix_max.toFixed(1)} (${range.toFixed(1)} pts): no hay un relato consolidado. Acción: homogeneizar mensajes clave y reforzar fuentes verificables para cerrar la horquilla.`,
      });
    } else if (range >= 15) {
      recs.push({
        severity: "media",
        title: "Narrativa algorítmica inestable",
        detail: `Los 6 modelos te puntúan de ${r.rix_min.toFixed(1)} a ${r.rix_max.toFixed(1)} (${range.toFixed(1)} pts): el relato aún no está consolidado. Acción: homogeneizar mensajes clave y reforzar fuentes verificables para cerrar la horquilla.`,
      });
    }

    // Weekly drop
    if (r.rixc_prev !== null && typeof r.rixc_prev === "number") {
      const delta = r.rixc - r.rixc_prev;
      if (delta <= -3) {
        recs.push({
          severity: "alta",
          title: `Retroceso semanal de ${delta.toFixed(1)} pts`,
          detail: "Revisar qué narrativa o evento ha pesado esta semana y comunicar de forma proactiva para revertir la tendencia.",
        });
      } else if (delta <= -1) {
        recs.push({
          severity: "media",
          title: `Retroceso semanal de ${delta.toFixed(1)} pts`,
          detail: "Revisar qué narrativa o evento ha pesado esta semana y comunicar de forma proactiva.",
        });
      }
    }

    // Weakest metric below basket average
    let weakest: { k: MetricKey; v: number } | null = null;
    for (const m of METRICS) {
      const v = val(r, m);
      const avg = basketAvg[m];
      if (v === null || avg === undefined) continue;
      if (v >= avg) continue;
      if (weakest === null || v < weakest.v) weakest = { k: m, v };
    }
    if (weakest) {
      recs.push({
        severity: "media",
        title: `Punto débil: ${METRIC_LABEL[weakest.k]}`,
        detail: WEAK_ACTION[weakest.k],
      });
    }

    // Strength: leads basket in a metric
    for (const m of METRICS) {
      if (leaderTk[m] !== r.tk) continue;
      const v = val(r, m);
      if (v === null) continue;
      recs.push({
        severity: "oportunidad",
        title: `Ventaja en ${METRIC_LABEL[m]}`,
        detail: `Lideras la cesta en ${METRIC_LABEL[m]} (${v.toFixed(1)}). Mantén y capitaliza esta fortaleza.`,
      });
      break; // one strength callout is enough
    }

    // Low citation density
    if (
      minCitasTk === r.tk &&
      typeof r.num_citas === "number" &&
      r.num_citas < 8
    ) {
      recs.push({
        severity: "media",
        title: "Baja densidad de fuentes",
        detail: `Las IAs apenas encuentran fuentes sobre ti (${r.num_citas}); genera contenido citable y notas de prensa indexables.`,
      });
    }

    recs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    out[r.tk] = recs.slice(0, 4);
  }

  return out;
}