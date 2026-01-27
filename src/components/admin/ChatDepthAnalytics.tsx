import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Rocket, Zap, Flame, FileText, Sparkles, Users, DollarSign, Hash } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DepthStat {
  depth_level: string;
  calls: number;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  unique_users: number;
  avg_cost_per_call: number;
}

interface UserDepthStat {
  user_id: string | null;
  email: string;
  full_name: string | null;
  quick: { calls: number; cost: number };
  complete: { calls: number; cost: number };
  exhaustive: { calls: number; cost: number };
  enrich: { calls: number; cost: number };
  bulletin: { calls: number; cost: number };
  total_cost: number;
  total_calls: number;
  pattern: string;
}

interface DepthAnalyticsData {
  by_depth: DepthStat[];
  by_user: UserDepthStat[];
  summary: {
    total_chat_calls: number;
    total_cost: number;
    authenticated_users: number;
  };
}

interface ChatDepthAnalyticsProps {
  period: string;
}

const DEPTH_CONFIG = {
  quick: { 
    label: 'Rápido', 
    icon: Rocket, 
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    description: '~30s, síntesis ejecutiva'
  },
  complete: { 
    label: 'Completo', 
    icon: Zap, 
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    description: '~1min, informe ejecutivo'
  },
  exhaustive: { 
    label: 'Exhaustivo', 
    icon: Flame, 
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    description: '~2min, análisis profundo'
  },
  enrich: { 
    label: 'Enriquecimiento', 
    icon: Sparkles, 
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    description: 'Reformulación por rol'
  },
  bulletin: { 
    label: 'Boletín', 
    icon: FileText, 
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    description: 'Informe empresarial'
  },
};

export const ChatDepthAnalytics: React.FC<ChatDepthAnalyticsProps> = ({ period }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DepthAnalyticsData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const response = await fetch(
          `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/admin-api-data/depth-analytics?period=${period}`,
          {
            headers: {
              'Authorization': `Bearer ${session?.session?.access_token || ''}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (response.ok) {
          const result = await response.json();
          setData(result.data);
        }
      } catch (error) {
        console.error('Error fetching depth analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period]);

  const formatCost = (cost: number) => {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  };

  const _formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return tokens.toString();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6 h-32 bg-muted/20" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          No hay datos disponibles para el período seleccionado
        </CardContent>
      </Card>
    );
  }

  const totalCost = data.by_depth.reduce((sum, d) => sum + d.cost, 0);
  const secondaryDepths = data.by_depth.filter(d => ['enrich', 'bulletin'].includes(d.depth_level));

  return (
    <div className="space-y-6">
      {/* Summary Cards - Main Depth Levels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['quick', 'complete', 'exhaustive'].map(level => {
          const stat = data.by_depth.find(d => d.depth_level === level);
          const config = DEPTH_CONFIG[level as keyof typeof DEPTH_CONFIG];
          const IconComponent = config.icon;
          const percentage = stat && totalCost > 0 ? (stat.cost / totalCost) * 100 : 0;
          
          return (
            <Card key={level} className={`${config.bgColor} border-0`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <IconComponent className={`h-5 w-5 ${config.color}`} />
                      <span className="font-semibold">{config.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                  </div>
                  <Badge variant="secondary" className="font-mono">
                    {percentage.toFixed(0)}%
                  </Badge>
                </div>
                
                <div className="mt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Llamadas</span>
                    <span className="font-medium">{stat?.calls || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Coste</span>
                    <span className="font-medium text-green-600">{formatCost(stat?.cost || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Usuarios</span>
                    <span className="font-medium">{stat?.unique_users || 0}</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Secondary Types (Enrich + Bulletin) */}
      {secondaryDepths.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {secondaryDepths.map(stat => {
            const config = DEPTH_CONFIG[stat.depth_level as keyof typeof DEPTH_CONFIG];
            if (!config) return null;
            const IconComponent = config.icon;
            
            return (
              <Card key={stat.depth_level} className="border border-border/50">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config.bgColor}`}>
                        <IconComponent className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div>
                        <span className="font-medium">{config.label}</span>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{stat.calls} calls</div>
                      <div className="text-sm text-green-600">{formatCost(stat.cost)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* User Consumption Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            Consumo por Usuario
            <Badge variant="outline" className="ml-2">
              Top 50
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead className="text-center">🚀 Rápido</TableHead>
                <TableHead className="text-center">⚡ Completo</TableHead>
                <TableHead className="text-center">🔥 Exhaustivo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Patrón</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_user.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No hay usuarios con datos de chat en este período
                  </TableCell>
                </TableRow>
              ) : (
                data.by_user.map((user, idx) => (
                  <TableRow key={user.user_id || idx}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm truncate max-w-[200px]">
                          {user.email}
                        </div>
                        {user.full_name && (
                          <div className="text-xs text-muted-foreground">{user.full_name}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-sm">
                        <span className="font-medium">{user.quick.calls}</span>
                        {user.quick.cost > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({formatCost(user.quick.cost)})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-sm">
                        <span className="font-medium">{user.complete.calls}</span>
                        {user.complete.cost > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({formatCost(user.complete.cost)})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-sm">
                        <span className="font-medium">{user.exhaustive.calls}</span>
                        {user.exhaustive.cost > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({formatCost(user.exhaustive.cost)})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium text-green-600">
                        {formatCost(user.total_cost)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {user.total_calls} calls
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">
                        {user.pattern}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Global Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                <Hash className="h-4 w-4" />
                <span className="text-sm">Total Llamadas</span>
              </div>
              <div className="text-2xl font-bold">{data.summary.total_chat_calls}</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm">Coste Total</span>
              </div>
              <div className="text-2xl font-bold text-green-600">{formatCost(data.summary.total_cost)}</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                <Users className="h-4 w-4" />
                <span className="text-sm">Usuarios Autenticados</span>
              </div>
              <div className="text-2xl font-bold">{data.summary.authenticated_users}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
