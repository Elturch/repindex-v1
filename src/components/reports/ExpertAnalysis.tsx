import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useReportAnalysis } from "@/hooks/useReportAnalysis";
import { ExpertAnalysisView } from "./ExpertAnalysisView";

interface ExpertAnalysisProps {
  type: "profile" | "comparison";
  tickers: string[];
  week: string;
}

export function ExpertAnalysis({ type, tickers, week }: ExpertAnalysisProps) {
  const { analysis, analysisJson, isLoading, isError, retry } = useReportAnalysis(
    type,
    tickers,
    week,
  );

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-lg">Análisis del experto</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Interpretación sobre los datos deterministas de la semana — sin fuentes externas
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generando análisis del experto… (puede tardar unos segundos)
          </div>
        )}

        {!isLoading && isError && (
          <div className="flex flex-wrap items-center gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              No se pudo generar el análisis.
            </div>
            <Button size="sm" variant="outline" onClick={retry}>
              Reintentar
            </Button>
          </div>
        )}

        {!isLoading && !isError && (analysisJson || analysis) && (
          <ExpertAnalysisView json={analysisJson} markdown={analysis} />
        )}
      </CardContent>
    </Card>
  );
}