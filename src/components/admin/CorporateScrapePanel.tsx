import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Globe, 
  Play, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  Loader2,
  Building2,
  Calendar,
  Link as LinkIcon,
  Search,
  RotateCcw
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ScrapeProgress {
  id: string;
  sweep_id: string;
  ticker: string;
  issuer_name: string | null;
  website: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
}

interface SweepStatus {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
}

export function CorporateScrapePanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [resettingFailed, setResettingFailed] = useState(false);
  const [sweepId, setSweepId] = useState<string>('');
  const [customSweepId, setCustomSweepId] = useState('');
  const [status, setStatus] = useState<SweepStatus | null>(null);
  const [progress, setProgress] = useState<ScrapeProgress[]>([]);
  const [websiteCount, setWebsiteCount] = useState(0);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const getCurrentSweepId = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `corp-${year}-${month}`;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const targetSweepId = customSweepId || getCurrentSweepId();
      setSweepId(targetSweepId);

      // Fetch sweep status from edge function
      const response = await fetch(
        `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/corporate-scrape-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU`
          },
          body: JSON.stringify({ mode: 'get_status', sweep_id: targetSweepId })
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);
      }

      // Fetch progress entries
      const { data: progressData } = await supabase
        .from('corporate_scrape_progress')
        .select('*')
        .eq('sweep_id', targetSweepId)
        .order('updated_at', { ascending: false });

      setProgress(progressData || []);

      // Fetch website count
      const { count: websiteCountResult } = await supabase
        .from('repindex_root_issuers')
        .select('*', { count: 'exact', head: true })
        .not('website', 'is', null);

      setWebsiteCount(websiteCountResult || 0);

      // Fetch snapshot count for current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count: snapshotCountResult } = await supabase
        .from('corporate_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('scrape_status', 'success')
        .gte('snapshot_date', startOfMonth.toISOString());

      setSnapshotCount(snapshotCountResult || 0);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [customSweepId]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const startFullSweep = async () => {
    setExecuting(true);
    try {
      const response = await fetch(
        `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/corporate-scrape-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU`
          },
          body: JSON.stringify({ mode: 'start_full_sweep' })
        }
      );

      const result = await response.json();

      toast({
        title: result.success ? 'Sweep iniciado' : 'Error',
        description: result.message || 'El proceso se ejecutará en segundo plano',
        variant: result.success ? 'default' : 'destructive'
      });

      setTimeout(fetchData, 2000);
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo iniciar el sweep',
        variant: 'destructive'
      });
    } finally {
      setExecuting(false);
    }
  };

  const resetFailed = async () => {
    setResettingFailed(true);
    try {
      const response = await fetch(
        `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/corporate-scrape-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU`
          },
          body: JSON.stringify({ mode: 'reset_failed', sweep_id: sweepId })
        }
      );

      const result = await response.json();

      toast({
        title: 'Reset completado',
        description: `${result.reset_count || 0} empresas marcadas para reintentar`,
      });

      setTimeout(fetchData, 1000);
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo resetear los fallidos',
        variant: 'destructive'
      });
    } finally {
      setResettingFailed(false);
    }
  };

  const getStatusBadge = (statusValue: string) => {
    switch (statusValue) {
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completado</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Fallido</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Procesando</Badge>;
      case 'pending':
        return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Pendiente</Badge>;
      case 'skipped':
        return <Badge variant="secondary">Omitido</Badge>;
      default:
        return <Badge variant="outline">{statusValue}</Badge>;
    }
  };

  const filteredProgress = filterStatus === 'all' 
    ? progress 
    : progress.filter(p => p.status === filterStatus);

  const progressPercent = status && status.total > 0 
    ? Math.round(((status.completed + status.failed + status.skipped) / status.total) * 100)
    : 0;

  if (loading && progress.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Corporate Web Scraping
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Extracción automática de datos corporativos desde webs oficiales
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button 
            size="sm" 
            onClick={startFullSweep} 
            disabled={executing}
            className="bg-gradient-to-r from-primary to-primary/80"
          >
            {executing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Iniciar Scraping Completo
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{websiteCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">URLs descubiertas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{snapshotCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Snapshots este mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{status?.completed || 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">Completados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{status?.pending || 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-2xl font-bold">{status?.failed || 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">Fallidos</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      {status && status.total > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Progreso del Sweep: {sweepId}</span>
              <span className="text-sm text-muted-foreground">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{status.completed + status.failed + status.skipped} de {status.total} procesados</span>
              {status.processing > 0 && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {status.processing} en proceso
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters and Reset */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sweep ID (ej: corp-2026-01)"
            value={customSweepId}
            onChange={(e) => setCustomSweepId(e.target.value)}
            className="w-48"
          />
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant={filterStatus === 'all' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilterStatus('all')}
          >
            Todos
          </Button>
          <Button 
            variant={filterStatus === 'completed' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilterStatus('completed')}
          >
            Completados
          </Button>
          <Button 
            variant={filterStatus === 'failed' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilterStatus('failed')}
          >
            Fallidos
          </Button>
          <Button 
            variant={filterStatus === 'pending' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilterStatus('pending')}
          >
            Pendientes
          </Button>
        </div>

        {status && status.failed > 0 && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetFailed}
            disabled={resettingFailed}
            className="ml-auto"
          >
            {resettingFailed ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Reintentar Fallidos ({status.failed})
          </Button>
        )}
      </div>

      {/* Progress List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Detalle del Sweep: {sweepId}
          </CardTitle>
          <CardDescription>
            {filteredProgress.length} empresas {filterStatus !== 'all' ? `con estado "${filterStatus}"` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredProgress.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No hay registros para este sweep</p>
              <p className="text-sm mt-2">Pulsa "Iniciar Scraping Completo" para comenzar</p>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {filteredProgress.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {item.issuer_name || item.ticker}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {item.ticker}
                          </Badge>
                        </div>
                        {item.website && (
                          <a 
                            href={item.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline truncate block"
                          >
                            {item.website}
                          </a>
                        )}
                        {item.error_message && (
                          <p className="text-xs text-red-500 truncate mt-1">
                            {item.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 ml-4">
                      {item.completed_at && (
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.completed_at), { addSuffix: true, locale: es })}
                        </span>
                      )}
                      {getStatusBadge(item.status)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Recent Snapshots Preview */}
      <RecentSnapshotsPreview />
    </div>
  );
}

function RecentSnapshotsPreview() {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnapshots = async () => {
      const { data } = await supabase
        .from('corporate_snapshots')
        .select('ticker, company_description, ceo_name, president_name, headquarters_city, employees_approx, snapshot_date_only, scrape_status')
        .eq('scrape_status', 'success')
        .order('snapshot_date', { ascending: false })
        .limit(10);
      
      setSnapshots(data || []);
      setLoading(false);
    };

    fetchSnapshots();
  }, []);

  if (loading) return null;

  if (snapshots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Últimos Snapshots Corporativos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Aún no hay snapshots. Inicia el scraping para generar datos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="h-5 w-5 text-green-500" />
          Últimos Snapshots Corporativos
        </CardTitle>
        <CardDescription>
          Vista previa de los datos extraídos más recientes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {snapshots.map((snapshot, idx) => (
            <div key={idx} className="p-3 border rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium">{snapshot.ticker}</span>
                  {snapshot.snapshot_date_only && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {format(new Date(snapshot.snapshot_date_only), 'dd/MM/yyyy')}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 text-sm grid grid-cols-2 md:grid-cols-4 gap-2">
                {snapshot.ceo_name && (
                  <div>
                    <span className="text-muted-foreground">CEO:</span> {snapshot.ceo_name}
                  </div>
                )}
                {snapshot.president_name && (
                  <div>
                    <span className="text-muted-foreground">Presidente:</span> {snapshot.president_name}
                  </div>
                )}
                {snapshot.headquarters_city && (
                  <div>
                    <span className="text-muted-foreground">Sede:</span> {snapshot.headquarters_city}
                  </div>
                )}
                {snapshot.employees_approx && (
                  <div>
                    <span className="text-muted-foreground">Empleados:</span> {snapshot.employees_approx.toLocaleString()}
                  </div>
                )}
              </div>
              {snapshot.company_description && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {snapshot.company_description}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
