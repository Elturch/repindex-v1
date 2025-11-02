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
import { Search, List, Grid, AlertCircle, CalendarIcon, X, Building2, Calendar as CalendarDays, Brain, BarChart3, Factory, AlertTriangle, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AIFilter } from "@/components/layout/Header";
import { format, addDays } from "date-fns";
import { toZonedTime } from 'date-fns-tz';
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
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [ibexFamilyFilter, setIbexFamilyFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all"); // Changed to "all" to show trends
  const navigate = useNavigate();
  
  const { data: rixRuns, isLoading, error } = useRixRuns(searchQuery, aiFilter === "comparison" ? "all" : aiFilter, companyFilter, sectorFilter, ibexFamilyFilter);
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

  // Generate batch options based on available data (most recent first)
  // Include status indicator (✓ complete / ⏳ in progress)
  const batchOptions = useMemo(() => {
    if (!rixRuns) return [];
    
    const batchGroups = new Map<number, { 
      label: string; 
      date: Date; 
      count: number; 
      companies: Set<string> 
    }>();
    
    rixRuns.forEach(run => {
      if (run.batchNumber && run.batchLabel && run.batch_execution_date) {
        if (!batchGroups.has(run.batchNumber)) {
          batchGroups.set(run.batchNumber, {
            label: run.batchLabel,
            date: new Date(run.batch_execution_date),
            count: 0,
            companies: new Set()
          });
        }
        const group = batchGroups.get(run.batchNumber)!;
        group.count++;
        if (run["05_ticker"]) {
          group.companies.add(run["05_ticker"]);
        }
      }
    });
    
    return Array.from(batchGroups.entries())
      .sort((a, b) => b[0] - a[0]) // Sort by batch number descending (most recent first)
      .map(([num, info]) => {
        // A batch is complete if it has >= 150 unique companies
        const isComplete = info.companies.size >= 150;
        const statusIcon = isComplete ? '✓' : '⏳';
        const subLabel = isComplete 
          ? `${info.companies.size} empresas`
          : `${info.companies.size}/153 empresas (en progreso)`;
        
        return {
          value: num.toString(),
          label: `${info.label} ${statusIcon}`,
          subLabel,
          isComplete
        };
      });
  }, [rixRuns]);

  // Auto-select the most recent COMPLETE batch when data is available
  React.useEffect(() => {
    if (batchOptions.length > 0 && batchFilter === "all") {
      // Find the most recent complete batch (isComplete = true)
      const latestCompleteBatch = batchOptions.find(opt => opt.isComplete);
      
      if (latestCompleteBatch) {
        console.log('🎯 Auto-selecting most recent complete batch:', latestCompleteBatch.value);
        setBatchFilter(latestCompleteBatch.value);
      } else {
        // If no complete batches, select the most recent one anyway
        console.log('⚠️  No complete batches found, selecting most recent:', batchOptions[0].value);
        setBatchFilter(batchOptions[0].value);
      }
    }
  }, [batchOptions, batchFilter]);

  const clearFilters = () => {
    setCompanyFilter("all");
    setSectorFilter("all");
    setIbexFamilyFilter("all");
    setBatchFilter("all");
  };

  // Sort RIX runs to move invalid data to the end and apply batch filter
  const sortedRixRuns = useMemo(() => {
    if (!rixRuns) return [];
    
    console.log('🔍 BATCH FILTER:', {
      batchFilter,
      totalRixRuns: rixRuns.length,
      batchNumbers: [...new Set(rixRuns.map(r => r.batchNumber))].sort((a, b) => (b || 0) - (a || 0))
    });
    
    let filteredByBatch = rixRuns;
    if (batchFilter && batchFilter !== "all") {
      filteredByBatch = rixRuns.filter(run => 
        run.batchNumber?.toString() === batchFilter
      );
      console.log('🔍 AFTER FILTER:', {
        batchFilter,
        filteredCount: filteredByBatch.length,
        sampleTickers: filteredByBatch.slice(0, 5).map(r => `${r["05_ticker"]}-${r.batchNumber}`)
      });
    }
    
    return [...filteredByBatch].sort((a, b) => {
      // If one has invalid data and the other doesn't, move invalid to end
      if (a.isDataInvalid && !b.isDataInvalid) return 1;
      if (!a.isDataInvalid && b.isDataInvalid) return -1;
      
      // For same validity status, prioritize more recent batch_execution_date
      if (batchFilter === "all" && a.batch_execution_date && b.batch_execution_date) {
        return new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime();
      }
      
      return 0; // Keep original order
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
            {(companyFilter !== "all" || sectorFilter !== "all" || ibexFamilyFilter !== "all" || batchFilter !== "all") && (
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-48 justify-between">
                    {companyFilter === "all" ? "Todas las empresas" : companies?.find(c => c.issuer_name === companyFilter)?.issuer_name || "Seleccionar..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar empresa..." />
                    <CommandList>
                      <CommandEmpty>No se encontró empresa.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="all" onSelect={() => setCompanyFilter("all")}>
                          <Check className={cn("mr-2 h-4 w-4", companyFilter === "all" ? "opacity-100" : "opacity-0")} />
                          Todas las empresas
                        </CommandItem>
                        {companies?.map((company) => (
                          <CommandItem key={company.issuer_id} value={company.issuer_name} onSelect={(value) => setCompanyFilter(value)}>
                            <Check className={cn("mr-2 h-4 w-4", companyFilter === company.issuer_name ? "opacity-100" : "opacity-0")} />
                            {company.issuer_name} ({company.ticker})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Sector Filter */}
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-muted-foreground" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-48 justify-between">
                    {sectorFilter === "all" ? "Todos los sectores" : sectorFilter}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar sector..." />
                    <CommandList>
                      <CommandEmpty>No se encontró sector.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="all" onSelect={() => setSectorFilter("all")}>
                          <Check className={cn("mr-2 h-4 w-4", sectorFilter === "all" ? "opacity-100" : "opacity-0")} />
                          Todos los sectores
                        </CommandItem>
                        {sectorCategories?.map((sector) => (
                          <CommandItem key={sector.sector_category} value={sector.sector_category} onSelect={(value) => setSectorFilter(value)}>
                            <Check className={cn("mr-2 h-4 w-4", sectorFilter === sector.sector_category ? "opacity-100" : "opacity-0")} />
                            {sector.sector_category}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Ibex Family Filter */}
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-48 justify-between">
                    {ibexFamilyFilter === "all" ? "Todas las familias IBEX" : ibexFamilyFilter}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar IBEX Family..." />
                    <CommandList>
                      <CommandEmpty>No se encontró familia IBEX.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="all" onSelect={() => setIbexFamilyFilter("all")}>
                          <Check className={cn("mr-2 h-4 w-4", ibexFamilyFilter === "all" ? "opacity-100" : "opacity-0")} />
                          Todas las familias IBEX
                        </CommandItem>
                        {ibexFamilyCategories?.map((ibex) => (
                          <CommandItem key={ibex.ibex_family_code} value={ibex.ibex_family_code} onSelect={(value) => setIbexFamilyFilter(value)}>
                            <Check className={cn("mr-2 h-4 w-4", ibexFamilyFilter === ibex.ibex_family_code ? "opacity-100" : "opacity-0")} />
                            {ibex.ibex_family_code}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Batch Filter */}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Fecha de análisis" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">Todas las fechas</SelectItem>
                  {batchOptions.map((batch) => (
                    <SelectItem key={batch.value} value={batch.value}>
                      <div className="flex flex-col">
                        <span>{batch.label}</span>
                        <span className="text-xs text-muted-foreground">{batch.subLabel}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(companyFilter !== "all" || sectorFilter !== "all" || ibexFamilyFilter !== "all" || batchFilter !== "all") && (
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
            {searchQuery || companyFilter !== "all" || sectorFilter !== "all" || ibexFamilyFilter !== "all" || batchFilter !== "all" ? "No companies found matching your filters." : 
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
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-lg font-bold text-primary">
                                {rixRun.displayRixScore ?? rixRun["09_rix_score"] ?? 0}
                              </span>
                              {rixRun.trend && (
                                <span className={cn(
                                  "text-sm",
                                  rixRun.trend === "up" ? "text-good" : rixRun.trend === "down" ? "text-insufficient" : "text-muted-foreground"
                                )}>
                                  {rixRun.trend === "up" ? "↑" : rixRun.trend === "down" ? "↓" : "→"}
                                </span>
                              )}
                              {rixRun["52_cxm_excluded"] && (
                                <span className="text-[9px] text-muted-foreground italic block">
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
                          const metricTrend = rixRun.metricTrends?.[metric.key as keyof typeof rixRun.metricTrends];
                          
                          return (
                            <TableCell key={metric.key} className="text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                <div className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  isInvalid ? 'bg-muted/20 text-muted-foreground' : getCategoryColor(categoria)
                                }`}>
                                  {score || 0}
                                </div>
                                {metricTrend && (
                                  <span className={cn(
                                    "text-xs",
                                    metricTrend === "up" ? "text-good" : metricTrend === "down" ? "text-insufficient" : "text-muted-foreground"
                                  )}>
                                    {metricTrend === "up" ? "↑" : metricTrend === "down" ? "↓" : "→"}
                                  </span>
                                )}
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
                                    <div className="flex items-center gap-1">
                                       <div className="text-3xl font-bold text-primary">
                                         {rixRun.displayRixScore ?? rixRun["09_rix_score"] ?? 0}
                                       </div>
                                       {rixRun.trend && (
                                         <span className={cn(
                                           "text-2xl",
                                           rixRun.trend === "up" ? "text-good" : rixRun.trend === "down" ? "text-insufficient" : "text-muted-foreground"
                                         )}>
                                           {rixRun.trend === "up" ? "↑" : rixRun.trend === "down" ? "↓" : "→"}
                                         </span>
                                       )}
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
                                const metricTrend = rixRun.metricTrends?.[metric.key as keyof typeof rixRun.metricTrends];
                                return (
                                  <div key={metric.key} className="text-center">
                                    <div className="text-xs text-muted-foreground mb-1">{metric.label}</div>
                                    <div className="flex items-center justify-center gap-0.5">
                                      <div className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(categoria)}`}>
                                        {score || 0}
                                      </div>
                                       {metricTrend && (
                                         <span className={cn(
                                           "text-xs",
                                           metricTrend === "up" ? "text-good" : metricTrend === "down" ? "text-insufficient" : "text-muted-foreground"
                                         )}>
                                           {metricTrend === "up" ? "↑" : metricTrend === "down" ? "↓" : "→"}
                                         </span>
                                       )}
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