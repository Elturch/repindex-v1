import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, TrendingUp, TrendingDown, Trophy, Search, ShieldCheck, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureRankingStylesInjected, bandFor } from "./blocks/rankingTokens";
import { Ribbon } from "./blocks/Ribbon";
import { SectionEyebrow } from "./blocks/SectionEyebrow";
import { Scorecard } from "./blocks/Scorecard";
import { KpiCard, type KpiTone } from "./blocks/KpiCard";
import { RankBar } from "./blocks/RankBar";
import { MetricGauge } from "./blocks/MetricGauge";
import { DivergenceRow } from "./blocks/DivergenceRow";
import { RecCard } from "./blocks/RecCard";
import { BrandFooter } from "./blocks/BrandFooter";
import { LineChart, type LineSeries } from "./blocks/LineChart";
import { ExpertAnalysisView } from "./ExpertAnalysisView";
import {
  useRankingDatapack,
  type RankingDatapackParams,
  type RankingDatapack,
  type RankingRow,
} from "@/hooks/useRankingDatapack";
import { METRIC_GLOSSARY } from "@/lib/reports/metricGlossary";

interface Props {
  params: RankingDatapackParams;
  scopeLabel?: string; // e.g. "Energía y Gas"
}

// --- Ranking-specific expert analysis: soft-fails to "en preparación". ---
function useRankingExpert(scope: object | null, week: string | null) {
  const [state, setState] = useState<{
    md: string | null;
    loading: boolean;
    ready: boolean;
  }>({ md: null, loading: false, ready: false });

  const key = scope && week ? `repindex.analysis.ranking.${JSON.stringify(scope)}.${week}` : null;
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!key) return;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        setState({ md: cached, loading: false, ready: true });
        return;
      }
    } catch {
      /* ignore */
    }
    let cancelled = false;
    setState({ md: null, loading: true, ready: false });
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("report-analysis", {
          body: { type: "ranking", scope },
        });
        if (cancelled) return;
        if (error) throw error;
        const md: string | undefined = (data as any)?.analysis;
        if (!md) throw new Error("empty");
        try {
          localStorage.setItem(key, md);
        } catch {
          /* ignore */
        }
        setState({ md, loading: false, ready: true });
      } catch {
        if (cancelled) return;
        setState({ md: null, loading: false, ready: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PALETTE = {
  sector: "var(--rr-primary-dark)",
  a: "#1a73e8",
  b: "#f97316",
  c: "#dc2626",
  d: "#10a37f",
  e: "#20808d",
};

function fmt1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}
function fmt0(n: number): string {
  return Math.round(n).toString();
}
function fmtWeek(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${day}-${months[d.getUTCMonth()]}`;
}
function fmtIsoLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}
function isoWeekLabel(iso: string): string {
  // Approximate ISO week number label.
  const d = new Date(`${iso}T00:00:00Z`);
  const target = new Date(d.getTime());
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNo = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function ExpertPanel({ md, loading }: { md: string | null; loading: boolean }) {
  return (
    <section className="rr-section">
      <SectionEyebrow>Análisis del experto</SectionEyebrow>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--rr-text-light)", fontSize: 13, padding: "18px 20px", border: "1px solid var(--rr-border)", borderRadius: 13, background: "linear-gradient(120deg,#eff6ff,#fff)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Generando análisis del experto…
        </div>
      ) : md ? (
        <ExpertAnalysisView markdown={md} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--rr-text-muted)", fontSize: 13, padding: "18px 20px", border: "1px solid var(--rr-border)", borderRadius: 13, background: "var(--rr-bg-alt)" }}>
          <AlertTriangle className="h-4 w-4" /> Análisis en preparación — próximamente disponible para esta vista.
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sector (snapshot) view
// ---------------------------------------------------------------------------

function SectorView({
  data,
  scopeLabel,
  expert,
}: {
  data: RankingDatapack;
  scopeLabel: string;
  expert: { md: string | null; loading: boolean };
}) {
  const rows = data.ranking ?? [];
  const avg = data.sector_avg?.rixc ?? 0;
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const spread = best && worst ? Math.abs(best.rixc - worst.rixc) : 0;

  // Biggest weekly mover (down = "caída de la semana").
  const biggestDown = [...rows]
    .filter((r) => typeof r.delta === "number")
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  const biggestUp = [...rows]
    .filter((r) => typeof r.delta === "number")
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];

  const leaders = rows.slice(0, 3);
  const laggards = rows.slice(-3).reverse();

  const divergents = [...rows]
    .map((r) => ({ ...r, range: (r.rix_max ?? 0) - (r.rix_min ?? 0) }))
    .sort((a, b) => b.range - a.range)
    .slice(0, 4);

  const scoreCardStats = [
    best
      ? { label: "Mejor", value: `${best.name} · ${fmt0(best.rixc)}`, variant: "best" as const }
      : null,
    worst
      ? { label: "Peor", value: `${worst.name} · ${fmt0(worst.rixc)}`, variant: "worst" as const }
      : null,
    { label: "Recorrido", value: `${fmt0(spread)} pts` },
  ].filter(Boolean) as Array<{ label: string; value: string; variant?: "best" | "worst" }>;

  const distTotal = Math.max(1, rows.length);
  const dist = data.distribution ?? { fuerte: 0, solido: 0, atencion: 0, critico: 0 };

  const metricAvg = data.sector_avg;

  return (
    <div className="rr-panel">
      <Ribbon
        kind="sector"
        subtitle={`${scopeLabel} · ${rows.length} empresas · Semana ${isoWeekLabel(data.latest_week)} (${fmtWeek(data.latest_week)})`}
        topLimit={data.scope?.limit ?? null}
      />
      <div className="rr-body">
        {/* Hero */}
        <section className="rr-section">
          <SectionEyebrow>Titular ejecutivo</SectionEyebrow>
          <div className="rr-hero">
            <div>
              <div className="rr-hero-headline">
                El sector <b>{scopeLabel}</b> promedia un RIXc de {fmt0(avg)} — {bandFor(avg) === "green" ? "zona de excelencia" : bandFor(avg) === "blue" ? "zona sólida" : bandFor(avg) === "amber" ? "zona de atención" : "zona crítica"}.
                {best ? <> {best.name} lidera ({fmt0(best.rixc)}).</> : null}
                {biggestDown && (biggestDown.delta ?? 0) < 0 ? (
                  <> La mayor caída de la semana es <em>{biggestDown.name} ({fmt0(biggestDown.delta ?? 0)})</em>.</>
                ) : null}
              </div>
              <div className="rr-caption">
                Radiografía de sector sobre los datos deterministas de la semana. El experto ordena las {rows.length} empresas, calcula la huella del sector y explica los patrones — sin consultar ninguna fuente externa.
              </div>
            </div>
            <Scorecard
              header="Media del sector · RIXc"
              big={fmt0(avg)}
              sub={`${rows.length} empresas · ${scopeLabel}`}
              stats={scoreCardStats}
            />
          </div>
        </section>

        {/* TL;DR */}
        <section className="rr-section">
          <SectionEyebrow>Lo esencial en 20 segundos</SectionEyebrow>
          <div className="rr-tldr">
            {best && (
              <KpiCard
                tone="green"
                icon={<Trophy size={18} />}
                title="Líder del sector"
                text={`${best.name} encabeza con RIXc ${fmt0(best.rixc)}${typeof best.delta === "number" ? ` (${best.delta >= 0 ? "+" : ""}${fmt0(best.delta)})` : ""}.`}
              />
            )}
            {biggestDown && (biggestDown.delta ?? 0) < 0 && (
              <KpiCard
                tone="red"
                icon={<TrendingDown size={18} />}
                title="Caída de la semana"
                text={`${biggestDown.name} pierde ${Math.abs(Math.round(biggestDown.delta ?? 0))} puntos y baja al puesto ${biggestDown.rank}. El movimiento a vigilar.`}
              />
            )}
            {metricAvg && (
              <KpiCard
                tone="green"
                icon={<ShieldCheck size={18} />}
                title="Fortaleza de sector"
                text={`CEM ${fmt0(metricAvg.cem)} y RMM ${fmt0(metricAvg.rmm)}: el sector está tranquilo y vigente.`}
              />
            )}
            {metricAvg && (
              <KpiCard
                tone="red"
                icon={<Search size={18} />}
                title="Debilidad de sector"
                text={`Autoridad de fuentes (SIM ${fmt0(metricAvg.sim)}) es el punto flaco común del sector.`}
              />
            )}
          </div>
        </section>

        {/* Ranking */}
        <section className="rr-section">
          <SectionEyebrow>Ranking del sector · {rows.length} empresas</SectionEyebrow>
          <div className="rr-legend">
            <span><i style={{ background: "var(--rr-green)" }} />80–100 excelente</span>
            <span><i style={{ background: "var(--rr-blue)" }} />60–79 sólido</span>
            <span><i style={{ background: "var(--rr-amber)" }} />40–59 atención</span>
            <span><i style={{ background: "var(--rr-red)" }} />0–39 crítico</span>
            <span><i style={{ width: 2, height: 11, borderRadius: 0, background: "var(--rr-primary-dark)" }} />media del sector ({fmt0(avg)})</span>
          </div>
          <div className="rr-rankbars">
            {rows.map((r, i) => (
              <RankBar
                key={r.tk}
                rank={r.rank ?? i + 1}
                name={r.name}
                sub={r.subsector ?? (r.cotiza === false ? "no cotiza" : null)}
                score={r.rixc}
                avg={avg}
                delta={r.delta}
                isLead={i === 0}
              />
            ))}
          </div>
        </section>

        {/* Fingerprint */}
        {metricAvg && (
          <section className="rr-section">
            <SectionEyebrow>Huella del sector · media por métrica</SectionEyebrow>
            <div className="rr-strip">
              {METRIC_GLOSSARY.map((m) => (
                <MetricGauge
                  key={m.key}
                  code={m.code}
                  label={m.name}
                  value={(metricAvg as any)[m.key] ?? null}
                />
              ))}
            </div>
            <div className="rr-caption">
              Media de cada métrica en las {rows.length} empresas. CXM se calcula solo sobre cotizadas.
            </div>
          </section>
        )}

        {/* Distribution */}
        <section className="rr-section">
          <SectionEyebrow>Distribución por banda</SectionEyebrow>
          <div className="rr-dist">
            <div className="rr-dist-bar">
              {dist.fuerte > 0 && (
                <div className="rr-dist-seg green" style={{ flex: dist.fuerte }}>{dist.fuerte}</div>
              )}
              {dist.solido > 0 && (
                <div className="rr-dist-seg blue" style={{ flex: dist.solido }}>{dist.solido}</div>
              )}
              {dist.atencion > 0 && (
                <div className="rr-dist-seg amber" style={{ flex: dist.atencion }}>{dist.atencion}</div>
              )}
              {dist.critico > 0 && (
                <div className="rr-dist-seg red" style={{ flex: dist.critico }}>{dist.critico}</div>
              )}
              {dist.fuerte + dist.solido + dist.atencion + dist.critico === 0 && (
                <div className="rr-dist-seg empty" style={{ flex: 1 }}>sin datos</div>
              )}
            </div>
            <div className="rr-dist-key">
              <div className="rr-dist-k"><i style={{ background: "var(--rr-green)" }} />Fuerte (80–100)<b>{dist.fuerte}</b></div>
              <div className="rr-dist-k"><i style={{ background: "var(--rr-blue)" }} />Sólido (60–79)<b>{dist.solido}</b></div>
              <div className="rr-dist-k"><i style={{ background: "var(--rr-amber)" }} />Atención (40–59)<b>{dist.atencion}</b></div>
              <div className="rr-dist-k"><i style={{ background: "var(--rr-red)" }} />Crítico (0–39)<b>{dist.critico}</b></div>
            </div>
          </div>
          <div className="rr-caption">Distribución de las {distTotal} empresas del alcance por banda de RIXc.</div>
        </section>

        {/* Leaders vs laggards */}
        <section className="rr-section">
          <SectionEyebrow>Líderes y rezagados</SectionEyebrow>
          <div className="rr-ro">
            <div className="rr-ro-col lead-col">
              <h3><TrendingUp size={16} />Cabeza del sector</h3>
              {leaders.map((r) => (
                <div className="rr-item" key={`lead-${r.tk}`}>
                  <span className="r">{r.rank}</span>
                  <div className="n">
                    <b>{r.name}</b>
                    <span>DCM {fmt0(r.dcm ?? 0)} · SIM {fmt0(r.sim ?? 0)} · CEM {fmt0(r.cem ?? 0)}</span>
                  </div>
                  <span className="sc">{fmt0(r.rixc)}</span>
                </div>
              ))}
            </div>
            <div className="rr-ro-col lag-col">
              <h3><TrendingDown size={16} />Cola del sector</h3>
              {laggards.map((r) => (
                <div className="rr-item" key={`lag-${r.tk}`}>
                  <span className="r">{r.rank}</span>
                  <div className="n">
                    <b>{r.name}</b>
                    <span>SIM {fmt0(r.sim ?? 0)} · NVM {fmt0(r.nvm ?? 0)} · GAM {fmt0(r.gam ?? 0)}</span>
                  </div>
                  <span className="sc">{fmt0(r.rixc)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Divergence */}
        <section className="rr-section">
          <SectionEyebrow>Divergencia entre modelos · lecturas más dispersas</SectionEyebrow>
          <div className="rr-diverge">
            {divergents.map((r) => (
              <DivergenceRow
                key={`dv-${r.tk}`}
                name={r.name}
                min={r.rix_min}
                max={r.rix_max}
                avg={r.rixc}
              />
            ))}
          </div>
          <div className="rr-caption">
            Cuanto más ancha la banda, mayor desacuerdo entre las 6 IAs sobre la misma empresa.
          </div>
        </section>

        <ExpertPanel md={expert.md} loading={expert.loading} />

        {/* Recommendations (deterministas) */}
        <section className="rr-section">
          <SectionEyebrow>Claves de lectura</SectionEyebrow>
          <div className="rr-recs">
            {best && (
              <RecCard
                n={1}
                primary
                title={`Aprender del líder: ${best.name} (RIXc ${fmt0(best.rixc)})`}
                why={`Marca el techo del alcance. Su coherencia entre modelos (DCM ${fmt0(best.dcm ?? 0)}) y autoridad de fuentes (SIM ${fmt0(best.sim ?? 0)}) son la referencia a batir.`}
              />
            )}
            {biggestDown && (biggestDown.delta ?? 0) < 0 && (
              <RecCard
                n={2}
                title={`Vigilar la caída de ${biggestDown.name}`}
                why={`Pierde ${Math.abs(Math.round(biggestDown.delta ?? 0))} puntos en la semana. Comprobar si es un ajuste puntual o el inicio de una tendencia.`}
              />
            )}
            {metricAvg && metricAvg.sim < 50 && (
              <RecCard
                n={3}
                title="Elevar la autoridad de las fuentes (SIM)"
                why={`La media del sector en SIM es ${fmt0(metricAvg.sim)}: la conversación se apoya en dominios de poca jerarquía. Es la palanca común de diferenciación.`}
              />
            )}
          </div>
        </section>
      </div>
      <BrandFooter configLabel={`RIXc · media ${fmt1(avg)} · ${rows.length} entidades`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evolucion view
// ---------------------------------------------------------------------------

function EvolucionView({
  data,
  scopeLabel,
  expert,
}: {
  data: RankingDatapack;
  scopeLabel: string;
  expert: { md: string | null; loading: boolean };
}) {
  const series = data.sector_series ?? [];
  const entities = data.entity_series ?? [];
  const period = data.period ?? [];
  const rows = data.ranking ?? [];
  const weeks = data.window?.weeks ?? series.length;
  const monthsSpan = Math.max(1, Math.round(weeks / 4.34));

  const firstAvg = series[0]?.avg ?? 0;
  const lastAvg = series[series.length - 1]?.avg ?? 0;
  const bandLow = series.length ? Math.min(...series.map((s) => s.avg)) : 0;
  const bandHigh = series.length ? Math.max(...series.map((s) => s.avg)) : 0;
  const variation = lastAvg - firstAvg;
  const isFlat = Math.abs(variation) < 2;

  // Movers by period delta.
  const sortedMovers = [...period].sort((a, b) => b.delta - a.delta);
  const upMovers = sortedMovers.filter((m) => m.delta > 0).slice(0, 4);
  const downMovers = [...sortedMovers].reverse().filter((m) => m.delta < 0).slice(0, 4);

  const sortedVol = [...period].sort((a, b) => b.volatility - a.volatility);
  const hiVol = sortedVol.slice(0, 4);
  const loVol = [...sortedVol].reverse().slice(0, 4);

  // Select 3-4 highlighted entities for the chart.
  const nameOf = (tk: string) => rows.find((r) => r.tk === tk)?.name ?? tk;

  const bestPeriod = sortedMovers[0]; // biggest riser
  const worstPeriod = sortedMovers[sortedMovers.length - 1]; // biggest faller
  const mostVol = sortedVol[0];
  const leaderNow = rows[0];

  const pickedTks = new Set<string>();
  const picked: Array<{ tk: string; label: string; color: string }> = [];
  const push = (tk: string | undefined, color: string, tag: string) => {
    if (!tk) return;
    if (pickedTks.has(tk)) return;
    pickedTks.add(tk);
    picked.push({ tk, label: `${nameOf(tk)} · ${tag}`, color });
  };
  push(leaderNow?.tk, PALETTE.a, "líder");
  push(worstPeriod?.tk, PALETTE.c, "en caída");
  push(bestPeriod?.tk, PALETTE.d, "al alza");
  push(mostVol?.tk, PALETTE.b, "volátil");

  const chartSeries: LineSeries[] = [
    {
      key: "sector",
      label: "Media sector",
      color: "#1a3a5c",
      dashed: true,
      points: series.map((s) => ({ x: s.wk, y: s.avg })),
    },
    ...picked
      .map((p) => {
        const es = entities.find((e) => e.tk === p.tk);
        if (!es) return null;
        return {
          key: p.tk,
          label: p.label,
          color: p.color,
          points: es.series.map((pt) => ({ x: pt.wk, y: pt.rixc })),
        } as LineSeries;
      })
      .filter(Boolean) as LineSeries[],
  ];

  const xLabels = useMemo(() => {
    // Show first/last months plus roughly monthly ticks (up to 7 labels).
    if (series.length === 0) return [];
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const uniqMonths: string[] = [];
    const seen = new Set<string>();
    series.forEach((s) => {
      const d = new Date(`${s.wk}T00:00:00Z`);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqMonths.push(months[d.getUTCMonth()]);
      }
    });
    return uniqMonths;
  }, [series]);

  const spread = Math.abs(variation);
  const variationLabel = isFlat
    ? `${variation >= 0 ? "+" : "−"}${fmt1(spread)} · plano`
    : `${variation >= 0 ? "+" : "−"}${fmt1(spread)}`;

  return (
    <div className="rr-panel">
      <Ribbon
        kind="evolucion"
        subtitle={`${scopeLabel} · ${monthsSpan} meses · ${fmtIsoLong(data.window.from)} → ${fmtIsoLong(data.window.to)} · ${weeks} semanas`}
      />
      <div className="rr-body">
        {/* Hero */}
        <section className="rr-section">
          <SectionEyebrow>Titular ejecutivo</SectionEyebrow>
          <div className="rr-hero">
            <div>
              <div className="rr-hero-headline">
                En {monthsSpan} meses la media del sector <b>{scopeLabel}</b> se mueve de {fmt1(firstAvg)} a {fmt1(lastAvg)} — {isFlat ? "tendencia plana" : variation > 0 ? "tendencia al alza" : "tendencia a la baja"}.
                {worstPeriod && worstPeriod.delta < -5 ? (
                  <> Debajo de la calma, <em>{nameOf(worstPeriod.tk)} encadena una caída de {Math.round(Math.abs(worstPeriod.delta))} puntos</em>.</>
                ) : null}
              </div>
              <div className="rr-caption">
                Evolución semanal sobre los datos deterministas del periodo. Serie desde {fmtIsoLong(data.window.from)} (no se incluye histórico anterior). El experto lee la tendencia; no consulta fuentes externas.
              </div>
            </div>
            <Scorecard
              header="Media del sector · hoy"
              big={fmt1(lastAvg)}
              sub={`${rows.length} empresas · ${weeks} semanas`}
              stats={[
                { label: "Al inicio", value: fmt1(firstAvg) },
                { label: "Variación", value: variationLabel, variant: isFlat ? "flat" : "default" },
                { label: "Banda del periodo", value: `${fmt1(bandLow)} – ${fmt1(bandHigh)}` },
              ]}
            />
          </div>
        </section>

        {/* TL;DR */}
        <section className="rr-section">
          <SectionEyebrow>Lo esencial en 20 segundos</SectionEyebrow>
          <div className="rr-tldr">
            <KpiCard
              tone="navy"
              icon={<Activity size={18} />}
              title={`Tendencia del sector: ${isFlat ? "plana" : variation > 0 ? "al alza" : "a la baja"}`}
              text={`Termina en ${fmt1(lastAvg)} desde ${fmt1(firstAvg)} (${variationLabel}).`}
            />
            {worstPeriod && (
              <KpiCard
                tone="red"
                icon={<TrendingDown size={18} />}
                title={`Caída del periodo: ${nameOf(worstPeriod.tk)}`}
                text={`De ${fmt0(worstPeriod.first)} a ${fmt0(worstPeriod.last)} (${worstPeriod.delta >= 0 ? "+" : ""}${fmt0(worstPeriod.delta)}).`}
              />
            )}
            {mostVol && (
              <KpiCard
                tone="amber"
                icon={<Activity size={18} />}
                title={`Más volátil: ${nameOf(mostVol.tk)}`}
                text={`σ ${fmt1(mostVol.volatility)} (${fmt0(mostVol.min)}–${fmt0(mostVol.max)}) — lecturas dispersas semana a semana.`}
              />
            )}
            {bestPeriod && (
              <KpiCard
                tone="green"
                icon={<TrendingUp size={18} />}
                title={`Mejor progresión: ${nameOf(bestPeriod.tk)}`}
                text={`Sube ${bestPeriod.delta >= 0 ? "+" : ""}${fmt0(bestPeriod.delta)} en el periodo — la que más terreno gana.`}
              />
            )}
          </div>
        </section>

        {/* Chart */}
        <section className="rr-section">
          <SectionEyebrow>Evolución del RIXc · {monthsSpan} meses</SectionEyebrow>
          <div className="rr-chartwrap">
            <div className="rr-clegend">
              <span className="rr-cl"><i className="dash" />Media del sector</span>
              {picked.map((p) => (
                <span className="rr-cl" key={p.tk}>
                  <i style={{ background: p.color }} />
                  {nameOf(p.tk)}
                </span>
              ))}
            </div>
            <LineChart series={chartSeries} xLabels={xLabels} />
          </div>
        </section>

        {/* Movers */}
        <section className="rr-section">
          <SectionEyebrow>Movimiento del periodo</SectionEyebrow>
          <div className="rr-ro">
            <div className="rr-ro-col up-col">
              <h3><TrendingUp size={16} />Los que suben</h3>
              {upMovers.map((m) => (
                <div className="rr-mv" key={`up-${m.tk}`}>
                  <b>{nameOf(m.tk)}</b>
                  <span className="path">{fmt0(m.first)} → {fmt0(m.last)}</span>
                  <span className="d up">+{fmt0(m.delta)}</span>
                </div>
              ))}
              {upMovers.length === 0 && (
                <div className="rr-caption">Ninguna empresa sube en neto en el periodo.</div>
              )}
            </div>
            <div className="rr-ro-col down-col">
              <h3><TrendingDown size={16} />Los que bajan</h3>
              {downMovers.map((m) => (
                <div className="rr-mv" key={`dn-${m.tk}`}>
                  <b>{nameOf(m.tk)}</b>
                  <span className="path">{fmt0(m.first)} → {fmt0(m.last)}</span>
                  <span className="d down">{fmt0(m.delta)}</span>
                </div>
              ))}
              {downMovers.length === 0 && (
                <div className="rr-caption">Ninguna empresa cae en neto en el periodo.</div>
              )}
            </div>
          </div>
        </section>

        {/* Volatility */}
        <section className="rr-section">
          <SectionEyebrow>Volatilidad de la percepción</SectionEyebrow>
          <div className="rr-vol">
            <div className="rr-vol-col">
              <h4><Activity size={15} />Más volátiles</h4>
              {hiVol.map((v) => (
                <div className="rr-vrow" key={`vh-${v.tk}`}>
                  <b>{nameOf(v.tk)}</b>
                  <div className="rr-vbar vhi"><i style={{ width: `${Math.min(100, v.volatility * 15)}%` }} /></div>
                  <span className="rr-vnum">σ {fmt1(v.volatility)}</span>
                </div>
              ))}
            </div>
            <div className="rr-vol-col">
              <h4><ShieldCheck size={15} />Más estables</h4>
              {loVol.map((v) => (
                <div className="rr-vrow" key={`vl-${v.tk}`}>
                  <b>{nameOf(v.tk)}</b>
                  <div className="rr-vbar vlo"><i style={{ width: `${Math.min(100, Math.max(4, v.volatility * 15))}%` }} /></div>
                  <span className="rr-vnum">σ {fmt1(v.volatility)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <ExpertPanel md={expert.md} loading={expert.loading} />

        {/* Claves de lectura */}
        <section className="rr-section">
          <SectionEyebrow>Claves de lectura del periodo</SectionEyebrow>
          <div className="rr-recs">
            <RecCard
              n={1}
              primary
              title={isFlat ? "El sector está plano: la foto grande no se mueve" : variation > 0 ? "El sector avanza en neto" : "El sector retrocede en neto"}
              why={`Media ${fmt1(firstAvg)} → ${fmt1(lastAvg)} en ${weeks} semanas. Banda ${fmt1(bandLow)}–${fmt1(bandHigh)}.`}
            />
            {worstPeriod && worstPeriod.delta < -5 && (
              <RecCard
                n={2}
                title={`Vigilar el deterioro sostenido de ${nameOf(worstPeriod.tk)}`}
                why={`Pierde ${Math.round(Math.abs(worstPeriod.delta))} puntos a lo largo del periodo. No es ruido semanal.`}
              />
            )}
            {mostVol && mostVol.volatility >= 3 && (
              <RecCard
                n={3}
                title={`No confundir volatilidad con tendencia: ${nameOf(mostVol.tk)}`}
                why={`Alta dispersión (σ ${fmt1(mostVol.volatility)}) sobre un neto ${fmt0(mostVol.first)}→${fmt0(mostVol.last)}. Los picos aislados no marcan dirección.`}
              />
            )}
          </div>
        </section>
      </div>
      <BrandFooter configLabel={`RIXc · media ${fmt1(lastAvg)} · ${weeks} semanas`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function RankingReport({ params, scopeLabel }: Props) {
  useEffect(() => {
    ensureRankingStylesInjected();
  }, []);

  const { data, isLoading, isError, error } = useRankingDatapack(params);

  const scopeText = useMemo(() => {
    if (scopeLabel) return scopeLabel;
    if (params.sector) return params.sector;
    if (params.subsector) return params.subsector;
    if (params.universe && params.universe.length > 0) return params.universe.join(" · ");
    return "Alcance seleccionado";
  }, [scopeLabel, params]);

  const scopeSector = data?.scope?.sector ?? null;
  const scopeSubsector = data?.scope?.subsector ?? null;
  const scopeUniverseKey = (data?.scope?.universe ?? []).join(",");
  const scopeTickersKey = (data?.scope?.tickers ?? []).join(",");
  const windowFrom = data?.window?.from ?? null;
  const windowTo = data?.window?.to ?? null;
  const modelsKey = (data?.models_used ?? []).join(",");
  const latestWeek = data?.latest_week ?? null;
  const scopeLimit = data?.scope?.limit ?? params.limit ?? null;

  const expertScope = useMemo(() => {
    if (!data) return null;
    return {
      sector: scopeSector,
      subsector: scopeSubsector,
      universe: scopeUniverseKey ? scopeUniverseKey.split(",") : [],
      tickers: scopeTickersKey ? scopeTickersKey.split(",") : [],
      from: windowFrom,
      to: windowTo,
      models: modelsKey ? modelsKey.split(",") : [],
      limit: scopeLimit,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    !!data,
    scopeSector,
    scopeSubsector,
    scopeUniverseKey,
    scopeTickersKey,
    windowFrom,
    windowTo,
    modelsKey,
    latestWeek,
    scopeLimit,
  ]);

  const expert = useRankingExpert(expertScope, latestWeek);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-16 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando datapack del ranking…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-3 py-16 justify-center text-destructive">
        <AlertTriangle className="h-5 w-5" />
        <span className="text-sm">
          No se pudo cargar el ranking. {(error as any)?.message ?? ""}
        </span>
      </div>
    );
  }

  const isEvolution = (data.window?.weeks ?? 1) > 1;

  return isEvolution ? (
    <EvolucionView data={data} scopeLabel={scopeText} expert={expert} />
  ) : (
    <SectorView data={data} scopeLabel={scopeText} expert={expert} />
  );
}

// Utility for callers to pull the "highest divergence" first — kept in the
// module so future views (Perfil, Comparativa) can reuse the same ordering.
export function sortByDivergence(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort((a, b) => (b.rix_max - b.rix_min) - (a.rix_max - a.rix_min));
}