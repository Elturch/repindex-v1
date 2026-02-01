import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Activity,
  Ghost,
  Zap
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

  // State display helper
  const getStateDisplay = () => {
    if (!metrics) return { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted' };
    
    switch (metrics.systemState) {
      case 'SWEEP_RUNNING':
        return { icon: Activity, color: 'text-green-600', bgColor: 'bg-green-500', animate: true };
      case 'COMPLETE':
        return { icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-600' };
      default:
        return { icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-500' };
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

  const stateDisplay = getStateDisplay();
  const modelsIncomplete = metrics.byModel.filter(m => m.percentage < 100);
  const hasPendingWork = metrics.recordsNoData > 0 || metrics.recordsPendingAnalysis > 0;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-lg">
            <div className={cn(
              "relative w-8 h-8 rounded-full flex items-center justify-center",
              stateDisplay.bgColor
            )}>
              <stateDisplay.icon className="w-4 h-4 text-white" />
              {stateDisplay.animate && (
                <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-40" />
              )}
            </div>
            <div>
              <span>Barrido {metrics.sweepId}</span>
              <div className="text-sm font-normal text-muted-foreground">
                {metrics.totalCompanies} empresas • {metrics.companiesComplete} completas
                {hasPendingWork && ` • ${metrics.recordsNoData + metrics.recordsPendingAnalysis} pendientes`}
              </div>
            </div>
          </CardTitle>
          <div className="text-2xl font-bold">{metrics.companyCompletionRate}%</div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Ghost alert - only if needed */}
        {metrics.ghostCompanies > 0 && (
          <Alert variant="destructive" className="py-2">
            <Ghost className="h-4 w-4" />
            <AlertDescription className="ml-2">
              {metrics.ghostCompanies} empresas fantasma detectadas. Pulsa Forzar para reparar.
            </AlertDescription>
          </Alert>
        )}

        {/* Progress bar */}
        <Progress value={metrics.companyCompletionRate} className="h-2" />

        {/* Incomplete models - only show if any */}
        {modelsIncomplete.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {modelsIncomplete.map(m => `${m.model} ${m.percentage}%`).join(' • ')}
          </div>
        )}

        {/* Actions + timestamp */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            {metrics.systemState !== 'COMPLETE' && (
              <Button size="sm" onClick={handleForce} disabled={forcing}>
                {forcing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
                Forzar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(metrics.lastUpdated, { locale: es, addSuffix: true })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
