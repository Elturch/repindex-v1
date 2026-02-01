import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Skull,
  RotateCcw,
  Activity,
  Pause,
  Zap,
  Timer
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, differenceInSeconds, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

// ============ TIPOS ============
interface SweepStatus {
  sweepId: string;
  completed: number;
  pending: number;
  processing: number;
  failed: number;
  total: number;
  progress: number;
  lastActivity: Date | null;
  secondsSinceActivity: number;
  zombieCount: number;
  estimatedTimeRemaining: string;
  velocity: number;  // empresas por hora
}

type SystemState = 'running' | 'stuck' | 'idle' | 'complete' | 'unknown';

// ============ COMPONENTE PRINCIPAL ============
export function SweepHealthDashboard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SweepStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRecoveryActive] = useState(true);
  
  // Tracking for velocity calculation
  const completedHistory = useRef<Array<{ count: number; time: Date }>>([]);
  
  // Action states
  const [cleaningZombies, setCleaningZombies] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  // ============ CALCULATE VELOCITY ============
  const calculateVelocity = useCallback((currentCompleted: number): number => {
    const now = new Date();
    const history = completedHistory.current;
    
    // Add current data point
    history.push({ count: currentCompleted, time: now });
    
    // Keep only last 10 minutes of data
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    completedHistory.current = history.filter(h => h.time >= tenMinAgo);
    
    // Need at least 2 data points
    if (completedHistory.current.length < 2) return 0;
    
    const oldest = completedHistory.current[0];
    const newest = completedHistory.current[completedHistory.current.length - 1];
    
    const completedDiff = newest.count - oldest.count;
    const timeDiffMinutes = differenceInMinutes(newest.time, oldest.time);
    
    if (timeDiffMinutes === 0) return 0;
    
    // Convert to per hour
    return Math.round((completedDiff / timeDiffMinutes) * 60);
  }, []);

  // ============ FETCH DATA ============
  const fetchStatus = useCallback(async () => {
    try {
      // 1. Get orchestrator status
      const { data: orchData, error: orchError } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { get_status: true },
      });

      if (orchError || !orchData?.initialized) {
        setStatus(null);
        setLoading(false);
        return;
      }

      const sweepId = orchData.sweepId;
      const byStatus = orchData.byStatus || {};
      
      const completed = byStatus.completed || 0;
      const pending = byStatus.pending || 0;
      const processing = byStatus.processing || 0;
      const failed = byStatus.failed || 0;
      const total = orchData.totalCompanies || 0;

      // 2. Get last activity from DB
      const { data: progressData } = await supabase
        .from('sweep_progress')
        .select('completed_at')
        .eq('sweep_id', sweepId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastActivity = progressData?.completed_at ? new Date(progressData.completed_at) : null;
      const secondsSinceActivity = lastActivity ? differenceInSeconds(new Date(), lastActivity) : 9999;
      
      // Zombie detection (processing > 5 min)
      const { data: zombieData } = await supabase
        .from('sweep_progress')
        .select('ticker')
        .eq('sweep_id', sweepId)
        .eq('status', 'processing')
        .lt('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
      
      const zombieCount = zombieData?.length || 0;
      
      // Calculate velocity and ETA
      const velocity = calculateVelocity(completed);
      const remaining = pending + failed;
      let estimatedTimeRemaining = '-';
      
      if (velocity > 0 && remaining > 0) {
        const hoursRemaining = remaining / velocity;
        if (hoursRemaining < 1) {
          estimatedTimeRemaining = `~${Math.round(hoursRemaining * 60)} min`;
        } else {
          estimatedTimeRemaining = `~${hoursRemaining.toFixed(1)} h`;
        }
      } else if (remaining === 0) {
        estimatedTimeRemaining = 'Completado';
      }

      setStatus({
        sweepId,
        completed,
        pending,
        processing,
        failed,
        total,
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
        lastActivity,
        secondsSinceActivity,
        zombieCount,
        estimatedTimeRemaining,
        velocity,
      });
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [calculateVelocity]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // ============ ACTIONS ============
  const handleCleanZombies = async () => {
    if (!status) return;
    setCleaningZombies(true);
    try {
      const { data } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { reset_stuck: true, reset_stuck_timeout: 5 },
      });
      toast({ title: '🧹 Zombis limpiados', description: `${data?.resetCount || 0} empresas reseteadas` });
      await fetchStatus();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setCleaningZombies(false);
    }
  };

  const handleForce = async () => {
    if (!status) return;
    setForcing(true);
    try {
      const { data } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'auto_recovery' },
      });
      toast({ 
        title: '⚡ Auto-recovery disparado', 
        description: data?.firedCount ? `${data.firedCount} empresas en proceso` : data?.action 
      });
      await fetchStatus();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setForcing(false);
    }
  };

  const handleResetAll = async () => {
    if (!status || !confirm(`¿Reiniciar TODO ${status.sweepId}?`)) return;
    setResettingAll(true);
    try {
      await supabase.from('sweep_progress')
        .update({ status: 'pending', started_at: null, completed_at: null, retry_count: 0 })
        .eq('sweep_id', status.sweepId);
      toast({ title: '🔄 Reset completo' });
      await fetchStatus();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setResettingAll(false);
    }
  };

  // ============ DETERMINE STATE ============
  const getSystemState = (): SystemState => {
    if (!status) return 'unknown';
    if (status.progress === 100) return 'complete';
    if (status.zombieCount > 0 || (status.pending > 0 && status.processing === 0 && status.secondsSinceActivity > 300)) return 'stuck';
    if (status.processing > 0 || status.secondsSinceActivity < 120) return 'running';
    if (status.pending === 0 && status.processing === 0) return 'idle';
    return 'idle';
  };

  const state = getSystemState();

  // ============ RENDER ============
  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className="mb-6">
        <CardContent className="py-12 text-center text-muted-foreground">
          No hay barrido activo
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "mb-6 border-2 transition-all duration-300",
      state === 'running' && "border-green-500/50 bg-green-500/5",
      state === 'stuck' && "border-red-500/50 bg-red-500/5",
      state === 'complete' && "border-green-600/50 bg-green-600/5",
      state === 'idle' && "border-yellow-500/50 bg-yellow-500/5",
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            {/* Estado visual */}
            <div className={cn(
              "relative w-10 h-10 rounded-full flex items-center justify-center",
              state === 'running' && "bg-green-500",
              state === 'stuck' && "bg-red-500",
              state === 'complete' && "bg-green-600",
              state === 'idle' && "bg-yellow-500",
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
                <span>Barrido {status.sweepId}</span>
                {autoRecoveryActive && state !== 'complete' && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    AUTO
                  </Badge>
                )}
              </div>
              <div className="text-sm font-normal text-muted-foreground">
                {state === 'running' && 'Procesando automáticamente'}
                {state === 'stuck' && '⚠️ Requiere atención'}
                {state === 'complete' && 'Completado'}
                {state === 'idle' && 'En espera'}
              </div>
            </div>
          </CardTitle>

          <div className="text-right">
            <div className="text-3xl font-bold">{status.progress}%</div>
            <div className="text-sm text-muted-foreground">{status.completed}/{status.total}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Barra de progreso */}
        <Progress 
          value={status.progress} 
          className={cn(
            "h-3",
            state === 'complete' && "[&>div]:bg-green-600",
            state === 'running' && "[&>div]:bg-green-500",
            state === 'stuck' && "[&>div]:bg-red-500",
          )} 
        />

        {/* Métricas principales */}
        <div className="grid grid-cols-5 gap-2 text-center text-sm">
          <div className="rounded bg-green-500/10 p-2">
            <div className="font-bold text-green-600">{status.completed}</div>
            <div className="text-xs text-muted-foreground">Completados</div>
          </div>
          <div className="rounded bg-blue-500/10 p-2">
            <div className="font-bold text-blue-600">{status.processing}</div>
            <div className="text-xs text-muted-foreground">Procesando</div>
          </div>
          <div className="rounded bg-yellow-500/10 p-2">
            <div className="font-bold text-yellow-600">{status.pending}</div>
            <div className="text-xs text-muted-foreground">Pendientes</div>
          </div>
          <div className="rounded bg-red-500/10 p-2">
            <div className="font-bold text-red-600">{status.failed}</div>
            <div className="text-xs text-muted-foreground">Fallidos</div>
          </div>
          <div className="rounded bg-purple-500/10 p-2">
            <div className="font-bold text-purple-600">{status.zombieCount}</div>
            <div className="text-xs text-muted-foreground">Zombis</div>
          </div>
        </div>

        {/* Estimaciones */}
        <div className="flex items-center justify-between text-sm border-t pt-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Timer className="w-4 h-4" />
              <span>ETA: <span className="font-medium text-foreground">{status.estimatedTimeRemaining}</span></span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>Velocidad: <span className="font-medium text-foreground">{status.velocity} emp/h</span></span>
            </div>
          </div>
          <div className="text-muted-foreground">
            Última: {status.lastActivity 
              ? formatDistanceToNow(status.lastActivity, { locale: es, addSuffix: true })
              : 'Nunca'
            }
          </div>
        </div>

        {/* Mensaje de alerta */}
        {state === 'stuck' && (
          <div className="p-3 rounded-lg bg-red-500/15 text-red-700 text-center text-sm font-medium">
            ⚠️ Sistema atascado. {status.zombieCount > 0 ? 'Hay zombis que limpiar.' : 'No hay actividad reciente.'}
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {status.zombieCount > 0 && (
            <Button 
              size="sm"
              variant="outline" 
              onClick={handleCleanZombies}
              disabled={cleaningZombies}
              className="border-orange-500 text-orange-600 hover:bg-orange-500/10"
            >
              {cleaningZombies ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Skull className="mr-1 h-3 w-3" />}
              Limpiar Zombis
            </Button>
          )}
          
          {state !== 'complete' && (status.pending > 0 || state === 'stuck' || state === 'idle') && (
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

          <Button variant="ghost" size="sm" onClick={fetchStatus}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {/* Info del sistema auto */}
        {autoRecoveryActive && state !== 'complete' && (
          <div className="text-xs text-center text-muted-foreground border-t pt-3">
            🔄 CRON auto-recovery activo cada 5 min • Máximo 3 empresas simultáneas • Limpieza automática de zombis
          </div>
        )}
      </CardContent>
    </Card>
  );
}
