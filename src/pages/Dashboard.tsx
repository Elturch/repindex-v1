import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useUnifiedRixRuns, UnifiedRixRun } from "@/hooks/useUnifiedRixRuns";
import { useCompanies } from "@/hooks/useCompanies";
import { useSectorCategories } from "@/hooks/useSectorCategories";
import { useIbexFamilyCategories } from "@/hooks/useIbexFamilyCategories";
import { useChatContext } from "@/contexts/ChatContext";
import { useProgressiveLoad } from "@/hooks/useProgressiveLoad";
import ConsolidationAnalysis from "@/components/ConsolidationAnalysis";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { aggregateConsensus, compareConsensus, type ConsensusLevel } from "@/lib/consensusRanking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, List, Grid, AlertCircle, CalendarIcon, X, Building2, Calendar as CalendarDays, Brain, BarChart3, Factory, AlertTriangle, Check, ChevronsUpDown, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, addDays } from "date-fns";
import { toZonedTime } from 'date-fns-tz';
import { cn } from "@/lib/utils";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";
import { WeeklyReadingError } from "@/components/ui/weekly-reading-error";
import { trackDashboardFilter, trackCompanyDetailView } from "@/lib/gtmEvents";
import { getMetricByAcronym } from "@/lib/rixMetricsGlossary";

