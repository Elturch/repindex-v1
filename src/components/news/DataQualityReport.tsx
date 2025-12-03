import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, XCircle, Info, Database } from "lucide-react";

interface ModelCoverage {
  model: string;
  companies: number;
  status: 'ok' | 'warning' | 'error';
  note?: string;
}

interface DataQualityReportData {
  headline: string;
  summary: string;
  totalCompanies: number;
  modelCoverage: ModelCoverage[];
  issues?: string[];
  recommendations?: string[];
}

interface DataQualityReportProps {
  report: DataQualityReportData;
}

const statusConfig = {
  ok: { 
    icon: CheckCircle, 
    color: 'text-green-600 dark:text-green-400', 
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    badgeVariant: 'default' as const
  },
  warning: { 
    icon: AlertTriangle, 
    color: 'text-amber-600 dark:text-amber-400', 
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    badgeVariant: 'secondary' as const
  },
  error: { 
    icon: XCircle, 
    color: 'text-red-600 dark:text-red-400', 
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    badgeVariant: 'destructive' as const
  }
};

export function DataQualityReport({ report }: DataQualityReportProps) {
  if (!report) return null;

  return (
    <Card className="border-2 border-dashed border-muted-foreground/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg font-serif">{report.headline}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground mt-2">{report.summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model Coverage */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Info className="h-4 w-4" />
            Cobertura por Modelo de IA
          </h4>
          <div className="grid gap-3">
            {report.modelCoverage?.map((model) => {
              const config = statusConfig[model.status] || statusConfig.ok;
              const StatusIcon = config.icon;
              const coverage = (model.companies / report.totalCompanies) * 100;
              
              return (
                <div key={model.model} className={`p-3 rounded-lg ${config.bgColor}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`h-4 w-4 ${config.color}`} />
                      <span className="font-medium text-sm">{model.model}</span>
                    </div>
                    <Badge variant={config.badgeVariant} className="text-xs">
                      {model.companies}/{report.totalCompanies} empresas
                    </Badge>
                  </div>
                  <Progress value={coverage} className="h-2 mb-1" />
                  {model.note && (
                    <p className="text-xs text-muted-foreground mt-1">{model.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Issues */}
        {report.issues && report.issues.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Incidencias Detectadas
            </h4>
            <ul className="text-xs space-y-1 text-muted-foreground">
              {report.issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-500">•</span>
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {report.recommendations && report.recommendations.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Interpretación de los Datos
            </h4>
            <ul className="text-xs space-y-1 text-muted-foreground">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-500">→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}