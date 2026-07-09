import { useMemo } from "react";
import {
  Loader2,
  AlertTriangle,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  Minus,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExpertAnalysis } from "./ExpertAnalysis";
import { ConsensusBlock } from "./ConsensusBlock";
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
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  useProfileDatapack,
  type ProfileDatapack,
} from "@/hooks/useProfileDatapack";
import { buildProfileRecommendations } from "@/lib/reports/recommendationEngine";
import { METRIC_GLOSSARY } from "@/lib/reports/metricGlossary";

interface Props {
  ticker: string;
  from?: string | null;
  to?: string | null;
}

const MODEL_LABEL: Record<string, string> = {
  ChatGPT: "ChatGPT",
  Perplexity: "Perplexity",
  "Google Gemini": "Gemini",
  Gemini: "Gemini",
  Deepseek: "DeepSeek",
  DeepSeek: "DeepSeek",
  Grok: "Grok",
  Qwen: "Qwen",
};

type SnapField = "rixc" | "nvm" | "rmm" | "cem" | "dcm" | "gam" | "cxm" | "sim" | "drm";
type SectorAvgField =
  | "avg_rixc"
  | "avg_nvm"
  | "avg_rmm"
  | "avg_cem"
  | "avg_dcm"
  | "avg_gam"
  | "avg_cxm"
  | "avg_sim"
  | "avg_drm";

// All metric rows come from the canonical glossary — every metric is higher = better.
const METRIC_ROWS: Array<{
  key: string;
  name: string;
  what: string;
  snap: SnapField;
  sector: SectorAvgField;
  higherIsBetter: true;
}> = [
  {
    key: "RIXc",
    name: "Índice compuesto",
    what: "Índice compuesto de reputación algorítmica.",
    snap: "rixc",
    sector: "avg_rixc",
    higherIsBetter: true,
  },
  ...METRIC_GLOSSARY.map((m) => ({
    key: m.code,
    name: m.name,
    what: m.what,
    snap: m.key as SnapField,
    sector: `avg_${m.key}` as SectorAvgField,
    higherIsBetter: true as const,
  })),
];

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

export function ProfileReport({ ticker, from, to }: Props) {
  const { data, isLoading, isError, error } = useProfileDatapack(ticker, from ?? null, to ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-6">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <p className="text-sm">Cargando datapack determinista del perfil…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">No se pudo cargar el perfil.</p>
          <p className="text-muted-foreground mt-1">
            {(error as Error)?.message ?? "Reintenta más tarde."}
          </p>
        </div>
      </div>
    );
  }

  return <ProfileReportBody data={data} from={from ?? null} to={to ?? null} />;
}

