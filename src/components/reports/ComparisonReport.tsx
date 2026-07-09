import { useMemo } from "react";
import { Loader2, AlertTriangle, ShieldCheck, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExpertAnalysis } from "./ExpertAnalysis";
import { ConsensusCompact } from "./ConsensusCompact";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  useComparisonDatapack,
  type ComparisonDatapack,
  type ComparisonSnapshotRow,
} from "@/hooks/useComparisonDatapack";
import { buildRecommendations } from "@/lib/reports/recommendationEngine";
import { ExternalLink } from "lucide-react";
import { METRIC_GLOSSARY } from "@/lib/reports/metricGlossary";

interface Props {
  tickers: string[];
  from?: string | null;
  to?: string | null;
}

// Deterministic palette (aligned with the app's semantic tokens for lines).
const LINE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 12 76% 61%))",
  "hsl(var(--chart-3, 173 58% 39%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 27 87% 67%))",
  "hsl(var(--chart-1, 220 70% 50%))",
  "hsl(var(--chart-6, 280 65% 60%))",
  "hsl(var(--chart-7, 340 75% 55%))",
];

const MODEL_LABEL: Record<string, string> = {
  "ChatGPT": "ChatGPT",
  "Perplexity": "Perplexity",
  "Google Gemini": "Gemini",
  "Gemini": "Gemini",
  "Deepseek": "DeepSeek",
  "DeepSeek": "DeepSeek",
  "Grok": "Grok",
  "Qwen": "Qwen",
};

// All metric names & descriptions come from the canonical glossary.
// Every metric is higher = better (no exceptions).
const METRIC_ROWS: Array<{
  key: string;
  field: keyof ComparisonSnapshotRow | "rixc";
  higherIsBetter: boolean;
}> = [
  { key: "RIXc", field: "rixc", higherIsBetter: true },
  ...METRIC_GLOSSARY.map((m) => ({
    key: m.code,
    field: m.key as keyof ComparisonSnapshotRow,
    higherIsBetter: true,
  })),
];

function metricWhat(code: string): string {
  if (code === "RIXc") return "Índice compuesto de reputación algorítmica.";
  const def = METRIC_GLOSSARY.find((m) => m.code === code);
  return def ? def.what : "";
}
function metricLabel(code: string): string {
  const def = METRIC_GLOSSARY.find((m) => m.code === code);
  return def ? `${def.name.toLowerCase()} (${def.code})` : code;
}

// Metrics used for "destaca en / más floja en" — all 8 canonical metrics.
const HIGHLIGHT_METRICS: Array<{
  key: string;
  field: keyof ComparisonSnapshotRow;
  label: string;
}> = METRIC_GLOSSARY.map((m) => ({
  key: m.code,
  field: m.key as keyof ComparisonSnapshotRow,
  label: metricLabel(m.code),
}));

