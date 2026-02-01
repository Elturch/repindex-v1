import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Skull,
  XCircle,
  RotateCcw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// ============ TIPOS SIMPLIFICADOS ============
interface SweepHealthData {
  sweepId: string;
  totalCompanies: number;
  completed: number;
  pending: number;
  failed: number;
  progress: number;
  zombieCount: number;
  lastActivity: Date | null;
  estimatedSpeed: number; // empresas/hora
  estimatedETA: string;
}

// ============ COMPONENTE PRINCIPAL: SEMÁFORO DE SALUD ============
export function SweepHealthDashboard() {
  const { toast } = useToast();
  const [data, setData] = useState<SweepHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resettingZombies, setResettingZombies] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

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

      // 2. Fetch all progress records
      const { data: progressData, error: progressError } = await supabase
        .from('sweep_progress')
        .select('ticker, status, started_at, completed_at')
        .eq('sweep_id', sweepId);

      if (progressError || !progressData) {
        throw new Error('Failed to fetch progress data');
      }

      // 3. Calculate simple metrics
      const completed = progressData.filter(r => r.status === 'completed').length;
      const pending = progressData.filter(r => r.status === 'pending').length;
      const processing = progressData.filter(r => r.status === 'processing').length;
      const failed = progressData.filter(r => r.status === 'failed').length;
      const total = progressData.length;

      // 4. Detect zombies (processing > 5 min)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const zombieCount = progressData.filter(r => 
        r.status === 'processing' && 
        r.started_at &&
        new Date(r.started_at).getTime() < fiveMinutesAgo
      ).length;

      // 5. Find last activity
      const completedRecords = progressData.filter(r => r.completed_at);
      const lastActivity = completedRecords.length > 0 
        ? new Date(Math.max(...completedRecords.map(r => new Date(r.completed_at!).getTime())))
        : null;

      // 6. Calculate speed and ETA
      let estimatedSpeed = 0;
      let estimatedETA = '—';
      
      if (lastActivity && completed > 0) {
        const firstCompleted = completedRecords.reduce((min, r) => {
          const t = new Date(r.completed_at!).getTime();
          return t < min ? t : min;
        }, Infinity);
        
        const hoursElapsed = (lastActivity.getTime() - firstCompleted) / 3600000;
        if (hoursElapsed > 0.1) {
          estimatedSpeed = Math.round(completed / hoursElapsed);
          const remaining = pending + processing + failed;
          if (estimatedSpeed > 0 && remaining > 0) {
            const hoursRemaining = remaining / estimatedSpeed;
            if (hoursRemaining < 1) {
              estimatedETA = `~${Math.round(hoursRemaining * 60)} min`;
            } else {
              estimatedETA = `~${hoursRemaining.toFixed(1)} h`;
            }
          }
        }
      }

      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

      setData({
        sweepId,
        totalCompanies: total,
        completed,
        pending: pending + processing, // Combinamos pendientes + en proceso
        failed,
        progress,
        zombieCount,
        lastActivity,
        estimatedSpeed,
        estimatedETA,
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
    if (!data) return;
    setResettingZombies(true);

    try {
      // Reset via orchestrator (uses reset_stuck action)
      const { error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { reset_stuck: true, reset_stuck_timeout: 5 },
      });

      if (error) throw error;

      toast({
        title: '🧹 Zombis limpiados',
        description: 'Registros atascados reiniciados a pendiente',
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

  const handleResume = async () => {
    if (!data) return;
    setResuming(true);

    try {
      // Use concurrent_stable mode (the new stable mode)
      const { data: result, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { mode: 'concurrent_stable', workers: 3 },
      });

      if (error) throw error;

      toast({
        title: '▶️ Barrido reanudado',
        description: result?.message || 'Procesando empresas...',
      });

      await fetchHealthData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo reanudar',
        variant: 'destructive',
      });
    } finally {
      setResuming(false);
    }
  };

  const handleResetAll = async () => {
    if (!data) return;
    
    const confirmed = window.confirm(
      `¿Reiniciar TODO el barrido ${data.sweepId}?\n\nEsto marcará todas las empresas como pendientes de nuevo.`
    );
    if (!confirmed) return;
    
    setResettingAll(true);

    try {
      const { error } = await supabase
        .from('sweep_progress')
        .update({ 
          status: 'pending', 
          started_at: null, 
          completed_at: null,
          error_message: 'Reset manual completo',
          retry_count: 0 
        })
        .eq('sweep_id', data.sweepId);

      if (error) throw error;

      toast({
        title: '🔄 Barrido reiniciado',
        description: `${data.totalCompanies} empresas marcadas como pendientes`,
      });

      await fetchHealthData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo reiniciar',
        variant: 'destructive',
      });
    } finally {
      setResettingAll(false);
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
            No hay barrido activo esta semana
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine status for visual styling
  const isComplete = data.progress === 100;
  const hasZombies = data.zombieCount > 0;
  const hasFailed = data.failed > 0;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold">
            BARRIDO SEMANAL
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-sm">
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

      <CardContent className="space-y-6">
        {/* ═══════════════════════════════════════════════════════════════════
            SEMÁFORO: 3 NÚMEROS GRANDES
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-3 gap-4">
          {/* Completados - Verde */}
          <div className="flex flex-col items-center rounded-xl bg-green-500/10 p-6 border-2 border-green-500/30">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div className="text-4xl font-bold text-green-600 mt-2">
              {data.completed}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Completados
            </div>
          </div>

          {/* Pendientes - Amarillo */}
          <div className="flex flex-col items-center rounded-xl bg-yellow-500/10 p-6 border-2 border-yellow-500/30">
            <div className="flex items-center gap-2">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="text-4xl font-bold text-yellow-600 mt-2">
              {data.pending}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Pendientes
            </div>
          </div>

          {/* Fallidos - Rojo */}
          <div className="flex flex-col items-center rounded-xl bg-red-500/10 p-6 border-2 border-red-500/30">
            <div className="flex items-center gap-2">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div className="text-4xl font-bold text-red-600 mt-2">
              {data.failed}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Fallidos
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            BARRA DE PROGRESO
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {data.progress}% completado
            </span>
            <span className="text-muted-foreground">
              {data.completed}/{data.totalCompanies} empresas
            </span>
          </div>
          <Progress 
            value={data.progress} 
            className={cn(
              "h-4",
              isComplete && "bg-green-100 [&>div]:bg-green-500"
            )} 
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            VELOCIDAD Y ETA
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground border-t border-b py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">Velocidad:</span>
            <span>~{data.estimatedSpeed} emp/hora</span>
          </div>
          <div className="text-muted-foreground">|</div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Tiempo restante:</span>
            <span>{data.estimatedETA}</span>
          </div>
          {data.lastActivity && (
            <>
              <div className="text-muted-foreground">|</div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Última actividad:</span>
                <span>{formatDistanceToNow(data.lastActivity, { locale: es, addSuffix: true })}</span>
              </div>
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            ALERTAS (solo si hay problemas)
        ═══════════════════════════════════════════════════════════════════ */}
        {(hasZombies || hasFailed) && (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
            <div className="flex flex-wrap gap-2">
              {hasZombies && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600">
                  🧟 {data.zombieCount} proceso(s) atascado(s)
                </Badge>
              )}
              {hasFailed && (
                <Badge variant="outline" className="bg-red-500/10 text-red-600">
                  ❌ {data.failed} fallido(s)
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            MENSAJE DE ESTADO
        ═══════════════════════════════════════════════════════════════════ */}
        <div className={cn(
          "rounded-lg p-3 text-center",
          isComplete ? "bg-green-500/10 text-green-700" :
          hasZombies ? "bg-orange-500/10 text-orange-700" :
          data.pending > 0 ? "bg-blue-500/10 text-blue-700" :
          "bg-muted text-muted-foreground"
        )}>
          {isComplete ? (
            <span className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Barrido completado exitosamente
            </span>
          ) : hasZombies ? (
            <span>⚠️ Hay procesos atascados. Pulsa "Limpiar Zombis" para desbloquear.</span>
          ) : data.pending > 0 ? (
            <span>✓ Sistema funcionando normalmente</span>
          ) : (
            <span>Sin empresas pendientes</span>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            BOTONES DE ACCIÓN
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {/* Limpiar Zombis */}
          {hasZombies && (
            <Button 
              variant="outline" 
              onClick={handleResetZombies}
              disabled={resettingZombies}
              className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
            >
              {resettingZombies ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Skull className="mr-2 h-4 w-4" />
              )}
              Limpiar Zombis
            </Button>
          )}
          
          {/* Reanudar */}
          {!isComplete && data.pending > 0 && (
            <Button 
              onClick={handleResume}
              disabled={resuming}
              className="bg-primary hover:bg-primary/90"
            >
              {resuming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Reanudar
            </Button>
          )}

          {/* Reset Total */}
          {!isComplete && (
            <Button 
              variant="outline" 
              onClick={handleResetAll}
              disabled={resettingAll}
              className="border-red-500/50 text-red-600 hover:bg-red-500/10"
            >
              {resettingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Reset Total
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
