import React from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { usePariRun } from "@/hooks/usePariRuns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

export function PariRunDetail() {
  const { id } = useParams<{ id: string }>();
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
    { key: 'lns', label: 'LNS', score: pariRun.lns_score, peso: pariRun.lns_peso, categoria: pariRun.lns_categoria },
    { key: 'es', label: 'ES', score: pariRun.es_score, peso: pariRun.es_peso, categoria: pariRun.es_categoria },
    { key: 'sam', label: 'SAM', score: pariRun.sam_score, peso: pariRun.sam_peso, categoria: pariRun.sam_categoria },
    { key: 'rm', label: 'RM', score: pariRun.rm_score, peso: pariRun.rm_peso, categoria: pariRun.rm_categoria },
    { key: 'clr', label: 'CLR', score: pariRun.clr_score, peso: pariRun.clr_peso, categoria: pariRun.clr_categoria },
    { key: 'gip', label: 'GIP', score: pariRun.gip_score, peso: pariRun.gip_peso, categoria: pariRun.gip_categoria },
    { key: 'kgi', label: 'KGI', score: pariRun.kgi_score, peso: pariRun.kgi_peso, categoria: pariRun.kgi_categoria },
    { key: 'mpi', label: 'MPI', score: pariRun.mpi_score, peso: pariRun.mpi_peso, categoria: pariRun.mpi_categoria },
  ];

  return (
    <Layout title="RepIndex - Detalle">
      <div className="space-y-6">
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

        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-2xl font-bold">
                    {metric.score || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Peso: {metric.peso || 0}%
                  </div>
                  {metric.categoria && (
                    <Badge variant="outline" className="text-xs">
                      {metric.categoria}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary and Key Points */}
        {pariRun.resumen && (
          <Card>
            <CardHeader>
              <CardTitle>Resumen Ejecutivo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{pariRun.resumen}</p>
            </CardContent>
          </Card>
        )}

        {pariRun.puntos_clave && (
          <Card>
            <CardHeader>
              <CardTitle>Puntos Clave</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {typeof pariRun.puntos_clave === 'string' 
                  ? pariRun.puntos_clave
                  : JSON.stringify(pariRun.puntos_clave, null, 2)
                }
              </div>
            </CardContent>
          </Card>
        )}

        {/* Statistics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Palabras</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pariRun.palabras || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Fechas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pariRun.num_fechas || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Citas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pariRun.num_citas || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Alineación Temporal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {pariRun.temporal_alignment ? (pariRun.temporal_alignment * 100).toFixed(1) + '%' : '0%'}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Densidad de Citas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {pariRun.citation_density ? (pariRun.citation_density * 100).toFixed(1) + '%' : '0%'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}