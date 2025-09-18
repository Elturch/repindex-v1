import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AIFilter } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WinnerBadge } from "@/components/ui/winner-badge";
import { useEvaluations } from "@/hooks/useEvaluations";
import { Grid, List, Calendar, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [aiFilter, setAIFilter] = useState<AIFilter>("all");
  const navigate = useNavigate();
  
  const { data: evaluations, isLoading, error } = useEvaluations(searchQuery);

  const handleRowClick = (evaluationId: string) => {
    navigate(`/evaluation/${evaluationId}?filter=${aiFilter}`);
  };

  // Filter evaluations based on AI filter
  const filteredEvaluations = evaluations?.filter(evaluation => {
    if (aiFilter === "all") return true;
    if (aiFilter === "chatgpt") return evaluation.composite_winner === "ChatGPT";
    if (aiFilter === "perplexity") return evaluation.composite_winner === "Perplexity";
    return true;
  }) || [];

  if (isLoading) {
    return (
      <Layout 
        title="RepIndex Dashboard" 
        onSearch={setSearchQuery}
        onAIFilterChange={setAIFilter}
        aiFilter={aiFilter}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Cargando evaluaciones...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout 
        title="RepIndex Dashboard" 
        onSearch={setSearchQuery}
        onAIFilterChange={setAIFilter}
        aiFilter={aiFilter}
      >
        <div className="text-center py-8">
          <p className="text-destructive">Error al cargar las evaluaciones</p>
        </div>
      </Layout>
    );
  }

  const formatDateRange = (from?: string, to?: string) => {
    if (!from || !to) return "—";
    try {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      return `${format(fromDate, "dd/MM/yy", { locale: es })} - ${format(toDate, "dd/MM/yy", { locale: es })}`;
    } catch {
      return "—";
    }
  };

  return (
    <Layout 
      title="RepIndex Dashboard" 
      onSearch={setSearchQuery}
      onAIFilterChange={setAIFilter}
      aiFilter={aiFilter}
    >
      <div className="space-y-6">
        {/* Header with controls */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              {filteredEvaluations.length} evaluaciones encontradas
              {aiFilter !== "all" && (
                <span className="ml-2">
                  (filtrado por {aiFilter === "chatgpt" ? "ChatGPT" : "Perplexity"})
                </span>
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

        {/* Content */}
        {!filteredEvaluations || filteredEvaluations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay evaluaciones</h3>
              <p className="text-muted-foreground text-center">
                {searchQuery || aiFilter !== "all"
                  ? "No se encontraron evaluaciones que coincidan con los filtros aplicados."
                  : "Aún no hay evaluaciones en el sistema."
                }
              </p>
            </CardContent>
          </Card>
        ) : viewMode === "list" ? (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-center">ChatGPT</TableHead>
                  <TableHead className="text-center">Perplexity</TableHead>
                  <TableHead className="text-center">Ganador</TableHead>
                  <TableHead className="text-center">Δ%</TableHead>
                  <TableHead className="text-center">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvaluations.map((evaluation) => (
                  <TableRow
                    key={evaluation.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(evaluation.id)}
                  >
                    <TableCell className="font-medium">
                      {evaluation.target_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{evaluation.ticker || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateRange(evaluation.period_from, evaluation.period_to)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${aiFilter === "perplexity" ? "text-muted-foreground" : "text-chatgpt"}`}>
                        {evaluation.composite_chatgpt || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${aiFilter === "chatgpt" ? "text-muted-foreground" : "text-perplexity"}`}>
                        {evaluation.composite_perplexity || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <WinnerBadge 
                        winner={evaluation.composite_winner as "ChatGPT" | "Perplexity" | "Tie" | null} 
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {evaluation.composite_delta_pct ? (
                        <Badge variant={evaluation.composite_delta_pct > 0 ? "default" : "secondary"}>
                          {evaluation.composite_delta_pct > 0 ? "+" : ""}{evaluation.composite_delta_pct.toFixed(1)}%
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {format(new Date(evaluation.created_at), "dd/MM/yy", { locale: es })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvaluations.map((evaluation) => (
              <Card
                key={evaluation.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleRowClick(evaluation.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{evaluation.target_name}</CardTitle>
                    <Badge variant="outline">{evaluation.ticker || "—"}</Badge>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDateRange(evaluation.period_from, evaluation.period_to)}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ChatGPT</span>
                    <span className={`font-bold text-xl ${aiFilter === "perplexity" ? "text-muted-foreground" : "text-chatgpt"}`}>
                      {evaluation.composite_chatgpt || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Perplexity</span>
                    <span className={`font-bold text-xl ${aiFilter === "chatgpt" ? "text-muted-foreground" : "text-perplexity"}`}>
                      {evaluation.composite_perplexity || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <WinnerBadge 
                      winner={evaluation.composite_winner as "ChatGPT" | "Perplexity" | "Tie" | null} 
                    />
                    {evaluation.composite_delta_pct && (
                      <Badge variant={evaluation.composite_delta_pct > 0 ? "default" : "secondary"}>
                        {evaluation.composite_delta_pct > 0 ? "+" : ""}{evaluation.composite_delta_pct.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}