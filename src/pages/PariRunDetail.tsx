import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { usePariRun } from "@/hooks/usePariRuns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/ui/metric-card";
import { StatsPanel } from "@/components/ui/stats-panel";
import { AlertCircle, CheckCircle, ArrowLeft, BookOpen } from "lucide-react";

export function PariRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pariRun, isLoading, error } = usePariRun(id!);

  const formatDateRange = (from?: string, to?: string) => {
    if (!from && !to) return "N/A";
    if (!to) return from ? new Date(from).toLocaleDateString() : "N/A";
    if (!from) return to ? new Date(to).toLocaleDateString() : "N/A";
    
    const fromDate = new Date(from).toLocaleDateString();
    const toDate = new Date(to).toLocaleDateString();
    return `${fromDate} - ${toDate}`;
  };

  if (isLoading) {
    return (
      <Layout title="RepIndex - Detalle">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !pariRun) {
    return (
      <Layout title="RepIndex - Detalle">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Error loading company details</span>
          </div>
        </div>
      </Layout>
    );
  }

  const metrics = [
    { key: 'pari', label: 'PARI', score: pariRun.pari_score, peso: 100, categoria: pariRun.pari_score >= 70 ? 'Bueno' : pariRun.pari_score >= 40 ? 'Mejorable' : 'Insuficiente' },
    { key: 'lns', label: 'LNS', score: pariRun.lns_score, peso: pariRun.lns_peso, categoria: pariRun.lns_categoria },
    { key: 'es', label: 'ES', score: pariRun.es_score, peso: pariRun.es_peso, categoria: pariRun.es_categoria },
    { key: 'sam', label: 'SAM', score: pariRun.sam_score, peso: pariRun.sam_peso, categoria: pariRun.sam_categoria },
    { key: 'rm', label: 'RM', score: pariRun.rm_score, peso: pariRun.rm_peso, categoria: pariRun.rm_categoria },
    { key: 'clr', label: 'CLR', score: pariRun.clr_score, peso: pariRun.clr_peso, categoria: pariRun.clr_categoria },
    { key: 'gip', label: 'GIP', score: pariRun.gip_score, peso: pariRun.gip_peso, categoria: pariRun.gip_categoria },
    { key: 'kgi', label: 'KGI', score: pariRun.kgi_score, peso: pariRun.kgi_peso, categoria: pariRun.kgi_categoria },
    { key: 'mpi', label: 'MPI', score: pariRun.mpi_score, peso: pariRun.mpi_peso, categoria: pariRun.mpi_categoria },
  ];

  // Extract flags from JSONB
  const flags = Array.isArray(pariRun.flags) ? pariRun.flags : [];

  // Parse puntos_clave if it's an array
  const puntosClave = Array.isArray(pariRun.puntos_clave) ? pariRun.puntos_clave : [];

  // Glossary definitions
  const glossary = [
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

  return (
    <Layout title="RepIndex - Detalle">
      <div className="space-y-6">
        {/* Back Button */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Dashboard
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {pariRun.target_name}
              {pariRun.ticker && (
                <span className="text-xl text-muted-foreground ml-2">({pariRun.ticker})</span>
              )}
            </h1>
            <p className="text-muted-foreground">
              {formatDateRange(pariRun.period_from, pariRun.period_to)}
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold text-primary">
              {pariRun.pari_score || 0}
            </div>
            <div className="text-lg text-muted-foreground">PARI Score</div>
          </div>
        </div>

        {/* Model and basic info */}
        <div className="flex gap-4">
          <Badge variant="secondary" className="text-sm">
            {pariRun.model_name || "N/A"}
          </Badge>
          <Badge variant="outline" className="text-sm">
            {pariRun.target_type || "N/A"}
          </Badge>
        </div>

        {/* Metrics Grid with Color Coding */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => {
            // Determine color class based on categoria
            let colorClass = "";
            let bgClass = "";
            if (metric.categoria === "Bueno") {
              colorClass = "text-good";
              bgClass = "bg-good/10 border-good/20";
            } else if (metric.categoria === "Mejorable") {
              colorClass = "text-needs-improvement";
              bgClass = "bg-needs-improvement/10 border-needs-improvement/20";
            } else if (metric.categoria === "Insuficiente") {
              colorClass = "text-insufficient";
              bgClass = "bg-insufficient/10 border-insufficient/20";
            }

            return (
              <Card key={metric.key} className={`${bgClass} transition-colors`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className={`text-2xl font-bold ${colorClass}`}>
                      {metric.score || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Peso: {metric.peso || 0}%
                    </div>
                    {metric.categoria && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${colorClass} border-current`}
                      >
                        {metric.categoria}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Statistics Panel */}
        <StatsPanel
          palabras={pariRun.palabras || 0}
          numFechas={pariRun.num_fechas || 0}
          numCitas={pariRun.num_citas || 0}
          temporalAlignment={pariRun.temporal_alignment || 0}
          citationDensity={pariRun.citation_density || 0}
          flags={flags}
        />

        {/* Summary */}
        {pariRun.resumen && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Resumen Ejecutivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground">{pariRun.resumen}</p>
            </CardContent>
          </Card>
        )}

        {/* Key Points */}
        {puntosClave.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Puntos Clave
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {puntosClave.map((punto, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                    <span className="text-sm leading-relaxed text-foreground">{punto}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Glossary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Glosario de Métricas PARI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
              {glossary.map((item) => (
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
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}