// Consensus Health Study — recurrent empirical study of cross-AI consensus.
// Reproduces the Phase 1 Python script in TS/Deno. Admin-only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

// Average ranks with tie handling
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const r = (i + j) / 2 + 1; // average rank, 1-based
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

// Standard normal survival via erfc approximation
function normalSf(z: number): number {
  // two-sided p = erfc(|z|/sqrt(2))
  const x = Math.abs(z) / Math.SQRT2;
  // Abramowitz & Stegun 7.1.26
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

// Mann-Whitney U with normal approximation + tie correction
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
  // tie correction
  const counts = new Map<number, number>();
  for (const v of all) counts.set(v, (counts.get(v) || 0) + 1);
  let tieSum = 0;
  for (const c of counts.values()) if (c > 1) tieSum += c ** 3 - c;
  const N = n1 + n2;
  const sigma = Math.sqrt(
    ((n1 * n2) / 12) * (N + 1 - tieSum / (N * (N - 1))),
  );
  const z = sigma === 0 ? 0 : (U - mu) / sigma;
  return { U, p_value: normalSf(z), n1, n2, z };
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireAdmin(req, corsHeaders);
  if ('response' in auth) return auth.response;
  const admin = auth.admin;

  const service = getServiceClient();

  try {
    const periodStart = '2026-01-01';
    const periodEnd = new Date().toISOString().slice(0, 10);

    // Pull rows in pages (Supabase caps at 1000)
    type Row = { ticker: string; week: string; model: string; score: number };
    const rows: Row[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await service
        .from('rix_runs_v2')
        .select('"05_ticker","06_period_from","02_model_name","09_rix_score","batch_execution_date"')
        .gte('batch_execution_date', `${periodStart}T00:00:00Z`)
        .not('09_rix_score', 'is', null)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data as any[]) {
        const t = r['05_ticker'];
        const m = r['02_model_name'];
        const s = Number(r['09_rix_score']);
        const wRaw = r['06_period_from'] || r['batch_execution_date'];
        if (!t || !m || !wRaw || !Number.isFinite(s)) continue;
        const w = String(wRaw).slice(0, 10);
        rows.push({ ticker: t, week: w, model: m, score: s });
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Aggregate per (ticker, week) → keep first score per model
    type Sample = { ticker: string; week: string; mean: number; min: number; max: number; range: number; nModels: number };
    const grouped = new Map<string, Map<string, number>>(); // key=ticker|week → map<model, score>
    for (const r of rows) {
      const k = `${r.ticker}|${r.week}`;
      if (!grouped.has(k)) grouped.set(k, new Map());
      const mm = grouped.get(k)!;
      if (!mm.has(r.model)) mm.set(r.model, r.score);
    }
    const samples: Sample[] = [];
    for (const [k, mm] of grouped) {
      const scores = [...mm.values()];
      if (scores.length < 4) continue;
      const min = Math.min(...scores), max = Math.max(...scores);
      const [ticker, week] = k.split('|');
      samples.push({
        ticker, week,
        mean: mean(scores),
        min, max,
        range: max - min,
        nModels: scores.length,
      });
    }

    const nSamples = samples.length;
    const nTickers = new Set(samples.map(s => s.ticker)).size;
    const nWeeks = new Set(samples.map(s => s.week)).size;

    // State distribution
    const states = { crisis: 0, healthy: 0, dispersed: 0, neutral: 0 };
    for (const s of samples) {
      if (s.range <= 10 && s.mean < 50) states.crisis++;
      else if (s.range <= 10 && s.mean >= 70) states.healthy++;
      else if (s.range > 20) states.dispersed++;
      else states.neutral++;
    }
    const stateDistribution = Object.fromEntries(
      Object.entries(states).map(([k, n]) => [k, { n, pct: nSamples ? +(100 * n / nSamples).toFixed(2) : 0 }]),
    );

    // Range by polarity band
    const bearish = samples.filter(s => s.mean < 50).map(s => s.range);
    const neutralBand = samples.filter(s => s.mean >= 50 && s.mean < 65).map(s => s.range);
    const bullish = samples.filter(s => s.mean >= 65).map(s => s.range);
    const rangeByPolarity = {
      bearish: { median: +median(bearish).toFixed(2), n: bearish.length },
      neutral: { median: +median(neutralBand).toFixed(2), n: neutralBand.length },
      bullish: { median: +median(bullish).toFixed(2), n: bullish.length },
    };

    // Spearman mean vs range
    const sp = spearman(samples.map(s => s.mean), samples.map(s => s.range));
    const spearmanResult = {
      rho: Number.isFinite(sp.rho) ? +sp.rho.toFixed(4) : null,
      p_value: Number.isFinite(sp.p_value) ? sp.p_value : null,
      n: sp.n,
    };

    // Mann-Whitney bearish vs bullish
    const mw = mannWhitney(bearish, bullish);
    const mannWhitneyResult = {
      U: Number.isFinite(mw.U) ? mw.U : null,
      p_value: Number.isFinite(mw.p_value) ? mw.p_value : null,
      n_bearish: mw.n1,
      n_bullish: mw.n2,
    };

    // Top crisis cases
    const topCrisis = samples
      .filter(s => s.range <= 10 && s.mean < 50)
      .sort((a, b) => a.mean - b.mean || a.range - b.range)
      .slice(0, 10)
      .map(s => ({
        ticker: s.ticker,
        week: s.week,
        mean: +s.mean.toFixed(2),
        range: +s.range.toFixed(2),
      }));

    // Theme tags segmentation (optional)
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
          tagMap.set(`${t.ticker}|${String(t.week_start).slice(0, 10)}`, String(t.theme || 'unknown'));
        }
        const buckets = new Map<string, number[]>();
        for (const s of samples) {
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

    // Verdict
    let verdict: 'supported' | 'refuted' | 'inconclusive' = 'inconclusive';
    const mB = rangeByPolarity.bearish.median;
    const mU = rangeByPolarity.bullish.median;
    const p = mannWhitneyResult.p_value;
    if (Number.isFinite(mB) && Number.isFinite(mU) && p !== null) {
      if (mB < mU - 2 && p < 0.05) verdict = 'supported';
      else if (mB >= mU && p < 0.05) verdict = 'refuted';
    }

    const snapshot = {
      created_by: admin.id,
      period_start: periodStart,
      period_end: periodEnd,
      n_samples: nSamples,
      n_tickers: nTickers,
      n_weeks: nWeeks,
      state_distribution: stateDistribution,
      range_by_polarity: rangeByPolarity,
      spearman: spearmanResult,
      mann_whitney: mannWhitneyResult,
      theme_tags_available: themeTagsAvailable,
      range_by_theme: rangeByTheme,
      top_crisis_cases: topCrisis,
      hypothesis_verdict: verdict,
      notes: null,
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
      payload: { n_samples: nSamples, verdict },
      req,
      statusCode: 200,
    });

    return new Response(JSON.stringify({ ok: true, snapshot: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[consensus-health-study] error', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});