import { Loader2 } from 'lucide-react';
import { useSweepStatus, useSweepThroughput } from '@/hooks/useSweepStatus';

function fmtEta(min: number | null) {
  if (min == null || !isFinite(min)) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

/**
 * Banda fija superior visible cuando el sistema está ejecutando un barrido masivo.
 * Avisa al usuario de que algunas vistas pueden tardar más o mostrar datos parciales.
 */
export function SweepInProgressBanner() {
  const { data: status } = useSweepStatus();
  const { data: thr } = useSweepThroughput(10);
  if (!status?.in_progress) return null;

  const done = thr?.done_total ?? 0;
  const total = (thr?.pending_total ?? 0) + (thr?.processing_total ?? 0) + done + (thr?.skipped_total ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-2 flex items-center justify-center gap-3">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="font-medium">Procesando barrido semanal</span>
      <span className="opacity-70">
        {done}/{total} análisis ({pct}%) · {Math.round(thr?.tickers_per_hour ?? 0)}/h · ETA {fmtEta(thr?.eta_minutes ?? null)}
      </span>
    </div>
  );
}