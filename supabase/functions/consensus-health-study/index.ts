// Consensus Health Study v2 — multi-metric, deterministic, paginated safely.
// Reproduces & extends Phase 1: now studies RIX + 8 sub-metrics + categorical agreement.
// Admin-only.

import {
  requireAdmin,
  getServiceClient,
  logAdminAction,
} from '../_shared/requireAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ---------- stats helpers ----------
function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k].i] = r;
    i = j + 1;
  }
  return out;
}
function pearson(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}
function normalSf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429;
  const erfc = (a1 * t + a2 * t * t + a3 * t ** 3 + a4 * t ** 4 + a5 * t ** 5) * Math.exp(-x * x);
  return Math.max(0, Math.min(1, erfc));
}
function spearman(x: number[], y: number[]) {
  if (x.length < 4) return { rho: NaN, p_value: NaN, n: x.length };
  const rho = pearson(ranks(x), ranks(y));
  const z = rho * Math.sqrt(x.length - 1);
  return { rho, p_value: normalSf(z), n: x.length };
}
function mannWhitney(a: number[], b: number[]) {
  const n1 = a.length, n2 = b.length;
  if (n1 < 3 || n2 < 3) return { U: NaN, p_value: NaN, n1, n2 };
  const all = [...a, ...b];
  const r = ranks(all);
  const R1 = r.slice(0, n1).reduce((s, v) => s + v, 0);
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const mu = (n1 * n2) / 2;
  const counts = new Map<number, number>();
  for (const v of all) counts.set(v, (counts.get(v) || 0) + 1);
  let tieSum = 0;
  for (const c of counts.values()) if (c > 1) tieSum += c ** 3 - c;
  const N = n1 + n2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieSum / (N * (N - 1))));
  const z = sigma === 0 ? 0 : (U - mu) / sigma;
  return { U, p_value: normalSf(z), n1, n2, z };
}

// ISO Monday for any YYYY-MM-DD
function isoMonday(d: string): string {
  const dt = new Date(d + 'T00:00:00Z');
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

// Metric definitions: column name → display key
const METRICS: { key: string; col: string; catCol?: string }[] = [
  { key: 'RIX', col: '09_rix_score' },
  { key: 'NVM', col: '23_nvm_score', catCol: '25_nvm_categoria' },
  { key: 'DRM', col: '26_drm_score', catCol: '28_drm_categoria' },
  { key: 'SIM', col: '29_sim_score', catCol: '31_sim_categoria' },
  { key: 'RMM', col: '32_rmm_score', catCol: '34_rmm_categoria' },
  { key: 'CEM', col: '35_cem_score', catCol: '37_cem_categoria' },
  { key: 'GAM', col: '38_gam_score', catCol: '40_gam_categoria' },
  { key: 'DCM', col: '41_dcm_score', catCol: '43_dcm_categoria' },
  { key: 'CXM', col: '44_cxm_score', catCol: '46_cxm_categoria' },
];

type Sample = { ticker: string; week: string; mean: number; min: number; max: number; range: number; n: number };

function buildSamples(
  rows: Record<string, unknown>[],
  scoreCol: string,
): Sample[] {
  // dedupe: keep latest by batch_execution_date per (ticker, week, model)
  const latest = new Map<string, { score: number; ts: number }>();
  for (const r of rows) {
    const t = r['05_ticker'] as string | null;
    const m = r['02_model_name'] as string | null;
    const pf = r['06_period_from'] as string | null;
    if (!t || !m || !pf) continue;
    const raw = r[scoreCol];
    const s = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(s)) continue;
    const week = isoMonday(String(pf).slice(0, 10));
    const ts = new Date(String(r['batch_execution_date'] ?? '')).getTime() || 0;
    const k = `${t}|${week}|${m}`;
    const prev = latest.get(k);
    if (!prev || ts > prev.ts) latest.set(k, { score: s, ts });
  }
  // group by (ticker, week)
  const grouped = new Map<string, number[]>();
  const meta = new Map<string, { ticker: string; week: string }>();
  for (const [k, v] of latest) {
    const [ticker, week] = k.split('|');
    const gk = `${ticker}|${week}`;
    if (!grouped.has(gk)) {
      grouped.set(gk, []);
      meta.set(gk, { ticker, week });
    }
    grouped.get(gk)!.push(v.score);
  }
  const out: Sample[] = [];
  for (const [gk, scores] of grouped) {
    if (scores.length < 4) continue;
    const min = Math.min(...scores), max = Math.max(...scores);
    const m = meta.get(gk)!;
    out.push({ ticker: m.ticker, week: m.week, mean: mean(scores), min, max, range: max - min, n: scores.length });
  }
  return out;
}

