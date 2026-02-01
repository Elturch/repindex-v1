import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Activity,
  Pause,
  Zap,
  Timer,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useUnifiedSweepMetrics, useRefreshSweepMetrics } from '@/hooks/useUnifiedSweepMetrics';

type SystemState = 'running' | 'stuck' | 'idle' | 'complete' | 'unknown';

export function SweepHealthDashboard() {
  const { toast } = useToast();
  const { data: metrics, isLoading, refetch } = useUnifiedSweepMetrics();
  const refreshAllMetrics = useRefreshSweepMetrics();
  
  // Action states
  const [forcing, setForcing] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  // ============ ACTIONS ============
  const handleForce = async () => {
    if (!metrics) return;
    setForcing(true);
    try {
      const { data } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'auto_recovery' },
      });
      toast({ 
        title: '⚡ Auto-recovery disparado', 
        description: data?.firedCount ? `${data.firedCount} empresas en proceso` : data?.action 
      });
      refreshAllMetrics();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setForcing(false);
    }
  };

  const handleResetAll = async () => {
    if (!metrics || !confirm(`¿Reiniciar TODO ${metrics.sweepId}?`)) return;
    setResettingAll(true);
    try {
      await supabase.from('sweep_progress')
        .update({ status: 'pending', started_at: null, completed_at: null, retry_count: 0 })
        .eq('sweep_id', metrics.sweepId);
      toast({ title: '🔄 Reset completo' });
      refreshAllMetrics();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setResettingAll(false);
    }
  };

  // ============ DETERMINE STATE ============
  const getSystemState = (): SystemState => {
    if (!metrics) return 'unknown';
    // Complete: all companies have 6/6 models
    if (metrics.companyCompletionRate === 100) return 'complete';
    // Stuck: nothing processing but work remains
    if (metrics.searchProcessing === 0 && (metrics.searchPending > 0 || metrics.recordsPendingAnalysis > 0)) {
      return 'stuck';
    }
    // Running: actively processing
    if (metrics.searchProcessing > 0) return 'running';
    // Idle: nothing pending
    if (metrics.searchPending === 0 && metrics.searchProcessing === 0) return 'idle';
    return 'idle';
  };

  const state = getSystemState();

  // ============ RENDER ============
  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className="mb-6">
        <CardContent className="py-12 text-center text-muted-foreground">
          No hay barrido activo
        </CardContent>
      </Card>
    );
  }

  // Calculate display metrics
  const totalSearched = metrics.searchCompleted + metrics.searchFailed;
  const totalExpected = totalSearched + metrics.searchPending + metrics.searchProcessing;
  const searchProgress = totalExpected > 0 ? Math.round((metrics.searchCompleted / totalExpected) * 100) : 0;
  
  // Use COMPANY completion rate for the main progress (more meaningful)
  const mainProgress = metrics.companyCompletionRate;

  return (
    <Card className={cn(
      "mb-6 border-2 transition-all duration-300",
      state === 'running' && "border-green-500/50 bg-green-500/5",
      state === 'stuck' && "border-yellow-500/50 bg-yellow-500/5",
      state === 'complete' && "border-green-600/50 bg-green-600/5",
      state === 'idle' && "border-muted-foreground/30 bg-muted/5",
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            {/* Estado visual */}
            <div className={cn(
              "relative w-10 h-10 rounded-full flex items-center justify-center",
              state === 'running' && "bg-green-500",
              state === 'stuck' && "bg-yellow-500",
              state === 'complete' && "bg-green-600",
              state === 'idle' && "bg-muted-foreground",
            )}>
              {state === 'running' && (
                <>
                  <Activity className="w-5 h-5 text-white" />
                  <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />
                </>
              )}
              {state === 'stuck' && <Pause className="w-5 h-5 text-white" />}
              {state === 'complete' && <CheckCircle2 className="w-5 h-5 text-white" />}
              {state === 'idle' && <Clock className="w-5 h-5 text-white" />}
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <span>Barrido {metrics.sweepId}</span>
                {state !== 'complete' && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    AUTO
                  </Badge>
                )}
              </div>
              <div className="text-sm font-normal text-muted-foreground">
                {state === 'running' && 'Procesando automáticamente'}
                {state === 'stuck' && '⚠️ Esperando - Sin actividad'}
                {state === 'complete' && 'Todas las empresas completadas (6/6)'}
                {state === 'idle' && 'En espera'}
              </div>
            </div>
          </CardTitle>

          <div className="text-right">
            <div className="text-3xl font-bold">{mainProgress}%</div>
            <div className="text-sm text-muted-foreground">
              {metrics.companiesComplete}/{metrics.totalCompanies} empresas (6/6)
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Barra de progreso - basada en empresas completadas */}
        <Progress 
          value={mainProgress} 
          className={cn(
            "h-3",
            state === 'complete' && "[&>div]:bg-green-600",
            state === 'running' && "[&>div]:bg-green-500",
            state === 'stuck' && "[&>div]:bg-yellow-500",
          )} 
        />

        {/* Métricas principales - UNIFICADAS desde rix_runs_v2 */}
        <div className="grid grid-cols-5 gap-2 text-center text-sm">
          <div className="rounded bg-green-500/10 p-2">
            <div className="font-bold text-green-600">{metrics.companiesComplete}</div>
            <div className="text-xs text-muted-foreground">Completas (6/6)</div>
          </div>
          <div className="rounded bg-blue-500/10 p-2">
            <div className="font-bold text-blue-600">{metrics.companiesPartial}</div>
            <div className="text-xs text-muted-foreground">Parciales (1-5)</div>
          </div>
          <div className="rounded bg-yellow-500/10 p-2">
            <div className="font-bold text-yellow-600">{metrics.recordsPendingAnalysis}</div>
            <div className="text-xs text-muted-foreground">Analizables</div>
          </div>
          <div className="rounded bg-red-500/10 p-2">
            <div className="font-bold text-red-600">{metrics.searchFailed}</div>
            <div className="text-xs text-muted-foreground">Fallidos</div>
          </div>
          <div className="rounded bg-purple-500/10 p-2">
            <div className="font-bold text-purple-600">{metrics.searchProcessing}</div>
            <div className="text-xs text-muted-foreground">Procesando</div>
          </div>
        </div>

        {/* Record-level progress */}
        <div className="flex items-center justify-between text-sm border-t pt-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>Análisis: <span className="font-medium text-foreground">
                {metrics.recordsWithScore}/{metrics.totalRecords} ({metrics.recordCompletionRate}%)
              </span></span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Timer className="w-4 h-4" />
              <span>Búsqueda: <span className="font-medium text-foreground">
                {metrics.searchCompleted}/{totalExpected} ({searchProgress}%)
              </span></span>
            </div>
          </div>
          <div className="text-muted-foreground text-xs">
            Actualizado: {formatDistanceToNow(metrics.lastUpdated, { locale: es, addSuffix: true })}
          </div>
        </div>

        {/* Mensaje de alerta si hay pendientes analizables */}
        {metrics.recordsPendingAnalysis > 0 && (
          <div className="p-3 rounded-lg bg-amber-500/15 text-amber-700 text-center text-sm font-medium flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {metrics.recordsPendingAnalysis} registros tienen datos pero faltan por analizar
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-wrap justify-center gap-2 pt-2">          
          {state !== 'complete' && (metrics.searchPending > 0 || state === 'stuck' || state === 'idle') && (
            <Button size="sm" onClick={handleForce} disabled={forcing}>
              {forcing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
              Forzar Ahora
            </Button>
          )}

          {state !== 'complete' && (
            <Button 
              size="sm"
              variant="outline" 
              onClick={handleResetAll}
              disabled={resettingAll}
              className="border-red-500 text-red-600 hover:bg-red-500/10"
            >
              {resettingAll ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
              Reset Total
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {/* Info del sistema auto */}
        {state !== 'complete' && (
          <div className="text-xs text-center text-muted-foreground border-t pt-3">
            🔄 CRON auto-recovery activo cada 5 min • Máximo 3 empresas simultáneas • Limpieza automática de zombis
          </div>
        )}
      </CardContent>
    </Card>
  );
}
