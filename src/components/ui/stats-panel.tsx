import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatsPanelProps {
  palabras?: number;
  numFechas?: number;
  numCitas?: number;
  temporalAlignment?: number;
  citationDensity?: number;
  flags?: string[];
}

export function StatsPanel({
  palabras,
  numFechas,
  numCitas,
  temporalAlignment,
  citationDensity,
  flags = []
}: StatsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Métricas de Análisis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Métricas de Análisis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Palabras analizadas</span>
            <span className="font-medium">{palabras?.toLocaleString() || "—"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Fechas detectadas</span>
            <span className="font-medium">{numFechas || "—"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Citas encontradas</span>
            <span className="font-medium">{numCitas || "—"}</span>
          </div>
          {temporalAlignment !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Alineación temporal</span>
              <span className="font-medium">{(temporalAlignment * 100).toFixed(1)}%</span>
            </div>
          )}
          {citationDensity !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Densidad de citas</span>
              <span className="font-medium">{(citationDensity * 100).toFixed(1)}%</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flags de Calidad */}
      {flags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flags de Calidad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {flags.map((flag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {flag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}