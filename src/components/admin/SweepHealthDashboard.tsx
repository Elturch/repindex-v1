import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Skull,
  Zap,
  XCircle,
  Timer,
  TrendingUp
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, differenceInMinutes, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ============ TIPOS ============
type SweepHealthStatus = 
  | 'healthy'      // Procesando normalmente, sin zombis
  | 'slow'         // Procesando pero por debajo del ritmo esperado  
  | 'stuck'        // Zombi detectado (>5 min sin cambios)
  | 'dead'         // Sin actividad en >10 min
  | 'completed'    // 100% completado
  | 'error';       // Errores críticos

interface SweepRecord {
  ticker: string;
  issuer_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  fase: number;
  worker_id?: number | null;
}

interface PhaseStatus {
  fase: number;
  total: number;
  completed: number;
  pending: number;
  processing: number;
  failed: number;
}

interface WorkerStats {
  workerId: number;
  processing: number;
  completed: number;
  tickers: string[];
  lastActivity: Date | null;
}

interface SweepHealthData {
  sweepId: string;
  totalCompanies: number;
  completed: number;
  pending: number;
  processing: number;
  failed: number;
  progress: number;
  expectedProgress: number;
  healthStatus: SweepHealthStatus;
  zombies: SweepRecord[];
  lastActivity: Date | null;
  sweepStartTime: Date | null;
  elapsedTime: string;
  phases: PhaseStatus[];
  workers: WorkerStats[];
  parallelActive: boolean;
}

const SUPABASE_URL = 'https://jzkjykmrwisijiqlwuua.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU';

// ============ HELPERS ============
function calculateExpectedProgress(sweepStartTime: Date | null): number {
  if (!sweepStartTime) return 0;
  const hoursElapsed = (Date.now() - sweepStartTime.getTime()) / 3600000;
  // El barrido debería completarse en ~3 horas
  return Math.min(100, Math.round((hoursElapsed / 3) * 100));
}

function detectZombies(records: SweepRecord[]): SweepRecord[] {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return records.filter(r => 
    r.status === 'processing' && 
    r.started_at &&
    new Date(r.started_at).getTime() < fiveMinutesAgo
  );
}

function determineHealthStatus(
  completed: number,
  total: number,
  zombies: SweepRecord[],
  lastActivity: Date | null,
  failed: number
): SweepHealthStatus {
  if (completed === total && total > 0) return 'completed';
  if (zombies.length > 0) return 'stuck';
  if (failed > total * 0.1) return 'error'; // >10% fallos
  
  if (lastActivity) {
    const minutesSinceActivity = differenceInMinutes(new Date(), lastActivity);
    if (minutesSinceActivity > 10) return 'dead';
    if (minutesSinceActivity > 5) return 'slow';
  }
  
  return 'healthy';
}

function getStatusConfig(status: SweepHealthStatus) {
  switch (status) {
    case 'healthy':
      return { 
        icon: Activity, 
        label: 'BARRIDO ACTIVO', 
        color: 'text-green-500', 
        bg: 'bg-green-500/10 border-green-500/30',
        description: 'Procesando normalmente'
      };
    case 'slow':
      return { 
        icon: Clock, 
        label: 'BARRIDO LENTO', 
        color: 'text-yellow-500', 
        bg: 'bg-yellow-500/10 border-yellow-500/30',
        description: 'Por debajo del ritmo esperado'
      };
    case 'stuck':
      return { 
        icon: AlertTriangle, 
        label: 'BARRIDO ATASCADO', 
        color: 'text-orange-500', 
        bg: 'bg-orange-500/10 border-orange-500/30',
        description: 'Zombi detectado'
      };
    case 'dead':
      return { 
        icon: Skull, 
        label: 'BARRIDO MUERTO', 
        color: 'text-red-500', 
        bg: 'bg-red-500/10 border-red-500/30',
        description: 'Sin actividad >10 min'
      };
    case 'completed':
      return { 
        icon: CheckCircle2, 
        label: 'BARRIDO COMPLETADO', 
        color: 'text-green-600', 
        bg: 'bg-green-600/10 border-green-600/30',
        description: '100% procesado'
      };
    case 'error':
      return { 
        icon: XCircle, 
        label: 'ERRORES CRÍTICOS', 
        color: 'text-red-600', 
        bg: 'bg-red-600/10 border-red-600/30',
        description: 'Alto ratio de fallos'
      };
  }
}

