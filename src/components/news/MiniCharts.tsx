import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar } from "recharts";

interface MiniPieChartProps {
  data: { name: string; value: number; color?: string }[];
  size?: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--muted))', 'hsl(var(--accent))', 'hsl(var(--secondary))'];

export function MiniPieChart({ data, size = 80 }: MiniPieChartProps) {
  return (
    <div className="flex items-center gap-2">
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.25}
            outerRadius={size * 0.4}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="text-xs space-y-0.5">
        {data.slice(0, 3).map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: item.color || COLORS[i % COLORS.length] }}
            />
            <span className="text-muted-foreground truncate max-w-[60px]">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MiniLineChartProps {
  data: { value: number }[];
  color?: string;
  width?: number;
  height?: number;
  showTrend?: boolean;
}

export function MiniLineChart({ data, color = 'hsl(var(--primary))', width = 100, height = 40, showTrend }: MiniLineChartProps) {
  const trend = data.length >= 2 ? data[data.length - 1].value - data[0].value : 0;
  const trendColor = trend >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)';
  
  return (
    <div className="flex items-center gap-2">
      <ResponsiveContainer width={width} height={height}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={showTrend ? trendColor : color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {showTrend && (
        <span className={`text-xs font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend >= 0 ? '+' : ''}{trend}
        </span>
      )}
    </div>
  );
}

interface MiniRadarChartProps {
  data: { subject: string; value: number; fullMark?: number }[];
  size?: number;
}

export function MiniRadarChart({ data, size = 90 }: MiniRadarChartProps) {
  return (
    <ResponsiveContainer width={size} height={size}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis 
          dataKey="subject" 
          tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
        />
        <Radar
          dataKey="value"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary))"
          fillOpacity={0.3}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

interface MiniBarChartProps {
  data: { name: string; value: number }[];
  width?: number;
  height?: number;
  showLabels?: boolean;
}

export function MiniBarChart({ data, width = 120, height = 50, showLabels }: MiniBarChartProps) {
  return (
    <div className="flex flex-col">
      <ResponsiveContainer width={width} height={height}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {showLabels && (
        <div className="flex justify-between text-[9px] text-muted-foreground px-1">
          {data.slice(0, 4).map((d, i) => (
            <span key={i} className="truncate max-w-[25px]">{d.name.substring(0, 3)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ComparisonGaugeProps {
  value: number;
  max?: number;
  label?: string;
}

export function ComparisonGauge({ value, max = 100, label }: ComparisonGaugeProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const color = value >= 60 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <div className="w-full max-w-[100px]">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
