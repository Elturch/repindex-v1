import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, DollarSign, Zap, TrendingUp, RefreshCw, Save, Users, AlertTriangle, Clock, Target, Server } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

interface ApiUsageLog {
  id: string;
  created_at: string;
  edge_function: string;
  provider: string;
  model: string;
  action_type: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  user_id: string | null;
  session_id: string | null;
  metadata: any;
}

interface ApiCostConfig {
  id: string;
  provider: string;
  model: string;
  input_cost_per_million: number;
  output_cost_per_million: number;
  updated_at: string;
}

interface UserStats {
  user_id: string | null;
  email: string;
  full_name: string | null;
  total_cost: number;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  actions: Record<string, number>;
  avg_cost_per_call: number;
  first_call: string;
  last_call: string;
}

interface UserStatsSummary {
  total_authenticated_users: number;
  anonymous_sessions: number;
  total_cost: number;
  avg_cost_per_user: number;
  top_user: { email: string; cost: number } | null;
}

interface ActionMetric {
  action_type: string;
  total_calls: number;
  total_cost: number;
  avg_cost: number;
  median_cost: number;
  p95_cost: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

interface PeakUsage {
  hour: string;
  cost: number;
  calls: number;
  tokens: number;
}

interface DailyStats {
  date: string;
  label: string;
  openai: number;
  gemini: number;
  total: number;
  calls: number;
}

type TimePeriod = 'today' | '7d' | '30d' | '90d' | 'all';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// Legacy/blocked models that are no longer actively used
const LEGACY_MODELS = [
  { provider: 'anthropic', model: 'claude-opus-4-20250514' },
  { provider: 'anthropic', model: 'claude-sonnet' },
  { provider: 'anthropic', model: 'claude' },
];

// Helper to check if a model is legacy
const isLegacyModel = (provider: string, model: string): boolean => {
  return LEGACY_MODELS.some(
    legacy => legacy.provider === provider.toLowerCase() || 
              model.toLowerCase().includes('claude')
  );
};

export const ApiCostDashboard: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [usageLogs, setUsageLogs] = useState<ApiUsageLog[]>([]);
  const [costConfig, setCostConfig] = useState<ApiCostConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<Record<string, { input: string; output: string }>>({});
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [userSummary, setUserSummary] = useState<UserStatsSummary | null>(null);
  const [actionMetrics, setActionMetrics] = useState<ActionMetric[]>([]);
  const [peakUsage, setPeakUsage] = useState<PeakUsage | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch data
  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const periodMap: Record<TimePeriod, string> = {
        'today': '24h',
        '7d': '7d',
        '30d': '30d',
        '90d': '90d',
        'all': '90d'
      };

      const baseUrl = `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/admin-api-data`;
      
      const [logsRes, configRes, userStatsRes, actionMetricsRes] = await Promise.all([
        fetch(`${baseUrl}/usage-logs?period=${periodMap[period]}`, {
          headers: { 'Content-Type': 'application/json' }
        }),
        fetch(`${baseUrl}/cost-config`, {
          headers: { 'Content-Type': 'application/json' }
        }),
        fetch(`${baseUrl}/user-stats?period=${periodMap[period]}`, {
          headers: { 'Content-Type': 'application/json' }
        }),
        fetch(`${baseUrl}/action-metrics?period=${periodMap[period]}`, {
          headers: { 'Content-Type': 'application/json' }
        })
      ]);

      if (!logsRes.ok) {
        const err = await logsRes.json();
        throw new Error(err.error || 'Error fetching logs');
      }
      if (!configRes.ok) {
        const err = await configRes.json();
        throw new Error(err.error || 'Error fetching config');
      }

      const logsData = await logsRes.json();
      const configData = await configRes.json();
      const userStatsData = userStatsRes.ok ? await userStatsRes.json() : { data: { users: [], summary: null } };
      const actionMetricsData = actionMetricsRes.ok ? await actionMetricsRes.json() : { data: { actions: [], peak_usage: null } };

