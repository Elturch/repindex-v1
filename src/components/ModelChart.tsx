import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendDataPoint } from "@/hooks/useTrendData";

interface ModelChartProps {
  modelName: string;
  modelIcon: React.ReactNode;
  chartData: any[];
  selectedCompanies: string[];
  companyColors: string[];
  isLoading: boolean;
}

const COMPANY_COLORS = [
  'hsl(var(--good))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--destructive))',
];

// Calculate dynamic domain for index values
const calculateIndexDomain = (chartData: any[], selectedCompanies: string[]): [number, number] => {
  if (!chartData || chartData.length === 0) return [70, 130];
  
  const allIndexValues: number[] = [];
  
  chartData.forEach(point => {
    // Always include market index
    if (point.market_index !== undefined && point.market_index !== null) {
      allIndexValues.push(point.market_index);
    }
    // Include company indices if any
    selectedCompanies.forEach(ticker => {
      if (point[`${ticker}_rix_index`]) allIndexValues.push(point[`${ticker}_rix_index`]);
      if (point[`${ticker}_price_index`]) allIndexValues.push(point[`${ticker}_price_index`]);
    });
  });
  
  if (allIndexValues.length === 0) return [70, 130];
  
  const minValue = Math.min(...allIndexValues);
  const maxValue = Math.max(...allIndexValues);
  const range = maxValue - minValue;
  const padding = Math.max(range * 0.15, 5);
  
  return [
    Math.floor(minValue - padding),
    Math.ceil(maxValue + padding)
  ];
};

export function ModelChart({
  modelName,
  modelIcon,
  chartData,
  selectedCompanies,
  companyColors,
  isLoading
}: ModelChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {modelIcon}
            {modelName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-[300px]" />
        </CardContent>
      </Card>
    );
  }

  // Calculate dynamic index domain
  const indexDomain = calculateIndexDomain(chartData, selectedCompanies);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {modelIcon}
          {modelName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            
            {/* Single Y-axis: Base 100 Index */}
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={indexDomain}
              label={{ 
                value: 'Índice Base 100', 
                angle: -90, 
                position: 'insideLeft',
                style: { fill: 'hsl(var(--muted-foreground))', textAnchor: 'middle' }
              }}
            />
            
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            
            {/* Market average RIX index */}
            <Line
              type="monotone"
              dataKey="market_index"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={2}
              name="Media Mercado"
              dot={false}
            />
            
            {/* Company RIX and Price indices */}
            {selectedCompanies.map((ticker, index) => {
              const color = COMPANY_COLORS[index % COMPANY_COLORS.length];
              const companyName = chartData[0]?.[`${ticker}_name`] || ticker;
              const isTraded = chartData[0]?.[`${ticker}_isTraded`] || false;
              
              return (
                <React.Fragment key={ticker}>
                  {/* RIX Index line (always show) */}
                  <Line
                    type="monotone"
                    dataKey={`${ticker}_rix_index`}
                    stroke={color}
                    strokeWidth={2}
                    name={`${companyName} RIX`}
                    dot={false}
                  />
                </React.Fragment>
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
