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

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [aiFilter, setAIFilter] = useState<AIFilter>("ChatGPT");
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
    { key: "lns", label: "LNS", scoreKey: "lns_score", categoryKey: "lns_categoria" },
    { key: "es", label: "ES", scoreKey: "es_score", categoryKey: "es_categoria" },
    { key: "sam", label: "SAM", scoreKey: "sam_score", categoryKey: "sam_categoria" },
    { key: "rm", label: "RM", scoreKey: "rm_score", categoryKey: "rm_categoria" },
    { key: "clr", label: "CLR", scoreKey: "clr_score", categoryKey: "clr_categoria" },
    { key: "gip", label: "GIP", scoreKey: "gip_score", categoryKey: "gip_categoria" },
    { key: "kgi", label: "KGI", scoreKey: "kgi_score", categoryKey: "kgi_categoria" },
    { key: "mpi", label: "MPI", scoreKey: "mpi_score", categoryKey: "mpi_categoria" },
  ];

  // Generate week options based on available data
  const weekOptions = useMemo(() => {
    if (!pariRuns) return [];
    
    const weeks = new Set<string>();
    pariRuns.forEach(run => {
      if (run.period_from) {
        const weekStart = startOfWeek(new Date(run.period_from), { weekStartsOn: 1 });
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
        {/* AI Model Selector - Prominent */}
        <div className="flex items-center justify-center">
          <div className="flex items-center bg-muted/50 p-1 rounded-lg">
            <Button
              variant={aiFilter === "ChatGPT" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAIFilter("ChatGPT")}
              className="flex items-center gap-2"
            >
              <Brain className="h-4 w-4" />
              ChatGPT
            </Button>
            <Button
              variant={aiFilter === "PERPLEXITY" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAIFilter("PERPLEXITY")}
              className="flex items-center gap-2"
            >
              <PerplexityIcon className="h-4 w-4" />
              Perplexity
            </Button>
            <Button
              variant={aiFilter === "comparison" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAIFilter("comparison")}
              className="flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Comparación
            </Button>
          </div>
        </div>

        {/* Header with controls */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Índice Reputacional - {aiFilter === "comparison" ? "Comparación" : aiFilter}
            </h1>
            <p className="text-muted-foreground">
              {pariRuns?.length || 0} empresas analizadas
              {(companyFilter !== "all" || weekFilter !== "all") && (
                <span className="ml-2">(con filtros aplicados)</span>
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
                      <TableHead className="w-32">Flags de Calidad</TableHead>
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
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(pariRun.flags) && pariRun.flags.length > 0 ? (
                              pariRun.flags.map((flag, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {flag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin flags</span>
                            )}
                          </div>
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
                        
                        {/* Quality Flags */}
                        <div className="border-t pt-2">
                          <div className="text-xs text-muted-foreground mb-1">Flags de Calidad:</div>
                          <div className="text-sm">
                            {Array.isArray(pariRun.flags) && pariRun.flags.length > 0 ? (
                              pariRun.flags.join(", ")
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