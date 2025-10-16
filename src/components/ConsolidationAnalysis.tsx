import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, TrendingUp, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ConsolidationReport {
  id: string;
  created_at: string;
  week_start: string;
  week_end: string;
  ticker: string;
  company_name: string;
  main_coincidences: Array<{
    topic: string;
    mentioned_by: string[];
    description: string;
  }>;
  common_media_sources: Array<{
    media: string;
    mentioned_by: string[];
    frequency: number;
  }>;
  divergences: Array<{
    aspect: string;
    difference: string;
  }>;
  consensus_score: number;
  full_analysis: string;
  media_ranking: Array<{
    media: string;
    mentions: number;
    models: string[];
  }>;
  models_analyzed: string[];
  total_sources_found: number;
}

export default function ConsolidationAnalysis() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [selectedCompany, setSelectedCompany] = useState<string>("all");

  // Fetch existing consolidation reports
  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ['consolidation-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_consolidation_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as ConsolidationReport[];
    },
  });

  // Get unique weeks from pari_runs
  const { data: availableWeeks } = useQuery({
    queryKey: ['available-weeks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rix_runs')
        .select('"06_period_from", "07_period_to"')
        .order('"06_period_from"', { ascending: false });

      if (error) throw error;

      const uniqueWeeks = new Map<string, { start: string; end: string }>();
      data.forEach((row: any) => {
        const key = `${row["06_period_from"]}_${row["07_period_to"]}`;
        if (!uniqueWeeks.has(key)) {
          uniqueWeeks.set(key, {
            start: row["06_period_from"],
            end: row["07_period_to"],
          });
        }
      });

      return Array.from(uniqueWeeks.values());
    },
  });

  const handleGenerateAnalysis = async () => {
    if (!selectedWeek) {
      toast({
        title: "Error",
        description: "Por favor selecciona una semana",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const [weekStart, weekEnd] = selectedWeek.split('_');
      
      const { data, error } = await supabase.functions.invoke('ai-consolidation-analysis', {
        body: {
          weekStart,
          weekEnd,
          ticker: selectedCompany !== 'all' ? selectedCompany : null,
        },
      });

      if (error) throw error;

      toast({
        title: "¡Análisis completado!",
        description: `Se generaron ${data.reports_created} reportes consolidados`,
      });

      refetch();
    } catch (error) {
      console.error('Error generating analysis:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al generar análisis",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getConsensusColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-destructive";
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "d 'de' MMMM, yyyy", { locale: es });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Análisis Consolidado de IA
          </CardTitle>
          <CardDescription>
            La "quinta IA" analiza coincidencias y fuentes mediáticas comunes entre todos los modelos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Semana</label>
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar semana" />
                </SelectTrigger>
                <SelectContent>
                  {availableWeeks?.map((week) => (
                    <SelectItem key={`${week.start}_${week.end}`} value={`${week.start}_${week.end}`}>
                      {formatDate(week.start)} - {formatDate(week.end)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Empresa</label>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las empresas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {/* Add company options dynamically */}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                onClick={handleGenerateAnalysis} 
                disabled={isGenerating || !selectedWeek}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generar Análisis
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {reports && reports.length > 0 && (
        <div className="space-y-6">
          {reports.map((report) => (
            <Card key={report.id} className="shadow-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{report.company_name}</CardTitle>
                    <CardDescription>
                      {formatDate(report.week_start)} - {formatDate(report.week_end)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Score de Consenso</div>
                      <div className={`text-2xl font-bold ${getConsensusColor(report.consensus_score)}`}>
                        {report.consensus_score}%
                      </div>
                    </div>
                    <Badge variant="outline">
                      {report.models_analyzed.length} modelos
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Coincidencias Principales */}
                {report.main_coincidences.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Coincidencias Principales
                    </h3>
                    <div className="space-y-3">
                      {report.main_coincidences.map((coincidence, idx) => (
                        <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-medium">{coincidence.topic}</h4>
                            <div className="flex gap-1">
                              {coincidence.mentioned_by.map((model) => (
                                <Badge key={model} variant="secondary" className="text-xs">
                                  {model}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{coincidence.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ranking de Medios */}
                {report.media_ranking.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Ranking de Medios Citados</h3>
                    <div className="rounded-md border overflow-hidden shadow-card">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Medio</TableHead>
                            <TableHead className="text-center">Menciones</TableHead>
                            <TableHead>Modelos que lo citan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.media_ranking
                            .sort((a, b) => b.mentions - a.mentions)
                            .map((media, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">{media.media}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline">{media.mentions}</Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1 flex-wrap">
                                    {media.models.map((model) => (
                                      <Badge key={model} variant="secondary" className="text-xs">
                                        {model}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Divergencias */}
                {report.divergences.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Divergencias Detectadas
                    </h3>
                    <div className="space-y-2">
                      {report.divergences.map((divergence, idx) => (
                        <div key={idx} className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                          <h4 className="font-medium text-sm mb-1">{divergence.aspect}</h4>
                          <p className="text-sm text-muted-foreground">{divergence.difference}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Análisis Completo */}
                {report.full_analysis && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Análisis Detallado</h3>
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{report.full_analysis}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reports && reports.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="text-center py-12">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              No hay análisis consolidados aún. Genera tu primer análisis seleccionando una semana.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
