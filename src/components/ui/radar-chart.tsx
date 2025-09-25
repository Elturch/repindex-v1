import React from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarketAverages } from "@/hooks/useMarketAverages";

interface RadarChartComparisonProps {
  companyData: {
    pari: number;
    lns: number;
    es: number;
    sam: number;
    rm: number;
    clr: number;
    gip: number;
    kgi: number;
    mpi: number;
  };
  marketAverages: MarketAverages;
  companyName: string;
  modelName: string;
}

const kpiLabels = {
  pari: "PARI",
  lns: "LNS",
  es: "ES", 
  sam: "SAM",
  rm: "RM",
  clr: "CLR",
  gip: "GIP",
  kgi: "KGI",
  mpi: "MPI"
};

export function RadarChartComparison({ 
  companyData, 
  marketAverages, 
  companyName, 
  modelName 
}: RadarChartComparisonProps) {
  // Prepare data for radar chart
  const radarData = Object.keys(kpiLabels).map((key) => {
    const kpi = key as keyof typeof kpiLabels;
    return {
      kpi: kpiLabels[kpi],
      empresa: Math.round(companyData[kpi] || 0),
      mercado: Math.round(marketAverages[key]?.[modelName] || 0),
    };
  });

  // Check if we have market data
  const hasMarketData = Object.values(marketAverages).some(modelData => 
    Object.values(modelData).some(value => value > 0)
  );

  if (!hasMarketData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            📊 Comparativa vs Mercado
            <Badge variant="outline" className="text-xs">
              {modelName}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <p className="text-sm">No hay datos suficientes del mercado para esta comparativa</p>
              <p className="text-xs mt-2">Se necesitan más análisis del mismo periodo</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          📊 Comparativa vs Mercado
          <Badge variant="outline" className="text-xs">
            {modelName}
          </Badge>
        </CardTitle>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary"></div>
            <span className="text-muted-foreground">{companyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted-foreground"></div>
            <span className="text-muted-foreground">Promedio Mercado</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <PolarGrid gridType="polygon" className="stroke-border" />
              <PolarAngleAxis 
                dataKey="kpi" 
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                className="text-xs"
              />
              <PolarRadiusAxis 
                angle={90} 
                domain={[0, 100]} 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickCount={6}
              />
              <Radar
                name={companyName}
                dataKey="empresa"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.1}
                strokeWidth={2}
                dot={{ r: 4, fill: "hsl(var(--primary))" }}
              />
              <Radar
                name="Promedio Mercado"
                dataKey="mercado"
                stroke="hsl(var(--muted-foreground))"
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.05}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: "hsl(var(--muted-foreground))" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Summary */}
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-3 gap-4 text-sm text-center">
            <div>
              <div className="text-muted-foreground">KPIs por encima</div>
              <div className="font-semibold text-good">
                {radarData.filter(d => d.empresa > d.mercado).length}/9
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Diferencia media</div>
              <div className="font-semibold">
                {Math.round(
                  radarData.reduce((sum, d) => sum + (d.empresa - d.mercado), 0) / radarData.length
                )}pts
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">PARI vs Mercado</div>
              <div className={`font-semibold ${radarData[0]?.empresa > radarData[0]?.mercado ? 'text-good' : 'text-needs-improvement'}`}>
                {radarData[0]?.empresa > radarData[0]?.mercado ? '+' : ''}
                {Math.round((radarData[0]?.empresa || 0) - (radarData[0]?.mercado || 0))}pts
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}