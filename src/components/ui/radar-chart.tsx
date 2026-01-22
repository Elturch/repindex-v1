import React from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Common type that works for both V1 and V2 market averages
export interface RadarMarketAverages {
  [key: string]: {
    [model: string]: number;
  };
}

interface RadarChartComparisonProps {
  companyData: {
    rix: number;
    nvm: number;
    drm: number;
    sim: number;
    rmm: number;
    cem: number;
    gam: number;
    dcm: number;
    cxm: number;
  };
  marketAverages: RadarMarketAverages;
  companyName: string;
  modelName: string;
}

// KPI labels with full descriptive names for radar chart (shortened for visual fit)
const kpiLabels: Record<string, string> = {
  rix: "RIX",
  nvm: "Narrativa",
  drm: "Evidencia", 
  sim: "Fuentes",
  rmm: "Actualidad",
  cem: "Riesgo",
  gam: "Gobierno",
  dcm: "Consistencia",
  cxm: "Mercado"
};

// Full descriptive names for tooltips and accessibility
const kpiFullNames: Record<string, string> = {
  rix: "Índice de Reputación (RIX)",
  nvm: "Calidad de la Narrativa (NVM)",
  drm: "Fortaleza de Evidencia (DRM)", 
  sim: "Autoridad de Fuentes (SIM)",
  rmm: "Actualidad y Empuje (RMM)",
  cem: "Controversia y Riesgo (CEM)",
  gam: "Independencia de Gobierno (GAM)",
  dcm: "Integridad del Grafo (DCM)",
  cxm: "Ejecución Corporativa (CXM)"
};

// Function to determine score category and color
const getScoreCategory = (score: number) => {
  if (score >= 70) {
    return { category: 'good', color: '#22c55e' }; // Green
  } else if (score >= 40) {
    return { category: 'needs-improvement', color: '#f59e0b' }; // Orange
  } else {
    return { category: 'insufficient', color: '#ef4444' }; // Red
  }
};

export function RadarChartComparison({ 
  companyData, 
  marketAverages, 
  companyName, 
  modelName 
}: RadarChartComparisonProps) {
  // Check if we have market data
  const hasMarketData = marketAverages && Object.values(marketAverages).some(modelData => 
    modelData && Object.values(modelData).some(value => value > 0)
  );

  // Prepare data for radar chart
  const radarData = Object.keys(kpiLabels).map((key) => {
    const kpi = key as keyof typeof kpiLabels;
    const empresaScore = Math.round(companyData[kpi] || 0);
    return {
      kpi: kpiLabels[kpi],
      empresa: empresaScore,
      mercado: hasMarketData ? Math.round(marketAverages[key]?.[modelName] || 0) : 0,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          📊 {hasMarketData ? "Comparativa vs Mercado" : "Perfil de Métricas"}
          <Badge variant="outline" className="text-xs">
            {modelName}
          </Badge>
        </CardTitle>
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-primary to-primary/80 shadow-sm"></div>
            <span className="font-medium text-foreground">{companyName}</span>
          </div>
          {hasMarketData && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-muted-foreground to-muted-foreground/60"></div>
              <span className="text-muted-foreground">Promedio Mercado</span>
            </div>
          )}
        </div>
        
        {/* Color legend for KPI categories */}
        <div className="flex flex-wrap gap-4 text-xs mt-3 pt-3 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }}></div>
            <span className="text-muted-foreground">≥70 pts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }}></div>
            <span className="text-muted-foreground">40-69 pts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }}></div>
            <span className="text-muted-foreground">&lt;40 pts</span>
          </div>
        </div>
        
        {!hasMarketData && (
          <div className="text-xs text-muted-foreground mt-2 italic">
            La comparativa con el mercado se mostrará cuando haya más datos del periodo
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[450px] sm:h-[500px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 30, right: 30, bottom: 30, left: 30 }}>
              <PolarGrid 
                gridType="polygon" 
                stroke="hsl(var(--border))"
                strokeWidth={1}
                fill="hsl(var(--muted))"
                fillOpacity={0.03}
              />
              <PolarAngleAxis 
                dataKey="kpi" 
                tick={{ 
                  fontSize: 13, 
                  fill: "hsl(var(--foreground))",
                  fontWeight: 500
                }}
                className="text-sm font-medium"
              />
              <PolarRadiusAxis 
                angle={90} 
                domain={[0, 100]} 
                tick={{ 
                  fontSize: 11, 
                  fill: "hsl(var(--muted-foreground))",
                  fontWeight: 400
                }}
                tickCount={6}
                stroke="hsl(var(--border))"
                strokeWidth={0.5}
              />
              <Radar
                name={companyName}
                dataKey="empresa"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.15}
                strokeWidth={3}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  const score = payload?.payload?.empresa || 0;
                  const { color } = getScoreCategory(score);
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={color}
                      stroke="hsl(var(--background))"
                      strokeWidth={2.5}
                      style={{
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
                        transition: 'all 0.2s ease'
                      }}
                    />
                  );
                }}
              />
              {hasMarketData && (
                <Radar
                  name="Promedio Mercado"
                  dataKey="mercado"
                  stroke="hsl(var(--muted-foreground))"
                  fill="hsl(var(--muted-foreground))"
                  fillOpacity={0.08}
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  dot={{ 
                    r: 4, 
                    fill: "hsl(var(--muted-foreground))",
                    stroke: "hsl(var(--background))",
                    strokeWidth: 1
                  }}
                />
              )}
            </RadarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Summary - only show market comparison if we have market data */}
        {hasMarketData ? (
          <div className="mt-6 pt-4 border-t border-border/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="text-center p-3 rounded-lg bg-good/5 border border-good/20">
                <div className="text-muted-foreground text-xs">KPIs por encima</div>
                <div className="font-bold text-lg text-good mt-1">
                  {radarData.filter(d => d.empresa > d.mercado).length}/9
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <div className="text-muted-foreground text-xs">Diferencia media</div>
                <div className="font-bold text-lg text-foreground mt-1">
                  {Math.round(
                    radarData.reduce((sum, d) => sum + (d.empresa - d.mercado), 0) / radarData.length
                  )}pts
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="text-muted-foreground text-xs">RIX vs Mercado</div>
                <div className={`font-bold text-lg mt-1 ${radarData[0]?.empresa > radarData[0]?.mercado ? 'text-good' : 'text-needs-improvement'}`}>
                  {radarData[0]?.empresa > radarData[0]?.mercado ? '+' : ''}
                  {Math.round((radarData[0]?.empresa || 0) - (radarData[0]?.mercado || 0))}pts
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 pt-4 border-t border-border/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="text-center p-3 rounded-lg bg-good/5 border border-good/20">
                <div className="text-muted-foreground text-xs">KPIs ≥70</div>
                <div className="font-bold text-lg text-good mt-1">
                  {radarData.filter(d => d.empresa >= 70).length}/9
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-needs-improvement/5 border border-needs-improvement/20">
                <div className="text-muted-foreground text-xs">KPIs 40-69</div>
                <div className="font-bold text-lg text-needs-improvement mt-1">
                  {radarData.filter(d => d.empresa >= 40 && d.empresa < 70).length}/9
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-insufficient/5 border border-insufficient/20">
                <div className="text-muted-foreground text-xs">KPIs &lt;40</div>
                <div className="font-bold text-lg text-insufficient mt-1">
                  {radarData.filter(d => d.empresa < 40).length}/9
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
