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

// Fixed domain for absolute RIX values (0-100 scale)
// RIX scores are always between 0-100, with typical values between 30-85
const FIXED_RIX_DOMAIN: [number, number] = [0, 100];

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
            
            {/* Single Y-axis: Absolute RIX Score (0-100) */}
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={FIXED_RIX_DOMAIN}
              label={{ 
                value: 'Puntuación RIX', 
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
            
            {/* Market average RIX (absolute value) */}
            <Line
              type="monotone"
              dataKey="market"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={2}
              name="Media Mercado"
              dot={false}
            />
            
            {/* Company RIX scores (absolute values) */}
            {selectedCompanies.map((ticker, index) => {
              const color = COMPANY_COLORS[index % COMPANY_COLORS.length];
              const companyName = chartData[0]?.[`${ticker}_name`] || ticker;
              
              return (
                <Line
                  key={ticker}
                  type="monotone"
                  dataKey={`${ticker}_rix`}
                  stroke={color}
                  strokeWidth={2}
                  name={`${companyName}`}
                  dot={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
