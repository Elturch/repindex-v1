import React, { useState, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { useTrendData } from "@/hooks/useTrendData";
import { useCompanies } from "@/hooks/useCompanies";
import { useSectorCategories } from "@/hooks/useSectorCategories";
import { useIbexFamilyCategories } from "@/hooks/useIbexFamilyCategories";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, ArrowRight, X, Building2, Factory, BarChart3, Brain } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { cn } from "@/lib/utils";

// Color palette for company lines
const COMPANY_COLORS = [
  'hsl(var(--good))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
];

export function MarketEvolution() {
  const [ibexFilter, setIbexFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [numWeeks, setNumWeeks] = useState<number>(4);
  const [modelFilter, setModelFilter] = useState<string>("ChatGPT");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [companyToAdd, setCompanyToAdd] = useState<string>("");

  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: sectorCategories } = useSectorCategories();
  const { data: ibexFamilyCategories } = useIbexFamilyCategories();

  // Get market trend data
  const { data: marketData, isLoading: marketLoading } = useTrendData({
    ibexFamily: ibexFilter,
    sector: sectorFilter,
    numWeeks,
    modelFilter
  });

  // Get company-specific trends
  const companyQueries = selectedCompanies.map(ticker =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTrendData({
      ticker,
      ibexFamily: ibexFilter,
      sector: sectorFilter,
      numWeeks,
      modelFilter
    })
  );

  // Filter companies by current filters
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    
    let filtered = companies;
    
    if (ibexFilter && ibexFilter !== "all") {
      filtered = filtered.filter(c => c.ibex_family_code === ibexFilter);
    }
    
    if (sectorFilter && sectorFilter !== "all") {
      filtered = filtered.filter(c => c.sector_category === sectorFilter);
    }
    
    return filtered.sort((a, b) => a.issuer_name.localeCompare(b.issuer_name));
  }, [companies, ibexFilter, sectorFilter]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!marketData?.marketTrend) return [];

    return marketData.marketTrend.map((point, index) => {
      const dataPoint: any = {
        date: point.batchLabel,
        market: point.averageRix,
      };

      // Add company data
      selectedCompanies.forEach((ticker, companyIndex) => {
        const companyData = companyQueries[companyIndex]?.data?.companyTrend?.[index];
        if (companyData) {
          dataPoint[ticker] = companyData.companyRix;
        }
      });

      return dataPoint;
    });
  }, [marketData, companyQueries, selectedCompanies]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!marketData?.marketTrend || marketData.marketTrend.length < 2) return null;

    const first = marketData.marketTrend[0];
    const last = marketData.marketTrend[marketData.marketTrend.length - 1];
    const marketDelta = last.averageRix - first.averageRix;
    const marketDeltaPercent = ((marketDelta / first.averageRix) * 100).toFixed(1);

    const companySummaries = selectedCompanies.map((ticker, index) => {
      const companyTrend = companyQueries[index]?.data?.companyTrend;
      if (!companyTrend || companyTrend.length < 2) return null;

      const companyFirst = companyTrend[0].companyRix!;
      const companyLast = companyTrend[companyTrend.length - 1].companyRix!;
      const delta = companyLast - companyFirst;
      const deltaPercent = ((delta / companyFirst) * 100).toFixed(1);
      const vsMarket = companyLast - last.averageRix;
      
      const company = companies?.find(c => c.ticker === ticker);

      return {
        ticker,
        name: company?.issuer_name || ticker,
        first: companyFirst,
        last: companyLast,
        delta,
        deltaPercent,
        vsMarket,
        isAboveMarket: vsMarket > 0
      };
    }).filter(Boolean);

    return {
      market: {
        first: first.averageRix,
        last: last.averageRix,
        delta: marketDelta,
        deltaPercent: marketDeltaPercent,
        trend: marketDelta > 0 ? 'up' : marketDelta < 0 ? 'down' : 'stable'
      },
      companies: companySummaries
    };
  }, [marketData, companyQueries, selectedCompanies, companies]);

  const handleAddCompany = () => {
    if (companyToAdd && !selectedCompanies.includes(companyToAdd)) {
      setSelectedCompanies([...selectedCompanies, companyToAdd]);
      setCompanyToAdd("");
    }
  };

  const handleRemoveCompany = (ticker: string) => {
    setSelectedCompanies(selectedCompanies.filter(t => t !== ticker));
  };

  if (marketLoading || companiesLoading) {
    return (
      <Layout title="Evolución del Mercado">
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-96" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Evolución del Mercado">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            📈 Evolución del Mercado
          </h1>
          <p className="text-sm text-muted-foreground">
            Tendencias comparativas de RIX Score
          </p>
        </div>

        {/* Market Summary Badge */}
        {summary && marketData?.marketTrend && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Media de la Bolsa</p>
                    <p className="text-2xl font-bold">{summary.market.last} RIX</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {summary.market.trend === 'up' ? (
                      <TrendingUp className="h-5 w-5 text-good" />
                    ) : summary.market.trend === 'down' ? (
                      <TrendingDown className="h-5 w-5 text-insufficient" />
                    ) : (
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className={cn(
                      "text-lg font-semibold",
                      summary.market.delta > 0 ? "text-good" : 
                      summary.market.delta < 0 ? "text-insufficient" : 
                      "text-muted-foreground"
                    )}>
                      {summary.market.delta > 0 ? '+' : ''}{summary.market.deltaPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {marketData.marketTrend[marketData.marketTrend.length - 1]?.numCompanies || 0} empresas
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Model Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Modelo IA
                </label>
                <Select value={modelFilter} onValueChange={setModelFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="ChatGPT">ChatGPT</SelectItem>
                    <SelectItem value="Google Gemini">Google Gemini</SelectItem>
                    <SelectItem value="Perplexity">Perplexity</SelectItem>
                    <SelectItem value="Deepseek">Deepseek</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* IBEX Family Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  IBEX Family
                </label>
                <Select value={ibexFilter} onValueChange={setIbexFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="all">Todas</SelectItem>
                    {ibexFamilyCategories?.map((ibex) => (
                      <SelectItem key={ibex.ibex_family_code} value={ibex.ibex_family_code}>
                        {ibex.ibex_family_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sector Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Factory className="h-4 w-4" />
                  Sector
                </label>
                <Select value={sectorFilter} onValueChange={setSectorFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="all">Todos</SelectItem>
                    {sectorCategories?.map((sector) => (
                      <SelectItem key={sector.sector_category} value={sector.sector_category}>
                        {sector.sector_category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Period Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Período</label>
                <Select value={numWeeks.toString()} onValueChange={(v) => setNumWeeks(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="2">Últimas 2 semanas</SelectItem>
                    <SelectItem value="4">Últimas 4 semanas</SelectItem>
                    <SelectItem value="6">Últimas 6 semanas</SelectItem>
                    <SelectItem value="8">Últimas 8 semanas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Company Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Seleccionar empresas para comparar
              </label>
              <div className="flex gap-2">
                <Select value={companyToAdd} onValueChange={setCompanyToAdd}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Buscar empresa..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    {filteredCompanies
                      .filter(c => !selectedCompanies.includes(c.ticker))
                      .map((company) => (
                        <SelectItem key={company.ticker} value={company.ticker}>
                          {company.issuer_name} ({company.ticker})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleAddCompany} 
                  disabled={!companyToAdd || selectedCompanies.length >= 4}
                >
                  + Añadir
                </Button>
              </div>
              
              {/* Selected companies */}
              {selectedCompanies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedCompanies.map((ticker, index) => {
                    const company = companies?.find(c => c.ticker === ticker);
                    return (
                      <Badge key={ticker} variant="secondary" className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COMPANY_COLORS[index] }}
                        />
                        {company?.issuer_name || ticker}
                        <button
                          onClick={() => handleRemoveCompany(ticker)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chart */}
        {marketData?.error ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              {marketData.error}
            </CardContent>
          </Card>
        ) : chartData.length < 2 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Historial insuficiente (mínimo 2 semanas de datos)
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Evolución de RIX Score</CardTitle>
              <CardDescription>
                La línea azul muestra la media de RIX Score de todas las empresas de la Bolsa (filtradas). Las líneas punteadas muestran empresas individuales para comparación.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  
                  {/* Market average line */}
                  <Line 
                    type="monotone" 
                    dataKey="market" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={4}
                    name="📊 Media de la Bolsa"
                    dot={{ r: 6, strokeWidth: 2, fill: "hsl(var(--primary))" }}
                  />
                  
                  {/* Company lines */}
                  {selectedCompanies.map((ticker, index) => {
                    const company = companies?.find(c => c.ticker === ticker);
                    return (
                      <Line 
                        key={ticker}
                        type="monotone" 
                        dataKey={ticker}
                        stroke={COMPANY_COLORS[index]}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name={company?.issuer_name || ticker}
                        dot={{ r: 4 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Summary Statistics */}
        {summary && (
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Market summary */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                {summary.market.trend === 'up' ? (
                  <TrendingUp className="h-5 w-5 text-good" />
                ) : summary.market.trend === 'down' ? (
                  <TrendingDown className="h-5 w-5 text-insufficient" />
                ) : (
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">Media del mercado</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.market.first} → {summary.market.last}{" "}
                    <span className={cn(
                      "font-medium",
                      summary.market.delta > 0 ? "text-good" : 
                      summary.market.delta < 0 ? "text-insufficient" : 
                      "text-muted-foreground"
                    )}>
                      ({summary.market.delta > 0 ? '+' : ''}{summary.market.deltaPercent}%)
                    </span>
                  </p>
                </div>
              </div>

              {/* Company summaries */}
              {summary.companies.map((company: any) => (
                <div key={company.ticker} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  {company.delta > 0 ? (
                    <TrendingUp className="h-5 w-5 text-good" />
                  ) : company.delta < 0 ? (
                    <TrendingDown className="h-5 w-5 text-insufficient" />
                  ) : (
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{company.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {company.first} → {company.last}{" "}
                      <span className={cn(
                        "font-medium",
                        company.delta > 0 ? "text-good" : 
                        company.delta < 0 ? "text-insufficient" : 
                        "text-muted-foreground"
                      )}>
                        ({company.delta > 0 ? '+' : ''}{company.deltaPercent}%)
                      </span>
                      {" • "}
                      <span className={company.isAboveMarket ? "text-good" : "text-insufficient"}>
                        {company.isAboveMarket ? "Por encima" : "Por debajo"} de la media
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