// Phase icon helper - kept for potential future use
// function getPhaseIcon(phase: PhaseStatus) {
//   if (phase.completed === phase.total) return '✓';
//   if (phase.failed > 0) return '❌';
//   if (phase.processing > 0) return '⏳';
//   if (phase.completed > 0) return '⚠️';
//   return '○';
// }

function getPhaseColor(phase: PhaseStatus) {
  if (phase.completed === phase.total) return 'bg-green-500 text-white';
  if (phase.failed > 0) return 'bg-red-500 text-white';
  if (phase.processing > 0) return 'bg-blue-500 text-white animate-pulse';
  if (phase.completed > 0) return 'bg-yellow-500 text-white';
  return 'bg-muted text-muted-foreground';
}

// ============ COMPONENTES AUXILIARES ============

function HeartbeatIndicator({ 
  status, 
  lastActivity, 
  processing 
}: { 
  status: SweepHealthStatus; 
  lastActivity: Date | null;
  processing: number;
}) {
  const isActive = status === 'healthy';
  const isCompleted = status === 'completed';
  const isSlow = status === 'slow';
  
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-background p-4">
      {/* Círculo pulsante / indicador visual */}
      <div className="relative flex h-12 w-12 items-center justify-center">
        {isActive ? (
          <>
            <span className="absolute h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </span>
          </>
        ) : isCompleted ? (
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        ) : isSlow ? (
          <>
            <span className="absolute h-full w-full animate-pulse rounded-full bg-yellow-400 opacity-50" />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500">
              <Clock className="h-5 w-5 text-white" />
            </span>
          </>
        ) : (
          <span className="h-8 w-8 rounded-full bg-red-500" />
        )}
      </div>
      
      {/* Texto de estado */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">
            {isActive ? `Procesando ${processing} empresa${processing !== 1 ? 's' : ''}...` : 
             isCompleted ? '✓ Barrido completado' :
             isSlow ? 'Procesando (lento)...' :
             '⚠ Sistema detenido'}
          </span>
        </div>
        {lastActivity && (
          <span className="text-sm text-muted-foreground">
            Última actividad: {formatDistanceToNow(lastActivity, { locale: es, addSuffix: true })}
          </span>
        )}
      </div>
      
      {/* Indicador de auto-refresh */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3" />
        Auto-refresh: 10s
      </div>
    </div>
  );
}

type GuidanceVariant = 'success' | 'info' | 'warning' | 'error';

function ActionGuidance({ status, hasZombies, hasFailed }: {
  status: SweepHealthStatus;
  hasZombies: boolean;
  hasFailed: boolean;
}) {
  const getGuidance = (): { icon: string; title: string; steps: string[]; variant: GuidanceVariant } | null => {
    if (status === 'completed') {
      return {
        icon: '✅',
        title: 'Barrido completado',
        steps: ['No se requiere ninguna acción. El barrido ha finalizado correctamente.'],
        variant: 'success'
      };
    }
    
    if (status === 'healthy' && !hasZombies && !hasFailed) {
      return {
        icon: '✅',
        title: 'Sistema funcionando correctamente',
        steps: ['El barrido avanza con normalidad.', 'No se requiere intervención.'],
        variant: 'success'
      };
    }
    
    if (hasZombies || status === 'stuck') {
      return {
        icon: '🔧',
        title: 'Acción requerida: Proceso atascado',
        steps: [
          '1. Haz clic en "Limpiar Zombis" para resetear registros atascados',
          '2. Luego haz clic en "Reanudar Cascada" para reiniciar el procesamiento',
          '3. Espera 30 segundos y verifica que el indicador vuelva a verde'
        ],
        variant: 'warning'
      };
    }
    
    if (status === 'dead') {
      return {
        icon: '⚠️',
        title: 'Acción requerida: Sistema detenido',
        steps: [
          '1. Haz clic en "Reanudar Cascada" para reiniciar el proceso',
          '2. Si no funciona, usa "Completar Análisis" para reparación programada',
          '3. Si persiste tras 5 minutos, revisa los logs de errores abajo'
        ],
        variant: 'error'
      };
    }
    
    if (status === 'slow') {
      return {
        icon: 'ℹ️',
        title: 'Sistema lento pero funcionando',
        steps: [
          'El barrido continúa pero más lento de lo esperado.',
          'Puede deberse a alta carga en las APIs de IA.',
          'No es necesaria acción inmediata, el sistema se recuperará solo.'
        ],
        variant: 'info'
      };
    }
    
    if (hasFailed || status === 'error') {
      return {
        icon: '❌',
        title: 'Errores detectados',
        steps: [
          '1. Revisa la sección de alertas abajo para ver qué falló',
          '2. Usa "Completar Análisis" para reprocesar los fallidos',
          '3. Si hay muchos fallos, puede haber un problema con las APIs'
        ],
        variant: 'error'
      };
    }
    
    return null;
  };
  
  const guidance = getGuidance();
  if (!guidance) return null;
  
  const variantStyles: Record<GuidanceVariant, string> = {
    success: 'border-green-500/30 bg-green-500/5',
    info: 'border-blue-500/30 bg-blue-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
    error: 'border-red-500/30 bg-red-500/5'
  };
  
  return (
    <div className={cn("rounded-lg border p-4", variantStyles[guidance.variant])}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{guidance.icon}</span>
        <div className="flex-1 space-y-2">
          <h4 className="font-semibold">{guidance.title}</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {guidance.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL ============
export function SweepHealthDashboard() {
  const { toast } = useToast();
  const [data, setData] = useState<SweepHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resettingZombies, setResettingZombies] = useState(false);
  const [triggeringRepair, setTriggeringRepair] = useState(false);
  const [resumingCascade, setResumingCascade] = useState(false);
  const [launchingParallel, setLaunchingParallel] = useState(false);
  const [workerCount, setWorkerCount] = useState(4);

  const fetchHealthData = useCallback(async () => {
    try {
      // 1. Get sweep status from orchestrator
      const { data: statusData, error: statusError } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { get_status: true },
      });

      if (statusError) throw statusError;
      if (!statusData?.initialized) {
        setData(null);
        return;
      }

      const sweepId = statusData.sweepId;

      // 2. Fetch all progress records for this sweep (including worker_id)
      const progressRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sweep_progress?sweep_id=eq.${sweepId}&select=ticker,issuer_name,status,started_at,completed_at,fase,worker_id`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' } }
      );
      const progressData: SweepRecord[] = await progressRes.json();

      if (!Array.isArray(progressData)) {
        throw new Error('Invalid progress data');
      }

      // 3. Calculate metrics
      const completed = progressData.filter(r => r.status === 'completed').length;
      const pending = progressData.filter(r => r.status === 'pending').length;
      const processing = progressData.filter(r => r.status === 'processing').length;
      const failed = progressData.filter(r => r.status === 'failed').length;
      const total = progressData.length;

      // 4. Detect zombies
      const zombies = detectZombies(progressData);

      // 5. Find last activity
      const completedRecords = progressData.filter(r => r.completed_at);
      const lastActivity = completedRecords.length > 0 
        ? new Date(Math.max(...completedRecords.map(r => new Date(r.completed_at!).getTime())))
        : null;

      // 6. Find sweep start time (earliest started_at)
      const startedRecords = progressData.filter(r => r.started_at);
      const sweepStartTime = startedRecords.length > 0
        ? new Date(Math.min(...startedRecords.map(r => new Date(r.started_at!).getTime())))
        : null;

      // 7. Calculate elapsed time
      let elapsedTime = '—';
      if (sweepStartTime) {
        const hours = differenceInHours(new Date(), sweepStartTime);
        const minutes = differenceInMinutes(new Date(), sweepStartTime) % 60;
        elapsedTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      }

      // 8. Group by phase
      const phaseMap = new Map<number, PhaseStatus>();
      progressData.forEach(r => {
        const current = phaseMap.get(r.fase) || { fase: r.fase, total: 0, completed: 0, pending: 0, processing: 0, failed: 0 };
        current.total++;
        if (r.status === 'completed') current.completed++;
        else if (r.status === 'pending') current.pending++;
        else if (r.status === 'processing') current.processing++;
        else if (r.status === 'failed') current.failed++;
        phaseMap.set(r.fase, current);
      });
      const phases = Array.from(phaseMap.values()).sort((a, b) => a.fase - b.fase);

      // 9. Calculate worker stats for parallel monitoring
      const workerMap = new Map<number, WorkerStats>();
      progressData.forEach(r => {
        if (r.worker_id !== null && r.worker_id !== undefined) {
          const current = workerMap.get(r.worker_id) || { 
            workerId: r.worker_id, 
            processing: 0, 
            completed: 0, 
            tickers: [],
            lastActivity: null 
          };
          
          if (r.status === 'processing') {
            current.processing++;
            current.tickers.push(r.ticker);
          } else if (r.status === 'completed') {
            current.completed++;
            if (r.completed_at) {
              const completedTime = new Date(r.completed_at);
              if (!current.lastActivity || completedTime > current.lastActivity) {
                current.lastActivity = completedTime;
              }
            }
          }
          workerMap.set(r.worker_id, current);
        }
      });
      const workers = Array.from(workerMap.values()).sort((a, b) => a.workerId - b.workerId);
      const parallelActive = workers.some(w => w.processing > 0);

      // 10. Determine health status
      const healthStatus = determineHealthStatus(completed, total, zombies, lastActivity, failed);

      // 11. Calculate expected progress
      const expectedProgress = calculateExpectedProgress(sweepStartTime);
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

      setData({
        sweepId,
        totalCompanies: total,
        completed,
        pending,
        processing,
        failed,
        progress,
        expectedProgress,
        healthStatus,
        zombies,
        lastActivity,
        sweepStartTime,
        elapsedTime,
        phases,
        workers,
        parallelActive,
      });

    } catch (error) {
      console.error('Error fetching health data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    fetchHealthData();
    const interval = setInterval(fetchHealthData, 10000);
    return () => clearInterval(interval);
  }, [fetchHealthData]);

  // ============ ACTIONS ============
  const handleResetZombies = async () => {
    if (!data?.zombies.length) return;
    setResettingZombies(true);

    try {
      // Reset zombies to pending via direct update
      const tickers = data.zombies.map(z => z.ticker);
      
      const { error } = await supabase
        .from('sweep_progress')
        .update({ 
          status: 'pending', 
          started_at: null,
          error_message: 'Reset por zombie cleanup'
        })
        .eq('sweep_id', data.sweepId)
        .in('ticker', tickers);

      if (error) throw error;

      toast({
        title: '🧟 Zombis limpiados',
        description: `${tickers.length} registros reiniciados a pendiente`,
      });

      await fetchHealthData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudieron limpiar los zombis',
        variant: 'destructive',
      });
    } finally {
      setResettingZombies(false);
    }
  };

  const handleTriggerRepair = async () => {
    setTriggeringRepair(true);

    try {
      const { data: triggerData, error } = await supabase.functions.invoke('admin-cron-triggers', {
        body: {
          action: 'repair_analysis',
          params: { batch_size: 5 },
        },
      });

      if (error) throw error;

      toast({
        title: '🔧 Reparación programada',
        description: `Trigger creado: ${triggerData.trigger?.id?.substring(0, 8)}...`,
      });

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo programar la reparación',
        variant: 'destructive',
      });
    } finally {
      setTriggeringRepair(false);
    }
  };

  const handleResumeCascade = async () => {
    setResumingCascade(true);

    try {
      const { data: cascadeData, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { process_one: true },
      });

      if (error) throw error;

      toast({
        title: '▶️ Cascada iniciada',
        description: cascadeData.message || 'Procesando siguiente empresa...',
      });

      await fetchHealthData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo reanudar la cascada',
        variant: 'destructive',
      });
    } finally {
      setResumingCascade(false);
    }
  };

  const handleLaunchParallel = async () => {
    setLaunchingParallel(true);

    try {
      const { data: parallelData, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { mode: 'parallel_batch', workers: workerCount },
      });

      if (error) throw error;

      toast({
        title: `⚡ ${workerCount} Workers lanzados`,
        description: parallelData.message || `Procesando empresas en paralelo...`,
      });

      await fetchHealthData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudieron lanzar los workers',
        variant: 'destructive',
      });
    } finally {
      setLaunchingParallel(false);
    }
  };

  // ============ RENDER ============
  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Cargando estado del barrido...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            No hay barrido activo
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusConfig = getStatusConfig(data.healthStatus);
  const StatusIcon = statusConfig.icon;

  return (
    <Card className={cn("mb-6 border-2", statusConfig.bg)}>
      <CardHeader className="pb-3">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon className={cn("h-6 w-6", statusConfig.color)} />
            <div>
              <CardTitle className={cn("text-lg font-bold", statusConfig.color)}>
                {statusConfig.label}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{statusConfig.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {data.sweepId}
            </Badge>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={fetchHealthData}
              className="h-8 w-8"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Heartbeat Indicator - Monitor visual de actividad */}
        <HeartbeatIndicator 
          status={data.healthStatus} 
          lastActivity={data.lastActivity}
          processing={data.processing}
        />
        
        {/* Action Guidance - Instrucciones contextuales */}
        <ActionGuidance 
          status={data.healthStatus}
          hasZombies={data.zombies.length > 0}
          hasFailed={data.failed > 0}
        />

        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {data.completed}/{data.totalCompanies} empresas ({data.progress}%)
            </span>
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Timer className="h-4 w-4" />
                {data.elapsedTime}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Esperado: {data.expectedProgress}%
              </span>
            </div>
          </div>
          
          <div className="relative">
            <Progress value={data.progress} className="h-3" />
            {data.expectedProgress > 0 && data.expectedProgress < 100 && (
              <div 
                className="absolute top-0 h-3 w-0.5 bg-yellow-500"
                style={{ left: `${data.expectedProgress}%` }}
                title={`Progreso esperado: ${data.expectedProgress}%`}
              />
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg bg-green-500/10 p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{data.completed}</div>
            <div className="text-xs text-muted-foreground">Completados</div>
          </div>
          <div className="rounded-lg bg-blue-500/10 p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{data.processing}</div>
            <div className="text-xs text-muted-foreground">Procesando</div>
          </div>
          <div className="rounded-lg bg-yellow-500/10 p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.pending}</div>
            <div className="text-xs text-muted-foreground">Pendientes</div>
          </div>
          <div className="rounded-lg bg-red-500/10 p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{data.failed}</div>
            <div className="text-xs text-muted-foreground">Fallidos</div>
          </div>
        </div>

        {/* Alerts Section */}
        {(data.zombies.length > 0 || data.healthStatus === 'dead' || data.failed > 0) && (
          <div className="space-y-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              Alertas Activas
            </div>
            <div className="flex flex-wrap gap-2">
              {data.zombies.length > 0 && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600">
                  🧟 {data.zombies.length} zombi{data.zombies.length > 1 ? 's' : ''}: {data.zombies.map(z => z.ticker).join(', ')}
                </Badge>
              )}
              {data.healthStatus === 'dead' && (
                <Badge variant="outline" className="bg-red-500/10 text-red-600">
                  💀 Sin actividad hace {data.lastActivity ? formatDistanceToNow(data.lastActivity, { locale: es }) : '?'}
                </Badge>
              )}
              {data.failed > 0 && (
                <Badge variant="outline" className="bg-red-500/10 text-red-600">
                  ❌ {data.failed} fallido{data.failed > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Phase Timeline */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Timeline de Fases</div>
          <TooltipProvider>
            <div className="flex flex-wrap gap-1">
              {data.phases.map(phase => (
                <Tooltip key={phase.fase}>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded text-xs font-medium cursor-default transition-all",
                        getPhaseColor(phase)
                      )}
                    >
                      {phase.fase}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <div className="font-medium">Fase {phase.fase}</div>
                      <div>{phase.completed}/{phase.total} completados</div>
                      {phase.processing > 0 && <div className="text-blue-400">{phase.processing} procesando</div>}
                      {phase.failed > 0 && <div className="text-red-400">{phase.failed} fallidos</div>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-green-500" /> Completa
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-yellow-500" /> Parcial
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-blue-500" /> Procesando
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-muted" /> Pendiente
            </span>
          </div>
        </div>

        {/* Parallel Workers Monitor */}
        {(data.parallelActive || data.workers.length > 0) && (
          <div className="space-y-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className={cn("h-5 w-5", data.parallelActive ? "text-purple-500 animate-pulse" : "text-muted-foreground")} />
                <span className="font-semibold">
                  Workers Paralelos {data.parallelActive && <Badge className="ml-2 bg-purple-500">ACTIVO</Badge>}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {data.workers.filter(w => w.processing > 0).length} activos de {data.workers.length} registrados
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              {data.workers.map(worker => (
                <TooltipProvider key={worker.workerId}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className={cn(
                          "rounded-lg border p-3 text-center transition-all",
                          worker.processing > 0 
                            ? "border-purple-500/50 bg-purple-500/10 animate-pulse" 
                            : "border-border bg-muted/30"
                        )}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {worker.processing > 0 && (
                            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                          )}
                          <span className="text-lg font-bold">W{worker.workerId}</span>
                        </div>
                        <div className="mt-1 flex justify-center gap-2 text-xs">
                          {worker.processing > 0 && (
                            <span className="text-purple-500">⏳ {worker.processing}</span>
                          )}
                          <span className="text-green-600">✓ {worker.completed}</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1 text-xs">
                        <div className="font-medium">Worker {worker.workerId}</div>
                        <div>Procesando: {worker.processing}</div>
                        <div>Completados: {worker.completed}</div>
                        {worker.tickers.length > 0 && (
                          <div className="mt-1 text-purple-400">
                            Ahora: {worker.tickers.slice(0, 3).join(', ')}{worker.tickers.length > 3 ? '...' : ''}
                          </div>
                        )}
                        {worker.lastActivity && (
                          <div className="text-muted-foreground">
                            Último: {formatDistanceToNow(worker.lastActivity, { locale: es, addSuffix: true })}
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
            
            {data.parallelActive && (
              <div className="flex items-center justify-center gap-2 text-sm text-purple-600">
                <Activity className="h-4 w-4" />
                <span>
                  Velocidad estimada: ~{Math.max(1, data.workers.filter(w => w.processing > 0).length * 15)} empresas/hora
                </span>
              </div>
            )}
          </div>
        )}


        <div className="flex flex-wrap gap-2 border-t pt-4">
          {data.zombies.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleResetZombies}
              disabled={resettingZombies}
              className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
            >
              {resettingZombies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Skull className="mr-2 h-4 w-4" />}
              Limpiar Zombis ({data.zombies.length})
            </Button>
          )}
          
          {data.pending > 0 && data.healthStatus !== 'healthy' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleResumeCascade}
              disabled={resumingCascade}
              className="border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
            >
              {resumingCascade ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Reanudar Cascada
            </Button>
          )}

          {data.healthStatus !== 'completed' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleTriggerRepair}
              disabled={triggeringRepair}
              className="border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
            >
              {triggeringRepair ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Completar Análisis
            </Button>
          )}

          {/* Parallel Workers Button */}
          {data.healthStatus !== 'completed' && data.pending > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={workerCount}
                onChange={(e) => setWorkerCount(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={2}>2 workers</option>
                <option value={4}>4 workers</option>
                <option value={6}>6 workers</option>
              </select>
              <Button 
                variant="default"
                size="sm"
                onClick={handleLaunchParallel}
                disabled={launchingParallel}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                {launchingParallel ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Lanzar Workers Paralelos
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