      setUsageLogs(logsData.data || []);
      setCostConfig(configData.data || []);
      setUserStats(userStatsData.data?.users || []);
      setUserSummary(userStatsData.data?.summary || null);
      setActionMetrics(actionMetricsData.data?.actions || []);
      setPeakUsage(actionMetricsData.data?.peak_usage || null);

      // Initialize editing state
      const editState: Record<string, { input: string; output: string }> = {};
      (configData.data || []).forEach((c: ApiCostConfig) => {
        editState[c.id] = {
          input: c.input_cost_per_million.toString(),
          output: c.output_cost_per_million.toString(),
        };
      });
      setEditingConfig(editState);

    } catch (error: any) {
      console.error('Error fetching API cost data:', error);
      toast({ title: 'Error', description: error.message || 'No se pudieron cargar los datos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalCost = usageLogs.reduce((sum, log) => sum + Number(log.estimated_cost_usd || 0), 0);
    const totalCalls = usageLogs.length;
    const totalInputTokens = usageLogs.reduce((sum, log) => sum + (log.input_tokens || 0), 0);
    const totalOutputTokens = usageLogs.reduce((sum, log) => sum + (log.output_tokens || 0), 0);
    
    const daysInPeriod = period === 'today' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const avgDailyCost = totalCost / daysInPeriod;

    return {
      totalCost,
      totalCalls,
      totalInputTokens,
      totalOutputTokens,
      avgDailyCost,
    };
  }, [usageLogs, period]);

  // Daily breakdown for chart
  const dailyStats = useMemo(() => {
    const dailyMap = new Map<string, DailyStats>();
    const now = new Date();
    const daysToShow = period === 'today' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 14;
    
    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      dailyMap.set(dateStr, { date: dateStr, label, openai: 0, gemini: 0, total: 0, calls: 0 });
    }

    usageLogs.forEach(log => {
      const dateStr = log.created_at.split('T')[0];
      const day = dailyMap.get(dateStr);
      if (day) {
        const cost = Number(log.estimated_cost_usd || 0);
        day.total += cost;
        day.calls++;
        if (log.provider === 'openai') {
          day.openai += cost;
        } else {
          day.gemini += cost;
        }
      }
    });

    return Array.from(dailyMap.values());
  }, [usageLogs, period]);

  // Breakdown by edge function
  const functionBreakdown = useMemo(() => {
    const functionMap = new Map<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }>();
    
    usageLogs.forEach(log => {
      const func = log.edge_function;
      if (!functionMap.has(func)) {
        functionMap.set(func, { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
      }
      const entry = functionMap.get(func)!;
      entry.calls++;
      entry.inputTokens += log.input_tokens || 0;
      entry.outputTokens += log.output_tokens || 0;
      entry.cost += Number(log.estimated_cost_usd || 0);
    });

    return Array.from(functionMap.entries())
      .map(([name, data]) => ({
        name,
        ...data,
        percentage: summaryStats.totalCost > 0 ? (data.cost / summaryStats.totalCost) * 100 : 0,
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [usageLogs, summaryStats.totalCost]);

  // Breakdown by model
  const modelBreakdown = useMemo(() => {
    const modelMap = new Map<string, { calls: number; cost: number }>();
    
    usageLogs.forEach(log => {
      const model = `${log.provider}/${log.model}`;
      if (!modelMap.has(model)) {
        modelMap.set(model, { calls: 0, cost: 0 });
      }
      const entry = modelMap.get(model)!;
      entry.calls++;
      entry.cost += Number(log.estimated_cost_usd || 0);
    });

    return Array.from(modelMap.entries())
      .map(([name, data]) => {
        const [provider, model] = name.split('/');
        return {
          name,
          value: data.cost,
          calls: data.calls,
          isLegacy: isLegacyModel(provider || '', model || name),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [usageLogs]);

  // Calculate legacy costs separately for visibility
  const legacyCosts = useMemo(() => {
    return usageLogs
      .filter(log => isLegacyModel(log.provider, log.model))
      .reduce((sum, log) => sum + Number(log.estimated_cost_usd || 0), 0);
  }, [usageLogs]);

  // Pipeline V2 stats
  const pipelineStats = useMemo(() => {
    const pipelineLogs = usageLogs.filter(log => 
      log.action_type === 'rix_search' || log.action_type === 'rix_analysis'
    );

    const searchLogs = pipelineLogs.filter(log => log.action_type === 'rix_search');
    const analysisLogs = pipelineLogs.filter(log => log.action_type === 'rix_analysis');

    const searchCost = searchLogs.reduce((sum, log) => sum + Number(log.estimated_cost_usd || 0), 0);
    const analysisCost = analysisLogs.reduce((sum, log) => sum + Number(log.estimated_cost_usd || 0), 0);

    // Group by model for search
    const searchByModel = new Map<string, { calls: number; cost: number; tokens: number }>();
    searchLogs.forEach(log => {
      const model = `${log.provider}/${log.model}`;
      const existing = searchByModel.get(model) || { calls: 0, cost: 0, tokens: 0 };
      existing.calls++;
      existing.cost += Number(log.estimated_cost_usd || 0);
      existing.tokens += (log.input_tokens || 0) + (log.output_tokens || 0);
      searchByModel.set(model, existing);
    });

    // Group by ticker
    const tickerCosts = new Map<string, { searchCost: number; analysisCost: number; models: number }>();
    pipelineLogs.forEach(log => {
      const ticker = (log.metadata as any)?.ticker || (log as any).ticker || 'unknown';
      const existing = tickerCosts.get(ticker) || { searchCost: 0, analysisCost: 0, models: 0 };
      if (log.action_type === 'rix_search') {
        existing.searchCost += Number(log.estimated_cost_usd || 0);
        existing.models++;
      } else {
        existing.analysisCost += Number(log.estimated_cost_usd || 0);
      }
      tickerCosts.set(ticker, existing);
    });

    // Sort tickers by total cost
    const topTickers = Array.from(tickerCosts.entries())
      .map(([ticker, data]) => ({
        ticker,
        totalCost: data.searchCost + data.analysisCost,
        searchCost: data.searchCost,
        analysisCost: data.analysisCost,
        models: data.models,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 15);

    return {
      totalCost: searchCost + analysisCost,
      searchCost,
      analysisCost,
      searchCalls: searchLogs.length,
      analysisCalls: analysisLogs.length,
      uniqueTickers: tickerCosts.size,
      avgCostPerTicker: tickerCosts.size > 0 ? (searchCost + analysisCost) / tickerCosts.size : 0,
      searchByModel: Array.from(searchByModel.entries())
        .map(([model, data]) => ({ model, ...data }))
        .sort((a, b) => b.cost - a.cost),
      topTickers,
    };
  }, [usageLogs]);


  // Save cost config
  const handleSaveConfig = async (configId: string) => {
    setSavingConfig(true);
    try {
      const edit = editingConfig[configId];
      if (!edit) return;

      const baseUrl = `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/admin-api-data`;
      const res = await fetch(`${baseUrl}/cost-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: configId,
          input_cost_per_million: parseFloat(edit.input),
          output_cost_per_million: parseFloat(edit.output),
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error saving config');
      }

      toast({ title: 'Guardado', description: 'Configuración de precios actualizada' });
      fetchData();
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast({ title: 'Error', description: error.message || 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setSavingConfig(false);
    }
  };

  const formatCost = (cost: number) => {
    if (cost >= 1) return `$${cost.toFixed(2)}`;
    if (cost >= 0.01) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(4)}`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  // Cost alert thresholds
  const costAlerts = useMemo(() => {
    const alerts: { type: 'warning' | 'danger'; message: string }[] = [];
    
    // Daily average exceeds threshold
    if (summaryStats.avgDailyCost > 5) {
      alerts.push({ type: 'warning', message: `Gasto diario promedio alto: ${formatCost(summaryStats.avgDailyCost)}/día` });
    }
    if (summaryStats.avgDailyCost > 10) {
      alerts.push({ type: 'danger', message: `¡Gasto diario crítico: ${formatCost(summaryStats.avgDailyCost)}/día!` });
    }

    // Single user consuming >30% of total
    if (userStats.length > 0 && userSummary) {
      const topUserPercentage = (userStats[0].total_cost / userSummary.total_cost) * 100;
      if (topUserPercentage > 30) {
        alerts.push({ type: 'warning', message: `Usuario ${userStats[0].email} consume ${topUserPercentage.toFixed(1)}% del total` });
      }
    }

    // Peak usage detected
    if (peakUsage && peakUsage.cost > 2) {
      alerts.push({ type: 'warning', message: `Pico de uso: ${formatCost(peakUsage.cost)} en una hora (${peakUsage.calls} llamadas)` });
    }

    return alerts;
  }, [summaryStats, userStats, userSummary, peakUsage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Control de Gastos API</h2>
          <p className="text-muted-foreground">Monitoriza el consumo de IAs y analiza costes por usuario</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="7d">7 días</SelectItem>
              <SelectItem value="30d">30 días</SelectItem>
              <SelectItem value="90d">90 días</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {costAlerts.length > 0 && (
        <div className="space-y-2">
          {costAlerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2 p-3 rounded-lg ${
                alert.type === 'danger' 
                  ? 'bg-destructive/10 text-destructive border border-destructive/20' 
                  : 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline V2</TabsTrigger>
          <TabsTrigger value="users">Por Usuario</TabsTrigger>
          <TabsTrigger value="actions">Por Acción</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Gasto Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCost(summaryStats.totalCost)}</div>
                <p className="text-xs text-muted-foreground">
                  ~{formatCost(summaryStats.avgDailyCost)}/día promedio
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Llamadas API
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.totalCalls.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {userSummary ? `${userSummary.total_authenticated_users} usuarios autenticados` : 'En el período'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Coste/Usuario
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {userSummary ? formatCost(userSummary.avg_cost_per_user) : '$0.00'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Promedio por usuario activo
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Pico de Uso
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {peakUsage ? formatCost(peakUsage.cost) : '$0.00'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {peakUsage ? `${peakUsage.calls} llamadas en 1h` : 'Sin datos de pico'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Daily Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Evolución del Gasto
              </CardTitle>
              <CardDescription>Gasto diario por proveedor (USD)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${v.toFixed(2)}`} className="text-xs" />
                    <Tooltip 
                      formatter={(value: number) => formatCost(value)}
                      labelFormatter={(label) => `Fecha: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="openai" name="OpenAI" fill="#6366f1" stackId="a" />
                    <Bar dataKey="gemini" name="Gemini" fill="#22c55e" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Breakdown Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Model Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Distribución por Modelo</span>
                  {legacyCosts > 0 && (
                    <Badge variant="outline" className="text-xs bg-muted">
                      Legacy: {formatCost(legacyCosts)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={modelBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent, payload }) => {
                          const modelName = name.split('/')[1] || name;
                          const suffix = payload?.isLegacy ? ' ⚠️' : '';
                          return `${modelName}${suffix} (${(percent * 100).toFixed(0)}%)`;
                        }}
                      >
                        {modelBreakdown.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.isLegacy ? '#9ca3af' : COLORS[index % COLORS.length]}
                            opacity={entry.isLegacy ? 0.6 : 1}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number, name: string, props: any) => [
                          formatCost(value),
                          props?.payload?.isLegacy ? `${name} (Legacy)` : name
                        ]} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {modelBreakdown.some(m => m.isLegacy) && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    ⚠️ Modelos marcados como Legacy: coste histórico, ya no activos
                  </p>
                )}
              </CardContent>
            </Card>

            {/* User Top Costs Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Top Usuarios por Coste</span>
                  {userSummary && (
                    <Badge variant="outline" className="text-xs">
                      {userSummary.total_authenticated_users} usuarios · {userSummary.anonymous_sessions} anónimos
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="text-xs">Usuario</TableHead>
                        <TableHead className="text-right text-xs">Llamadas</TableHead>
                        <TableHead className="text-right text-xs">Coste</TableHead>
                        <TableHead className="text-right text-xs">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userStats.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">
                            No hay datos de usuarios
                          </TableCell>
                        </TableRow>
                      ) : (
                        userStats.slice(0, 20).map((user, idx) => (
                          <TableRow key={user.user_id || idx} className="text-xs">
                            <TableCell className="max-w-[140px] truncate" title={user.email}>
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground text-[10px] w-4">{idx + 1}</span>
                                <span className="truncate font-medium">
                                  {user.full_name || user.email.split('@')[0]}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{user.total_calls}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatCost(user.total_cost)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {userSummary && userSummary.total_cost > 0 
                                ? `${((user.total_cost / userSummary.total_cost) * 100).toFixed(1)}%`
                                : '-'}
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

          {/* Function Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Desglose por Edge Function</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Edge Function</TableHead>
                    <TableHead className="text-right">Llamadas</TableHead>
                    <TableHead className="text-right">Tokens In</TableHead>
                    <TableHead className="text-right">Tokens Out</TableHead>
                    <TableHead className="text-right">Coste</TableHead>
                    <TableHead className="text-right">% Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {functionBreakdown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No hay datos para el período seleccionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    functionBreakdown.map((func) => (
                      <TableRow key={func.name}>
                        <TableCell className="font-medium">{func.name}</TableCell>
                        <TableCell className="text-right">{func.calls.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatTokens(func.inputTokens)}</TableCell>
                        <TableCell className="text-right">{formatTokens(func.outputTokens)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCost(func.cost)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{func.percentage.toFixed(1)}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline V2 Tab */}
        <TabsContent value="pipeline" className="space-y-6">
          {/* Pipeline Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Coste Total Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCost(pipelineStats.totalCost)}</div>
                <p className="text-xs text-muted-foreground">
                  Búsquedas + Análisis RIX V2
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Coste Búsquedas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCost(pipelineStats.searchCost)}</div>
                <p className="text-xs text-muted-foreground">
                  {pipelineStats.searchCalls} llamadas a 7 modelos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Coste Análisis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-good">{formatCost(pipelineStats.analysisCost)}</div>
                <p className="text-xs text-muted-foreground">
                  {pipelineStats.analysisCalls} análisis GPT-4o
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Coste/Empresa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCost(pipelineStats.avgCostPerTicker)}</div>
                <p className="text-xs text-muted-foreground">
                  {pipelineStats.uniqueTickers} empresas procesadas
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Search cost by model */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Coste por Modelo de Búsqueda</CardTitle>
                <CardDescription>Desglose de gastos por cada IA en Phase 1</CardDescription>
              </CardHeader>
              <CardContent>
                {pipelineStats.searchByModel.length > 0 ? (
                  <div className="space-y-3">
                    {pipelineStats.searchByModel.map((item, idx) => (
                      <div key={item.model} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                          />
                          <span className="font-medium text-sm">{item.model}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">{item.calls} llamadas</span>
                          <span className="font-bold">{formatCost(item.cost)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    No hay datos de búsquedas RIX V2
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Phase breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Distribución Search vs Analysis</CardTitle>
                <CardDescription>Proporción de costes por fase del pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                {pipelineStats.totalCost > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Phase 1: Búsquedas (7 modelos)</span>
                        <span className="font-bold">{formatCost(pipelineStats.searchCost)}</span>
                      </div>
                      <Progress 
                        value={(pipelineStats.searchCost / pipelineStats.totalCost) * 100} 
                        className="h-3"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {((pipelineStats.searchCost / pipelineStats.totalCost) * 100).toFixed(1)}% del total
                      </p>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Phase 2: Análisis GPT-4o</span>
                        <span className="font-bold">{formatCost(pipelineStats.analysisCost)}</span>
                      </div>
                      <Progress 
                        value={(pipelineStats.analysisCost / pipelineStats.totalCost) * 100} 
                        className="h-3"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {((pipelineStats.analysisCost / pipelineStats.totalCost) * 100).toFixed(1)}% del total
                      </p>
                    </div>
                    
                    <div className="pt-4 border-t">
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-primary">{pipelineStats.searchCalls}</div>
                          <p className="text-xs text-muted-foreground">Búsquedas realizadas</p>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-good">{pipelineStats.analysisCalls}</div>
                          <p className="text-xs text-muted-foreground">Análisis completados</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    No hay datos del pipeline RIX V2
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top tickers by cost */}
          <Card>
            <CardHeader>
              <CardTitle>Empresas con Mayor Coste</CardTitle>
              <CardDescription>Top 15 tickers por gasto total (búsqueda + análisis)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Coste Búsqueda</TableHead>
                    <TableHead className="text-right">Coste Análisis</TableHead>
                    <TableHead className="text-right">Coste Total</TableHead>
                    <TableHead className="text-right">Modelos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipelineStats.topTickers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No hay datos de empresas procesadas
                      </TableCell>
                    </TableRow>
                  ) : (
                    pipelineStats.topTickers.map((ticker) => (
                      <TableRow key={ticker.ticker}>
                        <TableCell className="font-medium">{ticker.ticker}</TableCell>
                        <TableCell className="text-right">{formatCost(ticker.searchCost)}</TableCell>
                        <TableCell className="text-right">{formatCost(ticker.analysisCost)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCost(ticker.totalCost)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{ticker.models}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          {/* User Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Usuarios Autenticados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userSummary?.total_authenticated_users || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Infraestructura</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userSummary?.anonymous_sessions || 0}</div>
                <p className="text-xs text-muted-foreground">Sesiones de sistema</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Coste Medio/Usuario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCost(userSummary?.avg_cost_per_user || 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top Usuario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold truncate">{userSummary?.top_user?.email || '-'}</div>
                <p className="text-xs text-muted-foreground">{formatCost(userSummary?.top_user?.cost || 0)}</p>
              </CardContent>
            </Card>
          </div>

          {/* User Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Usuarios Más Activos
              </CardTitle>
              <CardDescription>Top 50 usuarios por gasto total en el período</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Llamadas</TableHead>
                    <TableHead className="text-right">Coste Total</TableHead>
                    <TableHead className="text-right">Coste/Llamada</TableHead>
                    <TableHead className="text-right">% del Total</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No hay datos de usuarios
                      </TableCell>
                    </TableRow>
                  ) : (
                    userStats.slice(0, 20).map((user, idx) => {
                      const percentage = userSummary 
                        ? (user.total_cost / userSummary.total_cost) * 100 
                        : 0;
                      return (
                        <TableRow key={user.user_id || `anon-${idx}`}>
                          <TableCell>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                {user.email === 'Infraestructura' && (
                                  <Server className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-medium">{user.full_name || user.email}</span>
                              </div>
                              {user.full_name && (
                                <span className="text-xs text-muted-foreground">{user.email}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{user.total_calls.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">{formatCost(user.total_cost)}</TableCell>
                          <TableCell className="text-right">{formatCost(user.avg_cost_per_call)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress value={percentage} className="w-16 h-2" />
                              <span className="text-xs w-12 text-right">{percentage.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(user.actions).slice(0, 3).map(([action, count]) => (
                                <Badge key={action} variant="outline" className="text-xs">
                                  {action}: {count}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions" className="space-y-6">
          {/* Action Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {actionMetrics.slice(0, 3).map((action) => (
              <Card key={action.action_type}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium capitalize flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    {action.action_type}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Coste medio:</span>
                      <span className="font-bold">{formatCost(action.avg_cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">P95:</span>
                      <span>{formatCost(action.p95_cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total:</span>
                      <span>{formatCost(action.total_cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Llamadas:</span>
                      <span>{action.total_calls.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Peak Usage Alert */}
          {peakUsage && (
            <Card className="border-yellow-500/20 bg-yellow-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <Clock className="h-5 w-5" />
                  Pico de Uso Detectado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{peakUsage.hour.split('T')[1]}:00</div>
                    <div className="text-xs text-muted-foreground">{peakUsage.hour.split('T')[0]}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{formatCost(peakUsage.cost)}</div>
                    <div className="text-xs text-muted-foreground">Coste en 1h</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{peakUsage.calls}</div>
                    <div className="text-xs text-muted-foreground">Llamadas</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{formatTokens(peakUsage.tokens)}</div>
                    <div className="text-xs text-muted-foreground">Tokens</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Details Table */}
          <Card>
            <CardHeader>
              <CardTitle>Métricas Detalladas por Acción</CardTitle>
              <CardDescription>Análisis de coste y tokens por tipo de acción</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Acción</TableHead>
                    <TableHead className="text-right">Llamadas</TableHead>
                    <TableHead className="text-right">Coste Total</TableHead>
                    <TableHead className="text-right">Coste Medio</TableHead>
                    <TableHead className="text-right">Mediana</TableHead>
                    <TableHead className="text-right">P95</TableHead>
                    <TableHead className="text-right">Tokens In Avg</TableHead>
                    <TableHead className="text-right">Tokens Out Avg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionMetrics.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No hay datos de acciones
                      </TableCell>
                    </TableRow>
                  ) : (
                    actionMetrics.map((action) => (
                      <TableRow key={action.action_type}>
                        <TableCell className="font-medium capitalize">{action.action_type}</TableCell>
                        <TableCell className="text-right">{action.total_calls.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">{formatCost(action.total_cost)}</TableCell>
                        <TableCell className="text-right">{formatCost(action.avg_cost)}</TableCell>
                        <TableCell className="text-right">{formatCost(action.median_cost)}</TableCell>
                        <TableCell className="text-right">{formatCost(action.p95_cost)}</TableCell>
                        <TableCell className="text-right">{formatTokens(Math.round(action.avg_input_tokens))}</TableCell>
                        <TableCell className="text-right">{formatTokens(Math.round(action.avg_output_tokens))}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Projection Card */}
          <Card>
            <CardHeader>
              <CardTitle>Proyecciones de Escalabilidad</CardTitle>
              <CardDescription>Estimación de costes si el uso aumenta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-sm text-muted-foreground">Actual (30d)</div>
                  <div className="text-2xl font-bold mt-1">{formatCost(summaryStats.totalCost)}</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-sm text-muted-foreground">Si uso x2</div>
                  <div className="text-2xl font-bold mt-1 text-yellow-600">{formatCost(summaryStats.totalCost * 2)}</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-sm text-muted-foreground">Si uso x5</div>
                  <div className="text-2xl font-bold mt-1 text-orange-600">{formatCost(summaryStats.totalCost * 5)}</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-sm text-muted-foreground">Si uso x10</div>
                  <div className="text-2xl font-bold mt-1 text-red-600">{formatCost(summaryStats.totalCost * 10)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Precios</CardTitle>
              <CardDescription>Ajusta los precios por millón de tokens para cada modelo</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Input ($/1M tokens)</TableHead>
                    <TableHead>Output ($/1M tokens)</TableHead>
                    <TableHead>Última actualización</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costConfig.map((config) => {
                    const isLegacy = isLegacyModel(config.provider, config.model);
                    return (
                    <TableRow key={config.id} className={isLegacy ? 'opacity-60 bg-muted/30' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={config.provider === 'openai' ? 'default' : 'secondary'}>
                            {config.provider}
                          </Badge>
                          {isLegacy && (
                            <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                              Legacy
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className={isLegacy ? 'line-through' : ''}>
                          {config.model}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          value={editingConfig[config.id]?.input || ''}
                          onChange={(e) => setEditingConfig(prev => ({
                            ...prev,
                            [config.id]: { ...prev[config.id], input: e.target.value }
                          }))}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          value={editingConfig[config.id]?.output || ''}
                          onChange={(e) => setEditingConfig(prev => ({
                            ...prev,
                            [config.id]: { ...prev[config.id], output: e.target.value }
                          }))}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(config.updated_at).toLocaleDateString('es-ES')}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveConfig(config.id)}
                          disabled={savingConfig}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ApiCostDashboard;
