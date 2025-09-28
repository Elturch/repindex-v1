import { AlertTriangle, RefreshCw, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface WeeklyReadingErrorProps {
  reason?: string;
  companyName?: string;
  variant?: "banner" | "card" | "inline";
  className?: string;
}

export function WeeklyReadingError({ 
  reason = "Sin información reciente disponible", 
  companyName,
  variant = "inline",
  className = "" 
}: WeeklyReadingErrorProps) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-destructive mb-2">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-medium">Error en Lectura Semanal</span>
      </div>
      
      <p className="text-sm text-muted-foreground mb-3">
        {reason}. Los datos mostrados pueden estar obsoletos y no reflejan la situación actual reputacional.
      </p>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <span>Próxima actualización: Domingo automático</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="h-3 w-3" />
          <span>Para consultas urgentes, contactar soporte técnico</span>
        </div>
      </div>
    </>
  );

  if (variant === "banner") {
    return (
      <div className={`bg-destructive/10 border border-destructive/20 rounded-lg p-4 ${className}`}>
        {content}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <Card className={`border-destructive/20 ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Datos No Confiables
            {companyName && <span className="text-base font-normal">- {companyName}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            {reason}. La información reputacional está desactualizada.
          </p>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
              <span>Sistema de actualización automática: Cada domingo</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span>Soporte técnico disponible para casos urgentes</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // inline variant
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Datos Obsoletos
      </Badge>
      {reason && (
        <span className="text-xs text-muted-foreground">{reason}</span>
      )}
    </div>
  );
}