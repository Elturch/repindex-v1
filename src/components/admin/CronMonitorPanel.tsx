import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Clock, 
  Play, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  Activity,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
  database: string;
}

interface CronJobRun {
  runid: number;
  jobid: number;
  job_pid: number | null;
  database: string;
  username: string;
  command: string;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
}

// Map cron expressions to human readable
function parseCronSchedule(schedule: string): string {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return schedule;
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  // Common patterns
  if (dayOfMonth === '1' && month === '*') {
    return `Mensual (día 1, ${hour}:${minute.padStart(2, '0')} UTC)`;
  }
  if (dayOfWeek === '0' && dayOfMonth === '*') {
    return `Domingos ${hour}:${minute.padStart(2, '0')} UTC`;
  }
  if (dayOfWeek === '1' && dayOfMonth === '*') {
    return `Lunes ${hour}:${minute.padStart(2, '0')} UTC`;
  }
  if (minute.includes(',')) {
    return `Cada 5 min (${hour}:XX UTC)`;
  }
  
  return schedule;
}

function getJobCategory(jobname: string): { category: string; color: string } {
  if (jobname.includes('vector') || jobname.includes('populate')) {
    return { category: 'Vector Store', color: 'bg-purple-500' };
  }
  if (jobname.includes('news') || jobname.includes('story')) {
    return { category: 'Noticias', color: 'bg-blue-500' };
  }
  if (jobname.includes('sweep') || jobname.includes('batch') || jobname.includes('fase')) {
    return { category: 'Barrido RIX', color: 'bg-orange-500' };
  }
  if (jobname.includes('corporate') || jobname.includes('scrape')) {
    return { category: 'Corporate Scrape', color: 'bg-green-500' };
  }
  return { category: 'Sistema', color: 'bg-gray-500' };
}

