import { useMemo } from "react";

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  points: Array<{ x: string; y: number }>;
}

interface Props {
  series: LineSeries[];
  yDomain?: [number, number];
  xLabels?: string[];
  height?: number;
}

// Simple multi-series SVG line chart that mirrors the mockup visuals.
export function LineChart({ series, yDomain, xLabels, height = 320 }: Props) {
  const chart = useMemo(() => {
    const W = 880;
    const H = height;
    const padL = 40;
    const padR = 90;
    const padT = 20;
    const padB = 30;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    let [yMin, yMax] = yDomain ?? [45, 75];
    const allYs = series.flatMap((s) => s.points.map((p) => p.y));
    if (!yDomain && allYs.length > 0) {
      const mn = Math.min(...allYs);
      const mx = Math.max(...allYs);
      yMin = Math.floor((mn - 3) / 5) * 5;
      yMax = Math.ceil((mx + 3) / 5) * 5;
      if (yMax <= yMin) yMax = yMin + 10;
    }

    const xKeys: string[] = [];
    const xSeen = new Set<string>();
    series.forEach((s) =>
      s.points.forEach((p) => {
        if (!xSeen.has(p.x)) {
          xSeen.add(p.x);
          xKeys.push(p.x);
        }
      }),
    );
    xKeys.sort();

    const xOf = (xKey: string) => {
      const idx = xKeys.indexOf(xKey);
      if (xKeys.length <= 1) return padL;
      return padL + (innerW * idx) / (xKeys.length - 1);
    };
    const yOf = (y: number) => {
      const t = (y - yMin) / (yMax - yMin);
      return padT + innerH - t * innerH;
    };

    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax; v += 5) yTicks.push(v);

    return { W, H, padL, padR, padT, padB, innerW, innerH, yMin, yMax, xKeys, xOf, yOf, yTicks };
  }, [series, yDomain, height]);

  const labels = xLabels ?? [];

  return (
    <svg
      className="rr-chart"
      viewBox={`0 0 ${chart.W} ${chart.H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {chart.yTicks.map((v) => (
        <g key={v}>
          <line
            className="rr-grid"
            x1={chart.padL}
            y1={chart.yOf(v)}
            x2={chart.W - chart.padR}
            y2={chart.yOf(v)}
          />
          <text
            className="rr-ylab"
            x={chart.padL - 10}
            y={chart.yOf(v) + 3}
            textAnchor="end"
          >
            {v}
          </text>
        </g>
      ))}
      <line
        className="rr-axis"
        x1={chart.padL}
        y1={chart.padT + chart.innerH}
        x2={chart.W - chart.padR}
        y2={chart.padT + chart.innerH}
      />
      {labels.map((lbl, i) => {
        const x =
          labels.length <= 1
            ? chart.padL
            : chart.padL + (chart.innerW * i) / (labels.length - 1);
        return (
          <text
            key={lbl + i}
            className="rr-xlab"
            x={x}
            y={chart.padT + chart.innerH + 18}
            textAnchor="middle"
          >
            {lbl}
          </text>
        );
      })}
      {series.map((s) => {
        const pts = s.points
          .map((p) => `${chart.xOf(p.x).toFixed(1)},${chart.yOf(p.y).toFixed(1)}`)
          .join(" ");
        return (
          <polyline
            key={s.key}
            className={s.dashed ? "sector" : ""}
            points={pts}
            stroke={s.color}
            fill="none"
            strokeDasharray={s.dashed ? "6 4" : undefined}
            strokeWidth={s.dashed ? 3 : 2}
          />
        );
      })}
      {series.map((s) => {
        const last = s.points[s.points.length - 1];
        if (!last) return null;
        const cy = chart.yOf(last.y);
        const cx = chart.W - chart.padR + 6;
        return (
          <text
            key={`${s.key}-lbl`}
            x={cx}
            y={cy + 3}
            fontFamily="'JetBrains Mono', monospace"
            fontSize="11"
            fill={s.color}
          >
            {s.label}
          </text>
        );
      })}
    </svg>
  );
}