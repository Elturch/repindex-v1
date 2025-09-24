import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { usePariRuns } from "@/hooks/usePariRuns";
import { useCompanies } from "@/hooks/useCompanies";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, List, Grid, AlertCircle, CalendarIcon, X, Building2, Calendar as CalendarDays, Brain, BarChart3 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AIFilter } from "@/components/layout/Header";
import { format, startOfWeek, addWeeks, subWeeks, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [aiFilter, setAIFilter] = useState<AIFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");
  const navigate = useNavigate();
  
  const { data: pariRuns, isLoading, error } = usePariRuns(searchQuery, aiFilter === "comparison" ? "all" : aiFilter, companyFilter, weekFilter);
  const { data: companies, isLoading: companiesLoading } = useCompanies();

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
    { key: "lns", label: "LNS", scoreKey: "23_lns_score", categoryKey: "25_lns_categoria" },
    { key: "es", label: "ES", scoreKey: "26_es_score", categoryKey: "28_es_categoria" },
    { key: "sam", label: "SAM", scoreKey: "29_sam_score", categoryKey: "31_sam_categoria" },
    { key: "rm", label: "RM", scoreKey: "32_rm_score", categoryKey: "34_rm_categoria" },
    { key: "clr", label: "CLR", scoreKey: "35_clr_score", categoryKey: "37_clr_categoria" },
    { key: "gip", label: "GIP", scoreKey: "38_gip_score", categoryKey: "40_gip_categoria" },
    { key: "kgi", label: "KGI", scoreKey: "41_kgi_score", categoryKey: "43_kgi_categoria" },
    { key: "mpi", label: "MPI", scoreKey: "44_mpi_score", categoryKey: "46_mpi_categoria" },
  ];

  // Generate week options based on available data
  const weekOptions = useMemo(() => {
    if (!pariRuns) return [];
    
    const weeks = new Set<string>();
    pariRuns.forEach(run => {
      if (run["06_period_from"]) {
        const weekStart = startOfWeek(new Date(run["06_period_from"]), { weekStartsOn: 1 });
        weeks.add(format(weekStart, 'yyyy-MM-dd'));
      }
    });
    
    return Array.from(weeks).sort().reverse().map(weekStart => {
      const start = new Date(weekStart);
      const end = addWeeks(start, 1);
      return {
        value: weekStart,
        label: `${format(start, 'dd/MM')} - ${format(addWeeks(start, 1), 'dd/MM/yyyy')}`
      };
    });
  }, [pariRuns]);

  const clearFilters = () => {
    setCompanyFilter("all");
    setWeekFilter("all");
  };

  // Function to normalize flag names to user-friendly format
  const normalizeFlag = (flag: string) => {
    const flagMap: { [key: string]: string } = {
      "datos_antiguos": "Datos Antiguos",
      "dudas_no_aclaradas": "Dudas No Aclaradas",
      "cutoff_disclaimer": "Limitación de Fecha de Corte",
      "low_quality_sources": "Fuentes de Baja Calidad",
      "incomplete_data": "Datos Incompletos",
      "temporal_mismatch": "Desajuste Temporal",
      "insufficient_evidence": "Evidencia Insuficiente",
      "conflicting_sources": "Fuentes Conflictivas",
      "language_barriers": "Barreras de Idioma",
      "regional_bias": "Sesgo Regional"
    };
    
    return flagMap[flag] || flag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (isLoading) {
  return (
    <Layout title="Repindex.ai">
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
      <Layout title="Repindex.ai">
        <div className="space-y-6">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Índice Reputacional - {aiFilter === "comparison" ? "Comparación" : aiFilter === "all" ? "Todos" : aiFilter}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pariRuns?.length || 0} empresas analizadas
            {(companyFilter !== "all" || weekFilter !== "all") && (
              <span className="ml-2">(con filtros aplicados)</span>
            )}
          </p>
        </div>

        {/* Controls - AI Selector and View Mode */}
        <div className="flex items-center justify-between">
          {/* AI Model Selector */}
          <div className="flex items-center bg-muted/50 p-1 rounded-lg">
            <Button
              variant={aiFilter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAIFilter("all")}
              className="flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Todos
            </Button>
            <Button
              variant={aiFilter === "ChatGPT" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAIFilter("ChatGPT")}
              className="flex items-center gap-2"
            >
              <ChatGPTIcon className="h-4 w-4" />
              ChatGPT
            </Button>
            <Button
              variant={aiFilter === "Perplexity" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAIFilter("Perplexity")}
              className="flex items-center gap-2"
            >
              <PerplexityIcon className="h-4 w-4" />
              Perplexity
            </Button>
          </div>

          {/* View Mode Selector */}
          <div className="flex items-center bg-muted/50 p-1 rounded-lg">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="flex items-center gap-2"
            >
              <List className="h-4 w-4" />
              Lista
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className="flex items-center gap-2"
            >
              <Grid className="h-4 w-4" />
              Cards
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filtros:</span>
            
            {/* Company Filter */}
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Seleccionar empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {companies?.map((company) => (
                    <SelectItem key={company.issuer_id} value={company.issuer_name}>
                      {company.issuer_name} ({company.ticker})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Week Filter */}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={weekFilter} onValueChange={setWeekFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Seleccionar semana" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las semanas</SelectItem>
                  {weekOptions.map((week) => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(companyFilter !== "all" || weekFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
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
            {searchQuery || companyFilter !== "all" || weekFilter !== "all" ? "No companies found matching your filters." : 
             aiFilter === "comparison" ? "No data available for comparison view yet." : 
             `No reputational data available for ${aiFilter}.`}
          </div>
        )}

        {!isLoading && !error && pariRuns && pariRuns.length > 0 && aiFilter !== "comparison" && (
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
                      <TableHead className="w-32">Ibex Family Code</TableHead>
                      <TableHead className="w-32">Sector Category</TableHead>
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
                            <div className="font-medium">{pariRun["03_target_name"] || "Sin nombre"}</div>
                            {(pariRun.repindex_root_issuers?.ticker || pariRun["05_ticker"]) && (
                              <div className="text-sm text-muted-foreground">
                                {pariRun.repindex_root_issuers?.ticker || pariRun["05_ticker"]}
                              </div>
                            )}
                            {!pariRun["03_target_name"] && pariRun["01_run_id"] && (
                              <div className="text-xs text-muted-foreground">ID: {pariRun["01_run_id"]}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xl font-bold text-primary">
                              {pariRun["09_pari_score"] || 0}
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
                          {pariRun.repindex_root_issuers?.ibex_family_code || "N/A"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {pariRun.repindex_root_issuers?.sector_category || "N/A"}
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
                          <CardTitle className="text-lg">{pariRun["03_target_name"] || "Sin nombre"}</CardTitle>
                          {(pariRun.repindex_root_issuers?.ticker || pariRun["05_ticker"]) && (
                            <CardDescription>
                              {pariRun.repindex_root_issuers?.ticker || pariRun["05_ticker"]}
                            </CardDescription>
                          )}
                          {!pariRun["03_target_name"] && pariRun["01_run_id"] && (
                            <CardDescription className="text-xs">ID: {pariRun["01_run_id"]}</CardDescription>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold text-primary">
                            {pariRun["09_pari_score"] || 0}
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
                        
                        {/* Company Info */}
                        <div className="border-t pt-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">IBEX Family:</span>
                            <span>{pariRun.repindex_root_issuers?.ibex_family_code || "N/A"}</span>
                          </div>
                          <div className="flex justify-between text-xs mb-2">
                            <span className="text-muted-foreground">Sector:</span>
                            <span>{pariRun.repindex_root_issuers?.sector_category || "N/A"}</span>
                          </div>
                        </div>
                        
                        {/* Quality Flags */}
                        <div className="border-t pt-2">
                          <div className="text-xs text-muted-foreground mb-1">Flags de Calidad:</div>
                          <div className="text-sm">
                            {Array.isArray(pariRun["17_flags"]) && pariRun["17_flags"].length > 0 ? (
                              pariRun["17_flags"].map(flag => normalizeFlag(flag)).join(", ")
                            ) : (
                              <span className="text-muted-foreground">Sin flags</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Comparison View - Coming Soon */}
        {!isLoading && !error && aiFilter === "comparison" && (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto space-y-4">
              <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto" />
              <h3 className="text-2xl font-semibold">Vista de Comparación</h3>
              <p className="text-muted-foreground">
                La vista de comparación entre ChatGPT y Perplexity estará disponible próximamente. 
                Esta funcionalidad permitirá ver los resultados de ambos modelos lado a lado.
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}