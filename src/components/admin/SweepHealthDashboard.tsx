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
  Play,
  RefreshCw,
  Skull,
  RotateCcw,
  Search,
  Wrench,
  AlertTriangle,
  Activity,
  Pause
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
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
  isStuck: boolean;
  isHealthy: boolean;
  zombieCount: number;
}

interface QualityStatus {
  valid: number;
  invalid: number;
  missing: number;
  byModel: Record<string, { valid: number; invalid: number; missing: number }>;
}

type SystemState = 'running' | 'stuck' | 'idle' | 'complete' | 'unknown';

// ============ COMPONENTE PRINCIPAL ============
export function SweepHealthDashboard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SweepStatus | null>(null);
  const [quality, setQuality] = useState<QualityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const prevCompletedRef = useRef<number>(0);
  
  // Action states
  const [cleaningZombies, setCleaningZombies] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [sanitizing, setSanitizing] = useState(false);
  const [repairing, setRepairing] = useState(false);

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
      
      // Detect if stuck (no activity in 2+ minutes while there are pending)
      const isStuck = (pending > 0 || processing > 0) && secondsSinceActivity > 120;
      const isHealthy = !isStuck && processing > 0 && secondsSinceActivity < 60;
      
      // Zombie detection (processing > 5 min)
      const { data: zombieData } = await supabase
        .from('sweep_progress')
        .select('ticker')
        .eq('sweep_id', sweepId)
        .eq('status', 'processing')
        .lt('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
      
      const zombieCount = zombieData?.length || 0;

      // Track completion changes
      prevCompletedRef.current = completed;

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
        isStuck,
        isHealthy,
        zombieCount,
      });

      // 3. Fetch quality report
      try {
        const { data: qualityData } = await supabase.functions.invoke('rix-quality-watchdog', {
          body: { action: 'report', sweep_id: sweepId },
        });

        if (qualityData?.success) {
          let totalValid = 0, totalInvalid = 0, totalMissing = 0;
          const byModel: Record<string, { valid: number; invalid: number; missing: number }> = {};
          
          Object.entries(qualityData.byModel || {}).forEach(([model, stats]: [string, any]) => {
            const valid = total - (stats.missing || 0) - (stats.invalid || 0) - (stats.failed || 0);
            byModel[model] = {
              valid: Math.max(0, valid),
              invalid: stats.invalid || 0,
              missing: (stats.missing || 0) + (stats.failed || 0),
            };
            totalValid += byModel[model].valid;
            totalInvalid += byModel[model].invalid;
            totalMissing += byModel[model].missing;
          });

          setQuality({ valid: totalValid, invalid: totalInvalid, missing: totalMissing, byModel });
        }
      } catch (e) {
        console.warn('Quality fetch failed:', e);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
      await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { reset_stuck: true, reset_stuck_timeout: 5 },
      });
      toast({ title: '🧹 Zombis limpiados' });
      await fetchStatus();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setCleaningZombies(false);
    }
  };

  const handleResume = async () => {
    if (!status) return;
    setResuming(true);
    try {
      await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { mode: 'concurrent_stable', workers: 3 },
      });
      toast({ title: '▶️ Barrido reanudado' });
      await fetchStatus();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setResuming(false);
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

  const handleSanitize = async () => {
    if (!status) return;
    setSanitizing(true);
    try {
      const { data } = await supabase.functions.invoke('rix-quality-watchdog', {
        body: { action: 'sanitize', sweep_id: status.sweepId },
      });
      toast({ title: '🔍 Sanificación', description: `${data?.invalidFound || 0} inválidas detectadas` });
      await fetchStatus();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSanitizing(false);
    }
  };

  const handleRepair = async () => {
    if (!status) return;
    setRepairing(true);
    try {
      await supabase.from('cron_triggers').insert({
        action: 'repair_invalid_responses',
        params: { sweep_id: status.sweepId, max_repairs: 20 },
      });
      toast({ title: '🔧 Reparación programada' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRepairing(false);
    }
  };

  // ============ DETERMINE STATE ============
  const getSystemState = (): SystemState => {
    if (!status) return 'unknown';
    if (status.progress === 100) return 'complete';
    if (status.isStuck || status.zombieCount > 0) return 'stuck';
    if (status.isHealthy) return 'running';
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
    <div className="space-y-4 mb-6">
      {/* ═══════════════════════════════════════════════════════════════════
          ESTADO PRINCIPAL - GRAN INDICADOR VISUAL
      ═══════════════════════════════════════════════════════════════════ */}
      <Card className={cn(
        "border-2 transition-all duration-500",
        state === 'running' && "border-green-500 bg-green-500/5",
        state === 'stuck' && "border-red-500 bg-red-500/5 animate-pulse",
        state === 'complete' && "border-green-600 bg-green-600/10",
        state === 'idle' && "border-yellow-500 bg-yellow-500/5",
      )}>
        <CardContent className="py-6">
          {/* Header con estado */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {/* Indicador de latido */}
              <div className={cn(
                "relative w-12 h-12 rounded-full flex items-center justify-center",
                state === 'running' && "bg-green-500",
                state === 'stuck' && "bg-red-500",
                state === 'complete' && "bg-green-600",
                state === 'idle' && "bg-yellow-500",
              )}>
                {state === 'running' && (
                  <>
                    <Activity className="w-6 h-6 text-white" />
                    <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
                  </>
                )}
                {state === 'stuck' && <Pause className="w-6 h-6 text-white" />}
                {state === 'complete' && <CheckCircle2 className="w-6 h-6 text-white" />}
                {state === 'idle' && <Clock className="w-6 h-6 text-white" />}
              </div>
              
              <div>
                <div className="text-2xl font-bold">
                  {state === 'running' && 'PROCESANDO'}
                  {state === 'stuck' && '⚠️ ATASCADO'}
                  {state === 'complete' && '✓ COMPLETADO'}
                  {state === 'idle' && 'EN PAUSA'}
                </div>
                <div className="text-sm text-muted-foreground">
                  Barrido {status.sweepId}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-3xl font-bold">{status.progress}%</div>
              <div className="text-sm text-muted-foreground">
                {status.completed}/{status.total} empresas
              </div>
            </div>
          </div>

          {/* Barra de progreso */}
          <Progress 
            value={status.progress} 
            className={cn(
              "h-4 mb-4",
              state === 'complete' && "[&>div]:bg-green-600",
              state === 'running' && "[&>div]:bg-green-500",
              state === 'stuck' && "[&>div]:bg-red-500",
            )} 
          />

          {/* Métricas en línea */}
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="rounded-lg bg-green-500/10 p-3">
              <div className="text-2xl font-bold text-green-600">{status.completed}</div>
              <div className="text-xs text-muted-foreground">Completados</div>
            </div>
            <div className="rounded-lg bg-blue-500/10 p-3">
              <div className="text-2xl font-bold text-blue-600">{status.processing}</div>
              <div className="text-xs text-muted-foreground">Procesando</div>
            </div>
            <div className="rounded-lg bg-yellow-500/10 p-3">
              <div className="text-2xl font-bold text-yellow-600">{status.pending}</div>
              <div className="text-xs text-muted-foreground">Pendientes</div>
            </div>
            <div className="rounded-lg bg-red-500/10 p-3">
              <div className="text-2xl font-bold text-red-600">{status.failed}</div>
              <div className="text-xs text-muted-foreground">Fallidos</div>
            </div>
          </div>

          {/* Última actividad */}
          <div className="mt-4 flex items-center justify-between text-sm border-t pt-4">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                Última actividad: {status.lastActivity 
                  ? formatDistanceToNow(status.lastActivity, { locale: es, addSuffix: true })
                  : 'Nunca'
                }
              </span>
              {status.zombieCount > 0 && (
                <Badge variant="destructive">
                  <Skull className="w-3 h-3 mr-1" />
                  {status.zombieCount} zombis
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
              Actualizado {formatDistanceToNow(lastRefresh, { locale: es, addSuffix: true })}
            </div>
          </div>

          {/* Mensaje de acción requerida */}
          {state === 'stuck' && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/20 text-red-700 text-center font-medium">
              ⚠️ El sistema está atascado. Pulsa "Limpiar Zombis" y luego "Reanudar".
            </div>
          )}
          {state === 'idle' && status.pending > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-500/20 text-yellow-700 text-center font-medium">
              El barrido está pausado. Pulsa "Reanudar" para continuar.
            </div>
          )}

          {/* Botones de acción */}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {status.zombieCount > 0 && (
              <Button 
                variant="outline" 
                onClick={handleCleanZombies}
                disabled={cleaningZombies}
                className="border-orange-500 text-orange-600 hover:bg-orange-500/10"
              >
                {cleaningZombies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Skull className="mr-2 h-4 w-4" />}
                Limpiar Zombis
              </Button>
            )}
            
            {state !== 'complete' && (status.pending > 0 || state === 'stuck') && (
              <Button onClick={handleResume} disabled={resuming}>
                {resuming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Reanudar
              </Button>
            )}

            {state !== 'complete' && (
              <Button 
                variant="outline" 
                onClick={handleResetAll}
                disabled={resettingAll}
                className="border-red-500 text-red-600 hover:bg-red-500/10"
              >
                {resettingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Reset Total
              </Button>
            )}

            <Button variant="ghost" size="icon" onClick={fetchStatus}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════
          CALIDAD DE RESPUESTAS
      ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base flex items-center gap-2">
            Calidad de Respuestas
            {(quality?.invalid || 0) > 0 && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {quality?.invalid} inválidas
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 rounded-lg bg-green-500/10">
              <div className="text-xl font-bold text-green-600">{quality?.valid || 0}</div>
              <div className="text-xs text-muted-foreground">Válidas</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-yellow-500/10">
              <div className="text-xl font-bold text-yellow-600">{quality?.invalid || 0}</div>
              <div className="text-xs text-muted-foreground">Inválidas</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-500/10">
              <div className="text-xl font-bold text-red-600">{quality?.missing || 0}</div>
              <div className="text-xs text-muted-foreground">Sin datos</div>
            </div>
          </div>

          {/* Detalle por modelo */}
          {quality?.byModel && Object.keys(quality.byModel).length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {Object.entries(quality.byModel).map(([model, s]) => (
                <div 
                  key={model}
                  className={cn(
                    "text-xs p-2 rounded border",
                    (s.invalid > 0 || s.missing > 0) 
                      ? "bg-yellow-500/5 border-yellow-500/30" 
                      : "bg-green-500/5 border-green-500/30"
                  )}
                >
                  <div className="font-medium truncate">{model}</div>
                  <div className="flex gap-1 mt-1">
                    <span className="text-green-600">✓{s.valid}</span>
                    {s.invalid > 0 && <span className="text-yellow-600">⚠{s.invalid}</span>}
                    {s.missing > 0 && <span className="text-red-600">✗{s.missing}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <Button variant="outline" size="sm" onClick={handleSanitize} disabled={sanitizing}>
              {sanitizing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Search className="mr-2 h-3 w-3" />}
              Sanificar
            </Button>
            {(quality?.invalid || 0) > 0 && (
              <Button size="sm" onClick={handleRepair} disabled={repairing} className="bg-yellow-600 hover:bg-yellow-700">
                {repairing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Wrench className="mr-2 h-3 w-3" />}
                Reparar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
