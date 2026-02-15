import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, HeartPulse, Loader2, Clock } from 'lucide-react';
import { ChatGPTIcon } from '@/components/ui/chatgpt-icon';
import { PerplexityIcon } from '@/components/ui/perplexity-icon';
import { GeminiIcon } from '@/components/ui/gemini-icon';
import { DeepseekIcon } from '@/components/ui/deepseek-icon';
import { GrokIcon } from '@/components/ui/grok-icon';
import { QwenIcon } from '@/components/ui/qwen-icon';
import { Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface ApiLog {
  id: string;
  provider: string;
  model: string;
  edge_function: string;
  action_type: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  ticker: string | null;
  created_at: string;
  metadata: any;
}

interface ProviderHealth {
  provider: string;
  status: 'ok' | 'idle' | 'down' | 'no_data';
  lastCall: string | null;
  calls24h: number;
  successRate: number;
  models: string[];
}

const PROVIDER_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  openai: { label: 'OpenAI', icon: <ChatGPTIcon size={20} /> },
  perplexity: { label: 'Perplexity', icon: <PerplexityIcon size={20} /> },
  google: { label: 'Google Gemini', icon: <GeminiIcon size={20} /> },
  deepseek: { label: 'DeepSeek', icon: <DeepseekIcon size={20} /> },
  xai: { label: 'XAI / Grok', icon: <GrokIcon size={20} /> },
  alibaba: { label: 'Alibaba / Qwen', icon: <QwenIcon size={20} /> },
  firecrawl: { label: 'Firecrawl', icon: <Building2 className="h-5 w-5" /> },
};

const ALL_PROVIDERS = Object.keys(PROVIDER_CONFIG);

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'OK' },
  idle: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: 'Idle' },
  down: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Down' },
  no_data: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Sin datos' },
};

export function ApiHealthDashboard() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/admin-api-data/usage-logs?period=7d`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU',
          },
        }
      );
      const result = await response.json();
      setLogs(result.data || []);
    } catch (err) {
      console.error('Error fetching API health data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const providerHealthMap = useMemo(() => {
    const map: Record<string, ProviderHealth> = {};

    // Initialize all providers
    ALL_PROVIDERS.forEach(p => {
      map[p] = { provider: p, status: 'no_data', lastCall: null, calls24h: 0, successRate: 100, models: [] };
    });

    // Group logs by provider
    logs.forEach(log => {
      const p = log.provider.toLowerCase();
      const key = ALL_PROVIDERS.find(k => p.includes(k)) || p;
      if (!map[key]) {
        map[key] = { provider: key, status: 'no_data', lastCall: null, calls24h: 0, successRate: 100, models: [] };
      }
      const entry = map[key];

      // Track last call
      if (!entry.lastCall || log.created_at > entry.lastCall) {
        entry.lastCall = log.created_at;
      }

      // Count 24h calls
      if (new Date(log.created_at) >= twentyFourHoursAgo) {
        entry.calls24h++;
      }

      // Track models
      if (log.model && !entry.models.includes(log.model)) {
        entry.models.push(log.model);
      }
    });

    // Determine status
    Object.values(map).forEach(entry => {
      if (!entry.lastCall) {
        entry.status = 'no_data';
      } else if (new Date(entry.lastCall) >= twoHoursAgo) {
        entry.status = 'ok';
      } else if (new Date(entry.lastCall) >= twentyFourHoursAgo) {
        entry.status = 'idle';
      } else {
        entry.status = 'down';
      }
    });

    return map;
  }, [logs]);

  const recentLogs = useMemo(() => logs.slice(0, 25), [logs]);

  const summary = useMemo(() => {
    const providers = Object.values(providerHealthMap);
    const active = providers.filter(p => p.status === 'ok' || p.status === 'idle').length;
    const total24h = providers.reduce((sum, p) => sum + p.calls24h, 0);
    return { active, total: providers.length, total24h };
  }, [providerHealthMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Cargando estado de APIs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-primary" />
            Estado de Salud de APIs
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitorización en tiempo real de {summary.total} proveedores · {summary.total24h} llamadas en 24h · {summary.active} activos
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ALL_PROVIDERS.map(key => {
          const health = providerHealthMap[key];
          const config = PROVIDER_CONFIG[key];
          const style = STATUS_STYLES[health.status];
          return (
            <Card key={key} className="relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-1 ${
                health.status === 'ok' ? 'bg-green-500' :
                health.status === 'idle' ? 'bg-yellow-500' :
                health.status === 'down' ? 'bg-red-500' : 'bg-muted-foreground/30'
              }`} />
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {config.icon}
                    <span className="font-medium text-sm">{config.label}</span>
                  </div>
                  <Badge className={`${style.bg} ${style.text} border-0 text-[10px] px-1.5`}>
                    {style.label}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>24h calls</span>
                    <span className="font-mono font-medium text-foreground">{health.calls24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Última</span>
                    <span className="font-mono text-foreground">
                      {health.lastCall
                        ? formatDistanceToNow(new Date(health.lastCall), { addSuffix: true, locale: es })
                        : '—'}
                    </span>
                  </div>
                  {health.models.length > 0 && (
                    <div className="pt-1 border-t border-border/50">
                      <span className="text-[10px] text-muted-foreground">
                        {health.models.slice(0, 3).join(', ')}
                        {health.models.length > 3 && ` +${health.models.length - 3}`}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Calls Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Últimas llamadas ({recentLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Timestamp</TableHead>
                <TableHead className="text-xs">Provider</TableHead>
                <TableHead className="text-xs">Modelo</TableHead>
                <TableHead className="text-xs">Edge Function</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs text-right">Tokens</TableHead>
                <TableHead className="text-xs text-right">Coste</TableHead>
                <TableHead className="text-xs">Ticker</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLogs.map(log => {
                const providerKey = ALL_PROVIDERS.find(k => log.provider.toLowerCase().includes(k));
                const config = providerKey ? PROVIDER_CONFIG[providerKey] : null;
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('es-ES', {
                        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {config?.icon}
                        <span className="text-xs">{config?.label || log.provider}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.model}</TableCell>
                    <TableCell className="text-xs">{log.edge_function}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{log.action_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {(log.input_tokens + log.output_tokens).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      ${Number(log.estimated_cost_usd).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {log.ticker || '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