export function CronMonitorPanel() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [recentRuns, setRecentRuns] = useState<CronJobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [triggeringJob, setTriggeringJob] = useState<string | null>(null);

  const fetchCronData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch jobs
      const { data: jobsData, error: jobsError } = await supabase.rpc('execute_sql', {
        sql_query: `SELECT jobid, jobname, schedule, command, active, database FROM cron.job ORDER BY jobid`
      });

      if (jobsError) throw jobsError;

      // Fetch recent runs (last 100)
      const { data: runsData, error: runsError } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT runid, jobid, job_pid, database, username, command, status, return_message, start_time, end_time 
          FROM cron.job_run_details 
          ORDER BY start_time DESC 
          LIMIT 100
        `
      });

      if (runsError) throw runsError;

      setJobs(Array.isArray(jobsData) ? jobsData as unknown as CronJob[] : []);
      setRecentRuns(Array.isArray(runsData) ? runsData as unknown as CronJobRun[] : []);
    } catch (err) {
      console.error('Error fetching cron data:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de CRON',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCronData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchCronData, 30000);
    return () => clearInterval(interval);
  }, [fetchCronData]);

  const triggerJob = async (job: CronJob) => {
    setTriggeringJob(job.jobname);
    try {
      // Extract URL from command
      const urlMatch = job.command.match(/url\s*:=\s*'([^']+)'/);
      const bodyMatch = job.command.match(/body\s*:=\s*'([^']+)'/);
      
      if (!urlMatch) {
        throw new Error('No se pudo extraer la URL del comando');
      }

      const url = urlMatch[1];
      const body = bodyMatch ? JSON.parse(bodyMatch[1]) : {};

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU`
        },
        body: JSON.stringify({ ...body, trigger: 'manual' })
      });

      const result = await response.json();

      toast({
        title: 'Job ejecutado',
        description: `${job.jobname}: ${result.success ? 'OK' : result.error || 'Error'}`,
        variant: result.success ? 'default' : 'destructive'
      });

      // Refresh data after a short delay
      setTimeout(fetchCronData, 2000);
    } catch {
      toast({
        title: 'Error',
        description: `No se pudo ejecutar ${job.jobname}`,
        variant: 'destructive'
      });
    } finally {
      setTriggeringJob(null);
    }
  };

  const getJobRuns = (jobid: number) => {
    return recentRuns.filter(r => r.jobid === jobid).slice(0, 10);
  };

  const getJobStatus = (jobid: number): 'success' | 'failed' | 'running' | 'unknown' => {
    const runs = getJobRuns(jobid);
    if (runs.length === 0) return 'unknown';
    
    const lastRun = runs[0];
    if (!lastRun.end_time) return 'running';
    if (lastRun.status === 'succeeded') return 'success';
    return 'failed';
  };

  const getLastRunTime = (jobid: number): string | null => {
    const runs = getJobRuns(jobid);
    if (runs.length === 0) return null;
    return runs[0].start_time;
  };

  // Group jobs by category
  const jobsByCategory = jobs.reduce((acc, job) => {
    const { category } = getJobCategory(job.jobname);
    if (!acc[category]) acc[category] = [];
    acc[category].push(job);
    return acc;
  }, {} as Record<string, CronJob[]>);

  // Stats
  const stats = {
    total: jobs.length,
    active: jobs.filter(j => j.active).length,
    recentSuccess: recentRuns.filter(r => r.status === 'succeeded').length,
    recentFailed: recentRuns.filter(r => r.status === 'failed').length,
    running: recentRuns.filter(r => !r.end_time).length
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
            <p className="text-xs text-muted-foreground">Jobs totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{stats.active}</span>
            </div>
            <p className="text-xs text-muted-foreground">Activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{stats.running}</span>
            </div>
            <p className="text-xs text-muted-foreground">Ejecutando</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{stats.recentSuccess}</span>
            </div>
            <p className="text-xs text-muted-foreground">Éxitos (últimos 100)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-2xl font-bold">{stats.recentFailed}</span>
            </div>
            <p className="text-xs text-muted-foreground">Fallos (últimos 100)</p>
          </CardContent>
        </Card>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchCronData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Jobs by Category */}
      {Object.entries(jobsByCategory).map(([category, categoryJobs]) => {
        const { color } = getJobCategory(categoryJobs[0]?.jobname || '');
        
        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <CardTitle className="text-lg">{category}</CardTitle>
                <Badge variant="outline">{categoryJobs.length} jobs</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categoryJobs.map(job => {
                  const status = getJobStatus(job.jobid);
                  const lastRun = getLastRunTime(job.jobid);
                  const runs = getJobRuns(job.jobid);
                  const isExpanded = expandedJob === job.jobid;

                  return (
                    <div key={job.jobid} className="border rounded-lg">
                      <div 
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedJob(isExpanded ? null : job.jobid)}
                      >
                        <div className="flex items-center gap-3">
                          {status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                          {status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                          {status === 'unknown' && <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                          
                          <div>
                            <p className="font-medium text-sm">{job.jobname}</p>
                            <p className="text-xs text-muted-foreground">
                              {parseCronSchedule(job.schedule)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {lastRun && (
                            <span className="text-xs text-muted-foreground">
                              Último: {formatDistanceToNow(new Date(lastRun), { addSuffix: true, locale: es })}
                            </span>
                          )}
                          
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerJob(job);
                            }}
                            disabled={triggeringJob === job.jobname}
                          >
                            {triggeringJob === job.jobname ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>

                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>

                      {isExpanded && runs.length > 0 && (
                        <div className="border-t p-3 bg-muted/30">
                          <p className="text-xs font-medium mb-2">Últimas ejecuciones:</p>
                          <ScrollArea className="h-40">
                            <div className="space-y-1">
                              {runs.map(run => (
                                <div 
                                  key={run.runid} 
                                  className="flex items-center justify-between text-xs p-2 rounded bg-background"
                                >
                                  <div className="flex items-center gap-2">
                                    {run.status === 'succeeded' ? (
                                      <CheckCircle className="h-3 w-3 text-green-500" />
                                    ) : run.status === 'failed' ? (
                                      <XCircle className="h-3 w-3 text-red-500" />
                                    ) : (
                                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                                    )}
                                    <span>{format(new Date(run.start_time), 'dd/MM HH:mm:ss')}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {run.end_time && (
                                      <span className="text-muted-foreground">
                                        {Math.round((new Date(run.end_time).getTime() - new Date(run.start_time).getTime()) / 1000)}s
                                      </span>
                                    )}
                                    <Badge 
                                      variant={run.status === 'succeeded' ? 'default' : 'destructive'}
                                      className="text-[10px] py-0"
                                    >
                                      {run.status}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          {runs[0]?.return_message && (
                            <div className="mt-2 p-2 bg-muted rounded text-xs">
                              <p className="font-medium">Último mensaje:</p>
                              <p className="text-muted-foreground truncate">{runs[0].return_message}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Recent Failures Alert */}
      {stats.recentFailed > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Ejecuciones fallidas recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {recentRuns
                  .filter(r => r.status === 'failed')
                  .slice(0, 5)
                  .map(run => {
                    const job = jobs.find(j => j.jobid === run.jobid);
                    return (
                      <div key={run.runid} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                        <div>
                          <p className="font-medium">{job?.jobname || `Job ${run.jobid}`}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(run.start_time), 'dd/MM/yyyy HH:mm')}
                          </p>
                        </div>
                        <p className="text-xs text-red-600 max-w-xs truncate">
                          {run.return_message || 'Error desconocido'}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
