import type {
  ComparisonDatapack,
  ComparisonSnapshotRow,
} from "@/hooks/useComparisonDatapack";
import type { ProfileDatapack } from "@/hooks/useProfileDatapack";
import { METRIC_GLOSSARY, METRIC_BY_KEY, type MetricKey as GlossaryKey } from "@/lib/reports/metricGlossary";

export interface Recommendation {
  severity: "alta" | "media" | "oportunidad";
  title: string;
  detail: string;
}

// Canonical single source of truth for names/actions. All metrics treated equally
// (higher = better) with no special cases. DRM is included alongside the rest.
type MetricKey = GlossaryKey;

const METRIC_LABEL: Record<MetricKey, string> = METRIC_GLOSSARY.reduce(
  (acc, m) => {
    acc[m.key] = `${m.name.toLowerCase()} (${m.code})`;
    return acc;
  },
  {} as Record<MetricKey, string>,
);

const WEAK_ACTION: Record<MetricKey, string> = METRIC_GLOSSARY.reduce(
  (acc, m) => {
    acc[m.key] = m.action;
    return acc;
  },
  {} as Record<MetricKey, string>,
);

const METRICS: MetricKey[] = METRIC_GLOSSARY.map((m) => m.key);

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
// ------------------------------------------------------------------
// Profile (single entity) recommendations — deterministic, rule-based.
// ------------------------------------------------------------------

const METRIC_SHORT_LABEL: Record<MetricKey, string> = METRIC_GLOSSARY.reduce(
  (acc, m) => {
    acc[m.key] = m.code;
    return acc;
  },
  {} as Record<MetricKey, string>,
);

type SectorAvgKey =
  | "avg_nvm"
  | "avg_drm"
  | "avg_sim"
  | "avg_rmm"
  | "avg_cem"
  | "avg_gam"
  | "avg_dcm"
  | "avg_cxm";

const SECTOR_AVG_KEY: Record<MetricKey, SectorAvgKey> = METRIC_GLOSSARY.reduce(
  (acc, m) => {
    acc[m.key] = `avg_${m.key}` as SectorAvgKey;
    return acc;
  },
  {} as Record<MetricKey, SectorAvgKey>,
);

// Silence unused import: METRIC_BY_KEY is re-exported implicitly via glossary consumers.
void METRIC_BY_KEY;

export function buildProfileRecommendations(dp: ProfileDatapack): Recommendation[] {
  const recs: Recommendation[] = [];
  const snap = dp.snapshot;
  const sector = dp.sector;
  if (!snap) return recs;

  // Divergence
  const range = (snap.rix_max ?? 0) - (snap.rix_min ?? 0);
  if (range >= 25) {
    recs.push({
      severity: "alta",
      title: "Narrativa algorítmica inestable",
      detail: `Los 6 modelos puntúan de ${snap.rix_min.toFixed(1)} a ${snap.rix_max.toFixed(1)} (${range.toFixed(1)} pts). Acción: homogeneizar mensajes clave y reforzar fuentes verificables para cerrar la horquilla.`,
    });
  } else if (range >= 15) {
    recs.push({
      severity: "media",
      title: "Narrativa algorítmica inestable",
      detail: `Los 6 modelos puntúan de ${snap.rix_min.toFixed(1)} a ${snap.rix_max.toFixed(1)} (${range.toFixed(1)} pts). Acción: homogeneizar mensajes clave y reforzar fuentes verificables.`,
    });
  }

  // Weekly drop
  if (snap.rixc_prev !== null && typeof snap.rixc_prev === "number") {
    const delta = snap.rixc - snap.rixc_prev;
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

  // Weakness vs sector: metric with largest NEGATIVE (value − sector avg)
  let weakest: { k: MetricKey; v: number; avg: number; diff: number } | null = null;
  let strongest: { k: MetricKey; v: number; avg: number; diff: number } | null = null;
  for (const m of METRICS) {
    const v = (snap as any)[m] as number | null;
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    const avg = (sector as any)[SECTOR_AVG_KEY[m]] as number | null;
    if (avg === null || avg === undefined || Number.isNaN(avg)) continue;
    const diff = v - avg;
    if (weakest === null || diff < weakest.diff) weakest = { k: m, v, avg, diff };
    if (strongest === null || diff > strongest.diff) strongest = { k: m, v, avg, diff };
  }
  if (weakest && weakest.diff < 0) {
    recs.push({
      severity: "media",
      title: `Por debajo de la media del sector en ${METRIC_SHORT_LABEL[weakest.k]}`,
      detail: `${weakest.v.toFixed(1)} vs ${weakest.avg.toFixed(1)} del sector. ${WEAK_ACTION[weakest.k]}`,
    });
  }
  if (strongest && strongest.diff > 0) {
    recs.push({
      severity: "oportunidad",
      title: `Por encima de la media del sector en ${METRIC_SHORT_LABEL[strongest.k]}`,
      detail: `${strongest.v.toFixed(1)} vs ${strongest.avg.toFixed(1)} del sector; mantén la ventaja.`,
    });
  }

  // Low citation density
  if (typeof snap.num_citas === "number" && snap.num_citas < 8) {
    recs.push({
      severity: "media",
      title: "Baja densidad de fuentes",
      detail: `Las IAs apenas encuentran fuentes sobre esta empresa (${snap.num_citas}); genera contenido citable y notas de prensa indexables.`,
    });
  }

  recs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return recs.slice(0, 4);
}
