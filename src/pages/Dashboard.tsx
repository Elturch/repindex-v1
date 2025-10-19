import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useRixRuns } from "@/hooks/useRixRuns";
import { useCompanies } from "@/hooks/useCompanies";
import { useSectorCategories } from "@/hooks/useSectorCategories";
import { useIbexFamilyCategories } from "@/hooks/useIbexFamilyCategories";
import ConsolidationAnalysis from "@/components/ConsolidationAnalysis";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, List, Grid, AlertCircle, CalendarIcon, X, Building2, Calendar as CalendarDays, Brain, BarChart3, Factory, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AIFilter } from "@/components/layout/Header";
import { format, startOfWeek, addDays } from "date-fns";
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { cn } from "@/lib/utils";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { WeeklyReadingError } from "@/components/ui/weekly-reading-error";

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [aiFilter, setAIFilter] = useState<AIFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [ibexFamilyFilter, setIbexFamilyFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const navigate = useNavigate();
  
  const { data: rixRuns, isLoading, error } = useRixRuns(searchQuery, aiFilter === "comparison" ? "all" : aiFilter, companyFilter, weekFilter, sectorFilter, ibexFamilyFilter);
  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: sectorCategories, isLoading: sectorsLoading } = useSectorCategories();
  const { data: ibexFamilyCategories, isLoading: ibexLoading } = useIbexFamilyCategories();

  const handleRowClick = (rixRunId: string) => {
    navigate(`/rix-run/${rixRunId}`);
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
    { key: "nvm", label: "NVM", scoreKey: "23_nvm_score", categoryKey: "25_nvm_categoria" },
    { key: "drm", label: "DRM", scoreKey: "26_drm_score", categoryKey: "28_drm_categoria" },
    { key: "sim", label: "SIM", scoreKey: "29_sim_score", categoryKey: "31_sim_categoria" },
    { key: "rmm", label: "RMM", scoreKey: "32_rmm_score", categoryKey: "34_rmm_categoria" },
    { key: "cem", label: "CEM", scoreKey: "35_cem_score", categoryKey: "37_cem_categoria" },
    { key: "gam", label: "GAM", scoreKey: "38_gam_score", categoryKey: "40_gam_categoria" },
    { key: "dcm", label: "DCM", scoreKey: "41_dcm_score", categoryKey: "43_dcm_categoria" },
    { key: "cxm", label: "CXM", scoreKey: "44_cxm_score", categoryKey: "46_cxm_categoria" },
  ];

  // Generate week options based on available data (using Madrid timezone)
  const weekOptions = useMemo(() => {
    if (!rixRuns) return [];
    
    const MADRID_TZ = 'Europe/Madrid';
    const weeks = new Map<string, Date>();
    
    rixRuns.forEach(run => {
      // Convert UTC created_at to Madrid timezone
      const createdDateUTC = new Date(run.created_at);
      let createdDateMadrid = toZonedTime(createdDateUTC, MADRID_TZ);
      
      // If execution is Sunday before 6 AM, treat it as Saturday (previous day)
      // This ensures analyses running after midnight Saturday belong to that week
      if (createdDateMadrid.getDay() === 0 && createdDateMadrid.getHours() < 6) {
        createdDateMadrid = addDays(createdDateMadrid, -1); // Move back to Saturday
      }
      
      // Get the week start (Sunday) in Madrid timezone based on adjusted date
      const weekStartMadrid = startOfWeek(createdDateMadrid, { weekStartsOn: 0 }); // 0 = Sunday
      const weekKey = format(weekStartMadrid, 'yyyy-MM-dd');
      
      if (!weeks.has(weekKey)) {
        weeks.set(weekKey, weekStartMadrid);
      }
    });
    
    return Array.from(weeks.entries())
      .sort((a, b) => b[0].localeCompare(a[0])) // Sort descending (most recent first)
      .map(([key, weekStart]) => {
        const weekEnd = addDays(weekStart, 6); // Saturday
        return {
          value: key,
          label: `${format(weekStart, 'dd/MM/yyyy')} - ${format(weekEnd, 'dd/MM/yyyy')}`
        };
      });
  }, [rixRuns]);

  // Generate batch options based on available data
  const batchOptions = useMemo(() => {
    if (!rixRuns) return [];
    
    const batches = new Map<number, string>();
    rixRuns.forEach(run => {
      if (run.batchNumber && run.batchLabel) {
        batches.set(run.batchNumber, run.batchLabel);
      }
    });
    
    return Array.from(batches.entries())
      .sort((a, b) => a[0] - b[0]) // Sort by batch number
      .map(([num, label]) => ({ value: num.toString(), label }));
  }, [rixRuns]);

  const clearFilters = () => {
    setCompanyFilter("all");
    setWeekFilter("all");
    setSectorFilter("all");
    setIbexFamilyFilter("all");
    setBatchFilter("all");
  };

  // Sort RIX runs to move invalid data to the end and apply batch filter
  const sortedRixRuns = useMemo(() => {
    if (!rixRuns) return [];
    
    let filteredByBatch = rixRuns;
    if (batchFilter && batchFilter !== "all") {
      filteredByBatch = rixRuns.filter(run => 
        run.batchNumber?.toString() === batchFilter
      );
    }
    
    return [...filteredByBatch].sort((a, b) => {
      // If one has invalid data and the other doesn't, move invalid to end
      if (a.isDataInvalid && !b.isDataInvalid) return 1;
      if (!a.isDataInvalid && b.isDataInvalid) return -1;
      return 0; // Keep original order for same validity status
    });
  }, [rixRuns, batchFilter]);

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

  // Helper function to get AI model information
  const getModelInfo = (modelName: string) => {
    const normalizedModel = modelName?.toLowerCase() || '';
    
    if (normalizedModel.includes('chatgpt') || normalizedModel.includes('gpt')) {
      return {
        name: 'ChatGPT',
        abbreviation: 'GPT',
        icon: ChatGPTIcon,
        colorClass: 'text-emerald-600 dark:text-emerald-400'
      };
    } else if (normalizedModel.includes('gemini')) {
      return {
        name: 'Google Gemini',
        abbreviation: 'GMN',
        icon: GeminiIcon,
        colorClass: 'text-[hsl(var(--gemini))]'
      };
    } else if (normalizedModel.includes('perplexity')) {
      return {
        name: 'Perplexity', 
        abbreviation: 'PPX',
        icon: PerplexityIcon,
        colorClass: 'text-blue-600 dark:text-blue-400'
      };
    } else if (normalizedModel.includes('deepseek')) {
      return {
        name: 'Deepseek',
        abbreviation: 'DSK',
        icon: DeepseekIcon,
        colorClass: 'text-[hsl(var(--deepseek))]'
      };
    }
    
    return {
      name: 'Desconocido',
      abbreviation: 'N/A',
      icon: Brain,
      colorClass: 'text-muted-foreground'
    };
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
            {rixRuns?.length || 0} resultados analizados
            {(companyFilter !== "all" || weekFilter !== "all" || sectorFilter !== "all" || ibexFamilyFilter !== "all" || batchFilter !== "all") && (
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
              variant={aiFilter === "Google Gemini" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAIFilter("Google Gemini")}
              className="flex items-center gap-2"
            >
              <GeminiIcon className="h-4 w-4" />
              Google Gemini
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
            <Button
              variant={aiFilter === "Deepseek" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAIFilter("Deepseek")}
              className="flex items-center gap-2"
            >
              <DeepseekIcon className="h-4 w-4" />
              Deepseek
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
                <SelectContent className="bg-background border z-50">
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
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">Todas las semanas</SelectItem>
                  {weekOptions.map((week) => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sector Filter */}
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-muted-foreground" />
              <Select value={sectorFilter} onValueChange={setSectorFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Seleccionar sector" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">Todos los sectores</SelectItem>
                  {sectorCategories?.map((sector) => (
                    <SelectItem key={sector.sector_category} value={sector.sector_category}>
                      {sector.sector_category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ibex Family Filter */}
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <Select value={ibexFamilyFilter} onValueChange={setIbexFamilyFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Seleccionar IBEX Family" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">Todas las familias IBEX</SelectItem>
                  {ibexFamilyCategories?.map((ibex) => (
                    <SelectItem key={ibex.ibex_family_code} value={ibex.ibex_family_code}>
                      {ibex.ibex_family_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Batch Filter */}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Seleccionar consulta" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">Todas las consultas</SelectItem>
                  {batchOptions.map((batch) => (
                    <SelectItem key={batch.value} value={batch.value}>
                      {batch.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(companyFilter !== "all" || weekFilter !== "all" || sectorFilter !== "all" || ibexFamilyFilter !== "all" || batchFilter !== "all") && (
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
              <span>Error loading RIX runs</span>
            </div>
          </div>
        )}

        {!isLoading && !error && (!rixRuns || rixRuns.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery || companyFilter !== "all" || weekFilter !== "all" || sectorFilter !== "all" || ibexFamilyFilter !== "all" ? "No companies found matching your filters." : 
             aiFilter === "comparison" ? "No data available for comparison view yet." : 
             `No reputational data available for ${aiFilter}.`}
          </div>
        )}

        {!isLoading && !error && rixRuns && rixRuns.length > 0 && aiFilter !== "comparison" && (
          <>
            {viewMode === "list" && (
              <div className="rounded-md border overflow-x-auto shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Empresa</TableHead>
                      <TableHead className="text-center w-24">Consulta</TableHead>
                      {aiFilter === "all" && (
                        <TableHead className="text-center w-24">Modelo IA</TableHead>
                      )}
                      <TableHead className="text-center">RIX</TableHead>
                      {metrics.map((metric) => (
                        <TableHead key={metric.key} className="text-center w-16">
                          {metric.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-40">Ibex Family Code</TableHead>
                      <TableHead className="min-w-48">Sector Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRixRuns.map((rixRun) => (
                      <TableRow
                        key={rixRun.id}
                        className="cursor-pointer hover:bg-muted/50 hover:shadow-subtle transition-all"
                        onClick={() => handleRowClick(rixRun.id)}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{rixRun["03_target_name"] || "Sin nombre"}</div>
                            {(rixRun.repindex_root_issuers?.ticker || rixRun["05_ticker"]) && (
                              <div className="text-xs text-muted-foreground">
                                {rixRun.repindex_root_issuers?.ticker || rixRun["05_ticker"]}
                              </div>
                            )}
                            {!rixRun["03_target_name"] && rixRun["01_run_id"] && (
                              <div className="text-[10px] text-muted-foreground">ID: {rixRun["01_run_id"]}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {rixRun.batchNumber ? (
                            <Badge variant="outline">
                              #{rixRun.batchNumber}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        {aiFilter === "all" && (
                          <TableCell className="text-center">
                            {(() => {
                              const modelInfo = getModelInfo(rixRun["02_model_name"] || '');
                              const ModelIcon = modelInfo.icon;
                              return (
                                <div className="flex items-center justify-center gap-1">
                                  <ModelIcon className={cn("h-4 w-4", modelInfo.colorClass)} />
                                  <span className={cn("text-xs font-medium", modelInfo.colorClass)}>
                                    {modelInfo.name}
                                  </span>
                                </div>
                              );
                            })()}
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                          {rixRun.isDataInvalid ? (
                            <div className="flex items-center justify-center gap-1">
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                              <span className="text-sm text-destructive font-medium">
                                Datos Obsoletos
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center">
                              <span className="text-lg font-bold text-primary">
                                {rixRun.displayRixScore ?? rixRun["09_rix_score"] ?? 0}
                              </span>
                              {rixRun["52_cxm_excluded"] && (
                                <span className="text-[9px] text-muted-foreground italic">
                                  (sin CXM)
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        {metrics.map((metric) => {
                          const score = (rixRun as any)[metric.scoreKey];
                          const categoria = (rixRun as any)[metric.categoryKey];
                          const isInvalid = rixRun.isDataInvalid;
                          
                          return (
                            <TableCell key={metric.key} className="text-center">
                              <div className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                isInvalid ? 'bg-muted/20 text-muted-foreground' : getCategoryColor(categoria)
                              }`}>
                                {score || 0}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-xs">
                          {rixRun.repindex_root_issuers?.ibex_family_code || "N/A"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-normal">
                          {rixRun.repindex_root_issuers?.sector_category || "N/A"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {viewMode === "cards" && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sortedRixRuns.map((rixRun) => (
                  <Card 
                    key={rixRun.id} 
                    className="cursor-pointer shadow-soft hover:shadow-medium border-border/50 transition-all duration-200 hover:-translate-y-0.5"
                    onClick={() => handleRowClick(rixRun.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{rixRun["03_target_name"] || "Sin nombre"}</CardTitle>
                          {(rixRun.repindex_root_issuers?.ticker || rixRun["05_ticker"]) && (
                            <CardDescription>
                              {rixRun.repindex_root_issuers?.ticker || rixRun["05_ticker"]}
                            </CardDescription>
                          )}
                          {!rixRun["03_target_name"] && rixRun["01_run_id"] && (
                            <CardDescription className="text-xs">ID: {rixRun["01_run_id"]}</CardDescription>
                          )}
                        </div>
                        <div className="text-right relative">
                           {/* AI Model Badge for "all" view */}
                           {aiFilter === "all" && (
                             <div className="mb-2">
                               {(() => {
                                 const modelInfo = getModelInfo(rixRun["02_model_name"] || '');
                                 const ModelIcon = modelInfo.icon;
                                 return (
                                   <Badge variant="outline" className={cn("text-xs px-2 py-1", modelInfo.colorClass)}>
                                     <ModelIcon className="h-3 w-3 mr-1" />
                                     {modelInfo.abbreviation}
                                   </Badge>
                                 );
                               })()}
                             </div>
                           )}
                           
                            {rixRun.isDataInvalid ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1 text-destructive">
                                  <AlertTriangle className="h-4 w-4" />
                                  <span className="text-sm font-medium">Obsoleto</span>
                                </div>
                                <div className="text-xs text-muted-foreground">Sin datos recientes</div>
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-col items-center">
                                  <div className="text-3xl font-bold text-primary">
                                    {rixRun.displayRixScore ?? rixRun["09_rix_score"] ?? 0}
                                  </div>
                                  <div className="text-sm text-muted-foreground">RIX Score</div>
                                  {rixRun["52_cxm_excluded"] && (
                                    <div className="text-xs text-muted-foreground italic mt-1">
                                      (CXM no aplicable)
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                         </div>
                      </div>
                    </CardHeader>
                     <CardContent className="pt-0">
                       {rixRun.isDataInvalid ? (
                         <WeeklyReadingError 
                           reason={rixRun.dataInvalidReason}
                           variant="banner"
                           className="text-center"
                         />
                       ) : (
                         <div className="space-y-3">
                           {/* Metrics Grid */}
                           <div className="grid grid-cols-4 gap-2">
                             {metrics.map((metric) => {
                               const score = (rixRun as any)[metric.scoreKey];
                               const categoria = (rixRun as any)[metric.categoryKey];
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
                               <span>{rixRun.repindex_root_issuers?.ibex_family_code || "N/A"}</span>
                             </div>
                             <div className="flex justify-between text-xs mb-2">
                               <span className="text-muted-foreground">Sector:</span>
                               <span>{rixRun.repindex_root_issuers?.sector_category || "N/A"}</span>
                             </div>
                           </div>
                           
                           {/* Quality Flags */}
                           <div className="border-t pt-2">
                             <div className="text-xs text-muted-foreground mb-1">Flags de Calidad:</div>
                             <div className="flex flex-wrap gap-1">
                               {(() => {
                                 // Parse flags - handle both strings and arrays
                                 const flagsData = rixRun["17_flags"];
                                 const flags = !flagsData ? [] : 
                                              Array.isArray(flagsData) ? flagsData : 
                                              typeof flagsData === 'string' ? [flagsData] : [];
                                 
                                 return flags.length > 0 ? (
                                   flags.map((flag, index) => (
                                     <Badge key={index} variant="outline" className="text-xs">
                                       {normalizeFlag(flag)}
                                     </Badge>
                                   ))
                                 ) : (
                                   <span className="text-xs text-muted-foreground">Sin flags</span>
                                 );
                               })()}
                             </div>
                           </div>
                         </div>
                       )}
                     </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Comparison View - AI Consolidation Analysis */}
        {!isLoading && !error && aiFilter === "comparison" && (
          <ConsolidationAnalysis />
        )}
      </div>
    </Layout>
  );
}