// AI Filter type for the 6 models
type AIFilter = "all" | "ChatGPT" | "Google Gemini" | "Perplexity" | "Deepseek" | "Grok" | "Qwen" | "comparison";

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [aiFilter, setAIFilter] = useState<AIFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [ibexFamilyFilter, setIbexFamilyFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<{
    key: 'rix' | 'nvm' | 'drm' | 'sim' | 'rmm' | 'cem' | 'gam' | 'dcm' | 'cxm';
    direction: 'asc' | 'desc';
  }>({ key: 'rix', direction: 'desc' });
  const [rankingMode, setRankingMode] = useState<"score" | "consensus">("score");
  const navigate = useNavigate();
  
  const { data: rixRuns, isLoading, error } = useUnifiedRixRuns({
    modelFilter: aiFilter === "comparison" ? "all" : aiFilter,
    companyFilter,
    sectorFilter,
    ibexFamilyFilter,
    weeksToLoad: 6
  });
  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: sectorCategories, isLoading: sectorsLoading } = useSectorCategories();
  const { data: ibexFamilyCategories, isLoading: ibexLoading } = useIbexFamilyCategories();
  const { setPageContext } = useChatContext();

  const handleRowClick = (rixRunId: string, companyName: string, ticker: string, modelName: string) => {
    trackCompanyDetailView(ticker || 'unknown', companyName || 'unknown', modelName || 'unknown');
    navigate(`/rix-run/${rixRunId}`);
  };

  // GTM tracking handlers for filters
  const handleAIFilterChange = useCallback((value: AIFilter) => {
    setAIFilter(value);
    trackDashboardFilter('ai_model', value);
  }, []);

  const handleCompanyFilterChange = useCallback((value: string) => {
    setCompanyFilter(value);
    trackDashboardFilter('company', value);
  }, []);

  const handleSectorFilterChange = useCallback((value: string) => {
    setSectorFilter(value);
    trackDashboardFilter('sector', value);
  }, []);

  const handleIbexFamilyFilterChange = useCallback((value: string) => {
    setIbexFamilyFilter(value);
    trackDashboardFilter('ibex_family', value);
  }, []);

  const handleBatchFilterChange = useCallback((value: string) => {
    setBatchFilter(value);
    trackDashboardFilter('batch_date', value);
  }, []);

  const formatDateRange = (from?: string | null, to?: string | null) => {
    if (!from && !to) return "N/A";
    if (!to) return from ? new Date(from).toLocaleDateString() : "N/A";
    if (!from) return to ? new Date(to).toLocaleDateString() : "N/A";
    
    const fromDate = new Date(from).toLocaleDateString();
    const toDate = new Date(to).toLocaleDateString();
    return `${fromDate} - ${toDate}`;
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
    { key: "nvm", label: "NVM", scoreKey: "nvm_score", categoryKey: "nvm_categoria" },
    { key: "drm", label: "DRM", scoreKey: "drm_score", categoryKey: "drm_categoria" },
    { key: "sim", label: "SIM", scoreKey: "sim_score", categoryKey: "sim_categoria" },
    { key: "rmm", label: "RMM", scoreKey: "rmm_score", categoryKey: "rmm_categoria" },
    { key: "cem", label: "CEM", scoreKey: "cem_score", categoryKey: "cem_categoria" },
    { key: "gam", label: "GAM", scoreKey: "gam_score", categoryKey: "gam_categoria" },
    { key: "dcm", label: "DCM", scoreKey: "dcm_score", categoryKey: "dcm_categoria" },
    { key: "cxm", label: "CXM", scoreKey: "cxm_score", categoryKey: "cxm_categoria" },
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
        const isComplete = info.companies.size >= 150;
        const statusIcon = isComplete ? '✓' : '⏳';
        const subLabel = isComplete 
          ? `${info.companies.size} empresas`
          : `${info.companies.size}/174 empresas (en progreso)`;
        
        return {
          value: num.toString(),
          label: `${info.label} ${statusIcon}`,
          subLabel,
          isComplete
        };
      });
  }, [rixRuns]);

  // Auto-select the most recent COMPLETE batch
  React.useEffect(() => {
    if (batchOptions.length > 0 && batchFilter === "all") {
      const latestCompleteBatch = batchOptions.find(opt => opt.isComplete);
      
      if (latestCompleteBatch) {
        setBatchFilter(latestCompleteBatch.value);
      } else if (batchOptions[0]) {
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

  // Handle column sorting - click again on active column to reset to default
  const handleSort = (key: typeof sortConfig.key) => {
    setSortConfig(current => {
      // If clicking on the already active column
      if (current.key === key) {
        // If it's desc, switch to asc
        if (current.direction === 'desc') {
          return { key, direction: 'asc' };
        }
        // If it's asc, reset to default (rix desc)
        return { key: 'rix', direction: 'desc' };
      }
      // New column, start with desc
      return { key, direction: 'desc' };
    });
  };

  // Sort and filter RIX runs
  const sortedRixRuns = useMemo(() => {
    if (!rixRuns) return [];

    let filteredByBatch = rixRuns;
    if (batchFilter && batchFilter !== "all") {
      filteredByBatch = rixRuns.filter(run =>
        run.batchNumber?.toString() === batchFilter
      );
    }

    // Apply search filter
    if (searchQuery) {
      filteredByBatch = filteredByBatch.filter(run =>
        run.target_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // CONSENSUS MODE — group by ticker across all 6 models in current batch,
    // then sort each row by its ticker's consensus level + majority block score.
    if (rankingMode === "consensus") {
      const consensusMap = aggregateConsensus(
        filteredByBatch.map(r => ({
          ticker: (r.repindex_root_issuers?.ticker || r.ticker || "") as string,
          rix_score: (r.displayRixScore ?? r.rix_score) as number | null,
        }))
      );

      return [...filteredByBatch].sort((a, b) => {
        if (a.isDataInvalid && !b.isDataInvalid) return 1;
        if (!a.isDataInvalid && b.isDataInvalid) return -1;
        const tA = (a.repindex_root_issuers?.ticker || a.ticker || "") as string;
        const tB = (b.repindex_root_issuers?.ticker || b.ticker || "") as string;
        const cA = consensusMap.get(tA);
        const cB = consensusMap.get(tB);
        if (cA && cB) {
          const cmp = compareConsensus(cA, cB, sortConfig.direction === "asc");
          if (cmp !== 0) return cmp;
        } else if (cA && !cB) return -1;
        else if (!cA && cB) return 1;
        // Tie-breaker: own rix score
        const sA = a.displayRixScore ?? a.rix_score ?? 0;
        const sB = b.displayRixScore ?? b.rix_score ?? 0;
        return sortConfig.direction === "asc" ? sA - sB : sB - sA;
      });
    }

    return [...filteredByBatch].sort((a, b) => {
      // Invalid data always at the bottom
      if (a.isDataInvalid && !b.isDataInvalid) return 1;
      if (!a.isDataInvalid && b.isDataInvalid) return -1;

      // Get scores based on sort key
      let scoreA: number;
      let scoreB: number;

      if (sortConfig.key === 'rix') {
        scoreA = a.displayRixScore ?? a.rix_score ?? 0;
        scoreB = b.displayRixScore ?? b.rix_score ?? 0;
      } else {
        const scoreKey = `${sortConfig.key}_score` as keyof typeof a;
        scoreA = (a as any)[scoreKey] ?? 0;
        scoreB = (b as any)[scoreKey] ?? 0;
      }

      // Apply sort direction
      const multiplier = sortConfig.direction === 'desc' ? 1 : -1;

      if (scoreB !== scoreA) {
        return (scoreB - scoreA) * multiplier;
      }

      // Secondary sort by date
      if (a.batch_execution_date && b.batch_execution_date) {
        return new Date(b.batch_execution_date).getTime() - new Date(a.batch_execution_date).getTime();
      }

      return 0;
    });
  }, [rixRuns, batchFilter, searchQuery, sortConfig, rankingMode]);

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

  // Update chat context
  useEffect(() => {
    setPageContext({
      name: 'Dashboard',
      path: '/dashboard',
      dynamicData: {
        selectedCompany: companyFilter !== 'all' ? companyFilter : null,
        selectedSector: sectorFilter !== 'all' ? sectorFilter : null,
        selectedIbexFamily: ibexFamilyFilter !== 'all' ? ibexFamilyFilter : null,
        selectedAIModel: aiFilter !== 'all' ? aiFilter : null,
        totalResults: sortedRixRuns?.length || 0,
      }
    });
  }, [companyFilter, sectorFilter, ibexFamilyFilter, aiFilter, sortedRixRuns?.length, setPageContext]);

  // Normalize flag names
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

  // Get AI model information - now with 6 models
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
    } else if (normalizedModel.includes('grok')) {
      return {
        name: 'Grok',
        abbreviation: 'GRK',
        icon: GrokIcon,
        colorClass: 'text-orange-600 dark:text-orange-400'
      };
    } else if (normalizedModel.includes('qwen')) {
      return {
        name: 'Qwen',
        abbreviation: 'QWN',
        icon: QwenIcon,
        colorClass: 'text-indigo-600 dark:text-indigo-400'
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
      <Layout title="RepIndex.ai">
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
    <Layout title="RepIndex.ai">
      <div className="space-y-6">

        {/* Title */}
        <div className="text-center px-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Índice Reputacional - {aiFilter === "comparison" ? "Comparación" : aiFilter === "all" ? "Todos" : aiFilter}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {rixRuns?.length || 0} resultados analizados
            {(companyFilter !== "all" || sectorFilter !== "all" || ibexFamilyFilter !== "all" || batchFilter !== "all") && (
              <span className="ml-2">(con filtros aplicados)</span>
            )}
          </p>
        </div>

        {/* Controls - AI Selector with 6 models */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            <div className="flex items-center bg-muted/50 p-1 rounded-lg min-w-max">
              <Button
                variant={aiFilter === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleAIFilterChange("all")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <BarChart3 className="h-4 w-4" />
                Todos
              </Button>
              <Button
                variant={aiFilter === "ChatGPT" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleAIFilterChange("ChatGPT")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <ChatGPTIcon className="h-4 w-4" />
                <span className="hidden xs:inline">ChatGPT</span>
              </Button>
              <Button
                variant={aiFilter === "Google Gemini" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleAIFilterChange("Google Gemini")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <GeminiIcon className="h-4 w-4" />
                <span className="hidden xs:inline">Gemini</span>
              </Button>
              <Button
                variant={aiFilter === "Perplexity" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleAIFilterChange("Perplexity")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <PerplexityIcon className="h-4 w-4" />
                <span className="hidden xs:inline">Perplexity</span>
              </Button>
              <Button
                variant={aiFilter === "Deepseek" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleAIFilterChange("Deepseek")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <DeepseekIcon className="h-4 w-4" />
                <span className="hidden xs:inline">Deepseek</span>
              </Button>
              <Button
                variant={aiFilter === "Grok" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleAIFilterChange("Grok")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <GrokIcon className="h-4 w-4" />
                <span className="hidden xs:inline">Grok</span>
              </Button>
              <Button
                variant={aiFilter === "Qwen" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleAIFilterChange("Qwen")}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <QwenIcon className="h-4 w-4" />
                <span className="hidden xs:inline">Qwen</span>
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
              
              {/* Company Filter */}
              <div className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-40 sm:w-48 justify-between text-xs sm:text-sm">
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
                          <CommandItem value="all" onSelect={() => handleCompanyFilterChange("all")}>
                            <Check className={cn("mr-2 h-4 w-4", companyFilter === "all" ? "opacity-100" : "opacity-0")} />
                            Todas las empresas
                          </CommandItem>
                          {companies?.map((company) => (
                            <CommandItem key={company.issuer_id} value={company.issuer_name} onSelect={(value) => handleCompanyFilterChange(value)}>
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
                    <Button variant="outline" role="combobox" className="w-36 sm:w-48 justify-between text-xs sm:text-sm">
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
                          <CommandItem value="all" onSelect={() => handleSectorFilterChange("all")}>
                            <Check className={cn("mr-2 h-4 w-4", sectorFilter === "all" ? "opacity-100" : "opacity-0")} />
                            Todos los sectores
                          </CommandItem>
                          {sectorCategories?.map((sector) => (
                            <CommandItem key={sector.sector_category} value={sector.sector_category} onSelect={(value) => handleSectorFilterChange(value)}>
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
                    <Button variant="outline" role="combobox" className="w-40 sm:w-48 justify-between text-xs sm:text-sm">
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
                          <CommandItem value="all" onSelect={() => handleIbexFamilyFilterChange("all")}>
                            <Check className={cn("mr-2 h-4 w-4", ibexFamilyFilter === "all" ? "opacity-100" : "opacity-0")} />
                            Todos los índices
                          </CommandItem>
                          <CommandItem value="no_cotizadas" onSelect={() => handleIbexFamilyFilterChange("no_cotizadas")}>
                            <Check className={cn("mr-2 h-4 w-4", ibexFamilyFilter === "no_cotizadas" ? "opacity-100" : "opacity-0")} />
                            No cotizadas
                          </CommandItem>
                          {ibexFamilyCategories?.map((ibex) => (
                            <CommandItem key={ibex.ibex_family_code} value={ibex.ibex_family_code} onSelect={(value) => handleIbexFamilyFilterChange(value)}>
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
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Select value={batchFilter} onValueChange={handleBatchFilterChange}>
                  <SelectTrigger className="w-48 sm:w-64 text-xs sm:text-sm">
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
              <TooltipProvider delayDuration={300}>
              <div className="rounded-md border overflow-x-auto shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Empresa</TableHead>
                      {aiFilter === "all" && (
                        <TableHead className="text-center w-24">Modelo IA</TableHead>
                      )}
                      <TableHead 
                        className={cn(
                          "text-center cursor-pointer hover:bg-muted/50 transition-colors",
                          sortConfig.key === 'rix' && "bg-primary/10 text-primary"
                        )}
                        onClick={() => handleSort('rix')}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-center gap-1">
                              <span className={cn(sortConfig.key === 'rix' && "font-bold")}>RIX</span>
                              {sortConfig.key === 'rix' ? (
                                <span className="flex items-center gap-0.5">
                                  {sortConfig.direction === 'desc' ? 
                                    <ArrowDown className="h-3 w-3 text-primary" /> : 
                                    <ArrowUp className="h-3 w-3 text-primary" />
                                  }
                                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive ml-0.5" />
                                </span>
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-30" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p className="font-semibold">Índice Reputacional</p>
                            <p className="text-xs text-muted-foreground">Puntuación global (0-100)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      {metrics.map((metric) => {
                        const isActive = sortConfig.key === metric.key;
                        const metricDef = getMetricByAcronym(metric.label);
                        return (
                          <TableHead 
                            key={metric.key} 
                            className={cn(
                              "text-center w-16 cursor-pointer hover:bg-muted/50 transition-colors",
                              isActive && "bg-primary/10 text-primary"
                            )}
                            onClick={() => handleSort(metric.key as typeof sortConfig.key)}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center gap-1">
                                  <span className={cn(isActive && "font-bold")}>{metric.label}</span>
                                  {isActive ? (
                                    <span className="flex items-center gap-0.5">
                                      {sortConfig.direction === 'desc' ? 
                                        <ArrowDown className="h-3 w-3 text-primary" /> : 
                                        <ArrowUp className="h-3 w-3 text-primary" />
                                      }
                                      <X className="h-3 w-3 text-muted-foreground hover:text-destructive ml-0.5" />
                                    </span>
                                  ) : (
                                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="font-semibold">{metricDef?.executiveName || metric.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  Peso: {metricDef ? Math.round(metricDef.weight * 100) : 0}%
                                  {metricDef?.inverseScoring && " · Puntuación inversa"}
                                  {metric.label === "CXM" && " · Solo cotizadas"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TableHead>
                        );
                      })}
                      <TableHead className="w-40">Ibex Family Code</TableHead>
                      <TableHead className="min-w-48">Sector Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRixRuns.map((rixRun) => (
                      <TableRow
                        key={rixRun.id}
                        className="cursor-pointer hover:bg-muted/50 hover:shadow-subtle transition-all"
                        onClick={() => handleRowClick(
                          rixRun.id, 
                          rixRun.target_name || '', 
                          rixRun.repindex_root_issuers?.ticker || rixRun.ticker || '',
                          rixRun.model_name || ''
                        )}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{rixRun.target_name || "Sin nombre"}</div>
                            {(rixRun.repindex_root_issuers?.ticker || rixRun.ticker) && (
                              <div className="text-xs text-muted-foreground">
                                {rixRun.repindex_root_issuers?.ticker || rixRun.ticker}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        {aiFilter === "all" && (
                          <TableCell className="text-center">
                            {(() => {
                              const modelInfo = getModelInfo(rixRun.model_name || '');
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
                                {rixRun.displayRixScore ?? rixRun.rix_score ?? 0}
                              </span>
                              {rixRun.trend && (
                                <span className={cn(
                                  "text-sm",
                                  rixRun.trend === "up" ? "text-good" : rixRun.trend === "down" ? "text-insufficient" : "text-muted-foreground"
                                )}>
                                  {rixRun.trend === "up" ? "↑" : rixRun.trend === "down" ? "↓" : "→"}
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
                
                {/* Load more indicator */}
                <div ref={viewMode === "list" ? loadMoreRef : undefined} className="py-4">
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
              </TooltipProvider>
            )}

            {viewMode === "cards" && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleRixRuns.map((rixRun) => (
                  <Card 
                    key={rixRun.id} 
                    className="cursor-pointer shadow-soft hover:shadow-medium border-border/50 transition-all duration-200 hover:-translate-y-0.5"
                    onClick={() => handleRowClick(
                      rixRun.id,
                      rixRun.target_name || '',
                      rixRun.repindex_root_issuers?.ticker || rixRun.ticker || '',
                      rixRun.model_name || ''
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{rixRun.target_name || "Sin nombre"}</CardTitle>
                          {(rixRun.repindex_root_issuers?.ticker || rixRun.ticker) && (
                            <CardDescription>
                              {rixRun.repindex_root_issuers?.ticker || rixRun.ticker}
                            </CardDescription>
                          )}
                        </div>
                        <div className="text-right relative">
                          {aiFilter === "all" && (
                            <div className="mb-2">
                              {(() => {
                                const modelInfo = getModelInfo(rixRun.model_name || '');
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
                            <div className="flex flex-col items-center">
                              <div className="flex items-center gap-1">
                                <div className="text-3xl font-bold text-primary">
                                  {rixRun.displayRixScore ?? rixRun.rix_score ?? 0}
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
                              {rixRun.cxm_excluded && (
                                <div className="text-xs text-muted-foreground italic mt-1">
                                  (CXM no aplicable)
                                </div>
                              )}
                            </div>
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
                                const flags = rixRun.flags || [];
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
                
                {/* Load more indicator for cards view */}
                <div 
                  ref={viewMode === "cards" ? loadMoreRef : undefined} 
                  className="col-span-full py-4"
                >
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
