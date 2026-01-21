import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search, ExternalLink, Check, ChevronsUpDown, LayoutList, LayoutGrid, Beaker, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useRixRunsV2 } from "@/hooks/useRixRunsV2";
import { useCompanies } from "@/hooks/useCompanies";
import { cn } from "@/lib/utils";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { ClaudeIcon } from "@/components/ui/claude-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";

type PipelineFilter = "all" | "make_original" | "lovable_v2";
type ModelFilter = "all" | "ChatGPT" | "Gemini" | "Perplexity" | "Deepseek" | "Claude" | "Grok" | "Qwen";

const modelOptions: { value: ModelFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "Todos los modelos", icon: Beaker },
  { value: "ChatGPT", label: "ChatGPT", icon: ChatGPTIcon },
  { value: "Gemini", label: "Gemini", icon: GeminiIcon },
  { value: "Perplexity", label: "Perplexity", icon: PerplexityIcon },
  { value: "Deepseek", label: "Deepseek", icon: DeepseekIcon },
  { value: "Claude", label: "Claude", icon: ClaudeIcon },
  { value: "Grok", label: "Grok", icon: GrokIcon },
  { value: "Qwen", label: "Qwen", icon: QwenIcon },
];

export default function DashboardV2() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>("all");
  const [modelFilter, setModelFilter] = useState<ModelFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [companyOpen, setCompanyOpen] = useState(false);

  const { data: rixRuns, isLoading: runsLoading, error: runsError } = useRixRunsV2({ 
    sourcePipeline: pipelineFilter === "all" ? "all" : pipelineFilter,
    limit: 500 
  });
  const { data: companies, isLoading: companiesLoading } = useCompanies();

  // Filter and sort runs
  const filteredRuns = useMemo(() => {
    if (!rixRuns) return [];
    
    return rixRuns
      .filter(run => {
        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesName = run.target_name?.toLowerCase().includes(query);
          const matchesTicker = run.ticker?.toLowerCase().includes(query);
          if (!matchesName && !matchesTicker) return false;
        }
        
        // Model filter
        if (modelFilter !== "all") {
          const modelName = run.model_name?.toLowerCase() || "";
          const filterLower = modelFilter.toLowerCase();
          if (!modelName.includes(filterLower)) return false;
        }
        
        // Company filter
        if (companyFilter !== "all" && run.ticker !== companyFilter) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [rixRuns, searchQuery, modelFilter, companyFilter]);

  const getModelIcon = (modelName: string | null) => {
    if (!modelName) return null;
    const lower = modelName.toLowerCase();
    if (lower.includes("chatgpt") || lower.includes("gpt")) return <ChatGPTIcon className="h-4 w-4" />;
    if (lower.includes("gemini")) return <GeminiIcon className="h-4 w-4" />;
    if (lower.includes("perplexity")) return <PerplexityIcon className="h-4 w-4" />;
    if (lower.includes("deepseek")) return <DeepseekIcon className="h-4 w-4" />;
    if (lower.includes("claude")) return <ClaudeIcon className="h-4 w-4" />;
    if (lower.includes("grok")) return <GrokIcon className="h-4 w-4" />;
    if (lower.includes("qwen")) return <QwenIcon className="h-4 w-4" />;
    return null;
  };

  const getAnalysisStatus = (run: typeof rixRuns[0]) => {
    if (run.rix_score !== null && run.analysis_completed_at) {
      return { status: "completed", label: "Analizado", icon: CheckCircle2, color: "text-green-600" };
    }
    if (run.search_completed_at) {
      return { status: "pending", label: "Pendiente análisis", icon: Clock, color: "text-yellow-600" };
    }
    return { status: "error", label: "Sin datos", icon: AlertTriangle, color: "text-destructive" };
  };

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setPipelineFilter("all");
    setModelFilter("all");
    setCompanyFilter("all");
  };

  const hasActiveFilters = searchQuery || pipelineFilter !== "all" || modelFilter !== "all" || companyFilter !== "all";

  if (runsLoading) {
    return (
      <Layout>
        <div className="container py-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
          <Skeleton className="h-[500px]" />
        </div>
      </Layout>
    );
  }

  if (runsError) {
    return (
      <Layout>
        <div className="container py-6">
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">Error cargando datos: {runsError.message}</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Dashboard V2</h1>
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
                <Beaker className="h-3 w-3 mr-1" />
                Pre-producción
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Sistema de 7 IAs • Tabla rix_runs_v2 • {filteredRuns.length} registros
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("cards")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Pipeline Filter */}
          <Select value={pipelineFilter} onValueChange={(v) => setPipelineFilter(v as PipelineFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pipelines</SelectItem>
              <SelectItem value="make_original">Make Original</SelectItem>
              <SelectItem value="lovable_v2">Lovable V2</SelectItem>
            </SelectContent>
          </Select>

          {/* Model Filter */}
          <Select value={modelFilter} onValueChange={(v) => setModelFilter(v as ModelFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Modelo IA" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Company Filter */}
          <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[200px] justify-between">
                {companyFilter === "all" 
                  ? "Todas las empresas" 
                  : companies?.find(c => c.ticker === companyFilter)?.issuer_name || companyFilter
                }
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
              <Command>
                <CommandInput placeholder="Buscar empresa..." />
                <CommandList>
                  <CommandEmpty>No se encontró la empresa.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem onSelect={() => { setCompanyFilter("all"); setCompanyOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", companyFilter === "all" ? "opacity-100" : "opacity-0")} />
                      Todas las empresas
                    </CommandItem>
                    {companies?.map((company) => (
                      <CommandItem
                        key={company.ticker}
                        onSelect={() => { setCompanyFilter(company.ticker); setCompanyOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", companyFilter === company.ticker ? "opacity-100" : "opacity-0")} />
                        {company.issuer_name} ({company.ticker})
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          )}
        </div>

        {/* Data Display */}
        {viewMode === "list" ? (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>RIX Score</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No se encontraron registros
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRuns.map((run) => {
                    const status = getAnalysisStatus(run);
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={run.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/rix-run-v2/${run.id}`)}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{run.target_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{run.ticker}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getModelIcon(run.model_name)}
                            <span className="text-sm">{run.model_name || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={run.source_pipeline === "lovable_v2" ? "default" : "secondary"}>
                            {run.source_pipeline}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {run.rix_score !== null ? (
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">{run.rix_score}</span>
                              {run.rix_score_adjusted && run.rix_score_adjusted !== run.rix_score && (
                                <span className="text-xs text-muted-foreground">({run.rix_score_adjusted})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={cn("flex items-center gap-1 text-sm", status.color)}>
                            <StatusIcon className="h-4 w-4" />
                            {status.label}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(run.period_from)} - {formatDate(run.period_to)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(run.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredRuns.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No se encontraron registros
                </CardContent>
              </Card>
            ) : (
              filteredRuns.map((run) => {
                const status = getAnalysisStatus(run);
                const StatusIcon = status.icon;
                return (
                  <Card 
                    key={run.id} 
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => navigate(`/rix-run-v2/${run.id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{run.target_name || "—"}</CardTitle>
                          <CardDescription>{run.ticker}</CardDescription>
                        </div>
                        <Badge variant={run.source_pipeline === "lovable_v2" ? "default" : "secondary"}>
                          {run.source_pipeline}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getModelIcon(run.model_name)}
                          <span className="text-sm">{run.model_name || "—"}</span>
                        </div>
                        {run.rix_score !== null ? (
                          <div className="text-2xl font-bold">{run.rix_score}</div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className={cn("flex items-center gap-1 text-sm", status.color)}>
                        <StatusIcon className="h-4 w-4" />
                        {status.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(run.period_from)} - {formatDate(run.period_to)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
