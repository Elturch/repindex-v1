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
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={[0, 100]}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            
            {/* Market average line */}
            <Line
              type="monotone"
              dataKey="market"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              name="Media del Mercado"
              dot={{ r: 4 }}
            />
            
            {/* Company lines */}
            {selectedCompanies.map((ticker, index) => (
              <Line
                key={ticker}
                type="monotone"
                dataKey={ticker}
                stroke={COMPANY_COLORS[index % COMPANY_COLORS.length]}
                strokeWidth={2}
                name={ticker}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
