import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Microscope, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Snapshot {
  id: string;
  created_at: string;
  period_start: string;
  period_end: string;
  n_samples: number;
  n_tickers: number;
  n_weeks: number;
  state_distribution: Record<string, { n: number; pct: number }>;
  range_by_polarity: {
    bearish: { median: number; n: number };
    neutral: { median: number; n: number };
    bullish: { median: number; n: number };
  };
  spearman: { rho: number | null; p_value: number | null; n: number };
  mann_whitney: { U: number | null; p_value: number | null; n_bearish: number; n_bullish: number };
  theme_tags_available: boolean;
  range_by_theme: Record<string, { median: number; n: number }> | null;
  top_crisis_cases: Array<{ ticker: string; week: string; mean: number; range: number }>;
  hypothesis_verdict: 'supported' | 'refuted' | 'inconclusive';
}

const verdictMeta: Record<Snapshot['hypothesis_verdict'], { label: string; cls: string }> = {
  supported: { label: 'Soportada', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  refuted: { label: 'Refutada', cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
  inconclusive: { label: 'Inconclusa', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
};

function fmtP(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—';
  if (p < 1e-6) return p.toExponential(2);
  return p.toFixed(4);
}

export const ConsensusHealthPanel: React.FC = () => {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('consensus_health_studies')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      toast({ title: 'Error cargando historial', description: error.message, variant: 'destructive' });
    } else {
      setHistory((data ?? []) as unknown as Snapshot[]);
    }
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, []);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('consensus-health-study', { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Fallo desconocido');
      toast({ title: 'Estudio ejecutado', description: `Veredicto: ${data.snapshot.hypothesis_verdict}` });
      await loadHistory();
    } catch (e: any) {
      toast({ title: 'Error ejecutando estudio', description: String(e?.message ?? e), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const latest = history[0];
  const previous = history[1];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Microscope className="h-5 w-5 text-primary" />
              Estudio empírico de consenso entre IAs
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Replica la Fase 1 del estudio (Spearman ρ, Mann-Whitney U, distribución de
              estados firmados) sobre todo el histórico de <code>rix_runs_v2</code> desde
              2026-01-01. Cada ejecución se guarda como snapshot para vigilar si la
              hipótesis "consenso de crisis" emerge a medida que se acumulan datos.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={loadHistory} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Microscope className="h-4 w-4" />}
              {running ? 'Ejecutando…' : 'Ejecutar estudio'}
            </Button>
          </div>
        </CardHeader>

        {latest && (
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={`border ${verdictMeta[latest.hypothesis_verdict].cls}`}>
                Veredicto: {verdictMeta[latest.hypothesis_verdict].label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(latest.created_at).toLocaleString('es-ES')} · período {latest.period_start} → {latest.period_end}
              </span>
              <span className="text-xs text-muted-foreground">
                {latest.n_samples} muestras · {latest.n_tickers} tickers · {latest.n_weeks} semanas
              </span>
              {!latest.theme_tags_available && (
                <Badge variant="outline" className="text-xs">weekly_theme_tags vacía</Badge>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold mb-2">Distribución de estados</h4>
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(latest.state_distribution).map(([k, v]) => (
                      <tr key={k} className="border-b last:border-0">
                        <td className="py-1 capitalize">{k}</td>
                        <td className="py-1 text-right tabular-nums">{v.n}</td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">{v.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Mediana de range por banda de polaridad</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-1">Banda</th>
                      <th className="text-right py-1">Mediana range</th>
                      <th className="text-right py-1">n</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b"><td className="py-1">bearish (mean &lt; 50)</td><td className="text-right tabular-nums">{latest.range_by_polarity.bearish.median}</td><td className="text-right tabular-nums">{latest.range_by_polarity.bearish.n}</td></tr>
                    <tr className="border-b"><td className="py-1">neutral (50–65)</td><td className="text-right tabular-nums">{latest.range_by_polarity.neutral.median}</td><td className="text-right tabular-nums">{latest.range_by_polarity.neutral.n}</td></tr>
                    <tr><td className="py-1">bullish (mean ≥ 65)</td><td className="text-right tabular-nums">{latest.range_by_polarity.bullish.median}</td><td className="text-right tabular-nums">{latest.range_by_polarity.bullish.n}</td></tr>
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Spearman ρ (mean vs range)</h4>
                <p className="text-sm">ρ = <span className="font-mono">{latest.spearman.rho ?? '—'}</span> · p = <span className="font-mono">{fmtP(latest.spearman.p_value)}</span> · n = {latest.spearman.n}</p>
                <p className="text-xs text-muted-foreground mt-1">ρ negativo y significativo = a menor RIX, mayor dispersión (refuta consenso de crisis a nivel agregado).</p>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Mann-Whitney U (bearish vs bullish)</h4>
                <p className="text-sm">U = <span className="font-mono">{latest.mann_whitney.U ?? '—'}</span> · p = <span className="font-mono">{fmtP(latest.mann_whitney.p_value)}</span></p>
                <p className="text-xs text-muted-foreground mt-1">n bearish: {latest.mann_whitney.n_bearish} · n bullish: {latest.mann_whitney.n_bullish}</p>
              </div>
            </div>

            {latest.range_by_theme && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Mediana de range por tag temático</h4>
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(latest.range_by_theme).map(([k, v]) => (
                      <tr key={k} className="border-b last:border-0">
                        <td className="py-1">{k}</td>
                        <td className="py-1 text-right tabular-nums">{v.median}</td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">n={v.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2">Top 10 casos "consenso de crisis"</h4>
              {latest.top_crisis_cases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ningún caso (range≤10 ∧ mean&lt;50) en el período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-1">Ticker</th>
                      <th className="text-left py-1">Semana</th>
                      <th className="text-right py-1">Mean</th>
                      <th className="text-right py-1">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.top_crisis_cases.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 font-mono">{c.ticker}</td>
                        <td className="py-1">{c.week}</td>
                        <td className="py-1 text-right tabular-nums">{c.mean}</td>
                        <td className="py-1 text-right tabular-nums">{c.range}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {previous && (
              <div className="text-xs text-muted-foreground border-t pt-3">
                Δ vs snapshot anterior ({new Date(previous.created_at).toLocaleDateString('es-ES')}):
                {' '}crisis {(latest.state_distribution.crisis.pct - previous.state_distribution.crisis.pct).toFixed(2)}pp ·
                {' '}mediana range bearish {(latest.range_by_polarity.bearish.median - previous.range_by_polarity.bearish.median).toFixed(2)} ·
                {' '}veredicto previo: {verdictMeta[previous.hypothesis_verdict].label.toLowerCase()}.
              </div>
            )}
          </CardContent>
        )}

        {!latest && !loading && (
          <CardContent>
            <p className="text-sm text-muted-foreground">Aún no hay snapshots. Ejecuta el estudio para generar el primero.</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial (últimos 10 snapshots)</CardTitle>
          <CardDescription>Sigue la evolución temporal del veredicto y los indicadores clave.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin historial.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-right py-2">n muestras</th>
                  <th className="text-right py-2">% crisis</th>
                  <th className="text-right py-2">Med. range bearish</th>
                  <th className="text-right py-2">Med. range bullish</th>
                  <th className="text-right py-2">Spearman ρ</th>
                  <th className="text-right py-2">MW p</th>
                  <th className="text-right py-2">Veredicto</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2">{new Date(s.created_at).toLocaleString('es-ES')}</td>
                    <td className="py-2 text-right tabular-nums">{s.n_samples}</td>
                    <td className="py-2 text-right tabular-nums">{s.state_distribution?.crisis?.pct ?? '—'}%</td>
                    <td className="py-2 text-right tabular-nums">{s.range_by_polarity?.bearish?.median ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums">{s.range_by_polarity?.bullish?.median ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums">{s.spearman?.rho ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums">{fmtP(s.mann_whitney?.p_value ?? null)}</td>
                    <td className="py-2 text-right">
                      <Badge className={`border text-xs ${verdictMeta[s.hypothesis_verdict].cls}`}>
                        {verdictMeta[s.hypothesis_verdict].label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConsensusHealthPanel;