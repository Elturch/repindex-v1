import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RefreshCw, ChevronDown, ChevronRight, Sparkles, Zap, DollarSign, Hash, Activity, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProcessConfig {
  id: string;
  name: string;
  icon: string;
  edgeFunction: string;
  actionTypes: string[];
  models: {
    provider: string;
    model: string;
    displayName: string;
    role: 'primary' | 'fallback' | 'parallel';
  }[];
}

const PROCESS_MAP: ProcessConfig[] = [
  {
    id: 'search',
    name: 'Búsqueda Semanal',
    icon: '🔍',
    edgeFunction: 'rix-search-v2',
    actionTypes: ['rix_search'],
    models: [
      { provider: 'perplexity', model: 'sonar-pro', displayName: 'Perplexity Sonar Pro', role: 'parallel' },
      { provider: 'xai', model: 'grok-3', displayName: 'Grok 3', role: 'parallel' },
      { provider: 'deepseek', model: 'deepseek-chat', displayName: 'DeepSeek Chat', role: 'parallel' },
      { provider: 'openai', model: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', role: 'parallel' },
      { provider: 'gemini', model: 'gemini-2.5-pro-preview-05-06', displayName: 'Gemini 2.5 Pro', role: 'parallel' },
      { provider: 'alibaba', model: 'qwen-max', displayName: 'Qwen Max', role: 'parallel' },
    ]
  },
  {
    id: 'analysis',
    name: 'Análisis RIX',
    icon: '🧠',
    edgeFunction: 'rix-analyze-v2',
    actionTypes: ['rix_analysis'],
    models: [
      { provider: 'openai', model: 'gpt-5', displayName: 'GPT-5', role: 'primary' },
    ]
  },
  {
    id: 'chat',
    name: 'Agente Rix',
    icon: '💬',
    edgeFunction: 'chat-intelligence',
    actionTypes: ['chat', 'enrich', 'bulletin'],
    models: [
      { provider: 'openai', model: 'o3', displayName: 'o3', role: 'primary' },
      { provider: 'gemini', model: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', role: 'fallback' },
    ]
  },
  {
    id: 'momentum',
    name: 'Momentum Tips',
    icon: '📊',
    edgeFunction: 'fetch-momentum-tips',
    actionTypes: ['momentum_analysis'],
    models: [
      { provider: 'perplexity', model: 'sonar-pro', displayName: 'Perplexity Sonar Pro', role: 'primary' },
    ]
  },
  {
    id: 'news',
    name: 'Generación Noticias',
    icon: '📰',
    edgeFunction: 'generate-news-story',
    actionTypes: ['news_generation'],
    models: [
      { provider: 'gemini', model: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro Preview', role: 'primary' },
    ]
  },
  {
    id: 'scrape',
    name: 'Scraping Corporativo',
    icon: '🌐',
    edgeFunction: 'firecrawl-corporate-scrape',
    actionTypes: ['corporate_extraction'],
    models: [
      { provider: 'openai', model: 'gpt-4o-mini', displayName: 'GPT-4o-mini', role: 'primary' },
    ]
  },
  {
    id: 'consolidation',
    name: 'Consolidación IA',
    icon: '🔄',
    edgeFunction: 'ai-consolidation-analysis',
    actionTypes: ['consolidation'],
    models: [
      { provider: 'openai', model: 'gpt-4o', displayName: 'GPT-4o', role: 'primary' },
    ]
  },
  {
    id: 'vectorstore',
    name: 'Vector Store',
    icon: '🗄️',
    edgeFunction: 'populate-vector-store',
    actionTypes: ['embedding'],
    models: [
      { provider: 'openai', model: 'text-embedding-3-small', displayName: 'Embedding 3 Small', role: 'primary' },
    ]
  },
  {
    id: 'ingest',
    name: 'Ingesta Emisores',
    icon: '📥',
    edgeFunction: 'ingest-new-issuer',
    actionTypes: ['issuer_ingest'],
    models: [
      { provider: 'gemini', model: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', role: 'primary' },
    ]
  },
];

interface UsageLog {
  id: string;
  created_at: string;
  edge_function: string;
  action_type: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  ticker: string | null;
}

interface ProcessStats {
  processId: string;
  totalCalls: number;
  totalCost: number;
  totalTokens: number;
  modelStats: {
    provider: string;
    model: string;
    displayName: string;
    role: 'primary' | 'fallback' | 'parallel';
    calls: number;
    cost: number;
    tokens: number;
  }[];
}

const PROCESS_COLORS: Record<string, string> = {
  search: 'bg-blue-500',
  analysis: 'bg-purple-500',
  chat: 'bg-green-500',
  momentum: 'bg-orange-500',
  news: 'bg-pink-500',
  scrape: 'bg-cyan-500',
  consolidation: 'bg-yellow-500',
  vectorstore: 'bg-indigo-500',
  ingest: 'bg-red-500',
};

export const AIModelsDashboard: React.FC = () => {
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set(['search', 'analysis', 'chat']));
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/admin-api-data/usage-logs?period=${period}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.session?.access_token || ''}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        setUsageLogs(result.data || []);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching usage logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, period]);

  const processStats = useMemo<ProcessStats[]>(() => {
    return PROCESS_MAP.map(process => {
      const processLogs = usageLogs.filter(
        log => log.edge_function === process.edgeFunction || 
               process.actionTypes.includes(log.action_type)
      );

      const modelStats = process.models.map(modelConfig => {
        const modelLogs = processLogs.filter(
          log => log.provider.toLowerCase().includes(modelConfig.provider.toLowerCase()) ||
                 log.model.toLowerCase().includes(modelConfig.model.toLowerCase().split('-')[0])
        );

        return {
          ...modelConfig,
          calls: modelLogs.length,
          cost: modelLogs.reduce((sum, log) => sum + Number(log.estimated_cost_usd || 0), 0),
          tokens: modelLogs.reduce((sum, log) => sum + (log.input_tokens || 0) + (log.output_tokens || 0), 0),
        };
      });

      return {
        processId: process.id,
        totalCalls: processLogs.length,
        totalCost: processLogs.reduce((sum, log) => sum + Number(log.estimated_cost_usd || 0), 0),
        totalTokens: processLogs.reduce((sum, log) => sum + (log.input_tokens || 0) + (log.output_tokens || 0), 0),
        modelStats,
      };
    });
  }, [usageLogs]);

  const summaryStats = useMemo(() => {
    const activeModels = new Set<string>();
    usageLogs.forEach(log => activeModels.add(`${log.provider}:${log.model}`));

    return {
      activeAIs: activeModels.size,
      totalCalls: usageLogs.length,
      totalCost: usageLogs.reduce((sum, log) => sum + Number(log.estimated_cost_usd || 0), 0),
      totalTokens: usageLogs.reduce((sum, log) => sum + (log.input_tokens || 0) + (log.output_tokens || 0), 0),
    };
  }, [usageLogs]);

  const totalCostAllProcesses = useMemo(() => {
    return processStats.reduce((sum, ps) => sum + ps.totalCost, 0);
  }, [processStats]);

  const recentActivity = useMemo(() => {
    return [...usageLogs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);
  }, [usageLogs]);

  const toggleProcess = (processId: string) => {
    setExpandedProcesses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(processId)) {
        newSet.delete(processId);
      } else {
        newSet.add(processId);
      }
      return newSet;
    });
  };

  const formatCost = (cost: number) => {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return tokens.toString();
  };

  const getRoleBadgeVariant = (role: 'primary' | 'fallback' | 'parallel') => {
    switch (role) {
      case 'primary': return 'default';
      case 'fallback': return 'secondary';
      case 'parallel': return 'outline';
    }
  };

  const getMaxModelCost = () => {
    let max = 0;
    processStats.forEach(ps => {
      ps.modelStats.forEach(ms => {
        if (ms.cost > max) max = ms.cost;
      });
    });
    return max || 1;
  };

  const maxModelCost = getMaxModelCost();

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="jan-2026">Enero 2026</SelectItem>
              <SelectItem value="90d">Últimos 90 días</SelectItem>
              <SelectItem value="all">Todo el histórico</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>

          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-sm text-muted-foreground">
              Auto-refresh (15s)
            </Label>
          </div>
        </div>

        <div className="text-sm text-muted-foreground flex items-center gap-1">
          <Clock className="h-4 w-4" />
          Última actualización: {lastUpdate.toLocaleTimeString('es-ES')}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">IAs Activas</p>
                <p className="text-3xl font-bold">{summaryStats.activeAIs}</p>
              </div>
              <Sparkles className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Llamadas</p>
                <p className="text-3xl font-bold">{summaryStats.totalCalls.toLocaleString()}</p>
              </div>
              <Zap className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Coste Total</p>
                <p className="text-3xl font-bold">{formatCost(summaryStats.totalCost)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tokens</p>
                <p className="text-3xl font-bold">{formatTokens(summaryStats.totalTokens)}</p>
              </div>
              <Hash className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Process Map */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Mapa de Procesos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {PROCESS_MAP.map((process, idx) => {
            const stats = processStats[idx];
            const isExpanded = expandedProcesses.has(process.id);

            return (
              <Collapsible
                key={process.id}
                open={isExpanded}
                onOpenChange={() => toggleProcess(process.id)}
              >
                <div className="border rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-xl">{process.icon}</span>
                        <div>
                          <span className="font-medium">{process.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({process.edgeFunction})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          {stats.totalCalls} calls
                        </span>
                        <span className="font-medium text-green-600">
                          {formatCost(stats.totalCost)}
                        </span>
                        <span className="text-muted-foreground">
                          {formatTokens(stats.totalTokens)} tokens
                        </span>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="p-3 space-y-2 border-t">
                      {stats.modelStats.map((model, mIdx) => (
                        <div key={mIdx} className="flex items-center gap-3">
                          <Badge variant={getRoleBadgeVariant(model.role)} className="w-20 justify-center text-xs">
                            {model.role}
                          </Badge>
                          <span className="w-48 truncate text-sm">{model.displayName}</span>
                          <span className="w-20 text-right text-sm text-muted-foreground">
                            {model.calls} calls
                          </span>
                          <div className="flex-1 max-w-xs">
                            <Progress 
                              value={(model.cost / maxModelCost) * 100} 
                              className="h-2"
                            />
                          </div>
                          <span className="w-20 text-right text-sm font-medium text-green-600">
                            {formatCost(model.cost)}
                          </span>
                          <span className="w-20 text-right text-sm text-muted-foreground">
                            {formatTokens(model.tokens)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Cost Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Distribución de Costes por Proceso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-8 rounded-lg overflow-hidden">
            {processStats
              .filter(ps => ps.totalCost > 0)
              .sort((a, b) => b.totalCost - a.totalCost)
              .map((ps, idx) => {
                const process = PROCESS_MAP.find(p => p.id === ps.processId)!;
                const percentage = totalCostAllProcesses > 0 
                  ? (ps.totalCost / totalCostAllProcesses) * 100 
                  : 0;

                return (
                  <div
                    key={ps.processId}
                    className={`${PROCESS_COLORS[ps.processId]} flex items-center justify-center text-white text-xs font-medium transition-all hover:opacity-80`}
                    style={{ width: `${percentage}%` }}
                    title={`${process.name}: ${formatCost(ps.totalCost)} (${percentage.toFixed(1)}%)`}
                  >
                    {percentage > 8 && `${process.icon} ${percentage.toFixed(0)}%`}
                  </div>
                );
              })}
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            {processStats
              .filter(ps => ps.totalCost > 0)
              .sort((a, b) => b.totalCost - a.totalCost)
              .map(ps => {
                const process = PROCESS_MAP.find(p => p.id === ps.processId)!;
                const percentage = totalCostAllProcesses > 0 
                  ? (ps.totalCost / totalCostAllProcesses) * 100 
                  : 0;

                return (
                  <div key={ps.processId} className="flex items-center gap-2 text-sm">
                    <div className={`w-3 h-3 rounded ${PROCESS_COLORS[ps.processId]}`} />
                    <span>{process.icon}</span>
                    <span className="text-muted-foreground">{process.name}</span>
                    <span className="font-medium">{percentage.toFixed(1)}%</span>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Real-time Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Actividad en Tiempo Real
            {autoRefresh && (
              <Badge variant="outline" className="ml-2 animate-pulse">
                LIVE
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Hora</TableHead>
                  <TableHead>Edge Function</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Coste</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hay actividad en el período seleccionado
                    </TableCell>
                  </TableRow>
                ) : (
                  recentActivity.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {new Date(log.created_at).toLocaleTimeString('es-ES', { 
                          hour: '2-digit', 
                          minute: '2-digit', 
                          second: '2-digit' 
                        })}
                      </TableCell>
                      <TableCell className="text-sm">{log.edge_function}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {log.provider}
                          </Badge>
                          <span className="text-sm truncate max-w-32">{log.model}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.ticker ? (
                          <Badge variant="secondary" className="text-xs">
                            {log.ticker}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatTokens((log.input_tokens || 0) + (log.output_tokens || 0))}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-600">
                        {formatCost(Number(log.estimated_cost_usd || 0))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
