import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Calculator, RefreshCw, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RixcScore {
  id: string;
  ticker: string;
  company_name: string;
  week_start: string;
  rixc_score: number;
  sigma_intermodelo: number;
  ic_score: number;
  consensus_level: string;
  models_count: number;
  individual_scores: Record<string, number>;
  created_at: string;
}

const CONSENSUS_COLORS: Record<string, string> = {
  'Hecho Consolidado': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'Señal Fuerte': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Divergencia Moderada': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Narrativa Fragmentada': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Dato Inestable': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const CONSENSUS_LEVELS = [
  'Hecho Consolidado',
  'Señal Fuerte',
  'Divergencia Moderada',
  'Narrativa Fragmentada',
  'Dato Inestable',
];

export const RixcMonitorPanel: React.FC = () => {
  const { toast } = useToast();
  const [scores, setScores] = useState<RixcScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [consensusFilter, setConsensusFilter] = useState<string>('all');
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('latest');

  const callAdminApi = async (action: string, data?: any) => {
    const { data: response, error } = await supabase.functions.invoke('admin-api', {
      body: { action, data },
    });
    if (error) throw error;
    if (response.error) throw new Error(response.error);
    return response;
  };

  const fetchScores = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (selectedWeek !== 'latest') filters.week_start = selectedWeek;
      if (consensusFilter !== 'all') filters.consensus_level = consensusFilter;

      const result = await callAdminApi('list_rixc_scores', filters);
      setScores(result.scores || []);

      // Extract unique weeks
      const weeks = [...new Set((result.scores || []).map((s: RixcScore) => s.week_start))].sort().reverse() as string[];
      if (weeks.length > 0 && availableWeeks.length === 0) {
        setAvailableWeeks(weeks);
      }
    } catch (error: any) {
      console.error('Error fetching RIXc scores:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const computeRixc = async () => {
    setComputing(true);
    try {
      const result = await callAdminApi('compute_rixc', {
        week_start: selectedWeek !== 'latest' ? selectedWeek : undefined,
      });
      toast({
        title: 'RIXc calculado',
        description: `${result.summary?.total_computed || 0} empresas procesadas`,
      });
      fetchScores();
    } catch (error: any) {
      console.error('Error computing RIXc:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setComputing(false);
    }
  };

  useEffect(() => {
    fetchScores();
  }, [selectedWeek, consensusFilter]);

  const filteredScores = scores.filter(s =>
    s.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.ticker.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Summary stats
  const avgIc = filteredScores.length > 0
    ? (filteredScores.reduce((sum, s) => sum + Number(s.ic_score), 0) / filteredScores.length).toFixed(1)
    : '—';
  const avgRixc = filteredScores.length > 0
    ? (filteredScores.reduce((sum, s) => sum + Number(s.rixc_score), 0) / filteredScores.length).toFixed(1)
    : '—';
  const consensusDistribution = CONSENSUS_LEVELS.map(level => ({
    level,
    count: filteredScores.filter(s => s.consensus_level === level).length,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            RIXc — RIX Compuesto
            <Badge variant="outline" className="ml-2 text-xs">En validación</Badge>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Mediana robusta de los 6 modelos · σ inter-modelo · IC (Indicador de Confiabilidad)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchScores} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={computeRixc} disabled={computing}>
            {computing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Calculator className="h-4 w-4 mr-1" />}
            Calcular RIXc
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Empresas</p>
            <p className="text-2xl font-bold">{filteredScores.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">RIXc medio</p>
            <p className="text-2xl font-bold">{avgRixc}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">IC medio</p>
            <p className="text-2xl font-bold">{avgIc}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Consenso alto</p>
            <p className="text-2xl font-bold">
              {filteredScores.filter(s => s.consensus_level === 'Hecho Consolidado' || s.consensus_level === 'Señal Fuerte').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Consensus Distribution */}
      <div className="flex flex-wrap gap-2">
        {consensusDistribution.map(({ level, count }) => (
          <Badge key={level} className={`${CONSENSUS_COLORS[level] || ''} cursor-pointer`}
            onClick={() => setConsensusFilter(consensusFilter === level ? 'all' : level)}>
            {level}: {count}
          </Badge>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa o ticker..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={consensusFilter} onValueChange={setConsensusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Consenso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            {CONSENSUS_LEVELS.map(level => (
              <SelectItem key={level} value={level}>{level}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {availableWeeks.length > 0 && (
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Semana" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Última semana</SelectItem>
              {availableWeeks.map(w => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Results Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">RIXc</TableHead>
                <TableHead className="text-right">σ</TableHead>
                <TableHead className="text-right">IC</TableHead>
                <TableHead>Consenso</TableHead>
                <TableHead className="text-right">Modelos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredScores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Sin datos. Pulsa "Calcular RIXc" para generar.
                  </TableCell>
                </TableRow>
              ) : (
                filteredScores.map(score => (
                  <TableRow key={score.id}>
                    <TableCell className="font-mono text-xs">{score.ticker}</TableCell>
                    <TableCell className="font-medium text-sm">{score.company_name}</TableCell>
                    <TableCell className="text-right font-bold">{Number(score.rixc_score).toFixed(1)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{Number(score.sigma_intermodelo).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(score.ic_score).toFixed(0)}</TableCell>
                    <TableCell>
                      <Badge className={CONSENSUS_COLORS[score.consensus_level] || ''}>
                        {score.consensus_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{score.models_count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