function ProfileReportBody({
  data,
  from,
  to,
}: {
  data: ProfileDatapack;
  from?: string | null;
  to?: string | null;
}) {
  const { latest_week, entity, snapshot, sector, permodel, evolution } = data;
  const citations = data.citations ?? { total_sources: 0, items: [] };
  const recommendations = useMemo(() => buildProfileRecommendations(data), [data]);

  const isPeriod = data.mode === "period";
  const delta =
    isPeriod && snapshot.rixc_last != null && snapshot.rixc_first != null
      ? snapshot.rixc_last - snapshot.rixc_first
      : snapshot.rixc - (snapshot.rixc_prev ?? snapshot.rixc);
  const isUp = delta > 0.05;
  const isDown = delta < -0.05;

  const sectorDiff =
    sector.avg_rixc !== null && sector.avg_rixc !== undefined
      ? snapshot.rixc - sector.avg_rixc
      : null;

  const modelExtremes = useMemo(() => {
    if (!permodel || permodel.length === 0) return { min: null, max: null, range: 0 };
    const vals = permodel.map((p) => p.rix).filter((v) => typeof v === "number");
    if (vals.length === 0) return { min: null, max: null, range: 0 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { min, max, range: max - min };
  }, [permodel]);

  const sectorContext = [entity.sector, entity.subsector, entity.ibex_family_category]
    .filter((s) => s && s.length > 0)
    .join(" · ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{entity.name}</h1>
              {sectorContext && (
                <p className="text-sm text-muted-foreground mt-1">{sectorContext}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {isPeriod ? (
                  <>
                    Período: <strong>{fmtWeek(data.period_from)} → {fmtWeek(data.period_to)}</strong> · {data.weeks_count} semanas · media del período · 6 modelos de IA
                  </>
                ) : (
                  <>
                    Semana de referencia: <strong>{fmtWeek(latest_week)}</strong> · 6 modelos de IA
                  </>
                )}
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
        type="profile"
        tickers={[entity.ticker]}
        week={latest_week}
        from={from ?? null}
        to={to ?? null}
      />

      {/* Headline card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] items-center">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {isPeriod
                  ? `RIXc ${fmtWeek(data.period_from)} → ${fmtWeek(data.period_to)}`
                  : `RIXc ${fmtWeek(latest_week)}`}
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <div className="text-5xl font-bold tabular-nums">{fmtNum(snapshot.rixc)}</div>
                <div
                  className={cn(
                    "text-sm font-medium flex items-center gap-1",
                    isUp && "text-emerald-600 dark:text-emerald-400",
                    isDown && "text-red-600 dark:text-red-400",
                    !isUp && !isDown && "text-muted-foreground",
                  )}
                >
                  {isUp ? <ArrowUp className="h-4 w-4" /> : isDown ? <ArrowDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  {fmtDelta(delta)}
                </div>
              </div>
              {isPeriod && (
                <div className="mt-1 text-[11px] text-muted-foreground">media del período</div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                Rango entre modelos: <span className="font-mono">{fmtNum(snapshot.rix_min)}–{fmtNum(snapshot.rix_max)}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 p-4 min-w-[220px]">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Posición en su sector
              </div>
              <div className="text-2xl font-semibold mt-1">
                #{sector.rank} <span className="text-sm font-normal text-muted-foreground">de {sector.size}</span>
              </div>
              {sector.name && (
                <div className="text-xs text-muted-foreground mt-0.5">{sector.name}</div>
              )}
              <div className="mt-3 text-xs">
                Media del sector: <span className="font-mono">{fmtNum(sector.avg_rixc)}</span>
              </div>
              {sectorDiff !== null && (
                <div
                  className={cn(
                    "text-xs font-medium mt-1 flex items-center gap-1",
                    sectorDiff > 0 && "text-emerald-600 dark:text-emerald-400",
                    sectorDiff < 0 && "text-red-600 dark:text-red-400",
                  )}
                >
                  {sectorDiff > 0 ? <ArrowUp className="h-3 w-3" /> : sectorDiff < 0 ? <ArrowDown className="h-3 w-3" /> : null}
                  {sectorDiff > 0 ? "Por encima" : sectorDiff < 0 ? "Por debajo" : "En línea"} de la media ({fmtDelta(sectorDiff)})
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empresa vs sector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">La empresa frente a su sector</CardTitle>
          <p className="text-xs text-muted-foreground">
            Comparación métrica a métrica con la media del sector.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead>Qué mide</TableHead>
                <TableHead className="text-right">Esta empresa</TableHead>
                <TableHead className="text-right">Media del sector</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRIC_ROWS.map((row) => {
                const raw = (snapshot as any)[row.snap] as number | null | undefined;
                const avg = row.sector ? ((sector as any)[row.sector] as number | null | undefined) : null;
                const isNa = row.key === "CXM" && (raw === null || raw === undefined);
                let diff: number | null = null;
                if (
                  typeof raw === "number" &&
                  !Number.isNaN(raw) &&
                  typeof avg === "number" &&
                  !Number.isNaN(avg)
                ) {
                  diff = raw - avg;
                }
                // For DRM lower is better: invert color logic.
                const positiveGood = row.higherIsBetter;
                const isBetter = diff !== null && (positiveGood ? diff > 0 : diff < 0);
                const isWorse = diff !== null && (positiveGood ? diff < 0 : diff > 0);
                return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">
                      {row.key === "RIXc" ? "RIXc" : `${row.key} · ${row.name}`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                      {row.what}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {isNa ? "N/A" : fmtNum(raw)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {fmtNum(avg)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-semibold",
                        isBetter && "text-emerald-600 dark:text-emerald-400",
                        isWorse && "text-red-600 dark:text-red-400",
                      )}
                    >
                      {diff === null ? "—" : fmtDelta(diff)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Evolution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Evolución del RIXc</CardTitle>
          <p className="text-xs text-muted-foreground">
            {isPeriod ? `Serie del período (${data.weeks_count} semanas).` : "Serie semanal."}
          </p>
        </CardHeader>
        <CardContent className="pt-0 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolution} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => {
                  try {
                    const d = new Date(`${v}T00:00:00Z`);
                    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
                  } catch {
                    return v;
                  }
                }}
              />
              <YAxis domain={[45, 75]} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
                labelFormatter={(v) => fmtWeek(String(v))}
                formatter={(val: number) => [fmtNum(val), "RIXc"]}
              />
              <Line
                type="monotone"
                dataKey="rixc"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Divergencia entre 6 IAs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Divergencia entre las 6 IAs</CardTitle>
          <p className="text-xs text-muted-foreground">
            RIX por modelo. Verde = máximo · rojo = mínimo.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">RIX</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permodel.map((p) => {
                const isMax =
                  modelExtremes.max !== null && p.rix === modelExtremes.max && modelExtremes.range > 0;
                const isMin =
                  modelExtremes.min !== null && p.rix === modelExtremes.min && modelExtremes.range > 0;
                return (
                  <TableRow key={p.model}>
                    <TableCell className="font-medium">{MODEL_LABEL[p.model] ?? p.model}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono",
                        isMax && "text-emerald-600 dark:text-emerald-400 font-semibold",
                        isMin && "text-red-600 dark:text-red-400 font-semibold",
                      )}
                    >
                      {fmtNum(p.rix)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Rango (desacuerdo)</TableCell>
                <TableCell className="text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                  {fmtNum(modelExtremes.range)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Análisis y recomendaciones</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Sin alertas relevantes esta semana.
            </p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((rec, i) => {
                const chip =
                  rec.severity === "alta"
                    ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/40"
                    : rec.severity === "media"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40";
                return (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        chip,
                      )}
                    >
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
        </CardContent>
      </Card>

      {/* Citations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Menciones y fuentes citadas</CardTitle>
          <p className="text-xs text-muted-foreground">
            {citations.total_sources} fuentes citadas por los 6 modelos.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {citations.items.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Sin fuentes verificadas para esta semana.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {citations.items.map((it, i) => (
                <li
                  key={`${it.url}-${i}`}
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
        </CardContent>
      </Card>

      {/* Consenso de las IAs — evidencia temática (al final) */}
      <ConsensusBlock ticker={entity.ticker} />

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
              Todas las cifras se calculan de forma determinista desde la base de datos (
              <code className="font-mono text-xs">rix_runs_v2</code>); el mismo informe es idéntico y reproducible en
              cada carga.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ProfileReport;