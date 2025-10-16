import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen } from "lucide-react";

const glossaryData = [
  {
    acronym: "RIX",
    fullName: "Reputation Index",
    description: "Índice general que mide la reputación de la empresa (antes PARI - Public Attention Reputational Index)."
  },
  {
    acronym: "NVM",
    fullName: "Narrative Value Metric",
    description: "Calidad de la narrativa - Evalúa la coherencia y calidad del discurso público de la empresa según análisis de modelos de lenguaje (antes LNS)."
  },
  {
    acronym: "DRM",
    fullName: "Data Reliability Metric",
    description: "Fortaleza de evidencia - Mide la solidez y verificabilidad de las afirmaciones y datos presentados por la empresa (antes ES)."
  },
  {
    acronym: "SIM",
    fullName: "Source Integrity Metric",
    description: "Autoridad de fuentes - Evalúa la diversidad y credibilidad de las fuentes que mencionan a la empresa (antes SAM)."
  },
  {
    acronym: "RMM",
    fullName: "Reputational Momentum Metric",
    description: "Actualidad y empuje - Mide la relevancia temporal y el impulso de las menciones recientes de la empresa (antes RM)."
  },
  {
    acronym: "CEM",
    fullName: "Controversy Exposure Metric",
    description: "Controversia y riesgo - Evalúa el nivel de controversias y riesgos asociados con la empresa (puntuación inversa, antes CLR)."
  },
  {
    acronym: "GAM",
    fullName: "Governance Autonomy Metric",
    description: "Independencia de gobierno - Mide cómo se percibe la autonomía de la empresa respecto a influencias gubernamentales (antes GIP)."
  },
  {
    acronym: "DCM",
    fullName: "Data Consistency Metric",
    description: "Integridad del grafo de conocimiento - Evalúa la consistencia y coherencia de la información sobre la empresa en diferentes fuentes (antes KGI)."
  },
  {
    acronym: "CXM",
    fullName: "Corporate Execution Metric",
    description: "Ejecución corporativa - Mide la capacidad de ejecución y el impacto percibido de la empresa en el mercado (antes MPI)."
  }
];

export function GlossaryDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2"
        >
          <BookOpen className="h-4 w-4" />
          Glosario
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
          {glossaryData.map((item) => (
            <div key={item.acronym} className="space-y-2 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-primary">{item.acronym}</span>
                <span className="text-sm text-muted-foreground">-</span>
                <span className="text-sm font-medium">{item.fullName}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
