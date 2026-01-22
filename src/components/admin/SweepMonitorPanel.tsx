import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Loader2,
  BarChart3,
  Building2,
  Zap,
  RotateCcw,
  Layers,
  Square,
  Activity,
  Skull,
  Timer
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SweepStatus {
  sweepId: string;
  initialized: boolean;
  totalCompanies: number;
  byStatus: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  byPhase: Record<number, number>;
  progress: number;
}

interface PhaseDetail {
  fase: number;
  total: number;
  completed: number;
  failed: number;
  pending: number;
}

interface CascadeState {
  isRunning: boolean;
  currentTicker: string | null;
  processedCount: number;
  remaining: number;
  startTime: number | null;
}

interface RecentActivity {
  ticker: string;
  issuer_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}

const TOTAL_PHASES = 34;
const SUPABASE_URL = 'https://jzkjykmrwisijiqlwuua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU';

export function SweepMonitorPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SweepStatus | null>(null);
  const [phaseDetails, setPhaseDetails] = useState<PhaseDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resettingZombis, setResettingZombis] = useState(false);
  
  // Actividad reciente
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [processingCompanies, setProcessingCompanies] = useState<RecentActivity[]>([]);
  
  // Estado para cascada 1-empresa-a-la-vez
  const [cascade, setCascade] = useState<CascadeState>({
    isRunning: false,
    currentTicker: null,
    processedCount: 0,
    remaining: 0,
    startTime: null,
  });
  const cascadeAbortRef = useRef(false);

  // Obtener actividad reciente (últimas 10 empresas procesadas + en proceso)
  const fetchRecentActivity = useCallback(async (sweepId: string) => {
    try {
      // Empresas en proceso
      const processingRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sweep_progress?sweep_id=eq.${sweepId}&status=eq.processing&select=ticker,issuer_name,status,started_at,completed_at&order=started_at.desc`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' } }
      );
      const processingData = await processingRes.json();
      setProcessingCompanies(Array.isArray(processingData) ? processingData : []);

      // Últimas 8 completadas
      const recentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sweep_progress?sweep_id=eq.${sweepId}&status=eq.completed&select=ticker,issuer_name,status,started_at,completed_at&order=completed_at.desc&limit=8`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' } }
      );
      const recentData = await recentRes.json();
      setRecentActivity(Array.isArray(recentData) ? recentData : []);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      // Obtener estado del orchestrator
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { get_status: true },
      });

      if (error) throw error;

      if (data.initialized) {
        setStatus(data);
        
        // Obtener detalles por fase
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/sweep_progress?sweep_id=eq.${data.sweepId}&select=fase,status`,
          { headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' } }
        );
        const progressData = await response.json() as Array<{ fase: number; status: string }>;

        if (progressData && Array.isArray(progressData)) {
          // Agrupar por fase
          const phaseMap = new Map<number, { total: number; completed: number; failed: number; pending: number }>();
          
          progressData.forEach((p: { fase: number; status: string }) => {
            const current = phaseMap.get(p.fase) || { total: 0, completed: 0, failed: 0, pending: 0 };
            current.total++;
            if (p.status === 'completed') current.completed++;
            else if (p.status === 'failed') current.failed++;
            else current.pending++;
            phaseMap.set(p.fase, current);
          });

          const details: PhaseDetail[] = [];
          phaseMap.forEach((value, fase) => {
            details.push({ fase, ...value });
          });
          details.sort((a, b) => a.fase - b.fase);
          setPhaseDetails(details);
        }

        // Obtener actividad reciente
        await fetchRecentActivity(data.sweepId);
      } else {
        setStatus({
          sweepId: data.sweepId,
          initialized: false,
          totalCompanies: 0,
          byStatus: { pending: 0, processing: 0, completed: 0, failed: 0 },
          byPhase: {},
          progress: 0,
        });
        setPhaseDetails([]);
        setRecentActivity([]);
        setProcessingCompanies([]);
      }
    } catch (error) {
      console.error('Error fetching sweep status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el estado del barrido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, fetchRecentActivity]);

  useEffect(() => {
    fetchStatus();
    
    // Auto-refresh cada 10 segundos si hay procesamiento activo O si está en cascada
    const interval = setInterval(() => {
      if ((status?.byStatus?.processing && status.byStatus.processing > 0) || cascade.isRunning) {
        fetchStatus();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [status?.byStatus?.processing, cascade.isRunning, fetchStatus]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatus();
  };

  // Reset inmediato de empresas zombis
  const handleResetZombis = async () => {
    setResettingZombis(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { reset_stuck: true, reset_stuck_timeout: 0 },  // timeout 0 = reset inmediato
      });

      if (error) throw error;

      toast({
        title: data.resetCount > 0 ? '🔄 Zombis reseteados' : 'Sin zombis',
        description: data.message,
        variant: data.resetCount > 0 ? 'default' : 'default',
      });

      fetchStatus();
    } catch (error: any) {
      console.error('Error resetting stuck companies:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo resetear',
        variant: 'destructive',
      });
    } finally {
      setResettingZombis(false);
    }
  };

  // Lanza UNA fase específica
  const handleLaunchPhase = async (fase: number) => {
    setLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'manual', fase },
      });

      if (error) throw error;

      toast({
        title: `Fase ${fase} ${data.status === 'no_work' ? 'sin trabajo' : 'completada'}`,
        description: `Procesados: ${data.companiesProcessed || 0} | Completados: ${data.companiesCompleted || 0} | Fallidos: ${data.companiesFailed || 0}`,
      });

      setTimeout(fetchStatus, 2000);
    } catch (error: any) {
      console.error('Error launching phase:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo procesar la fase',
        variant: 'destructive',
      });
    } finally {
      setLaunching(false);
    }
  };

  // Procesar UNA empresa via single_company mode
  const processOneCompany = async (): Promise<{
    processed: boolean;
    ticker: string | null;
    success: boolean;
    next_pending: boolean;
    remaining: number;
    error?: string;
  }> => {
    const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
      body: { single_company: true },
    });
    
    if (error) throw error;
    return data;
  };

  // Lanza TODO el barrido empresa por empresa en cascada (evita timeouts)
  const handleLaunchCascade = async () => {
    // Si ya está corriendo, pausar
    if (cascade.isRunning) {
      cascadeAbortRef.current = true;
      setCascade(prev => ({ ...prev, isRunning: false }));
      toast({
        title: 'Cascada pausada',
        description: `Procesadas ${cascade.processedCount} empresas. Quedan ${cascade.remaining}.`,
      });
      return;
    }

    // Iniciar cascada
    cascadeAbortRef.current = false;
    setCascade({
      isRunning: true,
      currentTicker: null,
      processedCount: 0,
      remaining: status?.byStatus?.pending || 0,
      startTime: Date.now(),
    });

    toast({
      title: 'Cascada iniciada',
      description: 'Procesando empresas una por una para evitar timeouts...',
    });

    let processed = 0;
    let remaining = status?.byStatus?.pending || 0;
    let consecutiveErrors = 0;

    try {
      // Bucle de cascada: procesar empresa por empresa
      while (remaining > 0 && !cascadeAbortRef.current) {
        try {
          const result = await processOneCompany();
          
          if (!result.processed) {
            // No hay más empresas pendientes
            break;
          }

          processed++;
          remaining = result.remaining;
          consecutiveErrors = 0;

          setCascade(prev => ({
            ...prev,
            currentTicker: result.ticker,
            processedCount: processed,
            remaining: remaining,
          }));

          // Actualizar status cada 5 empresas
          if (processed % 5 === 0) {
            fetchStatus();
          }

          // Pequeña pausa de 1s entre empresas para no saturar
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (err: any) {
          console.error('Error processing company:', err);
          consecutiveErrors++;
          
          // Si hay 3 errores consecutivos, pausar
          if (consecutiveErrors >= 3) {
            toast({
              title: 'Cascada pausada por errores',
              description: `${consecutiveErrors} errores consecutivos. Revisa los logs.`,
              variant: 'destructive',
            });
            break;
          }
          
          // Esperar más tiempo después de un error
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      // Finalizar cascada
      const wasAborted = cascadeAbortRef.current;
      setCascade(prev => ({ ...prev, isRunning: false, currentTicker: null }));
      fetchStatus();

      if (!wasAborted && remaining === 0) {
        toast({
          title: '🎉 Barrido completado',
          description: `Se procesaron ${processed} empresas exitosamente.`,
        });
      } else if (wasAborted) {
        toast({
          title: 'Cascada pausada',
          description: `Procesadas ${processed} empresas. Quedan ${remaining}.`,
        });
      }

    } catch (error: any) {
      console.error('Error in cascade:', error);
      setCascade(prev => ({ ...prev, isRunning: false }));
      toast({
        title: 'Error en cascada',
        description: error.message || 'Error inesperado',
        variant: 'destructive',
      });
    }
  };

  // Lanza la siguiente fase pendiente
  const handleLaunchNextPhase = async () => {
    setLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'manual' },
      });

      if (error) throw error;

      if (data.completed) {
        toast({
          title: 'Barrido completado',
          description: 'No hay más fases pendientes.',
        });
      } else {
        toast({
          title: `Fase ${data.fase} procesada`,
          description: `Completados: ${data.companiesCompleted || 0} | Fallidos: ${data.companiesFailed || 0}`,
        });
      }

      setTimeout(fetchStatus, 2000);
    } catch (error: any) {
      console.error('Error launching next phase:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo procesar la fase',
        variant: 'destructive',
      });
    } finally {
      setLaunching(false);
    }
  };

  const handleResetFailed = async () => {
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { reset_failed: true },
      });

      if (error) throw error;

      toast({
        title: 'Empresas reseteadas',
        description: `${data.resetCount} empresas fallidas marcadas como pendientes`,
      });

      fetchStatus();
    } catch (error: any) {
      console.error('Error resetting failed:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo resetear',
        variant: 'destructive',
      });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isProcessing = status?.byStatus?.processing && status.byStatus.processing > 0;
  const hasFailed = status?.byStatus?.failed && status.byStatus.failed > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Monitor de Barrido V2 por Fases
              </CardTitle>
              <CardDescription>
                Barrido: {status?.sweepId || 'N/A'} | Sistema robusto con persistencia y recuperación
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
                Actualizar
              </Button>
              {hasFailed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFailed}
                  disabled={resetting}
                  className="text-needs-improvement"
                >
                  <RotateCcw className={cn("h-4 w-4 mr-2", resetting && "animate-spin")} />
                  Reintentar fallidos ({status?.byStatus.failed})
                </Button>
              )}
              <Button
                onClick={handleLaunchNextPhase}
                disabled={launching || cascade.isRunning}
                className="gap-2"
              >
                {launching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Siguiente Fase
              </Button>
              <Button
                onClick={handleLaunchCascade}
                disabled={launching}
                variant={cascade.isRunning ? "destructive" : "default"}
                className="gap-2"
              >
                {cascade.isRunning ? (
                  <>
                    <Square className="h-4 w-4" />
                    Pausar ({cascade.processedCount} / {cascade.processedCount + cascade.remaining})
                  </>
                ) : (
                  <>
                    <Layers className="h-4 w-4" />
                    Lanzar Todo (1x1)
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Overall Progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progreso general</span>
              <div className="flex items-center gap-4">
                {isProcessing && (
                  <Badge variant="outline" className="bg-needs-improvement/10 text-needs-improvement border-needs-improvement/30">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {status?.byStatus?.processing} en proceso (auto-reset si atascadas)
                  </Badge>
                )}
                <span className="font-medium">{status?.progress || 0}%</span>
              </div>
            </div>
            <Progress value={status?.progress || 0} className="h-3" />
            
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-foreground">{status?.totalCompanies || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Total empresas
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-good/10">
                <div className="text-2xl font-bold text-good">{status?.byStatus?.completed || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Completados
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <div className="text-2xl font-bold text-primary">{status?.byStatus?.processing || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Loader2 className="h-3 w-3" />
                  Procesando
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-needs-improvement/10">
                <div className="text-2xl font-bold text-needs-improvement">{status?.byStatus?.pending || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pendientes
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <div className="text-2xl font-bold text-destructive">{status?.byStatus?.failed || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Fallidos
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NUEVO: Panel de Actividad en Tiempo Real */}
      {status?.initialized && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary animate-pulse" />
                Actividad en Tiempo Real
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetZombis}
                  disabled={resettingZombis}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Skull className={cn("h-4 w-4 mr-2", resettingZombis && "animate-spin")} />
                  Resetear Zombis
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Empresas en proceso */}
            {processingCompanies.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">En proceso ahora:</div>
                <div className="space-y-1">
                  {processingCompanies.map((company) => {
                    const startedAt = company.started_at ? new Date(company.started_at) : null;
                    const elapsedMinutes = startedAt 
                      ? Math.floor((Date.now() - startedAt.getTime()) / 60000)
                      : 0;
                    const isZombie = elapsedMinutes >= 5;
                    
                    return (
                      <div 
                        key={company.ticker}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-lg",
                          isZombie ? "bg-destructive/10 border border-destructive/30" : "bg-primary/10"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="font-medium">{company.ticker}</span>
                          <span className="text-sm text-muted-foreground">{company.issuer_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Timer className="h-3 w-3" />
                          <span className={cn(
                            "text-sm font-mono",
                            isZombie ? "text-destructive font-bold" : "text-muted-foreground"
                          )}>
                            {elapsedMinutes} min
                          </span>
                          {isZombie && (
                            <Badge variant="destructive" className="text-xs">ZOMBI</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Últimas completadas */}
            {recentActivity.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Últimas procesadas:</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {recentActivity.slice(0, 8).map((company) => {
                    const completedAt = company.completed_at ? new Date(company.completed_at) : null;
                    const timeStr = completedAt 
                      ? completedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                      : '';
                    
                    return (
                      <div 
                        key={company.ticker}
                        className="flex items-center gap-2 p-2 rounded-lg bg-good/10 text-sm"
                      >
                        <CheckCircle2 className="h-3 w-3 text-good" />
                        <span className="font-medium">{company.ticker}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{timeStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sin actividad */}
            {processingCompanies.length === 0 && recentActivity.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin actividad reciente</p>
              </div>
            )}

            {/* Info de auto-reset */}
            <div className="pt-2 border-t text-xs text-muted-foreground flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                <span>Auto-reset: 5 min</span>
              </div>
              <div className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                <span>Auto-refresh: 10 seg</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-good" />
                <span>Sistema infalible activo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {status?.initialized && phaseDetails.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Progreso por Fase ({phaseDetails.length} fases activas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-17 gap-2">
            {phaseDetails.map((phase) => {
                const hasErrors = phase.failed > 0;
                const isComplete = phase.completed === phase.total && phase.total > 0;
                const isPending = phase.pending > 0;

                return (
                  <div
                    key={phase.fase}
                    className={cn(
                      "relative p-2 rounded-lg text-center text-xs transition-all",
                      isComplete && "bg-good/20 text-good",
                      hasErrors && !isComplete && "bg-destructive/20 text-destructive",
                      isPending && !hasErrors && !isComplete && "bg-muted text-muted-foreground",
                      !isPending && !hasErrors && !isComplete && "bg-primary/20 text-primary"
                    )}
                    title={`Fase ${phase.fase}: ${phase.completed}/${phase.total} completados${hasErrors ? `, ${phase.failed} fallidos` : ''}`}
                  >
                    <div className="font-semibold">{phase.fase}</div>
                    <div className="text-[10px] opacity-80">
                      {phase.completed}/{phase.total}
                    </div>
                    {hasErrors && (
                      <div className="absolute -top-1 -right-1">
                        <span className="flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[8px] text-white">
                          {phase.failed}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-good/20" />
                <span>Completo</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-primary/20" />
                <span>En progreso</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-muted" />
                <span>Pendiente</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-destructive/20" />
                <span>Con errores</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleLaunchPhase(1)}
              disabled={launching}
            >
              <Play className="h-4 w-4 mr-2" />
              Fase 1 (prueba)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLaunchNextPhase}
              disabled={launching}
            >
              <Play className="h-4 w-4 mr-2" />
              Siguiente fase pendiente
            </Button>
            <Button
              variant={cascade.isRunning ? "destructive" : "outline"}
              size="sm"
              onClick={handleLaunchCascade}
              disabled={launching}
            >
              {cascade.isRunning ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Pausar cascada
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4 mr-2" />
                  Barrido completo (1x1)
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/dashboard-v2', '_blank')}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Ver Dashboard V2
            </Button>
          </div>
          
          {!status?.initialized && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              <p>
                <strong>Nota:</strong> El barrido para esta semana ({status?.sweepId}) aún no ha sido inicializado.
                Haz clic en "Iniciar Barrido" para comenzar a procesar las {TOTAL_PHASES} fases de empresas.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
