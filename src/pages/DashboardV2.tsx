import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useRixRunsV2 } from "@/hooks/useRixRunsV2";
import { useCompanies } from "@/hooks/useCompanies";
import { useSectorCategories } from "@/hooks/useSectorCategories";
import { useIbexFamilyCategories } from "@/hooks/useIbexFamilyCategories";
import { useProgressiveLoad } from "@/hooks/useProgressiveLoad";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, List, Grid, AlertCircle, X, Building2, Brain, BarChart3, Factory, AlertTriangle, Check, ChevronsUpDown, Loader2, Beaker, CheckCircle2, Clock } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { ClaudeIcon } from "@/components/ui/claude-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";

type AIFilterV2 = "all" | "ChatGPT" | "Gemini" | "Perplexity" | "Deepseek" | "Claude" | "Grok" | "Qwen";
type PipelineFilter = "all" | "make_original" | "lovable_v2";

export default function DashboardV2() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [aiFilter, setAIFilter] = useState<AIFilterV2>("all");
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [ibexFamilyFilter, setIbexFamilyFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const navigate = useNavigate();
  
  const { data: rixRuns, isLoading, error } = useRixRunsV2({
    sourcePipeline: pipelineFilter === "all" ? "all" : pipelineFilter,
    modelFilter: aiFilter === "all" ? "all" : aiFilter,
    companyFilter,
    sectorFilter,
    ibexFamilyFilter,
    limit: 1000
  });
  const { data: companies } = useCompanies();
  const { data: sectorCategories } = useSectorCategories();
  const { data: ibexFamilyCategories } = useIbexFamilyCategories();

  const handleRowClick = (rixRunId: string) => {
    navigate(`/rix-run-v2/${rixRunId}`);
  };

  const getCategoryColor = (categoria?: string | null) => {
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
    { key: "nvm", label: "NVM" },
    { key: "drm", label: "DRM" },
    { key: "sim", label: "SIM" },
    { key: "rmm", label: "RMM" },
    { key: "cem", label: "CEM" },
    { key: "gam", label: "GAM" },
    { key: "dcm", label: "DCM" },
    { key: "cxm", label: "CXM" },
  ];

  // Generate batch options based on available data
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
        if (run.ticker) {
          group.companies.add(run.ticker);
        }
      }
    });
    
    return Array.from(batchGroups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([num, info]) => {
        const isComplete = info.companies.size >= 10; // For V2, consider 10 companies as complete
        const statusIcon = isComplete ? '✓' : '⏳';
        const subLabel = `${info.companies.size} empresas`;
        
        return {
          value: num.toString(),
          label: `${info.label} ${statusIcon}`,
          subLabel,
          isComplete
        };
      });
  }, [rixRuns]);

  // Auto-select the most recent batch when data is available
  useEffect(() => {
    if (batchOptions.length > 0 && batchFilter === "all") {
      const latestBatch = batchOptions[0];
      if (latestBatch) {
        setBatchFilter(latestBatch.value);
      }
    }
  }, [batchOptions, batchFilter]);

  const clearFilters = () => {
    setCompanyFilter("all");
    setSectorFilter("all");
    setIbexFamilyFilter("all");
    setBatchFilter("all");
    setPipelineFilter("all");
    setSearchQuery("");
  };

  // Sort and filter RIX runs
  const sortedRixRuns = useMemo(() => {
    if (!rixRuns) return [];
    
    let filtered = rixRuns;
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(run => 
        run.target_name?.toLowerCase().includes(query) ||
        run.ticker?.toLowerCase().includes(query)
      );
    }
    
    // Apply batch filter
    if (batchFilter && batchFilter !== "all") {
      filtered = filtered.filter(run => run.batchNumber?.toString() === batchFilter);
    }
    
    return [...filtered].sort((a, b) => {
      // Invalid data goes to end
      if (a.isDataInvalid && !b.isDataInvalid) return 1;
      if (!a.isDataInvalid && b.isDataInvalid) return -1;
      
      // Order by RIX score descending
      const scoreA = a.displayRixScore ?? a.rix_score ?? 0;
      const scoreB = b.displayRixScore ?? b.rix_score ?? 0;
      
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      
      // If scores are equal, prioritize more recent
      if (a.batch_execution_date && b.batch_execution_date) {
        return new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime();
      }
      
      return 0;
    });
  }, [rixRuns, batchFilter, searchQuery]);

  // Progressive loading
  const {
    visibleItems: visibleRixRuns,
    hasMore,
    remainingCount,
    isLoadingMore,
    loadMore,
    loadAll,
  } = useProgressiveLoad(sortedRixRuns, {
    initialBatchSize: 25,
    incrementSize: 25,
    delay: 50,
  });

  // Intersection observer for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // Helper function to get AI model information
  const getModelInfo = (modelName: string | null) => {
    const normalizedModel = modelName?.toLowerCase() || '';
    
    if (normalizedModel.includes('chatgpt') || normalizedModel.includes('gpt')) {
      return { name: 'ChatGPT', icon: ChatGPTIcon, colorClass: 'text-emerald-600 dark:text-emerald-400' };
    } else if (normalizedModel.includes('gemini')) {
      return { name: 'Gemini', icon: GeminiIcon, colorClass: 'text-[hsl(var(--gemini))]' };
    } else if (normalizedModel.includes('perplexity')) {
      return { name: 'Perplexity', icon: PerplexityIcon, colorClass: 'text-blue-600 dark:text-blue-400' };
    } else if (normalizedModel.includes('deepseek')) {
      return { name: 'Deepseek', icon: DeepseekIcon, colorClass: 'text-[hsl(var(--deepseek))]' };
    } else if (normalizedModel.includes('claude')) {
      return { name: 'Claude', icon: ClaudeIcon, colorClass: 'text-orange-600 dark:text-orange-400' };
    } else if (normalizedModel.includes('grok')) {
      return { name: 'Grok', icon: GrokIcon, colorClass: 'text-gray-600 dark:text-gray-400' };
    } else if (normalizedModel.includes('qwen')) {
      return { name: 'Qwen', icon: QwenIcon, colorClass: 'text-purple-600 dark:text-purple-400' };
    }
    
    return { name: 'Desconocido', icon: Brain, colorClass: 'text-muted-foreground' };
  };

  const getAnalysisStatus = (run: typeof sortedRixRuns[0]) => {
    if (run.rix_score !== null && run.analysis_completed_at) {
      return { label: "Analizado", icon: CheckCircle2, color: "text-green-600" };
    }
    if (run.search_completed_at) {
      return { label: "Pendiente", icon: Clock, color: "text-yellow-600" };
    }
    return { label: "Sin datos", icon: AlertTriangle, color: "text-destructive" };
  };

  const hasActiveFilters = searchQuery || companyFilter !== "all" || sectorFilter !== "all" || ibexFamilyFilter !== "all" || batchFilter !== "all" || pipelineFilter !== "all";

  if (isLoading) {
    return (
      <Layout title="Dashboard V2 - Pre-producción">
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
    <Layout title="Dashboard V2 - Pre-producción">
      <div className="space-y-6">
        {/* Title */}
        <div className="text-center px-2">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Índice Reputacional V2 - 7 IAs
            </h1>
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
              <Beaker className="h-3 w-3 mr-1" />
              Pre-producción
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {sortedRixRuns?.length || 0} registros en rix_runs_v2
            {hasActiveFilters && (
              <span className="ml-2">(con filtros aplicados)</span>
            )}
          </p>
        </div>

        {/* Controls - AI Selector (7 models) and View Mode */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* AI Model Selector - 7 models */}
          <div className="w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            <div className="flex items-center bg-muted/50 p-1 rounded-lg min-w-max">
              <Button
                variant={aiFilter === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAIFilter("all")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <BarChart3 className="h-4 w-4" />
                Todos
              </Button>
              <Button
                variant={aiFilter === "ChatGPT" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAIFilter("ChatGPT")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <ChatGPTIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={aiFilter === "Gemini" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAIFilter("Gemini")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <GeminiIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={aiFilter === "Perplexity" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAIFilter("Perplexity")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <PerplexityIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={aiFilter === "Deepseek" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAIFilter("Deepseek")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <DeepseekIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={aiFilter === "Claude" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAIFilter("Claude")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <ClaudeIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={aiFilter === "Grok" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAIFilter("Grok")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <GrokIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={aiFilter === "Qwen" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAIFilter("Qwen")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <QwenIcon className="h-4 w-4" />
              </Button>
            </div>
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
        <div className="overflow-x-auto">
          <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4 bg-muted/50 rounded-lg min-w-max sm:min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-sm font-medium whitespace-nowrap">Filtros:</span>
              
              {/* Search */}
              <div className="relative w-40 sm:w-48">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {/* Pipeline Filter */}
              <Select value={pipelineFilter} onValueChange={(v) => setPipelineFilter(v as PipelineFilter)}>
                <SelectTrigger className="w-[140px] h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos pipelines</SelectItem>
                  <SelectItem value="make_original">Make Original</SelectItem>
                  <SelectItem value="lovable_v2">Lovable V2</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Company Filter */}
              <div className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-40 sm:w-48 justify-between text-xs sm:text-sm h-9">
                      {companyFilter === "all" ? "Todas las empresas" : companies?.find(c => c.issuer_name === companyFilter)?.issuer_name || "Seleccionar..."}
                      <ChevronsUpDown className="ml-1 h-3 w-3 sm:h-4 sm:w-4 shrink-0 opacity-50" />
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
              <div className="flex items-center gap-1.5">
                <Factory className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-36 sm:w-48 justify-between text-xs sm:text-sm h-9">
                      {sectorFilter === "all" ? "Todos los sectores" : sectorFilter}
                      <ChevronsUpDown className="ml-1 h-3 w-3 sm:h-4 sm:w-4 shrink-0 opacity-50" />
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
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-40 sm:w-48 justify-between text-xs sm:text-sm h-9">
                      {ibexFamilyFilter === "all" ? "Todos los índices" : ibexFamilyFilter === "no_cotizadas" ? "No cotizadas" : ibexFamilyFilter}
                      <ChevronsUpDown className="ml-1 h-3 w-3 sm:h-4 sm:w-4 shrink-0 opacity-50" />
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
                            Todos los índices
                          </CommandItem>
                          <CommandItem value="no_cotizadas" onSelect={() => setIbexFamilyFilter("no_cotizadas")}>
                            <Check className={cn("mr-2 h-4 w-4", ibexFamilyFilter === "no_cotizadas" ? "opacity-100" : "opacity-0")} />
                            No cotizadas
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
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger className="w-48 sm:w-64 text-xs sm:text-sm h-9">
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

              {hasActiveFilters && (
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
        </div>

        {error && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Error loading RIX runs V2: {error.message}</span>
            </div>
          </div>
        )}

        {!isLoading && !error && (!rixRuns || sortedRixRuns.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            No se encontraron registros en rix_runs_v2 con los filtros aplicados.
          </div>
        )}

        {!isLoading && !error && sortedRixRuns.length > 0 && (
          <>
            {viewMode === "list" && (
              <div className="rounded-md border overflow-x-auto shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Empresa</TableHead>
                      <TableHead className="text-center w-24">Modelo IA</TableHead>
                      <TableHead className="text-center w-20">Pipeline</TableHead>
                      <TableHead className="text-center w-16">Estado</TableHead>
                      <TableHead className="text-center">RIX</TableHead>
                      {metrics.map((metric) => (
                        <TableHead key={metric.key} className="text-center w-16">
                          {metric.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-32">IBEX Family</TableHead>
                      <TableHead className="w-40">Sector</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRixRuns.map((run) => {
                      const modelInfo = getModelInfo(run.model_name);
                      const ModelIcon = modelInfo.icon;
                      const status = getAnalysisStatus(run);
                      const StatusIcon = status.icon;

                      return (
                        <TableRow
                          key={run.id}
                          className="cursor-pointer hover:bg-muted/50 hover:shadow-subtle transition-all"
                          onClick={() => handleRowClick(run.id)}
                        >
                          <TableCell>
                            <div>
                              <div className="font-medium text-sm">{run.target_name || "Sin nombre"}</div>
                              {run.ticker && (
                                <div className="text-xs text-muted-foreground">{run.ticker}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <ModelIcon className={cn("h-4 w-4", modelInfo.colorClass)} />
                              <span className={cn("text-xs font-medium", modelInfo.colorClass)}>
                                {modelInfo.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant={run.source_pipeline === "lovable_v2" ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {run.source_pipeline === "lovable_v2" ? "V2" : "Make"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className={cn("flex items-center justify-center", status.color)}>
                              <StatusIcon className="h-4 w-4" />
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {run.isDataInvalid ? (
                              <div className="flex items-center justify-center gap-1">
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                                <span className="text-sm text-destructive font-medium">—</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-lg font-bold text-primary">
                                  {run.displayRixScore ?? run.rix_score ?? "—"}
                                </span>
                                {run.cxm_excluded && (
                                  <span className="text-[9px] text-muted-foreground italic">*</span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          {metrics.map((metric) => {
                            const scoreKey = `${metric.key}_score` as keyof typeof run;
                            const categoryKey = `${metric.key}_categoria` as keyof typeof run;
                            const score = run[scoreKey] as number | null;
                            const categoria = run[categoryKey] as string | null;
                            
                            return (
                              <TableCell key={metric.key} className="text-center">
                                <div className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  run.isDataInvalid ? 'bg-muted/20 text-muted-foreground' : getCategoryColor(categoria)
                                }`}>
                                  {score ?? "—"}
                                </div>
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-xs">
                            {run.repindex_root_issuers?.ibex_family_code || "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-normal">
                            {run.repindex_root_issuers?.sector_category || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                
                {/* Load more indicator */}
                <div ref={loadMoreRef} className="py-4">
                  {hasMore && (
                    <div className="flex items-center justify-center gap-3">
                      {isLoadingMore ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Cargando más...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">
                            Mostrando {visibleRixRuns.length} de {sortedRixRuns.length}
                          </span>
                          <Button variant="outline" size="sm" onClick={loadMore}>
                            Cargar más ({remainingCount})
                          </Button>
                          <Button variant="ghost" size="sm" onClick={loadAll}>
                            Cargar todos
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {viewMode === "cards" && (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {visibleRixRuns.map((run) => {
                    const modelInfo = getModelInfo(run.model_name);
                    const ModelIcon = modelInfo.icon;
                    const status = getAnalysisStatus(run);
                    const StatusIcon = status.icon;

                    return (
                      <Card 
                        key={run.id} 
                        className="cursor-pointer shadow-soft hover:shadow-medium border-border/50 transition-all duration-200 hover:-translate-y-0.5"
                        onClick={() => handleRowClick(run.id)}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{run.target_name || "Sin nombre"}</CardTitle>
                              <CardDescription>{run.ticker}</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={run.source_pipeline === "lovable_v2" ? "default" : "secondary"}
                                className="text-[10px]"
                              >
                                {run.source_pipeline === "lovable_v2" ? "V2" : "Make"}
                              </Badge>
                              <div className={cn("flex items-center", status.color)}>
                                <StatusIcon className="h-4 w-4" />
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ModelIcon className={cn("h-5 w-5", modelInfo.colorClass)} />
                              <span className="text-sm font-medium">{modelInfo.name}</span>
                            </div>
                            {run.isDataInvalid ? (
                              <div className="flex items-center gap-1 text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <span className="text-sm">Sin datos</span>
                              </div>
                            ) : (
                              <div className="text-3xl font-bold text-primary">
                                {run.displayRixScore ?? run.rix_score ?? "—"}
                              </div>
                            )}
                          </div>
                          
                          {/* Mini metrics grid */}
                          <div className="grid grid-cols-4 gap-1 text-xs">
                            {metrics.slice(0, 8).map((metric) => {
                              const scoreKey = `${metric.key}_score` as keyof typeof run;
                              const categoryKey = `${metric.key}_categoria` as keyof typeof run;
                              const score = run[scoreKey] as number | null;
                              const categoria = run[categoryKey] as string | null;
                              
                              return (
                                <div key={metric.key} className="text-center">
                                  <div className="text-[10px] text-muted-foreground">{metric.label}</div>
                                  <div className={`px-1 py-0.5 rounded text-xs font-medium ${getCategoryColor(categoria)}`}>
                                    {score ?? "—"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          
                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                            <span>{run.repindex_root_issuers?.sector_category || "—"}</span>
                            <span>{run.repindex_root_issuers?.ibex_family_code || "—"}</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                
                {/* Load more for cards view */}
                <div ref={viewMode === "cards" ? loadMoreRef : undefined} className="py-4">
                  {hasMore && (
                    <div className="flex items-center justify-center gap-3">
                      {isLoadingMore ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Cargando más...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">
                            Mostrando {visibleRixRuns.length} de {sortedRixRuns.length}
                          </span>
                          <Button variant="outline" size="sm" onClick={loadMore}>
                            Cargar más ({remainingCount})
                          </Button>
                          <Button variant="ghost" size="sm" onClick={loadAll}>
                            Cargar todos
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
