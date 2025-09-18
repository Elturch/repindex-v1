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
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>PARI Score</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Modelo IA</TableHead>
                      <TableHead>Fecha</TableHead>
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
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-primary">
                              {pariRun.pari_score || 0}
                            </span>
                            <span className="text-sm text-muted-foreground">/100</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatDateRange(pariRun.period_from, pariRun.period_to)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {pariRun.model_name || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
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
                    <CardHeader>
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
                    <CardContent>
                      <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">
                          {formatDateRange(pariRun.period_from, pariRun.period_to)}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {pariRun.model_name || "N/A"}
                          </Badge>
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
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