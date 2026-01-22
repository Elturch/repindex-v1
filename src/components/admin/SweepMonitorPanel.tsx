import React, { useState, useEffect, useCallback } from 'react';
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
  Layers
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

const TOTAL_PHASES = 34;

export function SweepMonitorPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SweepStatus | null>(null);
  const [phaseDetails, setPhaseDetails] = useState<PhaseDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchingAll, setLaunchingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      // Obtener estado del orchestrator
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { get_status: true },
      });

      if (error) throw error;

      if (data.initialized) {
        setStatus(data);
        
        // Obtener detalles por fase usando RPC o query directa con cast
        // La tabla sweep_progress es nueva, usamos fetch directo al API
        const response = await fetch(
          `https://jzkjykmrwisijiqlwuua.supabase.co/rest/v1/sweep_progress?sweep_id=eq.${data.sweepId}&select=fase,status`,
          {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU',
              'Content-Type': 'application/json',
            },
          }
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
  }, [toast]);

  useEffect(() => {
    fetchStatus();
    
    // Auto-refresh cada 15 segundos si hay procesamiento activo
    const interval = setInterval(() => {
      if (status?.byStatus?.processing && status.byStatus.processing > 0) {
        fetchStatus();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [status?.byStatus?.processing, fetchStatus]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatus();
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

  // Lanza TODAS las fases de forma escalonada (cada 5 minutos)
  const handleLaunchAllPhasesStaggered = async () => {
    setLaunchingAll(true);
    try {
      // Primero inicializamos el sweep
      await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { init_only: true },
      });

      // Obtener fases pendientes
      const pendingPhases = phaseDetails.filter(p => p.pending > 0 || p.failed > 0).map(p => p.fase);
      const allPhases = pendingPhases.length > 0 ? pendingPhases : Array.from({ length: TOTAL_PHASES }, (_, i) => i + 1);

      toast({
        title: 'Lanzamiento escalonado iniciado',
        description: `Se procesarán ${allPhases.length} fases de forma independiente. Primera fase lanzándose ahora...`,
      });

      // Lanzar la primera fase inmediatamente
      if (allPhases.length > 0) {
        supabase.functions.invoke('rix-batch-orchestrator', {
          body: { trigger: 'staggered', fase: allPhases[0] },
        }).catch(console.error);
      }

      // Las demás fases se lanzan via CRON cada 5 minutos
      toast({
        title: 'Fases programadas',
        description: `Las ${allPhases.length - 1} fases restantes se ejecutarán automáticamente cada 5 minutos vía CRON.`,
      });

      setTimeout(fetchStatus, 3000);
    } catch (error: any) {
      console.error('Error launching staggered sweep:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo iniciar el barrido escalonado',
        variant: 'destructive',
      });
    } finally {
      setLaunchingAll(false);
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
                disabled={launching || launchingAll}
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
                onClick={handleLaunchAllPhasesStaggered}
                disabled={launching || launchingAll}
                variant="default"
                className="gap-2"
              >
                {launchingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Layers className="h-4 w-4" />
                )}
                {launchingAll ? 'Iniciando...' : 'Lanzar Todo (Escalonado)'}
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

      {/* Phase visualization */}
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
              variant="outline"
              size="sm"
              onClick={handleLaunchAllPhasesStaggered}
              disabled={launchingAll}
            >
              <Layers className="h-4 w-4 mr-2" />
              Barrido completo escalonado
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
