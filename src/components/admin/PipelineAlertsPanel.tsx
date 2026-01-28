import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Bell,
  Zap,
  Activity,
  Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface HealthCheck {
  id: string;
  check_type: string;
  sweep_id: string | null;
  status: 'healthy' | 'warning' | 'critical';
  details: Record<string, unknown>;
  resolved_at: string | null;
  checked_at: string;
}

const STATUS_CONFIG = {
  healthy: { color: 'bg-emerald-500', icon: CheckCircle2, label: 'Saludable' },
  warning: { color: 'bg-amber-500', icon: AlertTriangle, label: 'Advertencia' },
  critical: { color: 'bg-red-500', icon: AlertCircle, label: 'Crítico' },
};

const CHECK_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  sweep_stuck: { label: 'Empresas Atascadas', icon: <Clock className="h-4 w-4" /> },
  model_errors: { label: 'Errores de Modelo', icon: <Zap className="h-4 w-4" /> },
  analysis_backlog: { label: 'Análisis Pendientes', icon: <Activity className="h-4 w-4" /> },
  zombie_reset: { label: 'Reset de Zombis', icon: <RefreshCw className="h-4 w-4" /> },
};

export function PipelineAlertsPanel() {
  const [alerts, setAlerts] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      // Obtener alertas activas (no resueltas) y recientes
      const { data, error } = await supabase
        .from('pipeline_health_checks')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAlerts((data as HealthCheck[]) || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  // Separar alertas activas de históricas
  const activeAlerts = alerts.filter(a => !a.resolved_at && (a.status === 'warning' || a.status === 'critical'));
  const recentAlerts = alerts.slice(0, 20);

  // Calcular estado general del sistema
  const criticalCount = activeAlerts.filter(a => a.status === 'critical').length;
  const warningCount = activeAlerts.filter(a => a.status === 'warning').length;
  const systemStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';
  const SystemIcon = STATUS_CONFIG[systemStatus].icon;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Panel de Estado General */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-full",
                systemStatus === 'healthy' ? 'bg-emerald-100 text-emerald-600' :
                systemStatus === 'warning' ? 'bg-amber-100 text-amber-600' :
                'bg-red-100 text-red-600'
              )}>
                <SystemIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Alertas del Sistema
                </CardTitle>
                <CardDescription>
                  Monitoreo automático del pipeline de reputación
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
              <div className="text-sm text-muted-foreground">Críticas</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-amber-600">{warningCount}</div>
              <div className="text-sm text-muted-foreground">Advertencias</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-emerald-600">{alerts.length > 0 ? '✓' : '—'}</div>
              <div className="text-sm text-muted-foreground">Checks Recientes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alertas Activas */}
      {activeAlerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Alertas Activas ({activeAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeAlerts.map(alert => {
                const config = CHECK_TYPE_LABELS[alert.check_type] || { label: alert.check_type, icon: <AlertCircle className="h-4 w-4" /> };
                const statusConfig = STATUS_CONFIG[alert.status];
                
                return (
                  <div 
                    key={alert.id} 
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      alert.status === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-1.5 rounded-full", alert.status === 'critical' ? 'bg-red-100' : 'bg-amber-100')}>
                        {config.icon}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{config.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {Object.entries(alert.details || {}).map(([key, value]) => (
                            <span key={key} className="mr-2">{key}: {String(value)}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.status === 'critical' ? 'destructive' : 'secondary'}>
                        {statusConfig.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(alert.checked_at), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial de Checks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historial de Health Checks</CardTitle>
          <CardDescription>Últimos {recentAlerts.length} registros</CardDescription>
        </CardHeader>
        <CardContent>
          {recentAlerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hay registros de health checks aún.</p>
              <p className="text-sm">Los checks se ejecutan automáticamente cada 5 minutos.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Detalles</TableHead>
                  <TableHead>Sweep</TableHead>
                  <TableHead className="text-right">Hace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAlerts.map(alert => {
                  const config = CHECK_TYPE_LABELS[alert.check_type] || { label: alert.check_type, icon: null };
                  const statusConfig = STATUS_CONFIG[alert.status];
                  
                  return (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {config.icon}
                          <span>{config.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={alert.status === 'critical' ? 'destructive' : alert.status === 'warning' ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {JSON.stringify(alert.details)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {alert.sweep_id || '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(alert.checked_at), { addSuffix: true, locale: es })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
