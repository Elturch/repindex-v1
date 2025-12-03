import { 
  PieChart, Pie, Cell, 
  LineChart, Line, XAxis, YAxis, 
  ResponsiveContainer, 
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar,
  AreaChart, Area,
  Tooltip
} from "recharts";

interface MiniPieChartProps {
  data: { name: string; value: number; color?: string }[];
  size?: number;
}

const COLORS = [
  'hsl(158, 64%, 52%)',  // ChatGPT green
  'hsl(217, 89%, 61%)',  // Gemini blue
  'hsl(221, 83%, 53%)',  // Perplexity
  'hsl(219, 95%, 64%)',  // DeepSeek
  'hsl(43, 96%, 56%)',   // Warning yellow
  'hsl(0, 84%, 60%)',    // Red
];

export function MiniPieChart({ data, size = 160 }: MiniPieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  
  return (
    <div className="flex flex-col items-center gap-3">
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.28}
            outerRadius={size * 0.42}
            dataKey="value"
            strokeWidth={2}
            stroke="hsl(var(--background))"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => [`${value} (${((value/total)*100).toFixed(0)}%)`, '']}
            contentStyle={{ 
              background: 'hsl(var(--card))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '11px'
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div 
              className="w-2.5 h-2.5 rounded-full shrink-0" 
              style={{ backgroundColor: item.color || COLORS[i % COLORS.length] }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MiniLineChartProps {
  data: { name?: string; value: number }[];
  color?: string;
  width?: number;
  height?: number;
  showTrend?: boolean;
}

export function MiniLineChart({ data, color = 'hsl(var(--primary))', width = 220, height = 120, showTrend }: MiniLineChartProps) {
  const trend = data.length >= 2 ? data[data.length - 1].value - data[0].value : 0;
  const trendColor = trend >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)';
  const chartColor = showTrend ? trendColor : color;
  
  return (
    <div className="flex flex-col items-center gap-2">
      <ResponsiveContainer width={width} height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="name" 
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
          <Tooltip 
            contentStyle={{ 
              background: 'hsl(var(--card))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '11px'
            }}
          />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={chartColor}
            strokeWidth={2}
            fill="url(#colorValue)"
          />
        </AreaChart>
      </ResponsiveContainer>
      {showTrend && (
        <div className={`text-sm font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)} puntos
        </div>
      )}
    </div>
  );
}

interface MiniRadarChartProps {
  data: { subject: string; value: number; fullMark?: number }[];
  size?: number;
}

export function MiniRadarChart({ data, size = 220 }: MiniRadarChartProps) {
  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width={size} height={size}>
        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Radar
            dataKey="value"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.4}
            strokeWidth={2}
          />
          <Tooltip 
            contentStyle={{ 
              background: 'hsl(var(--card))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '11px'
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-2 text-xs mt-2">
        {data.map((d, i) => (
          <span key={i} className="px-2 py-0.5 bg-muted rounded-full">
            {d.subject}: <span className="font-semibold">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface MiniBarChartProps {
  data: { name: string; value: number; color?: string }[];
  width?: number;
  height?: number;
  showLabels?: boolean;
  horizontal?: boolean;
}

export function MiniBarChart({ data, width = 220, height = 140, showLabels, horizontal }: MiniBarChartProps) {
  if (horizontal) {
    return (
      <div className="space-y-2 w-full max-w-[250px]">
        {data.map((item, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground truncate max-w-[120px]">{item.name}</span>
              <span className="font-semibold">{item.value}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all"
                style={{ 
                  width: `${Math.min((item.value / 100) * 100, 100)}%`,
                  backgroundColor: item.color || COLORS[i % COLORS.length]
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width={width} height={height}>
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
          <XAxis 
            dataKey="name" 
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis hide domain={[0, 100]} />
          <Tooltip 
            contentStyle={{ 
              background: 'hsl(var(--card))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '11px'
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ComparisonGaugeProps {
  value: number;
  max?: number;
  label?: string;
  showDelta?: number;
}

export function ComparisonGauge({ value, max = 100, label, showDelta }: ComparisonGaugeProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const getColor = () => {
    if (value >= 70) return 'bg-green-500';
    if (value >= 50) return 'bg-blue-500';
    if (value >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  return (
    <div className="w-full max-w-[180px]">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{value}</span>
          {showDelta !== undefined && (
            <span className={`text-xs ${showDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {showDelta >= 0 ? '+' : ''}{showDelta}
            </span>
          )}
        </div>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor()} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// New: Score comparison between models
interface ModelComparisonProps {
  models: { name: string; score: number }[];
}

export function ModelComparison({ models }: ModelComparisonProps) {
  const maxScore = Math.max(...models.map(m => m.score));
  
  return (
    <div className="space-y-3 w-full max-w-[250px]">
      {models.map((model, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-20 truncate">{model.name}</span>
          <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
            <div 
              className="h-full rounded transition-all flex items-center justify-end pr-2"
              style={{ 
                width: `${(model.score / 100) * 100}%`,
                backgroundColor: COLORS[i % COLORS.length]
              }}
            >
              <span className="text-xs font-bold text-white drop-shadow">{model.score}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// New: Score badge with visual indicator
interface ScoreBadgeProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, label, size = 'md' }: ScoreBadgeProps) {
  const getColor = () => {
    if (score >= 70) return 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950';
    if (score >= 50) return 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950';
    if (score >= 30) return 'border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950';
    return 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950';
  };
  
  const sizeClasses = {
    sm: 'w-12 h-12 text-lg',
    md: 'w-16 h-16 text-2xl',
    lg: 'w-20 h-20 text-3xl'
  };
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${sizeClasses[size]} ${getColor()} border-2 rounded-full flex items-center justify-center font-bold`}>
        {score}
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}
