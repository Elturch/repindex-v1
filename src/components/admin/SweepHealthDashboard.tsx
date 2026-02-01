import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  Loader2,
  RefreshCw,
  Zap,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useUnifiedSweepMetrics, useRefreshSweepMetrics } from '@/hooks/useUnifiedSweepMetrics';

export function SweepHealthDashboard() {
  const { toast } = useToast();
  const { data: metrics, isLoading, refetch } = useUnifiedSweepMetrics();
  const refreshAllMetrics = useRefreshSweepMetrics();
  const [forcing, setForcing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleForce = async () => {
    if (!metrics) return;
    setForcing(true);
    try {
      const { data: recoveryData } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'auto_recovery' },
      });
      
      const { data: triggersData } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { process_triggers_only: true },
      });
      
      const firedCount = recoveryData?.firedCount || 0;
      const triggersProcessed = triggersData?.triggersProcessed || 0;
      
      toast({ 
        title: firedCount > 0 || triggersProcessed > 0 ? '⚡ Procesado' : '✅ Sin trabajo pendiente',
        description: firedCount > 0 || triggersProcessed > 0 
          ? `${firedCount} empresas + ${triggersProcessed} triggers`
          : 'El barrido está al día'
      });
      
      refreshAllMetrics();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setForcing(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!metrics?.failedCompanies?.length) return;
    setRetrying(true);
    try {
      // Reset failed companies to pending status
      const { error } = await supabase
        .from('sweep_progress')
        .update({ status: 'pending', error_message: null, retry_count: 0 })
        .eq('sweep_id', metrics.sweepId)
        .eq('status', 'failed');
      
      if (error) throw error;
      
      // Trigger the orchestrator to process them
      await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'auto_recovery' },
      });
      
      toast({ 
        title: '🔄 Reintentando',
        description: `${metrics.failedCompanies.length} empresas puestas en cola`
      });
      
      refreshAllMetrics();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No hay barrido activo
        </CardContent>
      </Card>
    );
  }

  const hasActiveProcesses = metrics.searchProcessing > 0;

  return (
    <div className="space-y-4 mb-6">
      {/* SECCIÓN 1: Estado del Sistema */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Indicador de estado */}
              <div className={cn(
                "w-3 h-3 rounded-full",
                hasActiveProcesses ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
              )} />
              <div>
                <span className="font-medium">
                  {hasActiveProcesses 
                    ? `${metrics.searchProcessing} procesos activos`
                    : "Sin procesos activos"}
                </span>
                <div className="text-sm text-muted-foreground">
                  Barrido {metrics.sweepId} • {formatDistanceToNow(metrics.lastUpdated, { locale: es, addSuffix: true })}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleForce} disabled={forcing}>
                {forcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span className="ml-1">Forzar</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 2: Progreso por Modelo IA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Progreso por Modelo IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {metrics.byModel.map(model => (
            <div key={model.model} className="flex items-center gap-4">
              <span className="w-24 text-sm font-medium truncate">{model.model}</span>
              <div className="flex-1">
                <Progress value={model.percentage} className="h-2" />
              </div>
              <span className="w-20 text-sm text-right tabular-nums">
                {model.withScore}/{model.total}
              </span>
              <span className={cn(
                "w-12 text-sm font-medium text-right tabular-nums",
                model.percentage < 80 ? "text-destructive" : 
                model.percentage < 95 ? "text-muted-foreground" : "text-primary"
              )}>
                {model.percentage}%
              </span>
              {model.percentage < 80 && <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* SECCIÓN 3: Errores (solo si hay) */}
      {metrics.failedCompanies && metrics.failedCompanies.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                {metrics.failedCompanies.length} Empresas Fallidas
              </CardTitle>
              <Button 
                size="sm" 
                variant="destructive" 
                onClick={handleRetryFailed}
                disabled={retrying}
              >
                {retrying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Reintentar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {metrics.failedCompanies.map(f => (
                <div key={f.ticker} className="flex items-center gap-2 text-destructive">
                  <span className="font-mono font-medium">{f.ticker}</span>
                  <span className="text-xs text-destructive/70 truncate">
                    {f.error || 'Error'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
