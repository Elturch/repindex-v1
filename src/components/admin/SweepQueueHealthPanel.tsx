import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useSweepStatus, useSweepThroughput } from '@/hooks/useSweepStatus';

function fmtEta(min: number | null) {
  if (min == null || !isFinite(min)) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

/**
 * Observabilidad de la nueva cola `sweep_queue` (Área 4):
 * - tickers/hora (ventana 10 min)
 * - ETA
 * - estado actual por status
 * - flag global `app_config.sweep_status`
 */
export function SweepQueueHealthPanel() {
  const { data: status } = useSweepStatus();
  const { data: thr, isLoading } = useSweepThroughput(10);

  const total = (thr?.pending_total ?? 0) + (thr?.processing_total ?? 0) + (thr?.done_total ?? 0) + (thr?.skipped_total ?? 0);
  const pct = total > 0 ? Math.round(((thr?.done_total ?? 0) / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Cola de barrido (sweep_queue)
          {status?.in_progress ? (
            <span className="ml-auto text-xs flex items-center gap-1 text-amber-600">
              <Loader2 className="h-3 w-3 animate-spin" /> en curso · {status.sweep_id ?? '—'}
            </span>
          ) : (
            <span className="ml-auto text-xs flex items-center gap-1 text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" /> inactivo
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> cargando métricas…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Throughput" value={`${Math.round(thr?.tickers_per_hour ?? 0)}/h`} icon={<Activity className="h-3 w-3" />} />
              <Metric label="ETA restante" value={fmtEta(thr?.eta_minutes ?? null)} icon={<Clock className="h-3 w-3" />} />
              <Metric label="Procesando" value={String(thr?.processing_total ?? 0)} />
              <Metric label="Saltados" value={String(thr?.skipped_total ?? 0)} icon={<AlertCircle className="h-3 w-3 text-amber-500" />} />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progreso global</span>
                <span>{thr?.done_total ?? 0} / {total} ({pct}%)</span>
              </div>
              <Progress value={pct} />
            </div>
            <div className="text-xs text-muted-foreground">
              Pendientes: {thr?.pending_total ?? 0} · Completados: {thr?.done_total ?? 0} · Ventana: 10 min
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}