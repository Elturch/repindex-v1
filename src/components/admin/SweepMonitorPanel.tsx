import React, { useState, useEffect } from 'react';
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
  Timer,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ModelStats {
  model: string;
  totalRecords: number;
  analyzed: number;
  pendingAnalysis: number;
  tickers: number;
  lastCreated: string | null;
}

interface SweepStatus {
  totalIssuers: number;
  modelsData: ModelStats[];
  isRunning: boolean;
  lastSweepStart: string | null;
  estimatedCompletion: string | null;
}

const AI_MODELS = ['ChatGPT', 'Google Gemini', 'Perplexity', 'Deepseek', 'Grok', 'Qwen'];

export function SweepMonitorPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SweepStatus>({
    totalIssuers: 0,
    modelsData: [],
    isRunning: false,
    lastSweepStart: null,
    estimatedCompletion: null,
  });
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      // Get total issuers
      const { count: totalIssuers } = await supabase
        .from('repindex_root_issuers')
        .select('*', { count: 'exact', head: true });

      // Get current week's data by model
      const { data: modelData, error } = await supabase
        .from('rix_runs_v2')
        .select('02_model_name, analysis_completed_at, search_completed_at, 05_ticker, created_at')
        .gte('06_period_from', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      // Group by model
      const modelMap = new Map<string, {
        records: number;
        analyzed: number;
        pending: number;
        tickers: Set<string>;
        lastCreated: Date | null;
      }>();

      AI_MODELS.forEach(model => {
        modelMap.set(model, { records: 0, analyzed: 0, pending: 0, tickers: new Set(), lastCreated: null });
      });

      modelData?.forEach(row => {
        const model = row['02_model_name'];
        if (!AI_MODELS.includes(model)) return;
        
        const stats = modelMap.get(model)!;
        stats.records++;
        stats.tickers.add(row['05_ticker']);
        
        if (row.analysis_completed_at) {
          stats.analyzed++;
        } else if (row.search_completed_at) {
          stats.pending++;
        }

        const createdAt = new Date(row.created_at);
        if (!stats.lastCreated || createdAt > stats.lastCreated) {
          stats.lastCreated = createdAt;
        }
      });

      const modelsData: ModelStats[] = AI_MODELS.map(model => {
        const stats = modelMap.get(model)!;
        return {
          model,
          totalRecords: stats.records,
          analyzed: stats.analyzed,
          pendingAnalysis: stats.pending,
          tickers: stats.tickers.size,
          lastCreated: stats.lastCreated?.toISOString() || null,
        };
      });

      // Check if sweep is running (recent activity in last 5 minutes)
      const recentActivity = modelData?.some(row => {
        const created = new Date(row.created_at);
        return (Date.now() - created.getTime()) < 5 * 60 * 1000;
      });

      // Estimate completion based on progress
      const totalExpected = (totalIssuers || 0) * 7;
      const totalProcessed = modelsData.reduce((sum, m) => sum + m.analyzed, 0);
      const processRate = 5; // ~5 companies per batch, 30s delay
      const remainingBatches = Math.ceil(((totalIssuers || 0) - Math.max(...modelsData.map(m => m.tickers))) / 5);
      const estimatedMinutes = remainingBatches * 0.5; // 30s per batch

      setStatus({
        totalIssuers: totalIssuers || 0,
        modelsData,
        isRunning: recentActivity || false,
        lastSweepStart: modelsData[0]?.lastCreated || null,
        estimatedCompletion: estimatedMinutes > 0 ? `~${Math.ceil(estimatedMinutes)} min` : null,
      });
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
  };

  useEffect(() => {
    fetchStatus();
    
    // Auto-refresh every 30 seconds if sweep is running
    const interval = setInterval(() => {
      if (status.isRunning) {
        fetchStatus();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [status.isRunning]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatus();
  };

  const handleLaunchSweep = async () => {
    setLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke('rix-batch-orchestrator', {
        body: { trigger: 'manual', full_sweep: true },
      });

      if (error) throw error;

      toast({
        title: 'Barrido iniciado',
        description: `Procesando ${status.totalIssuers} empresas × 7 modelos. Tiempo estimado: ~${Math.ceil(status.totalIssuers / 5 * 0.5)} min`,
      });

      // Start refreshing to show progress
      setStatus(prev => ({ ...prev, isRunning: true }));
      setTimeout(fetchStatus, 5000);
    } catch (error: any) {
      console.error('Error launching sweep:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo iniciar el barrido',
        variant: 'destructive',
      });
    } finally {
      setLaunching(false);
    }
  };

  const overallProgress = status.totalIssuers > 0
    ? Math.round((Math.max(...status.modelsData.map(m => m.tickers)) / status.totalIssuers) * 100)
    : 0;

  const totalAnalyzed = status.modelsData.reduce((sum, m) => sum + m.analyzed, 0);
  const totalPending = status.modelsData.reduce((sum, m) => sum + m.pendingAnalysis, 0);
  const totalExpected = status.totalIssuers * 7;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Monitor de Barrido Semanal V2
              </CardTitle>
              <CardDescription>
                Pipeline RIX V2: {status.totalIssuers} empresas × 7 modelos de IA
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
              <Button
                onClick={handleLaunchSweep}
                disabled={launching || status.isRunning}
                className="gap-2"
              >
                {launching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : status.isRunning ? (
                  <Clock className="h-4 w-4 animate-pulse" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {status.isRunning ? 'En curso...' : 'Lanzar Barrido'}
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
                {status.isRunning && (
                  <Badge variant="outline" className="bg-primary/10 text-primary animate-pulse">
                    <Clock className="h-3 w-3 mr-1" />
                    En ejecución
                  </Badge>
                )}
                <span className="font-medium">{overallProgress}%</span>
              </div>
            </div>
            <Progress value={overallProgress} className="h-3" />
            
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-foreground">{status.totalIssuers}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Empresas totales
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-good/10">
                <div className="text-2xl font-bold text-good">{totalAnalyzed}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Analizados
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-needs-improvement/10">
                <div className="text-2xl font-bold text-needs-improvement">{totalPending}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pendientes análisis
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <div className="text-2xl font-bold text-primary">{totalExpected}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  Registros esperados
                </div>
              </div>
            </div>

            {status.estimatedCompletion && status.isRunning && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
                <Timer className="h-4 w-4" />
                Tiempo estimado restante: {status.estimatedCompletion}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Model breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estado por Modelo de IA</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {status.modelsData.map((model) => {
              const progress = status.totalIssuers > 0 
                ? Math.round((model.tickers / status.totalIssuers) * 100) 
                : 0;
              const hasErrors = model.pendingAnalysis > 0 && model.analyzed === 0;
              
              return (
                <div key={model.model} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.model}</span>
                      {model.pendingAnalysis > 0 && (
                        <Badge variant="outline" className="text-xs bg-needs-improvement/10 text-needs-improvement">
                          {model.pendingAnalysis} pendientes
                        </Badge>
                      )}
                      {hasErrors && (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="text-xs">
                        {model.tickers}/{status.totalIssuers} empresas
                      </span>
                      <span className="font-medium text-foreground">{progress}%</span>
                    </div>
                  </div>
                  <Progress 
                    value={progress} 
                    className={cn(
                      "h-2",
                      hasErrors && "bg-destructive/20"
                    )} 
                  />
                  {model.lastCreated && (
                    <div className="text-xs text-muted-foreground">
                      Último registro: {new Date(model.lastCreated).toLocaleString('es-ES')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

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
              onClick={() => window.open('/dashboard-v2', '_blank')}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Ver Dashboard V2
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                // Trigger analysis for pending records
                toast({
                  title: 'Funcionalidad próximamente',
                  description: 'Analizar registros pendientes desde aquí',
                });
              }}
            >
              <Play className="h-4 w-4 mr-2" />
              Analizar pendientes ({totalPending})
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
