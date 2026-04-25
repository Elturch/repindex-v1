import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen } from "lucide-react";
import { RIX_METRICS_GLOSSARY, getMetricIcon } from "@/lib/rixMetricsGlossary";

export function GlossaryDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 px-2 sm:px-3"
          aria-label="Glosario"
        >
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline">Glosario</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Glosario de Métricas RIX
          </DialogTitle>
          <DialogDescription>
            Definiciones de todas las métricas utilizadas en el análisis reputacional RIX
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 mt-4">
          {RIX_METRICS_GLOSSARY.map((item) => {
            const IconComponent = getMetricIcon(item.acronym);
            return (
              <div key={item.acronym} className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <IconComponent className={`h-4 w-4 ${item.colorClass}`} />
                  <span className="text-lg font-bold text-primary">{item.acronym}</span>
                  <span className="text-sm text-muted-foreground">-</span>
                  <span className="text-sm font-medium">{item.technicalName}</span>
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  → {item.executiveName} {item.inverseScoring && "(puntuación inversa)"}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.executiveDescription}
                </p>
                <div className="text-xs text-muted-foreground/70 italic border-t border-muted pt-2 mt-2">
                  Peso: {Math.round(item.weight * 100)}% del RIX total
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">⚠️ Nota Metodológica</h4>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Las métricas RIX miden <strong>percepción algorítmica</strong>, no reputación tradicional. 
            SIM evalúa jerarquía de fuentes (no sostenibilidad), DRM mide calidad de evidencia 
            (no desempeño financiero), DCM evalúa coherencia entre IAs (no innovación digital).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
