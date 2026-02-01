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
  AlertTriangle,
  Ghost,
  Activity,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
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

      const firedCount =
        (typeof recoveryData?.firedCount === 'number' ? recoveryData.firedCount : undefined) ??
        (Array.isArray(recoveryData?.firedCompanies) ? recoveryData.firedCompanies.length : 0);

      const orchestratorTriggersProcessed =
        typeof recoveryData?.triggersProcessed === 'number' ? recoveryData.triggersProcessed : 0;
      const uiTriggersProcessed =
        typeof triggersData?.triggersProcessed === 'number' ? triggersData.triggersProcessed : 0;
      const totalTriggersProcessed = orchestratorTriggersProcessed + uiTriggersProcessed;

      const dataCheck = recoveryData?.dataCheck as
        | { missingData?: number; analyzable?: number; failedCompanies?: number }
        | undefined;
      const autoChain = Array.isArray(recoveryData?.autoChain) ? (recoveryData.autoChain as string[]) : [];
      const pendingWorkDetected =
        !!dataCheck &&
        ((dataCheck.missingData || 0) > 0 || (dataCheck.analyzable || 0) > 0 || (dataCheck.failedCompanies || 0) > 0);

      const didAnything = firedCount > 0 || totalTriggersProcessed > 0 || autoChain.length > 0 || pendingWorkDetected;

      toast({
        title: didAnything ? '🛠️ Auto-recovery ejecutado' : '✅ Sin trabajo pendiente',
        description: didAnything
          ? [
              firedCount > 0 ? `${firedCount} empresas disparadas` : null,
              totalTriggersProcessed > 0 ? `${totalTriggersProcessed} triggers procesados` : null,
              autoChain.length > 0 ? `Triggers encolados: ${autoChain.join(', ')}` : null,
              pendingWorkDetected
                ? `Pendiente: ${(dataCheck?.missingData || 0)} sin datos • ${(dataCheck?.analyzable || 0)} sin analizar`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'El barrido está al día',
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
      const { error } = await supabase
        .from('sweep_progress')
        .update({ status: 'pending', error_message: null, retry_count: 0 })
        .eq('sweep_id', metrics.sweepId)
        .eq('status', 'failed');
      
      if (error) throw error;
      
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

  // Calcular procesos activos reales: sweep_progress + triggers
  const activeSearches = metrics.searchProcessing || 0;
  const activeTriggers = metrics.triggersProcessing || 0;
  const pendingTriggers = metrics.triggersPending || 0;
  const totalActive = activeSearches + activeTriggers;
  const hasActiveProcesses = totalActive > 0;
  
  // Trabajo pendiente real: triggers + registros sin datos + registros sin score
  const recordsNeedingWork = metrics.recordsNoData + metrics.recordsPendingAnalysis;
  const hasPendingWork = pendingTriggers > 0 || metrics.searchPending > 0 || recordsNeedingWork > 0;

  // Total empresas incluyendo fantasmas
  const totalWithGhosts = metrics.totalCompanies + metrics.ghostCompanies;
  const realComplete = metrics.companiesComplete;

  // Determinar velocidad del proceso basándose en actividad Y trabajo pendiente
  const getProcessSpeed = () => {
    // Si hay triggers activos, mostrar como activo
    if (activeTriggers >= 1) return { label: 'Procesando', color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/50' };
    if (activeSearches >= 1) return { label: 'Buscando', color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/50' };
    // Si hay triggers pendientes, mostrar como en cola
    if (pendingTriggers > 0) return { label: 'En Cola', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/30', borderColor: 'border-amber-500/50' };
    // Si hay trabajo pendiente pero no hay procesos, mostrar como necesita atención
    if (recordsNeedingWork > 0) return { label: 'Reparar', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/30', borderColor: 'border-amber-500/50' };
    // Si no hay trabajo pendiente, está completo o inactivo
    if (metrics.recordCompletionRate >= 99) return { label: 'Completo', color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/50' };
    return { label: 'Inactivo', color: 'text-muted-foreground', bgColor: 'bg-muted/30', borderColor: 'border-border' };
  };
  
  const speed = getProcessSpeed();

  return (
    <div className="space-y-4 mb-6">
      {/* SECCIÓN 0: BARRA DE TRIGGERS - MUY VISIBLE */}
      <Card className={cn("border-2", speed.borderColor, speed.bgColor)}>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Indicador visual grande */}
              <div className="relative">
                {hasActiveProcesses ? (
                  <>
                    <Activity className={cn("h-8 w-8 animate-pulse", speed.color)} />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-primary text-[10px] text-primary-foreground font-bold flex items-center justify-center">
                        {totalActive}
                      </span>
                    </span>
                  </>
                ) : hasPendingWork ? (
                  <Clock className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted-foreground/20 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">—</span>
                  </div>
                )}
              </div>
              
              {/* Info de procesos */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold">
                    {hasActiveProcesses ? (
                      <>
                        {activeTriggers > 0 && <span className="text-primary">{activeTriggers} triggers</span>}
                        {activeTriggers > 0 && activeSearches > 0 && <span className="text-muted-foreground"> + </span>}
                        {activeSearches > 0 && <span>{activeSearches} búsquedas</span>}
                      </>
                    ) : pendingTriggers > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">{pendingTriggers} triggers en cola</span>
                    ) : recordsNeedingWork > 0 ? (
                      <span className="text-muted-foreground">
                        {metrics.recordsNoData > 0 && <>{metrics.recordsNoData} sin datos</>}
                        {metrics.recordsNoData > 0 && metrics.recordsPendingAnalysis > 0 && ' + '}
                        {metrics.recordsPendingAnalysis > 0 && <>{metrics.recordsPendingAnalysis} sin analizar</>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sin trabajo pendiente</span>
                    )}
                  </span>
                  {/* Badge de velocidad */}
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                    speed.color,
                    speed.bgColor === 'bg-muted/30' ? 'bg-muted' : speed.bgColor
                  )}>
                    {speed.label}
                  </span>
                </div>
                {/* Indicador de progreso del trigger activo */}
                {metrics.activeTrigger && (
                  <div className="flex items-center gap-2 mt-1">
                    {/* Progress bar - solo si hay datos numéricos */}
                    {(metrics.activeTrigger.processed > 0 || metrics.activeTrigger.remaining > 0) && (
                      <div className="flex-1 max-w-[200px]">
                        <Progress 
                          value={metrics.activeTrigger.processed + metrics.activeTrigger.remaining > 0 
                            ? (metrics.activeTrigger.processed / (metrics.activeTrigger.processed + metrics.activeTrigger.remaining)) * 100 
                            : 0
                          } 
                          className="h-1.5" 
                        />
                      </div>
                    )}
                    {/* Status text - siempre visible */}
                    <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1">
                      {metrics.activeTrigger.action === 'repair_search' ? '🔍' : '📊'}
                      <span className="font-medium">
                        {metrics.activeTrigger.action === 'repair_search' ? 'Búsqueda' : 'Análisis'}
                      </span>
                      {(metrics.activeTrigger.processed > 0 || metrics.activeTrigger.remaining > 0) ? (
                        <span>
                          {metrics.activeTrigger.processed}/{metrics.activeTrigger.processed + metrics.activeTrigger.remaining}
                        </span>
                      ) : (
                        <span className="animate-pulse">en proceso...</span>
                      )}
                      {metrics.activeTrigger.lastTicker && (
                        <span className="font-mono text-primary">{metrics.activeTrigger.lastTicker}</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  Barrido {metrics.sweepId} • {realComplete}/{totalWithGhosts} empresas completas • {metrics.recordsWithScore}/{metrics.totalRecords} registros
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Progreso por Modelo IA</CardTitle>
            <span className="text-sm text-muted-foreground">
              {metrics.recordsWithScore}/{metrics.totalRecords} registros
            </span>
          </div>
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

      {/* SECCIÓN 3: Ghost Companies (empresas fantasmas) */}
      {metrics.ghostCompanies > 0 && (
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <Ghost className="h-4 w-4" />
                {metrics.ghostCompanies} Empresas Fantasma
              </CardTitle>
              <span className="text-xs text-amber-600 dark:text-amber-500">
                Marcadas completas pero sin datos reales
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-sm">
              {metrics.ghostTickers.slice(0, 12).map(ticker => (
                <span key={ticker} className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded font-mono text-xs">
                  {ticker}
                </span>
              ))}
              {metrics.ghostTickers.length > 12 && (
                <span className="px-2 py-1 text-amber-600 dark:text-amber-500 text-xs">
                  +{metrics.ghostTickers.length - 12} más
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECCIÓN 4: Errores (empresas fallidas) */}
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
