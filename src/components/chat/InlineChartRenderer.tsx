import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";

const COLORS = [
  'hsl(158, 64%, 52%)',  // ChatGPT green
  'hsl(217, 89%, 61%)',  // Gemini blue
  'hsl(221, 83%, 53%)',  // Perplexity
  'hsl(219, 95%, 64%)',  // DeepSeek
  'hsl(43, 96%, 56%)',   // Grok yellow
  'hsl(280, 70%, 60%)',  // Qwen purple
];

export interface TrendPoint {
  week: string;
  date: string;
  rixScore: number;
  marketAverage?: number;
  delta?: number;
}

export interface ComparisonPoint {
  name: string;
  score: number;
  color?: string;
}

export interface RadarPoint {
  subject: string;
  value: number;
  fullMark?: number;
}

export interface ChartData {
  type: 'trend' | 'comparison' | 'radar';
  data: TrendPoint[] | ComparisonPoint[] | RadarPoint[];
  title?: string;
  subtitle?: string;
  companyName?: string;
}

interface InlineChartRendererProps {
  chartData?: ChartData;
  compact?: boolean;
}

function TrendChart({ data, title, subtitle, compact }: { 
  data: TrendPoint[]; 
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  if (!data || data.length < 2) return null;
  
  const latestScore = data[data.length - 1]?.rixScore ?? 0;
  const firstScore = data[0]?.rixScore ?? 0;
  const trend = latestScore - firstScore;
  const trendPercent = firstScore > 0 ? ((trend / firstScore) * 100).toFixed(1) : '0';
  
  const chartColor = trend >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)';
  const chartWidth = compact ? 240 : 320;
  const chartHeight = compact ? 100 : 140;

  return (
    <Card className="my-3 border-primary/20 bg-gradient-to-br from-background to-muted/30">
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h4 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground`}>
              {title || '📈 Evolución RIX'}
            </h4>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {trend > 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : trend < 0 ? (
              <TrendingDown className="h-4 w-4 text-red-600" />
            ) : (
              <Minus className="h-4 w-4 text-muted-foreground" />
            )}
            <Badge 
              variant={trend >= 0 ? 'default' : 'destructive'} 
              className={`text-[10px] ${trend >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : ''}`}
            >
              {trend >= 0 ? '+' : ''}{trend.toFixed(1)} pts ({trendPercent}%)
            </Badge>
          </div>
        </div>
        
        <div className="flex justify-center">
          <ResponsiveContainer width={chartWidth} height={chartHeight}>
            <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="week" 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  `${value.toFixed(1)} pts`, 
                  name === 'rixScore' ? 'RIX' : 'Media Mercado'
                ]}
                contentStyle={{ 
                  background: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '11px'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="rixScore" 
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#trendGradient)"
                name="RIX"
              />
              {data[0]?.marketAverage !== undefined && (
                <Area 
                  type="monotone" 
                  dataKey="marketAverage" 
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  fill="none"
                  name="Media Mercado"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chartColor }} />
            RIX Score
          </span>
          {data[0]?.marketAverage !== undefined && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full border border-muted-foreground" />
              Media mercado
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonChart({ data, title, subtitle, compact }: { 
  data: ComparisonPoint[]; 
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  if (!data || data.length === 0) return null;
  
  const chartWidth = compact ? 240 : 320;
  const chartHeight = Math.max(compact ? 100 : 140, data.length * 28);

  return (
    <Card className="my-3 border-primary/20 bg-gradient-to-br from-background to-muted/30">
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        <div className="mb-3">
          <h4 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold`}>
            {title || '📊 Comparativa RIX'}
          </h4>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        
        <div className="flex justify-center">
          <ResponsiveContainer width={chartWidth} height={chartHeight}>
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 60 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }}
                width={55}
              />
              <Tooltip 
                formatter={(value: number) => [`${value.toFixed(1)} pts`, 'RIX']}
                contentStyle={{ 
                  background: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '11px'
                }}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color || COLORS[index % COLORS.length]} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function RadarMetricsChart({ data, title, compact }: { 
  data: RadarPoint[]; 
  title?: string;
  compact?: boolean;
}) {
  if (!data || data.length === 0) return null;
  
  const size = compact ? 180 : 240;

  return (
    <Card className="my-3 border-primary/20 bg-gradient-to-br from-background to-muted/30">
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        <h4 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold mb-2 text-center`}>
          {title || '🎯 Métricas RIX'}
        </h4>
        
        <div className="flex justify-center">
          <ResponsiveContainer width={size} height={size}>
            <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis 
                dataKey="subject" 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Radar
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.4}
                strokeWidth={2}
              />
              <Tooltip 
                formatter={(value: number) => [`${value.toFixed(0)} pts`, '']}
                contentStyle={{ 
                  background: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '11px'
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {data.slice(0, 4).map((d, i) => (
            <span key={i} className="text-[9px] px-2 py-0.5 bg-muted rounded-full">
              {d.subject}: <span className="font-semibold">{d.value}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function InlineChartRenderer({ chartData, compact = false }: InlineChartRendererProps) {
  if (!chartData?.data?.length) return null;
  
  switch (chartData.type) {
    case 'trend':
      return (
        <TrendChart 
          data={chartData.data as TrendPoint[]} 
          title={chartData.title}
          subtitle={chartData.subtitle}
          compact={compact}
        />
      );
    case 'comparison':
      return (
        <ComparisonChart 
          data={chartData.data as ComparisonPoint[]} 
          title={chartData.title}
          subtitle={chartData.subtitle}
          compact={compact}
        />
      );
    case 'radar':
      return (
        <RadarMetricsChart 
          data={chartData.data as RadarPoint[]} 
          title={chartData.title}
          compact={compact}
        />
      );
    default:
      return null;
  }
}
