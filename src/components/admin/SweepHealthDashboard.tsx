import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Activity,
  Ghost,
  Zap,
  Timer,
  AlertTriangle,
  Database,
  Bot
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useUnifiedSweepMetrics, useRefreshSweepMetrics } from '@/hooks/useUnifiedSweepMetrics';

// Type for pending triggers
interface PendingTrigger {
  action: string;
  created_at: string;
  params: { count?: number; sweep_id?: string } | null;
}

// AI Model icons mapping
const MODEL_COLORS: Record<string, string> = {
  'ChatGPT': 'text-green-600 bg-green-500/10',
  'Deepseek': 'text-blue-600 bg-blue-500/10',
  'Gemini': 'text-purple-600 bg-purple-500/10',
  'Grok': 'text-orange-600 bg-orange-500/10',
  'Perplexity': 'text-cyan-600 bg-cyan-500/10',
  'Qwen': 'text-pink-600 bg-pink-500/10',
};

export function SweepHealthDashboard() {
  const { toast } = useToast();
  const { data: metrics, isLoading, refetch } = useUnifiedSweepMetrics();
  const refreshAllMetrics = useRefreshSweepMetrics();
  
  // Action states
  const [forcing, setForcing] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  
  // Pending triggers state
  const [pendingTriggers, setPendingTriggers] = useState<PendingTrigger[]>([]);
  
  // Fetch pending triggers every 10 seconds
  useEffect(() => {
    const fetchPendingTriggers = async () => {
      const { data } = await supabase
        .from('cron_triggers')
        .select('action, created_at, params')
        .eq('status', 'pending')
        .in('action', ['repair_search', 'repair_analysis', 'auto_sanitize'])
        .order('created_at', { ascending: false });
      setPendingTriggers((data as PendingTrigger[]) || []);
    };
    
    fetchPendingTriggers();
    const interval = setInterval(fetchPendingTriggers, 10000);
    return () => clearInterval(interval);
  }, []);

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

  // ============ GET STATE LABEL ============
  const getStateDisplay = () => {
    if (!metrics) return { label: 'Cargando...', color: 'bg-muted-foreground' };
    
    switch (metrics.systemState) {
      case 'SWEEP_RUNNING':
        return { label: 'Procesando', color: 'bg-green-500', icon: Activity, animate: true };
      case 'CHECKING_DATA':
        return { label: 'Verificando datos', color: 'bg-yellow-500', icon: Database };
      case 'REPAIRS_PENDING':
        return { label: 'Reparaciones en cola', color: 'bg-blue-500', icon: Timer };
      case 'COMPLETE':
        return { label: 'Completado', color: 'bg-green-600', icon: CheckCircle2 };
      default:
        return { label: 'En espera', color: 'bg-muted-foreground', icon: Clock };
    }
  };

  const stateDisplay = getStateDisplay();

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
      metrics.systemState === 'SWEEP_RUNNING' && "border-green-500/50 bg-green-500/5",
      metrics.systemState === 'CHECKING_DATA' && "border-yellow-500/50 bg-yellow-500/5",
      metrics.systemState === 'REPAIRS_PENDING' && "border-blue-500/50 bg-blue-500/5",
      metrics.systemState === 'COMPLETE' && "border-green-600/50 bg-green-600/5",
      metrics.systemState === 'IDLE' && "border-muted-foreground/30 bg-muted/5",
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            {/* Estado visual */}
            <div className={cn(
              "relative w-10 h-10 rounded-full flex items-center justify-center",
              stateDisplay.color,
            )}>
              {stateDisplay.icon && (
                <>
                  <stateDisplay.icon className="w-5 h-5 text-white" />
                  {stateDisplay.animate && (
                    <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />
                  )}
                </>
              )}
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <span>Barrido {metrics.sweepId}</span>
                {metrics.systemState !== 'COMPLETE' && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    {stateDisplay.label}
                  </Badge>
                )}
              </div>
              <div className="text-sm font-normal text-muted-foreground">
                {metrics.systemState === 'SWEEP_RUNNING' && 'Procesando automáticamente'}
                {metrics.systemState === 'CHECKING_DATA' && `Faltan ${metrics.recordsNoData} búsquedas, ${metrics.recordsPendingAnalysis} análisis`}
                {metrics.systemState === 'REPAIRS_PENDING' && `${pendingTriggers.length} reparaciones en cola`}
                {metrics.systemState === 'COMPLETE' && 'Todas las empresas completadas (6/6)'}
                {metrics.systemState === 'IDLE' && 'En espera del próximo ciclo'}
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
        {/* ALERTA CRÍTICA: Empresas fantasma detectadas */}
        {metrics.ghostCompanies > 0 && (
          <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
            <Ghost className="h-4 w-4" />
            <AlertTitle>🚨 {metrics.ghostCompanies} empresas fantasma detectadas</AlertTitle>
            <AlertDescription>
              Estas empresas están marcadas como "completadas" pero tienen 0 registros en la base de datos: 
              <span className="font-mono text-xs ml-1">
                {metrics.ghostTickers.slice(0, 5).join(', ')}
                {metrics.ghostTickers.length > 5 && ` y ${metrics.ghostTickers.length - 5} más`}
              </span>
              <br />
              <span className="text-xs opacity-80">Pulsa "Forzar Ahora" para reconciliarlas automáticamente.</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Triggers pendientes - mostrar si hay alguno */}
        {pendingTriggers.length > 0 && (
          <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-medium text-sm">
                {pendingTriggers.length} trigger{pendingTriggers.length > 1 ? 's' : ''} en cola:
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {pendingTriggers.map((t, i) => (
                <Badge key={i} variant="outline" className="bg-background text-xs">
                  {t.action.replace('_', ' ')} ({t.params?.count || '?'} registros)
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {/* Barra de progreso - basada en empresas completadas */}
        <Progress
          value={mainProgress} 
          className={cn(
            "h-3",
            metrics.systemState === 'COMPLETE' && "[&>div]:bg-green-600",
            metrics.systemState === 'SWEEP_RUNNING' && "[&>div]:bg-green-500",
            metrics.systemState === 'CHECKING_DATA' && "[&>div]:bg-yellow-500",
            metrics.systemState === 'REPAIRS_PENDING' && "[&>div]:bg-blue-500",
          )} 
        />

        {/* === NUEVO: Progreso por modelo === */}
        {metrics.byModel.length > 0 && (
          <div className="grid grid-cols-6 gap-2">
            {metrics.byModel.map((modelMetric) => (
              <div 
                key={modelMetric.model} 
                className={cn(
                  "rounded-lg p-2 text-center border",
                  MODEL_COLORS[modelMetric.model] || 'bg-muted'
                )}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Bot className="w-3 h-3" />
                  <span className="text-xs font-medium">{modelMetric.model}</span>
                </div>
                <div className="text-lg font-bold">{modelMetric.percentage}%</div>
                <div className="text-[10px] text-muted-foreground">
                  {modelMetric.withScore}/{modelMetric.total}
                </div>
                {modelMetric.pendingNoData > 0 && (
                  <div className="text-[10px] text-red-600 font-medium">
                    ⚠ {modelMetric.pendingNoData} sin datos
                  </div>
                )}
                {modelMetric.pendingAnalyzable > 0 && modelMetric.pendingNoData === 0 && (
                  <div className="text-[10px] text-amber-600 font-medium">
                    ⏳ {modelMetric.pendingAnalyzable} por analizar
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

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
          <div className="rounded bg-amber-500/10 p-2">
            <div className="font-bold text-amber-600">{metrics.recordsPendingAnalysis}</div>
            <div className="text-xs text-muted-foreground">Por analizar</div>
          </div>
          <div className="rounded bg-red-500/10 p-2">
            <div className="font-bold text-red-600">{metrics.recordsNoData}</div>
            <div className="text-xs text-muted-foreground">Sin datos</div>
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

        {/* Mensaje de alerta si hay pendientes */}
        {(metrics.recordsNoData > 0 || metrics.recordsPendingAnalysis > 0) && metrics.systemState !== 'SWEEP_RUNNING' && (
          <div className="p-3 rounded-lg bg-amber-500/15 text-amber-700 text-center text-sm font-medium flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {metrics.recordsNoData > 0 && `${metrics.recordsNoData} sin búsqueda`}
            {metrics.recordsNoData > 0 && metrics.recordsPendingAnalysis > 0 && ' • '}
            {metrics.recordsPendingAnalysis > 0 && `${metrics.recordsPendingAnalysis} sin analizar`}
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-wrap justify-center gap-2 pt-2">          
          {metrics.systemState !== 'COMPLETE' && (
            <Button size="sm" onClick={handleForce} disabled={forcing}>
              {forcing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
              Forzar Ahora
            </Button>
          )}

          {metrics.systemState !== 'COMPLETE' && (
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
        {metrics.systemState !== 'COMPLETE' && (
          <div className="text-xs text-center text-muted-foreground border-t pt-3">
            🔄 CRON auto-recovery activo cada 5 min • Máximo 3 empresas simultáneas • Limpieza automática de zombis
          </div>
        )}
      </CardContent>
    </Card>
  );
}
