import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen } from "lucide-react";

const glossaryData = [
  {
    acronym: "PARI",
    fullName: "Public Attention Reputational Index",
    description: "Índice general que mide la atención pública y reputación de la empresa basado en la combinación ponderada de todas las métricas."
  },
  {
    acronym: "LNS",
    fullName: "LLM Narrative Score",
    description: "Calidad de la narrativa - Evalúa la coherencia y calidad del discurso público de la empresa según análisis de modelos de lenguaje."
  },
  {
    acronym: "ES",
    fullName: "Evidence Strength",
    description: "Fortaleza de evidencia - Mide la solidez y verificabilidad de las afirmaciones y datos presentados por la empresa."
  },
  {
    acronym: "SAM",
    fullName: "Source Authority Mix",
    description: "Mezcla de autoridad de fuentes - Evalúa la diversidad y credibilidad de las fuentes que mencionan a la empresa."
  },
  {
    acronym: "RM",
    fullName: "Recency & Momentum",
    description: "Actualidad y empuje - Mide la relevancia temporal y el impulso de las menciones recientes de la empresa."
  },
  {
    acronym: "CLR",
    fullName: "Controversy & Legal Risk",
    description: "Controversia y riesgo legal - Evalúa el nivel de controversias y riesgos legales asociados con la empresa (puntuación inversa)."
  },
  {
    acronym: "GIP",
    fullName: "Governance Independence Perception",
    description: "Percepción de independencia de gobierno - Mide cómo se percibe la independencia de la empresa respecto a influencias gubernamentales."
  },
  {
    acronym: "KGI",
    fullName: "Knowledge Graph Integrity",
    description: "Integridad del grafo de conocimiento - Evalúa la consistencia y coherencia de la información sobre la empresa en diferentes fuentes."
  },
  {
    acronym: "MPI",
    fullName: "Market/Performance Impact",
    description: "Impacto de mercado/ejecución - Mide el impacto percibido de la empresa en el mercado y su capacidad de ejecución."
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
            Glosario de Métricas PARI
          </DialogTitle>
          <DialogDescription>
            Definiciones de todas las métricas utilizadas en el análisis reputacional PARI
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