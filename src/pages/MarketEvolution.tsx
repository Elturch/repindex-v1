import React, { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { useTrendDataLight } from "@/hooks/useTrendDataLight";
import { useCompanies } from "@/hooks/useCompanies";
import { useSectorCategories } from "@/hooks/useSectorCategories";
import { useIbexFamilyCategories } from "@/hooks/useIbexFamilyCategories";
import { useChatContext } from "@/contexts/ChatContext";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Building2, Factory } from "lucide-react";
import { ModelChart } from "@/components/ModelChart";
import { Brain } from "lucide-react";

// AI model icons mapping
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";

const MAX_COMPANIES = 6;

export function MarketEvolution() {
  const [ibexFilter, setIbexFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [numWeeks] = useState<number>(6);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [companyToAdd, setCompanyToAdd] = useState<string>("");

  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: sectorCategories } = useSectorCategories();
  const { data: ibexFamilyCategories } = useIbexFamilyCategories();
  const { setPageContext } = useChatContext();

  // Get company names for selected tickers
  const selectedCompanyNames = useMemo(() => {
    if (!companies || selectedCompanies.length === 0) return [];
    return selectedCompanies.map(ticker => {
      const company = companies.find(c => c.ticker === ticker);
      return company?.issuer_name || ticker;
    });
  }, [companies, selectedCompanies]);

  // Update chat context with selected companies
  useEffect(() => {
    setPageContext({
      name: 'Evolución del Mercado',
      path: '/market-evolution',
      dynamicData: {
        selectedCompanies: selectedCompanyNames,
        selectedTickers: selectedCompanies,
        selectedSector: sectorFilter !== 'all' ? sectorFilter : null,
        selectedIbexFamily: ibexFilter !== 'all' ? ibexFilter : null,
      }
    });
  }, [selectedCompanyNames, selectedCompanies, sectorFilter, ibexFilter, setPageContext]);

  // Get market + company trend data for all 4 models (lightweight queries)
  const { data: chatGPTData, isLoading: chatGPTLoading } = useTrendDataLight({
    tickers: selectedCompanies,
    ibexFamily: ibexFilter,
    sector: sectorFilter,
    numWeeks,
    modelFilter: "ChatGPT"
  });

  const { data: perplexityData, isLoading: perplexityLoading } = useTrendDataLight({
    tickers: selectedCompanies,
    ibexFamily: ibexFilter,
    sector: sectorFilter,
    numWeeks,
    modelFilter: "Perplexity"
  });

  const { data: geminiData, isLoading: geminiLoading } = useTrendDataLight({
    tickers: selectedCompanies,
    ibexFamily: ibexFilter,
    sector: sectorFilter,
    numWeeks,
    modelFilter: "Google Gemini"
  });

  const { data: deepseekData, isLoading: deepseekLoading } = useTrendDataLight({
    tickers: selectedCompanies,
    ibexFamily: ibexFilter,
    sector: sectorFilter,
    numWeeks,
    modelFilter: "Deepseek"
  });

  // Filter companies by current filters (limit to 6)
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    
    let filtered = companies;
    
    if (ibexFilter && ibexFilter !== "all") {
      filtered = filtered.filter(c => c.ibex_family_code === ibexFilter);
    }
    
    if (sectorFilter && sectorFilter !== "all") {
      filtered = filtered.filter(c => c.sector_category === sectorFilter);
    }
    
    // Sort alphabetically
    return filtered
      .sort((a, b) => a.issuer_name.localeCompare(b.issuer_name));
  }, [companies, ibexFilter, sectorFilter]);

  // Normalize values to base 100 index
  const normalizeToIndex = (values: number[]): number[] => {
    if (values.length === 0) return [];
    const baseValue = values[0];
    if (baseValue === 0 || !baseValue) return values.map(() => 100);
    return values.map(v => (v / baseValue) * 100);
  };

  // Prepare chart data for each model (data is already combined in useTrendDataLight)
  const prepareChartData = (data: any[]) => {
    if (!data || data.length === 0) return [];
    
    // First, extract complete series per company to normalize
    const companySeries: Record<string, {rix: number[], price: number[], isTraded: boolean}> = {};
    
    selectedCompanies.forEach(ticker => {
      companySeries[ticker] = {
        rix: [],
        price: [],
        isTraded: false
      };
    });
    
    // Collect all values per company
    data.forEach((point: any) => {
      selectedCompanies.forEach(ticker => {
        if (point[ticker] !== undefined) {
          companySeries[ticker].rix.push(point[ticker]);
          const priceValue = point[`${ticker}_price`] || 0;
          if (priceValue > 0) {
            companySeries[ticker].price.push(priceValue);
          }
          companySeries[ticker].isTraded = point[`${ticker}_isTraded`] || false;
        }
      });
    });
    
    // Normalize series to base 100 index
    const normalizedSeries: Record<string, {rixIndex: number[], priceIndex: number[], isTraded: boolean}> = {};
    
    Object.keys(companySeries).forEach(ticker => {
      const {rix, price, isTraded} = companySeries[ticker];
      normalizedSeries[ticker] = {
        rixIndex: normalizeToIndex(rix),
        priceIndex: isTraded && price.length > 0 ? normalizeToIndex(price) : [],
        isTraded
      };
    });
    
    // Also normalize market average
    const marketRixValues = data.map(p => p.market);
    const marketRixIndex = normalizeToIndex(marketRixValues);
    
    // Build data points with normalized indices
    return data.map((point: any, idx: number) => {
      const dataPoint: any = {
        date: point.batchLabel,
        market_index: marketRixIndex[idx],
      };
      
      // Add indices per company
      selectedCompanies.forEach(ticker => {
        if (normalizedSeries[ticker]) {
          const ns = normalizedSeries[ticker];
          dataPoint[`${ticker}_rix_index`] = ns.rixIndex[idx];
          dataPoint[`${ticker}_name`] = point[`${ticker}_name`] || ticker;
          dataPoint[`${ticker}_isTraded`] = ns.isTraded;
          
          // Only add price_index if traded AND has data
          if (ns.isTraded && ns.priceIndex.length > 0) {
            dataPoint[`${ticker}_price_index`] = ns.priceIndex[idx];
          }
        }
      });
      
      return dataPoint;
    });
  };

  const chatGPTChartData = useMemo(() => 
    prepareChartData(chatGPTData),
    [chatGPTData, selectedCompanies]
  );

  const perplexityChartData = useMemo(() => 
    prepareChartData(perplexityData),
    [perplexityData, selectedCompanies]
  );

  const geminiChartData = useMemo(() => 
    prepareChartData(geminiData),
    [geminiData, selectedCompanies]
  );

  const deepseekChartData = useMemo(() => 
    prepareChartData(deepseekData),
    [deepseekData, selectedCompanies]
  );

  // Add company handler with limit check
  const handleAddCompany = () => {
    if (!companyToAdd || selectedCompanies.includes(companyToAdd)) return;
    if (selectedCompanies.length >= MAX_COMPANIES) {
      return;
    }
    setSelectedCompanies([...selectedCompanies, companyToAdd]);
    setCompanyToAdd("");
  };

  const handleRemoveCompany = (ticker: string) => {
    setSelectedCompanies(selectedCompanies.filter(t => t !== ticker));
  };

  if (companiesLoading) {
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
            Comparación de Modelos de IA - Últimas {numWeeks} Semanas
          </p>
        </div>

        {/* Filters and Company Selection */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* IBEX Family Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Factory className="h-4 w-4" />
                  Familia IBEX
                </label>
                <Select value={ibexFilter} onValueChange={setIbexFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las Familias</SelectItem>
                    {ibexFamilyCategories?.map((cat) => (
                      <SelectItem key={cat.ibex_family_code} value={cat.ibex_family_code}>
                        {cat.ibex_family_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sector Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Sector
                </label>
                <Select value={sectorFilter} onValueChange={setSectorFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Sectores</SelectItem>
                    {sectorCategories?.map((cat) => (
                      <SelectItem key={cat.sector_category} value={cat.sector_category}>
                        {cat.sector_category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Company Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Añadir Empresas (máx. {MAX_COMPANIES})
              </label>
              <div className="flex gap-2">
                <Select 
                  value={companyToAdd} 
                  onValueChange={setCompanyToAdd}
                  disabled={selectedCompanies.length >= MAX_COMPANIES}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar empresa..." />
                  </SelectTrigger>
                  <SelectContent>
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
                  disabled={!companyToAdd || selectedCompanies.length >= MAX_COMPANIES}
                >
                  Añadir
                </Button>
              </div>
            </div>

            {/* Selected Companies */}
            {selectedCompanies.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCompanies.map((ticker) => {
                  const company = companies?.find(c => c.ticker === ticker);
                  return (
                    <Badge key={ticker} variant="secondary" className="px-3 py-1">
                      {company?.issuer_name || ticker} ({ticker})
                      <button
                        onClick={() => handleRemoveCompany(ticker)}
                        className="ml-2 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts Grid - 2x2 layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ModelChart
            modelName="ChatGPT"
            modelIcon={<ChatGPTIcon className="h-5 w-5" />}
            chartData={chatGPTChartData}
            selectedCompanies={selectedCompanies}
            companyColors={[]}
            isLoading={chatGPTLoading}
          />

          <ModelChart
            modelName="Perplexity"
            modelIcon={<PerplexityIcon className="h-5 w-5" />}
            chartData={perplexityChartData}
            selectedCompanies={selectedCompanies}
            companyColors={[]}
            isLoading={perplexityLoading}
          />

          <ModelChart
            modelName="Google Gemini"
            modelIcon={<GeminiIcon className="h-5 w-5" />}
            chartData={geminiChartData}
            selectedCompanies={selectedCompanies}
            companyColors={[]}
            isLoading={geminiLoading}
          />

          <ModelChart
            modelName="Deepseek"
            modelIcon={<DeepseekIcon className="h-5 w-5" />}
            chartData={deepseekChartData}
            selectedCompanies={selectedCompanies}
            companyColors={[]}
            isLoading={deepseekLoading}
          />
        </div>
      </div>
    </Layout>
  );
}
