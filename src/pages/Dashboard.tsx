import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { usePariRuns } from "@/hooks/usePariRuns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, List, Grid, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AIFilter } from "@/components/layout/Header";

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [aiFilter, setAIFilter] = useState<AIFilter>("all");
  const navigate = useNavigate();
  const { data: pariRuns, isLoading, error } = usePariRuns(searchQuery, aiFilter);

  const handleRowClick = (pariRunId: string) => {
    navigate(`/pari-run/${pariRunId}`);
  };

  const formatDateRange = (from?: string, to?: string) => {
    if (!from && !to) return "N/A";
    if (!to) return from ? new Date(from).toLocaleDateString() : "N/A";
    if (!from) return to ? new Date(to).toLocaleDateString() : "N/A";
    
    const fromDate = new Date(from).toLocaleDateString();
    const toDate = new Date(to).toLocaleDateString();
    return `${fromDate} - ${toDate}`;
  };

  const getCategoryColor = (categoria?: string) => {
    switch (categoria?.toLowerCase()) {
      case "bueno":
        return "bg-good/10 text-good";
      case "mejorable":
        return "bg-needs-improvement/10 text-needs-improvement";
      case "insuficiente":
        return "bg-insufficient/10 text-insufficient";
      default:
        return "bg-muted/20 text-muted-foreground";
    }
  };

  const metrics = [
    { key: "lns", label: "LNS", scoreKey: "lns_score", categoryKey: "lns_categoria" },
    { key: "es", label: "ES", scoreKey: "es_score", categoryKey: "es_categoria" },
    { key: "sam", label: "SAM", scoreKey: "sam_score", categoryKey: "sam_categoria" },
    { key: "rm", label: "RM", scoreKey: "rm_score", categoryKey: "rm_categoria" },
    { key: "clr", label: "CLR", scoreKey: "clr_score", categoryKey: "clr_categoria" },
    { key: "gip", label: "GIP", scoreKey: "gip_score", categoryKey: "gip_categoria" },
    { key: "kgi", label: "KGI", scoreKey: "kgi_score", categoryKey: "kgi_categoria" },
    { key: "mpi", label: "MPI", scoreKey: "mpi_score", categoryKey: "mpi_categoria" },
  ];

  if (isLoading) {
    return (
      <Layout 
        title="RepIndex - Índice Reputacional IBEX 35" 
        onSearch={setSearchQuery} 
        onAIFilterChange={setAIFilter}
        aiFilter={aiFilter}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout 
      title="RepIndex - Índice Reputacional IBEX 35" 
      onSearch={setSearchQuery} 
      onAIFilterChange={setAIFilter}
      aiFilter={aiFilter}
    >
      <div className="space-y-6">
        {/* Header with controls */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Índice Reputacional</h1>
            <p className="text-muted-foreground">
              {pariRuns?.length || 0} empresas analizadas
              {aiFilter !== "all" && (
                <span className="ml-2">(filtrado por {aiFilter})</span>
              )}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4 mr-2" />
              Lista
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("cards")}
            >
              <Grid className="h-4 w-4 mr-2" />
              Cards
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Error loading PARI runs</span>
            </div>
          </div>
        )}

        {!isLoading && !error && (!pariRuns || pariRuns.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? "No companies found matching your search." : "No reputational data available."}
          </div>
        )}

        {!isLoading && !error && pariRuns && pariRuns.length > 0 && (
          <>
            {viewMode === "list" && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Empresa</TableHead>
                      <TableHead className="text-center">PARI</TableHead>
                      {metrics.map((metric) => (
                        <TableHead key={metric.key} className="text-center w-16">
                          {metric.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-32">Período</TableHead>
                      <TableHead className="w-24">Modelo</TableHead>
                      <TableHead className="w-24">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pariRuns.map((pariRun) => (
                      <TableRow 
                        key={pariRun.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(pariRun.id)}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium">{pariRun.target_name}</div>
                            {pariRun.ticker && (
                              <div className="text-sm text-muted-foreground">{pariRun.ticker}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xl font-bold text-primary">
                              {pariRun.pari_score || 0}
                            </span>
                          </div>
                        </TableCell>
                        {metrics.map((metric) => {
                          const score = (pariRun as any)[metric.scoreKey];
                          const categoria = (pariRun as any)[metric.categoryKey];
                          return (
                            <TableCell key={metric.key} className="text-center">
                              <div className={`px-2 py-1 rounded text-sm font-medium ${getCategoryColor(categoria)}`}>
                                {score || 0}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-sm">
                          {formatDateRange(pariRun.period_from, pariRun.period_to)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {pariRun.model_name || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(pariRun.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {viewMode === "cards" && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pariRuns.map((pariRun) => (
                  <Card 
                    key={pariRun.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleRowClick(pariRun.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{pariRun.target_name}</CardTitle>
                          {pariRun.ticker && (
                            <CardDescription>{pariRun.ticker}</CardDescription>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold text-primary">
                            {pariRun.pari_score || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">PARI Score</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-4 gap-2">
                          {metrics.map((metric) => {
                            const score = (pariRun as any)[metric.scoreKey];
                            const categoria = (pariRun as any)[metric.categoryKey];
                            return (
                              <div key={metric.key} className="text-center">
                                <div className="text-xs text-muted-foreground mb-1">{metric.label}</div>
                                <div className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(categoria)}`}>
                                  {score || 0}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-2">
                          <span>{formatDateRange(pariRun.period_from, pariRun.period_to)}</span>
                          <Badge variant="secondary" className="text-xs">
                            {pariRun.model_name || "N/A"}
                          </Badge>
                        </div>
                        
                        <div className="text-xs text-muted-foreground text-center">
                          {new Date(pariRun.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}