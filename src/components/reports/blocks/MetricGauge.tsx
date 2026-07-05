import { bandFor } from "./rankingTokens";

interface Props {
  code: string;
  label: string;
  value: number | null;
}

export function MetricGauge({ code, label, value }: Props) {
  const v = typeof value === "number" ? value : null;
  const band = v == null ? "amber" : bandFor(v);
  const w = v == null ? 0 : Math.max(0, Math.min(100, v));
  return (
    <div className="rr-sm">
      <div className="rr-sm-h">
        <span className="rr-sm-code">
          {code}
          <small>{label}</small>
        </span>
        <span className={`rr-sm-v v-${band}`}>{v == null ? "N/A" : Math.round(v)}</span>
      </div>
      <div className="rr-sm-bar">
        <i className={`b-${band}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}