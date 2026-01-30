/**
 * Convert chart data to inline SVG for PDF/HTML export
 * Since Recharts renders using React, we generate static SVGs here
 */

import type { ChartData, TrendPoint, ComparisonPoint, RadarPoint } from '@/components/chat/InlineChartRenderer';

const COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
];

/**
 * Generate SVG for a trend chart
 */
function generateTrendSvg(data: TrendPoint[], title?: string, subtitle?: string): string {
  if (!data || data.length < 2) return '';
  
  const width = 360;
  const height = 160;
  const padding = { top: 40, right: 20, bottom: 30, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Calculate min/max for Y axis
  const scores = data.map(d => d.rixScore);
  const minScore = Math.floor(Math.min(...scores) - 5);
  const maxScore = Math.ceil(Math.max(...scores) + 5);
  const range = maxScore - minScore || 1;
  
  // Calculate trend
  const latestScore = data[data.length - 1]?.rixScore ?? 0;
  const firstScore = data[0]?.rixScore ?? 0;
  const trend = latestScore - firstScore;
  const trendPercent = firstScore > 0 ? ((trend / firstScore) * 100).toFixed(1) : '0';
  const trendColor = trend >= 0 ? '#22c55e' : '#ef4444';
  
  // Scale functions
  const xScale = (i: number) => padding.left + (i / (data.length - 1)) * chartWidth;
  const yScale = (v: number) => padding.top + chartHeight - ((v - minScore) / range) * chartHeight;
  
  // Generate path
  const linePath = data.map((d, i) => {
    const x = xScale(i);
    const y = yScale(d.rixScore);
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');
  
  // Generate area path (closed polygon for fill)
  const areaPath = `${linePath} L ${xScale(data.length - 1)} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;
  
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="max-width: 100%; height: auto; margin: 16px 0;">
      <defs>
        <linearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${trendColor};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${trendColor};stop-opacity:0.05" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" rx="8" />
      
      <!-- Title -->
      <text x="${padding.left}" y="20" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#1e293b">
        ${title || '📈 Evolución RIX'}
      </text>
      ${subtitle ? `<text x="${padding.left}" y="34" font-family="system-ui, sans-serif" font-size="10" fill="#64748b">${subtitle}</text>` : ''}
      
      <!-- Trend badge -->
      <rect x="${width - 90}" y="8" width="80" height="22" rx="11" fill="${trend >= 0 ? '#dcfce7' : '#fee2e2'}" />
      <text x="${width - 50}" y="23" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="${trendColor}" text-anchor="middle">
        ${trend >= 0 ? '+' : ''}${trend.toFixed(1)} (${trendPercent}%)
      </text>
      
      <!-- Grid lines -->
      ${[0, 0.5, 1].map(pct => {
        const y = padding.top + chartHeight * (1 - pct);
        const value = minScore + range * pct;
        return `
          <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
          <text x="${padding.left - 8}" y="${y + 4}" font-family="system-ui, sans-serif" font-size="9" fill="#94a3b8" text-anchor="end">${value.toFixed(0)}</text>
        `;
      }).join('')}
      
      <!-- Area fill -->
      <path d="${areaPath}" fill="url(#trendGradient)" />
      
      <!-- Line -->
      <path d="${linePath}" fill="none" stroke="${trendColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      
      <!-- Data points -->
      ${data.map((d, i) => `
        <circle cx="${xScale(i)}" cy="${yScale(d.rixScore)}" r="4" fill="${trendColor}" stroke="white" stroke-width="2" />
      `).join('')}
      
      <!-- X axis labels -->
      ${data.map((d, i) => `
        <text x="${xScale(i)}" y="${height - 8}" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">${d.week}</text>
      `).join('')}
    </svg>
  `;
}

/**
 * Generate SVG for a comparison bar chart
 */
function generateComparisonSvg(data: ComparisonPoint[], title?: string, subtitle?: string): string {
  if (!data || data.length === 0) return '';
  
  const width = 360;
  const barHeight = 28;
  const padding = { top: 50, right: 50, bottom: 20, left: 100 };
  const height = padding.top + data.length * barHeight + padding.bottom;
  const chartWidth = width - padding.left - padding.right;
  
  // Sort by score descending
  const sortedData = [...data].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(...sortedData.map(d => d.score), 100);
  
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="max-width: 100%; height: auto; margin: 16px 0;">
      <!-- Background -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" rx="8" />
      
      <!-- Title -->
      <text x="${padding.left}" y="22" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#1e293b">
        ${title || '📊 Comparativa RIX'}
      </text>
      ${subtitle ? `<text x="${padding.left}" y="38" font-family="system-ui, sans-serif" font-size="10" fill="#64748b">${subtitle}</text>` : ''}
      
      <!-- Bars -->
      ${sortedData.map((d, i) => {
        const y = padding.top + i * barHeight;
        const barWidth = (d.score / maxScore) * chartWidth;
        const color = d.color || COLORS[i % COLORS.length];
        const displayName = d.name.length > 14 ? d.name.substring(0, 14) + '...' : d.name;
        
        return `
          <text x="${padding.left - 8}" y="${y + barHeight / 2 + 4}" font-family="system-ui, sans-serif" font-size="11" fill="#374151" text-anchor="end">${displayName}</text>
          <rect x="${padding.left}" y="${y + 4}" width="${barWidth}" height="${barHeight - 8}" rx="4" fill="${color}" opacity="0.85" />
          <text x="${padding.left + barWidth + 6}" y="${y + barHeight / 2 + 4}" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#374151">${d.score.toFixed(1)}</text>
        `;
      }).join('')}
    </svg>
  `;
}

/**
 * Generate SVG for a radar chart
 */
function generateRadarSvg(data: RadarPoint[], title?: string): string {
  if (!data || data.length === 0) return '';
  
  const width = 320;
  const height = 280;
  const centerX = width / 2;
  const centerY = height / 2 + 10;
  const radius = 90;
  const levels = 4;
  
  const angleSlice = (Math.PI * 2) / data.length;
  const maxValue = Math.max(...data.map(d => d.fullMark || 100));
  
  // Generate polygon points for data
  const dataPoints = data.map((d, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const r = (d.value / maxValue) * radius;
    return `${centerX + Math.cos(angle) * r},${centerY + Math.sin(angle) * r}`;
  }).join(' ');
  
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="max-width: 100%; height: auto; margin: 16px 0;">
      <!-- Background -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" rx="8" />
      
      <!-- Title -->
      <text x="${width / 2}" y="24" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#1e293b" text-anchor="middle">
        ${title || '🎯 Métricas RIX'}
      </text>
      
      <!-- Grid circles -->
      ${Array.from({ length: levels }, (_, i) => {
        const r = radius * ((i + 1) / levels);
        return `<circle cx="${centerX}" cy="${centerY}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="1" />`;
      }).join('')}
      
      <!-- Axis lines and labels -->
      ${data.map((d, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const x2 = centerX + Math.cos(angle) * radius;
        const y2 = centerY + Math.sin(angle) * radius;
        const labelX = centerX + Math.cos(angle) * (radius + 20);
        const labelY = centerY + Math.sin(angle) * (radius + 20);
        const anchor = Math.abs(angle + Math.PI / 2) < 0.1 ? 'middle' : (angle > -Math.PI / 2 && angle < Math.PI / 2 ? 'start' : 'end');
        
        return `
          <line x1="${centerX}" y1="${centerY}" x2="${x2}" y2="${y2}" stroke="#cbd5e1" stroke-width="1" />
          <text x="${labelX}" y="${labelY + 4}" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="${anchor}">${d.subject}</text>
        `;
      }).join('')}
      
      <!-- Data polygon -->
      <polygon points="${dataPoints}" fill="#3b82f6" fill-opacity="0.3" stroke="#3b82f6" stroke-width="2" />
      
      <!-- Data points -->
      ${data.map((d, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const r = (d.value / maxValue) * radius;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        return `<circle cx="${x}" cy="${y}" r="4" fill="#3b82f6" stroke="white" stroke-width="2" />`;
      }).join('')}
      
      <!-- Value labels in legend -->
      <g transform="translate(${width / 2 - (data.length * 35) / 2}, ${height - 30})">
        ${data.slice(0, 4).map((d, i) => `
          <rect x="${i * 70}" y="0" width="64" height="20" rx="10" fill="#e2e8f0" />
          <text x="${i * 70 + 32}" y="14" font-family="system-ui, sans-serif" font-size="9" fill="#374151" text-anchor="middle">${d.subject}: ${d.value}</text>
        `).join('')}
      </g>
    </svg>
  `;
}

/**
 * Main function to convert chart data to SVG
 */
export function chartDataToSvg(chartData: ChartData): string {
  if (!chartData?.data?.length) return '';
  
  switch (chartData.type) {
    case 'trend':
      return generateTrendSvg(
        chartData.data as TrendPoint[],
        chartData.title,
        chartData.subtitle
      );
    case 'comparison':
      return generateComparisonSvg(
        chartData.data as ComparisonPoint[],
        chartData.title,
        chartData.subtitle
      );
    case 'radar':
      return generateRadarSvg(
        chartData.data as RadarPoint[],
        chartData.title
      );
    default:
      return '';
  }
}