function fmtNum(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Number(v).toFixed(decimals);
}
function fmtDelta(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(1)}`;
}
function fmtWeek(w: string): string {
  try {
    const d = new Date(`${w}T00:00:00Z`);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return w;
  }
}

function medal(pos: number): string {
  return pos === 0 ? "🥇" : pos === 1 ? "🥈" : pos === 2 ? "🥉" : "";
}

export function ComparisonReport({ tickers, from, to }: Props) {
  const { data, isLoading, isError, error } = useComparisonDatapack(tickers, from, to);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-6">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <p className="text-sm">Cargando datapack determinista de la comparativa…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">No se pudo cargar la comparativa.</p>
          <p className="text-muted-foreground mt-1">
            {(error as Error)?.message ?? "Reintenta más tarde."}
          </p>
        </div>
      </div>
    );
  }

  return <ComparisonReportBody data={data} />;
}

function ComparisonReportBody({ data }: { data: ComparisonDatapack }) {
  const { latest_week, prev_week, entities, snapshot, permodel, evolution } = data;
  const mode = data.mode ?? "snapshot";
  const period_from = data.period_from ?? latest_week;
  const period_to = data.period_to ?? latest_week;
  const weeks_count = data.weeks_count ?? 1;
  const isPeriod = mode === "period";
  const citations = data.citations ?? [];
  const recommendations = useMemo(() => buildRecommendations(data), [data]);

  // Order snapshot by rixc desc.
  const ranked = useMemo(
    () => [...snapshot].sort((a, b) => (b.rixc ?? 0) - (a.rixc ?? 0)),
    [snapshot],
  );
  // Unified delta: in period mode compare first↔last of the range;
  // in snapshot mode fall back to week-over-week (rixc_prev).
  const periodDeltaOf = (r: ComparisonSnapshotRow): number => {
    if (isPeriod) {
      const last = r.rixc_last ?? r.rixc ?? 0;
      const first = r.rixc_first ?? r.rixc ?? 0;
      return last - first;
    }
    return (r.rixc ?? 0) - (r.rixc_prev ?? r.rixc ?? 0);
  };
  const colorByTk = useMemo(() => {
    const map = new Map<string, string>();
    entities.forEach((e, i) => map.set(e.ticker, LINE_COLORS[i % LINE_COLORS.length]));
    return map;
  }, [entities]);
  const nameByTk = useMemo(() => {
    const map = new Map<string, string>();
    entities.forEach((e) => map.set(e.ticker, e.name));
    snapshot.forEach((s) => { if (!map.has(s.tk)) map.set(s.tk, s.name); });
    return map;
  }, [entities, snapshot]);

  const verdict = useMemo(() => {
    if (ranked.length === 0) return "";
    const leader = ranked[0];
    const deltas = ranked
      .map((r) => ({ tk: r.tk, name: r.name, delta: periodDeltaOf(r) }))
      .filter((d) => Number.isFinite(d.delta));
    const up = [...deltas].sort((a, b) => b.delta - a.delta)[0];
    const down = [...deltas].sort((a, b) => a.delta - b.delta)[0];
    const parts: string[] = [];
    parts.push(`${leader.name} lidera la cesta con un RIXc de ${fmtNum(leader.rixc)}.`);
    const scopeUp = isPeriod ? "en el período" : "en la semana";
    const scopeDown = isPeriod ? "en el período" : "";
    if (up && up.delta > 0.05 && up.tk !== leader.tk) {
      parts.push(`${up.name} es quien más sube ${scopeUp} (${fmtDelta(up.delta)}).`);
    } else if (up && up.delta > 0.05) {
      parts.push(`Además, marca la mayor subida ${scopeUp} (${fmtDelta(up.delta)}).`);
    }
    if (down && down.delta < -0.05) {
      parts.push(`${down.name} registra el mayor retroceso${scopeDown ? " " + scopeDown : ""} (${fmtDelta(down.delta)}).`);
    }
    return parts.join(" ");
  }, [ranked, isPeriod]);

  // Evolution chart data — pivot to {week, [tk]: rixc}.
  const evoChartData = useMemo(() => {
    const byWeek = new Map<string, Record<string, number | string>>();
    for (const row of evolution) {
      if (!byWeek.has(row.week)) byWeek.set(row.week, { week: row.week });
      byWeek.get(row.week)![row.tk] = row.rixc;
    }
    return [...byWeek.values()].sort((a, b) =>
      String(a.week).localeCompare(String(b.week)),
    );
  }, [evolution]);

  // Per-model matrix (rows = models, cols = tickers)
  const modelOrder = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const r of permodel) {
      if (!seen.has(r.model)) {
        seen.add(r.model);
        ordered.push(r.model);
      }
    }
    return ordered;
  }, [permodel]);
  const permodelIndex = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of permodel) {
      if (!map.has(r.model)) map.set(r.model, new Map());
      map.get(r.model)!.set(r.tk, r.rix);
    }
    return map;
  }, [permodel]);
  const perTkExtremes = useMemo(() => {
    // min/max per ticker across models
    const map = new Map<string, { min: number; max: number; range: number }>();
    for (const e of entities) {
      const vals: number[] = [];
      for (const m of modelOrder) {
        const v = permodelIndex.get(m)?.get(e.ticker);
        if (typeof v === "number") vals.push(v);
      }
      if (vals.length) {
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        map.set(e.ticker, { min, max, range: max - min });
      }
    }
    return map;
  }, [entities, modelOrder, permodelIndex]);
  const maxRangeTk = useMemo(() => {
    let best: string | null = null;
    let bestR = -Infinity;
    for (const [tk, v] of perTkExtremes) {
      if (v.range > bestR) { bestR = v.range; best = tk; }
    }
    return best;
  }, [perTkExtremes]);

  // Metric best-value per row (for ▲ arrow).
  const metricBest = useMemo(() => {
    const map = new Map<string, string | null>(); // metric key -> tk with best value (or null)
    for (const row of METRIC_ROWS) {
      let bestTk: string | null = null;
      let bestVal: number | null = null;
      for (const s of snapshot) {
        const raw = (s as any)[row.field] as number | null | undefined;
        if (raw === null || raw === undefined || Number.isNaN(raw)) continue;
        if (bestVal === null) { bestVal = raw; bestTk = s.tk; continue; }
        const better = row.higherIsBetter ? raw > bestVal : raw < bestVal;
        if (better) { bestVal = raw; bestTk = s.tk; }
      }
      map.set(row.key, bestTk);
    }
    return map;
  }, [snapshot]);

  // Per-company reading (deterministic template).
  const readings = useMemo(() => {
    return ranked.map((r, idx) => {
      const delta = periodDeltaOf(r);
      const trend =
        delta > 0.5 ? "sube" : delta < -0.5 ? "baja" : "se mantiene estable";
      // Relative bests/worsts across the basket (excluding DRM).
      let best: { label: string; val: number } | null = null;
      let worst: { label: string; val: number } | null = null;
      for (const m of HIGHLIGHT_METRICS) {
        const val = (r as any)[m.field] as number | null | undefined;
        if (val === null || val === undefined || Number.isNaN(val)) continue;
        const peers = snapshot
          .filter((s) => s.tk !== r.tk)
          .map((s) => (s as any)[m.field] as number | null | undefined)
          .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
        if (peers.length === 0) continue;
        const peerMax = Math.max(...peers);
        const peerMin = Math.min(...peers);
        const overPeers = val - peerMax;
        const underPeers = val - peerMin;
        if (val > peerMax && (!best || overPeers > best.val)) {
          best = { label: m.label, val: overPeers };
        }
        if (val < peerMin && (!worst || underPeers < worst.val)) {
          worst = { label: m.label, val: underPeers };
        }
      }
      return { row: r, idx, delta, trend, best, worst };
    });
  }, [ranked, snapshot, isPeriod]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                Comparativa Reputacional Algorítmica
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {entities.map((e) => e.name).join(" · ")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Semana de referencia: <strong>{fmtWeek(latest_week)}</strong> · 6 modelos de IA
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1.5"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Datos deterministas desde la base de datos · cifras verificables · sin IA generativa
            </Badge>
          </div>
        </CardContent>
      </Card>

      <ExpertAnalysis
        type="comparison"
        tickers={entities.map((e) => e.ticker)}
        week={latest_week}
      />

      {/* Verdict */}
      {verdict && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Veredicto</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-base leading-relaxed">{verdict}</p>
          </CardContent>
        </Card>
      )}

      {/* Scoreboard */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ranked.map((r, idx) => {
          const delta = (r.rixc ?? 0) - (r.rixc_prev ?? r.rixc ?? 0);
          const isUp = delta > 0.05;
          const isDown = delta < -0.05;
          const color = colorByTk.get(r.tk) ?? "hsl(var(--primary))";
          return (
            <Card key={r.tk} className="relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
              <CardContent className="pt-5 pl-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      #{idx + 1} {medal(idx)}
                    </div>
                    <div className="font-semibold text-base mt-0.5">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.tk}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold tabular-nums">{fmtNum(r.rixc)}</div>
                    <div
                      className={cn(
                        "text-xs font-medium flex items-center gap-1 justify-end mt-1",
                        isUp && "text-emerald-600 dark:text-emerald-400",
                        isDown && "text-red-600 dark:text-red-400",
                        !isUp && !isDown && "text-muted-foreground",
                      )}
                    >
                      {isUp ? <ArrowUp className="h-3 w-3" /> : isDown ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      {fmtDelta(delta)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Rango entre modelos: <span className="font-mono">{fmtNum(r.rix_min)}–{fmtNum(r.rix_max)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Ranking & movement */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Ranking y movimiento</CardTitle>
          <p className="text-xs text-muted-foreground">
            Comparación con {fmtWeek(prev_week)}.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posición</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">RIXc</TableHead>
                <TableHead className="text-right">Semana anterior</TableHead>
                <TableHead className="text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((r, idx) => {
                const delta = (r.rixc ?? 0) - (r.rixc_prev ?? r.rixc ?? 0);
                return (
                  <TableRow key={r.tk}>
                    <TableCell className="font-medium">#{idx + 1} {medal(idx)}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{fmtNum(r.rixc)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmtNum(r.rixc_prev)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-semibold",
                        delta > 0.05 && "text-emerald-600 dark:text-emerald-400",
                        delta < -0.05 && "text-red-600 dark:text-red-400",
                      )}
                    >
                      {fmtDelta(delta)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Evolution chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Evolución del RIXc</CardTitle>
          <p className="text-xs text-muted-foreground">
            Serie semanal (≈13 semanas) por empresa.
          </p>
        </CardHeader>
        <CardContent className="pt-0 h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evoChartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => {
                  try {
                    const d = new Date(`${v}T00:00:00Z`);
                    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
                  } catch { return v; }
                }}
              />
              <YAxis domain={[45, 75]} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                labelFormatter={(v) => fmtWeek(String(v))}
                formatter={(val: number, name: string) => [fmtNum(val), nameByTk.get(name) ?? name]}
              />
              <Legend
                formatter={(value: string) => nameByTk.get(value) ?? value}
                wrapperStyle={{ fontSize: 12 }}
              />
              {entities.map((e) => (
                <Line
                  key={e.ticker}
                  type="monotone"
                  dataKey={e.ticker}
                  stroke={colorByTk.get(e.ticker)}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-model divergence */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Divergencia entre las 6 IAs</CardTitle>
          <p className="text-xs text-muted-foreground">
            RIX por modelo. Verde = máximo · rojo = mínimo por empresa.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modelo</TableHead>
                {entities.map((e) => (
                  <TableHead key={e.ticker} className="text-right">{e.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelOrder.map((m) => (
                <TableRow key={m}>
                  <TableCell className="font-medium">{MODEL_LABEL[m] ?? m}</TableCell>
                  {entities.map((e) => {
                    const val = permodelIndex.get(m)?.get(e.ticker);
                    const ext = perTkExtremes.get(e.ticker);
                    const isMax = ext && typeof val === "number" && val === ext.max;
                    const isMin = ext && typeof val === "number" && val === ext.min && ext.max !== ext.min;
                    return (
                      <TableCell
                        key={e.ticker}
                        className={cn(
                          "text-right font-mono",
                          isMax && "text-emerald-600 dark:text-emerald-400 font-semibold",
                          isMin && "text-red-600 dark:text-red-400 font-semibold",
                        )}
                      >
                        {fmtNum(val as number | undefined)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Rango (desacuerdo)</TableCell>
                {entities.map((e) => {
                  const ext = perTkExtremes.get(e.ticker);
                  const isMax = maxRangeTk === e.ticker && !!ext && ext.range > 0;
                  return (
                    <TableCell
                      key={e.ticker}
                      className={cn(
                        "text-right font-mono font-semibold",
                        isMax && "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {ext ? fmtNum(ext.range) : "—"}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 8 metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Las 8 métricas</CardTitle>
          <p className="text-xs text-muted-foreground">
            ▲ marca el valor más alto de cada fila (neutral).
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead>Qué mide</TableHead>
                {entities.map((e) => (
                  <TableHead key={e.ticker} className="text-right">{e.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRIC_ROWS.map((row) => {
                const bestTk = metricBest.get(row.key);
                return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">
                      {row.key === "RIXc"
                        ? "RIXc"
                        : (() => {
                            const def = METRIC_GLOSSARY.find((m) => m.code === row.key);
                            return def ? `${def.code} · ${def.name}` : row.key;
                          })()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                      {metricWhat(row.key)}
                    </TableCell>
                    {entities.map((e) => {
                      const s = snapshot.find((x) => x.tk === e.ticker);
                      const raw = s ? ((s as any)[row.field] as number | null | undefined) : undefined;
                      const isNa = row.key === "CXM" && (raw === null || raw === undefined);
                      const isBest = bestTk === e.ticker && raw !== null && raw !== undefined;
                      return (
                        <TableCell
                          key={e.ticker}
                          className={cn(
                            "text-right font-mono",
                            isBest && "text-primary font-semibold",
                          )}
                        >
                          {isNa ? "N/A" : fmtNum(raw)}
                          {isBest && <span className="ml-1">▲</span>}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-company reading */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Lectura por empresa</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {readings.map(({ row, idx, delta, trend, best, worst }) => {
            const recs = recommendations[row.tk] ?? [];
            return (
            <div
              key={row.tk}
              className="rounded-lg border border-border/60 p-4"
              style={{ borderLeft: `3px solid ${colorByTk.get(row.tk)}` }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h3 className="font-semibold">
                  {medal(idx)} {row.name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">#{idx + 1}</span>
                </h3>
                <span className="text-sm text-muted-foreground font-mono">
                  RIXc {fmtNum(row.rixc)} · rango {fmtNum(row.rix_min)}–{fmtNum(row.rix_max)}
                </span>
              </div>
              <p className="text-sm leading-relaxed">
                Ocupa la posición <strong>#{idx + 1}</strong> de {ranked.length} en la cesta.{" "}
                {trend === "sube"
                  ? `Sube ${fmtDelta(delta)} respecto a la semana anterior.`
                  : trend === "baja"
                    ? `Cae ${fmtDelta(delta)} respecto a la semana anterior.`
                    : `Se mantiene estable (${fmtDelta(delta)}).`}{" "}
                Divergencia entre modelos de <span className="font-mono">{fmtNum(row.rix_max - row.rix_min)}</span> puntos.
                {best && (
                  <> Destaca en <strong>{best.label}</strong> frente a las demás.</>
                )}
                {worst && (
                  <> Más floja en <strong>{worst.label}</strong>.</>
                )}
              </p>
              {recs.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {recs.map((rec, i) => {
                    const chip =
                      rec.severity === "alta"
                        ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/40"
                        : rec.severity === "media"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40"
                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40";
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", chip)}>
                          {rec.severity}
                        </span>
                        <span>
                          <strong className="font-semibold">{rec.title}.</strong>{" "}
                          <span className="text-muted-foreground">{rec.detail}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
          })}
        </CardContent>
      </Card>

      {/* Citations */}
      {citations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Menciones y fuentes citadas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Dominios que los 6 modelos referencian al hablar de cada empresa.
            </p>
          </CardHeader>
          <CardContent className="pt-0 space-y-5">
            {citations.map((c) => {
              const name = nameByTk.get(c.tk) ?? c.tk;
              const color = colorByTk.get(c.tk) ?? "hsl(var(--primary))";
              return (
                <div
                  key={c.tk}
                  className="rounded-lg border border-border/60 p-4"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <h3 className="font-semibold text-sm mb-2">
                    {name} —{" "}
                    <span className="font-normal text-muted-foreground">
                      {c.total_sources} fuentes citadas
                    </span>
                  </h3>
                  {c.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin fuentes verificadas para esta semana.</p>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {c.items.map((it, i) => (
                        <li
                          key={`${c.tk}-${i}`}
                          className="py-1.5 flex items-start justify-between gap-3 text-sm"
                        >
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all inline-flex items-center gap-1 min-w-0"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0 no-print" />
                            <span className="truncate">{it.domain}</span>
                          </a>
                          <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                            {it.models.join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Consenso de las IAs — evidencia temática (al final) */}
      <ConsensusCompact entities={entities.map((e) => ({ ticker: e.ticker, name: e.name }))} />

      {/* Methodology */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Metodología</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4 text-sm leading-relaxed">
          <p>
            El <strong>RIXc</strong> es un índice compuesto de reputación algorítmica: mide cómo perciben las
            inteligencias artificiales a una entidad a partir de 8 métricas normalizadas.
          </p>
          <div>
            <h4 className="font-semibold mb-2">Las 8 métricas</h4>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {METRIC_GLOSSARY.map((m) => (
                <li key={m.code} className="text-sm">
                  <span className="font-mono font-semibold">{m.code}</span>{" "}
                  <span className="font-semibold">· {m.name}</span>{" "}
                  <span className="text-muted-foreground">— {m.what}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Los 6 modelos consultados</h4>
            <p className="text-muted-foreground">
              ChatGPT, Perplexity, Gemini, DeepSeek, Grok y Qwen — todos con búsqueda web real y prompts idénticos
              para asegurar comparabilidad.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Cadencia y alcance</h4>
            <p className="text-muted-foreground">
              El barrido se ejecuta semanalmente (domingo). La métrica <strong>CXM</strong> no aplica a entidades sin
              componente B2C y aparece como <em>N/A</em> en esos casos.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Reproducibilidad</h4>
            <p className="text-muted-foreground">
              Todas las cifras se calculan de forma determinista desde la base de datos (<code className="font-mono text-xs">rix_runs_v2</code>);
              el mismo informe es idéntico y reproducible en cada carga.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ComparisonReport;