import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Globe, 
  Pause,
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  Loader2,
  Building2,
  Calendar,
  Link as LinkIcon,
  Search,
  RotateCcw,
  Zap,
  Newspaper
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';

type ScrapeMode = 'full' | 'news_only';

const SUPABASE_URL = 'https://jzkjykmrwisijiqlwuua.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU';

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

interface CascadeState {
  isRunning: boolean;
  isPaused: boolean;
  processed: number;
  remaining: number;
  currentTicker: string | null;
  startTime: number | null;
}

export function CorporateScrapePanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [resettingFailed, setResettingFailed] = useState(false);
  const [sweepId, setSweepId] = useState<string>('');
  const [customSweepId, setCustomSweepId] = useState('');
  const [status, setStatus] = useState<SweepStatus | null>(null);
  const [progress, setProgress] = useState<ScrapeProgress[]>([]);
  const [websiteCount, setWebsiteCount] = useState(0);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [newsCount, setNewsCount] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [scrapeMode, setScrapeMode] = useState<ScrapeMode>('full');
  
  // Cascade state
  const [cascade, setCascade] = useState<CascadeState>({
    isRunning: false,
    isPaused: false,
    processed: 0,
    remaining: 0,
    currentTicker: null,
    startTime: null,
  });
  const cascadeAbortRef = useRef(false);

  const getCurrentSweepId = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `corp-${year}-${month}`;
  };

  const invokeOrchestrator = async (payload: Record<string, unknown>) => {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/corporate-scrape-orchestrator`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`
        },
        body: JSON.stringify(payload)
      }
    );
    return response.json();
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const targetSweepId = customSweepId || getCurrentSweepId();
      setSweepId(targetSweepId);

      // Fetch sweep status from edge function
      const data = await invokeOrchestrator({ mode: 'get_status', sweep_id: targetSweepId });
      if (data.success) {
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

      // Fetch news count for current week
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      
      const { count: newsCountResult } = await supabase
        .from('corporate_news')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfWeek.toISOString());

      setNewsCount(newsCountResult || 0);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [customSweepId]);

  // Only auto-refresh when cascade is running - NO AUTOMATIC POLLING otherwise
  useEffect(() => {
    fetchData();
  }, []);  // Only on mount

  useEffect(() => {
    // Only poll during active cascade
    if (!cascade.isRunning) return;
    
    const interval = setInterval(fetchData, 15000); // 15s during cascade
    return () => clearInterval(interval);
  }, [cascade.isRunning, fetchData]);

  // ============================================================================
  // CASCADE LOGIC - Client-side loop for foolproof processing
  // ============================================================================
  
  const handleLaunchCascade = async () => {
    cascadeAbortRef.current = false;
    const startTime = Date.now();
    
    setCascade({
      isRunning: true,
      isPaused: false,
      processed: 0,
      remaining: status?.pending || 0,
      currentTicker: null,
      startTime,
    });

    const modeLabel = scrapeMode === 'full' ? 'Completa' : 'Solo Noticias';
    toast({
      title: `Cascada ${modeLabel} iniciada`,
      description: scrapeMode === 'news_only' 
        ? 'Extrayendo solo noticias (más rápido)...' 
        : 'Procesando empresas una a una...',
    });

    let processedCount = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    
    // Choose mode based on toggle
    const orchestratorMode = scrapeMode === 'news_only' ? 'scrape_news_only' : 'process_single';

    while (!cascadeAbortRef.current) {
      try {
        const result = await invokeOrchestrator({ mode: orchestratorMode, sweep_id: sweepId });
        
        if (!result.processed) {
          // No more pending companies
          break;
        }

        processedCount++;
        consecutiveErrors = 0; // Reset on success

        setCascade(prev => ({
          ...prev,
          processed: processedCount,
          remaining: result.remaining,
          currentTicker: result.ticker,
        }));

        // Small pause between companies (1 second)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error('Cascade error:', error);
        consecutiveErrors++;
        
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          toast({
            title: 'Cascada detenida',
            description: `Demasiados errores consecutivos (${consecutiveErrors})`,
            variant: 'destructive',
          });
          break;
        }
        
        // Wait longer on error
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    setCascade(prev => ({
      ...prev,
      isRunning: false,
      currentTicker: null,
    }));

    toast({
      title: cascadeAbortRef.current ? 'Cascada pausada' : 'Cascada completada',
      description: `Procesadas ${processedCount} empresas en ${minutes}m ${seconds}s`,
    });

    // Refresh data
    fetchData();
  };

  const handlePauseCascade = () => {
    cascadeAbortRef.current = true;
    setCascade(prev => ({ ...prev, isPaused: true }));
  };

  const resetFailed = async () => {
    setResettingFailed(true);
    try {
      const result = await invokeOrchestrator({ mode: 'reset_failed', sweep_id: sweepId });

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

  // Calculate ETA for cascade
  const getEstimatedTime = () => {
    if (!cascade.isRunning || !cascade.startTime || cascade.processed === 0) return null;
    const elapsed = (Date.now() - cascade.startTime) / 1000;
    const avgTimePerCompany = elapsed / cascade.processed;
    const remainingSeconds = Math.round(avgTimePerCompany * cascade.remaining);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `~${minutes}m ${seconds}s restantes`;
  };

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
            Extracción automática de datos corporativos (1 empresa por invocación)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          
          {/* Scrape Mode Selector */}
          <Select value={scrapeMode} onValueChange={(v) => setScrapeMode(v as ScrapeMode)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Modo de scraping" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span>Completo (mensual)</span>
                </div>
              </SelectItem>
              <SelectItem value="news_only">
                <div className="flex items-center gap-2">
                  <Newspaper className="h-4 w-4" />
                  <span>Solo Noticias (semanal)</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          
          {cascade.isRunning ? (
            <Button 
              size="sm" 
              onClick={handlePauseCascade}
              variant="destructive"
            >
              <Pause className="h-4 w-4 mr-2" />
              Pausar Cascada
            </Button>
          ) : (
            <Button 
              size="sm" 
              onClick={handleLaunchCascade}
              disabled={!status || status.pending === 0}
              className={scrapeMode === 'news_only' 
                ? "bg-gradient-to-r from-blue-500 to-blue-600" 
                : "bg-gradient-to-r from-primary to-primary/80"}
            >
              {scrapeMode === 'news_only' ? (
                <Newspaper className="h-4 w-4 mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {scrapeMode === 'news_only' ? 'Actualizar Noticias' : 'Cascada Completa'} ({status?.pending || 0})
            </Button>
          )}
        </div>
      </div>

      {/* Cascade Progress Card */}
      {cascade.isRunning && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-medium">Cascada en progreso</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {getEstimatedTime()}
              </span>
            </div>
            
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <Progress 
                  value={cascade.processed / (cascade.processed + cascade.remaining) * 100} 
                  className="h-3" 
                />
              </div>
              <span className="text-sm font-medium">
                {cascade.processed}/{cascade.processed + cascade.remaining}
              </span>
            </div>
            
            {cascade.currentTicker && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Procesando:</span>
                <Badge variant="outline" className="font-mono">{cascade.currentTicker}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-blue-600" />
              <span className="text-2xl font-bold">{newsCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Noticias esta semana</p>
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
              <p className="text-sm mt-2">Pulsa "Iniciar Cascada" para comenzar</p>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {filteredProgress.map((item) => (
                  <div 
                    key={item.id} 
                    className={`flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 ${
                      cascade.currentTicker === item.ticker ? 'border-primary bg-primary/5' : ''
                    }`}
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
                          {cascade.currentTicker === item.ticker && (
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          )}
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
  const [snapshots, setSnapshots] = useState<{
    ticker: string;
    company_description: string | null;
    ceo_name: string | null;
    president_name: string | null;
    headquarters_city: string | null;
    employees_approx: number | null;
    snapshot_date_only: string | null;
    scrape_status: string | null;
  }[]>([]);
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
            Aún no hay snapshots. Inicia la cascada para generar datos.
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
