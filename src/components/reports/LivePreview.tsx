import { useEffect, useState } from "react";
import { AlertCircle, Database, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  CoherenceWarning,
  computeScopeSize,
  getScopeTickers,
  CompanyMeta,
} from "@/lib/reports/coherenceEngine";
import { FilterState } from "@/lib/reports/filterState";

interface Props {
  state: FilterState;
  warnings: CoherenceWarning[];
  companies: CompanyMeta[];
}

interface PreviewCounts {
  observations: number;
  uniqueTickers: number;
  uniqueWeeks: number;
  uniqueModels: number;
  sample: any[];
}

export function LivePreview({ state, warnings, companies }: Props) {
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<PreviewCounts | null>(null);

  const scopeSize = computeScopeSize(state, companies);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const tickers = getScopeTickers(state, companies);
        let q = supabase
          .from("rix_runs_v2")
          .select(
            `id, "05_ticker", "02_model_name", "06_period_from", "07_period_to", "09_rix_score", "03_target_name"`,
            { count: "exact" },
          )
          .gte("06_period_from", state.window.value.from < "2026-01-01" ? "2026-01-01" : state.window.value.from)
          .lte("07_period_to", state.window.value.to)
          .in("02_model_name", state.models.value as string[])
          .limit(50);
        if (tickers.length > 0 && tickers.length < 200) {
          q = q.in("05_ticker", tickers);
        }
        const { data, count, error } = await q;
        if (error) throw error;
        const rows = data ?? [];
        setCounts({
          observations: count ?? rows.length,
          uniqueTickers: new Set(rows.map((r: any) => r["05_ticker"])).size,
          uniqueWeeks: new Set(rows.map((r: any) => r["06_period_from"])).size,
          uniqueModels: new Set(rows.map((r: any) => r["02_model_name"])).size,
          sample: rows.slice(0, 5),
        });
      } catch (e) {
        console.error("[LivePreview]", e);
        setCounts(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [
    state.window.value.from,
    state.window.value.to,
    state.models.value.join("|"),
    state.tickers.value.join("|"),
    state.universe.value.join("|"),
    state.sector.value.join("|"),
    state.subsector.value.join("|"),
    companies.length,
  ]);

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Vista previa del Datapack
            </h3>
            {loading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Empresas alcance" value={scopeSize || "—"} />
            <Stat label="Observaciones" value={counts?.observations ?? "—"} />
            <Stat label="Semanas" value={counts?.uniqueWeeks ?? "—"} />
            <Stat label="Modelos" value={counts?.uniqueModels ?? state.models.value.length} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            <Badge>Intent: {state.intent.value}</Badge>
            <Badge>{state.window.value.from} → {state.window.value.to}</Badge>
            <Badge>{state.granularity.value}</Badge>
            <Badge>Métricas: {state.axisMetrics.value.join(", ")}</Badge>
          </div>
        </CardContent>
      </Card>

      {warnings.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Avisos de coherencia
            </h3>
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className={cn(
                    "text-xs px-2 py-1.5 rounded border",
                    w.level === "error" &&
                      "bg-destructive/10 border-destructive/30 text-destructive",
                    w.level === "warning" &&
                      "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
                    w.level === "info" &&
                      "bg-muted border-border text-muted-foreground",
                  )}
                >
                  <span className="font-mono opacity-60">[{w.rule}]</span> {w.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Muestra (5 filas)
          </h3>
          {!counts || counts.sample.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin datos en el alcance actual.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-1.5 font-medium">Ticker</th>
                    <th className="text-left py-1.5 font-medium">Empresa</th>
                    <th className="text-left py-1.5 font-medium">Modelo</th>
                    <th className="text-left py-1.5 font-medium">Semana</th>
                    <th className="text-right py-1.5 font-medium">RIX</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.sample.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="py-1.5 font-mono">{r["05_ticker"]}</td>
                      <td className="py-1.5 truncate max-w-[180px]">
                        {r["03_target_name"]}
                      </td>
                      <td className="py-1.5">{r["02_model_name"]}</td>
                      <td className="py-1.5 font-mono opacity-70">
                        {r["06_period_from"]}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {r["09_rix_score"] ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-border/40 rounded-md px-3 py-2 bg-card/40">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">
      {children}
    </span>
  );
}