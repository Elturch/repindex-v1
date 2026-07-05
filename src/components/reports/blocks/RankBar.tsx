import { bandFor, type Band } from "./rankingTokens";

interface Props {
  rank: number;
  name: string;
  sub?: string | null;
  score: number;
  avg: number;
  delta: number | null;
  isLead?: boolean;
  bandOverride?: Band;
}

export function RankBar({ rank, name, sub, score, avg, delta, isLead, bandOverride }: Props) {
  const band = bandOverride ?? bandFor(score);
  const w = Math.max(0, Math.min(100, score));
  const avgClamped = Math.max(0, Math.min(100, avg));
  const d = delta ?? 0;
  const dCls = d > 0 ? "up" : d < 0 ? "down" : "flat";
  const dSym = d > 0 ? "▲" : d < 0 ? "▼" : "—";
  return (
    <div className={`rr-rb-row${isLead ? " lead" : ""}`}>
      <span className="rr-rb-rank">{rank}</span>
      <div className="rr-rb-name">
        {name} {sub ? <small>· {sub}</small> : null}
      </div>
      <div className="rr-rb-track">
        <div className={`rr-rb-fill ${band}`} style={{ width: `${w}%` }}>
          {Math.round(score)}
        </div>
        <div className="rr-rb-avg" style={{ left: `${avgClamped}%` }} />
      </div>
      <div className="rr-rb-end">
        <span className={`rr-rb-d ${dCls}`}>
          {dSym} {Math.abs(Math.round(d))}
        </span>
      </div>
    </div>
  );
}