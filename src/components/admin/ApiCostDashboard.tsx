import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, DollarSign, Zap, Hash, TrendingUp, RefreshCw, Save, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export const ApiCostDashboard: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [usageLogs, setUsageLogs] = useState<ApiUsageLog[]>([]);
  const [costConfig, setCostConfig] = useState<ApiCostConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<Record<string, { input: string; output: string }>>({});

  // Fetch data
  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Map period to API format
      const periodMap: Record<TimePeriod, string> = {
        'today': '24h',
        '7d': '7d',
        '30d': '30d',
        '90d': '90d',
        'all': '90d'
      };

      // Fetch usage logs via edge function
      const logsResponse = await supabase.functions.invoke('admin-api-data', {
        body: null,
        method: 'GET',
      });

      // Use custom fetch for GET requests with query params
      const baseUrl = `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/admin-api-data`;
      
      const [logsRes, configRes] = await Promise.all([
        fetch(`${baseUrl}/usage-logs?period=${periodMap[period]}`, {
          headers: { 'Content-Type': 'application/json' }
        }),
        fetch(`${baseUrl}/cost-config`, {
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

      setUsageLogs(logsData.data || []);
      setCostConfig(configData.data || []);

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
    
    // Days in period
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
    
    // Generate dates for the period
    const now = new Date();
    const daysToShow = period === 'today' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 14;
    
    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      dailyMap.set(dateStr, { date: dateStr, label, openai: 0, gemini: 0, total: 0, calls: 0 });
    }

    // Aggregate by day
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
      .map(([name, data]) => ({
        name,
        value: data.cost,
        calls: data.calls,
      }))
      .sort((a, b) => b.value - a.value);
  }, [usageLogs]);

  // Breakdown by action type
  const actionBreakdown = useMemo(() => {
    const actionMap = new Map<string, { calls: number; cost: number }>();
    
    usageLogs.forEach(log => {
      const action = log.action_type;
      if (!actionMap.has(action)) {
        actionMap.set(action, { calls: 0, cost: 0 });
      }
      const entry = actionMap.get(action)!;
      entry.calls++;
      entry.cost += Number(log.estimated_cost_usd || 0);
    });

    return Array.from(actionMap.entries())
      .map(([name, data]) => ({
        name,
        value: data.cost,
        calls: data.calls,
      }))
      .sort((a, b) => b.value - a.value);
  }, [usageLogs]);

  // Save cost config via edge function
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
          <p className="text-muted-foreground">Monitoriza el consumo de OpenAI y Google Gemini</p>
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
              En el período seleccionado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Tokens Entrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTokens(summaryStats.totalInputTokens)}</div>
            <p className="text-xs text-muted-foreground">
              Prompts enviados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Tokens Salida
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTokens(summaryStats.totalOutputTokens)}</div>
            <p className="text-xs text-muted-foreground">
              Respuestas generadas
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
            <CardTitle>Distribución por Modelo</CardTitle>
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
                    label={({ name, percent }) => `${name.split('/')[1] || name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {modelBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCost(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* By Action Type */}
        <Card>
          <CardHeader>
            <CardTitle>Por Tipo de Acción</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actionBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCost(v)} />
                  <YAxis type="category" dataKey="name" width={100} className="text-xs" />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [
                      `${formatCost(value)} (${props.payload.calls} llamadas)`,
                      'Coste'
                    ]}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
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

      {/* Cost Configuration */}
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
              {costConfig.map((config) => (
                <TableRow key={config.id}>
                  <TableCell>
                    <Badge variant={config.provider === 'openai' ? 'default' : 'secondary'}>
                      {config.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{config.model}</TableCell>
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiCostDashboard;