function metricBlock(samples: Sample[]) {
  const states = { crisis: 0, healthy: 0, dispersed: 0, neutral: 0 };
  for (const s of samples) {
    if (s.range <= 10 && s.mean < 50) states.crisis++;
    else if (s.range <= 10 && s.mean >= 70) states.healthy++;
    else if (s.range > 20) states.dispersed++;
    else states.neutral++;
  }
  const n = samples.length;
  const stateDist = Object.fromEntries(
    Object.entries(states).map(([k, c]) => [k, { n: c, pct: n ? +(100 * c / n).toFixed(2) : 0 }]),
  );
  const bearish = samples.filter(s => s.mean < 50).map(s => s.range);
  const neutralBand = samples.filter(s => s.mean >= 50 && s.mean < 65).map(s => s.range);
  const bullish = samples.filter(s => s.mean >= 65).map(s => s.range);
  const rangeByPolarity = {
    bearish: { median: +median(bearish).toFixed(2), n: bearish.length },
    neutral: { median: +median(neutralBand).toFixed(2), n: neutralBand.length },
    bullish: { median: +median(bullish).toFixed(2), n: bullish.length },
  };
  const sp = spearman(samples.map(s => s.mean), samples.map(s => s.range));
  const mw = mannWhitney(bearish, bullish);
  return {
    n_samples: n,
    state_distribution: stateDist,
    range_by_polarity: rangeByPolarity,
    spearman: {
      rho: Number.isFinite(sp.rho) ? +sp.rho.toFixed(4) : null,
      p_value: Number.isFinite(sp.p_value) ? sp.p_value : null,
      n: sp.n,
    },
    mann_whitney: {
      U: Number.isFinite(mw.U) ? mw.U : null,
      p_value: Number.isFinite(mw.p_value) ? mw.p_value : null,
      n_bearish: mw.n1,
      n_bullish: mw.n2,
    },
    median_range_overall: +median(samples.map(s => s.range)).toFixed(2),
  };
}

