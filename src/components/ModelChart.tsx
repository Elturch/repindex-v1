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
            
            {/* Eje izquierdo: RIX Score (0-100) */}
            <YAxis 
              yAxisId="left"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={[0, 100]}
              label={{ 
                value: 'RIX Score', 
                angle: -90, 
                position: 'insideLeft',
                style: { fill: 'hsl(var(--muted-foreground))' }
              }}
            />
            
            {/* Eje derecho: Precio (€) */}
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={['auto', 'auto']}
              label={{ 
                value: 'Precio (€)', 
                angle: 90, 
                position: 'insideRight',
                style: { fill: 'hsl(var(--muted-foreground))' }
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
            
            {/* Market average line (RIX) */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="market"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              name="Media del Mercado (RIX)"
              dot={{ r: 4 }}
            />
            
            {/* Company RIX lines */}
            {selectedCompanies.map((ticker, index) => (
              <Line
                key={`${ticker}-rix`}
                yAxisId="left"
                type="monotone"
                dataKey={ticker}
                stroke={COMPANY_COLORS[index % COMPANY_COLORS.length]}
                strokeWidth={2}
                name={`${ticker} (RIX)`}
                dot={{ r: 3 }}
              />
            ))}
            
            {/* Company price lines (only for traded companies) */}
            {selectedCompanies.map((ticker, index) => {
              // Check if this company has price data in any data point
              const hasPrice = chartData.some(d => 
                d[`${ticker}_isTraded`] && d[`${ticker}_price`] && d[`${ticker}_price`] > 0
              );
              
              if (!hasPrice) return null;
              
              return (
                <Line
                  key={`${ticker}-price`}
                  yAxisId="right"
                  type="monotone"
                  dataKey={`${ticker}_price`}
                  stroke={COMPANY_COLORS[index % COMPANY_COLORS.length]}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={`${ticker} (€)`}
                  dot={{ r: 3 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