function categoricalAgreement(rows: Record<string, unknown>[], catCol: string) {
  // dedupe: latest category per (ticker, week, model)
  const latest = new Map<string, { cat: string; ts: number }>();
  for (const r of rows) {
    const t = r['05_ticker'] as string | null;
    const m = r['02_model_name'] as string | null;
    const pf = r['06_period_from'] as string | null;
    const c = r[catCol];
    if (!t || !m || !pf || !c) continue;
    const week = isoMonday(String(pf).slice(0, 10));
    const ts = new Date(String(r['batch_execution_date'] ?? '')).getTime() || 0;
    const k = `${t}|${week}|${m}`;
    const prev = latest.get(k);
    if (!prev || ts > prev.ts) latest.set(k, { cat: String(c).trim().toLowerCase(), ts });
  }
  // per (ticker, week): % of models in modal category
  const groups = new Map<string, string[]>();
  for (const [k, v] of latest) {
    const [t, w] = k.split('|');
    const gk = `${t}|${w}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk)!.push(v.cat);
  }
  const ratios: number[] = [];
  let unanimous = 0, strong = 0, weak = 0, dispersed = 0, total = 0;
  for (const cats of groups.values()) {
    if (cats.length < 4) continue;
    const counts = new Map<string, number>();
    for (const c of cats) counts.set(c, (counts.get(c) || 0) + 1);
    const modeN = Math.max(...counts.values());
    const ratio = modeN / cats.length;
    ratios.push(ratio);
    total++;
    if (ratio === 1) unanimous++;
    else if (ratio >= 0.75) strong++;
    else if (ratio >= 0.5) weak++;
    else dispersed++;
  }
  return {
    n_groups: total,
    median_agreement_ratio: total ? +median(ratios).toFixed(3) : null,
    mean_agreement_ratio: total ? +mean(ratios).toFixed(3) : null,
    distribution: {
      unanimous: { n: unanimous, pct: total ? +(100 * unanimous / total).toFixed(2) : 0 },
      strong: { n: strong, pct: total ? +(100 * strong / total).toFixed(2) : 0 },
      weak: { n: weak, pct: total ? +(100 * weak / total).toFixed(2) : 0 },
      dispersed: { n: dispersed, pct: total ? +(100 * dispersed / total).toFixed(2) : 0 },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireAdmin(req, corsHeaders);
  if ('response' in auth) return auth.response;
  const admin = auth.admin;

  const service = getServiceClient();

  try {
    const periodStart = '2026-01-01';
    const periodEnd = new Date().toISOString().slice(0, 10);
    const endExclusive = new Date(periodEnd);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const endISO = endExclusive.toISOString();

    // Pull all needed columns once. Deterministic order via id.
    const selectCols = [
      '"05_ticker"', '"02_model_name"', '"06_period_from"', '"batch_execution_date"', 'id',
      ...METRICS.map(m => `"${m.col}"`),
      ...METRICS.filter(m => m.catCol).map(m => `"${m.catCol}"`),
    ].join(',');

    const rows: Record<string, unknown>[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await service
        .from('rix_runs_v2')
        .select(selectCols)
        .gte('batch_execution_date', `${periodStart}T00:00:00Z`)
        .lt('batch_execution_date', endISO)
        .order('id', { ascending: true })           // deterministic pagination
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...(data as Record<string, unknown>[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Build per-metric blocks
    const breakdown: Record<string, ReturnType<typeof metricBlock>> = {};
    for (const m of METRICS) {
      const samples = buildSamples(rows, m.col);
      breakdown[m.key] = metricBlock(samples);
    }

    // Categorical agreement (only for sub-metrics with catCol)
    const categorical: Record<string, ReturnType<typeof categoricalAgreement>> = {};
    for (const m of METRICS) {
      if (!m.catCol) continue;
      categorical[m.key] = categoricalAgreement(rows, m.catCol);
    }

    // Top-level (RIX) for backward compat with the existing snapshot columns
    const rixSamples = buildSamples(rows, '09_rix_score');
    const rix = breakdown.RIX;
    const nTickers = new Set(rixSamples.map(s => s.ticker)).size;
    const nWeeks = new Set(rixSamples.map(s => s.week)).size;

    const topCrisis = rixSamples
      .filter(s => s.range <= 10 && s.mean < 50)
      .sort((a, b) => a.mean - b.mean || a.range - b.range)
      .slice(0, 10)
      .map(s => ({ ticker: s.ticker, week: s.week, mean: +s.mean.toFixed(2), range: +s.range.toFixed(2) }));

    // Theme tags (still optional, empty for now)
    let themeTagsAvailable = false;
    let rangeByTheme: Record<string, { median: number; n: number }> | null = null;
    try {
      const { data: tags } = await service
        .from('weekly_theme_tags')
        .select('ticker,week_start,theme')
        .gte('week_start', periodStart)
        .limit(5000);
      if (tags && tags.length > 0) {
        themeTagsAvailable = true;
        const tagMap = new Map<string, string>();
        for (const t of tags as any[]) {
          tagMap.set(`${t.ticker}|${isoMonday(String(t.week_start).slice(0, 10))}`, String(t.theme || 'unknown'));
        }
        const buckets = new Map<string, number[]>();
        for (const s of rixSamples) {
          const tag = tagMap.get(`${s.ticker}|${s.week}`);
          if (!tag) continue;
          if (!buckets.has(tag)) buckets.set(tag, []);
          buckets.get(tag)!.push(s.range);
        }
        rangeByTheme = {};
        for (const [k, arr] of buckets) {
          rangeByTheme[k] = { median: +median(arr).toFixed(2), n: arr.length };
        }
      }
    } catch (e) {
      console.warn('[consensus-health-study] weekly_theme_tags unavailable:', e);
    }

    // Verdict — based on RIX MW + median delta (unchanged)
    let verdict: 'supported' | 'refuted' | 'inconclusive' = 'inconclusive';
    const mB = rix.range_by_polarity.bearish.median;
    const mU = rix.range_by_polarity.bullish.median;
    const p = rix.mann_whitney.p_value;
    if (Number.isFinite(mB) && Number.isFinite(mU) && p !== null) {
      if (mB < mU - 2 && p < 0.05) verdict = 'supported';
      else if (mB >= mU && p < 0.05) verdict = 'refuted';
    }

    const snapshot = {
      created_by: admin.id,
      period_start: periodStart,
      period_end: periodEnd,
      n_samples: rix.n_samples,
      n_tickers: nTickers,
      n_weeks: nWeeks,
      state_distribution: rix.state_distribution,
      range_by_polarity: rix.range_by_polarity,
      spearman: rix.spearman,
      mann_whitney: rix.mann_whitney,
      theme_tags_available: themeTagsAvailable,
      range_by_theme: rangeByTheme,
      top_crisis_cases: topCrisis,
      hypothesis_verdict: verdict,
      metrics_breakdown: breakdown,
      categorical_agreement: categorical,
      notes: `v2 multi-metric · raw_rows=${rows.length}`,
    };

    const { data: inserted, error: insErr } = await service
      .from('consensus_health_studies')
      .insert(snapshot)
      .select()
      .single();
    if (insErr) throw insErr;

    await logAdminAction({
      serviceClient: service,
      admin,
      edgeFunction: 'consensus-health-study',
      action: 'run_study',
      resource: inserted?.id ?? null,
      payload: { n_samples: rix.n_samples, raw_rows: rows.length, verdict },
      req,
      statusCode: 200,
    });

    return new Response(JSON.stringify({ ok: true, snapshot: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[consensus-health-study] error', e);
    return new Response(
      JSON.stringify({ ok: false, error: String((e as any)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
