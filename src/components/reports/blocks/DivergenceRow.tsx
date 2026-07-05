interface Props {
  name: string;
  min: number;
  max: number;
  avg: number;
}

export function DivergenceRow({ name, min, max, avg }: Props) {
  const range = Math.max(0, max - min);
  const wide = range >= 20;
  const leftPct = Math.max(0, Math.min(100, min));
  const widthPct = Math.max(0, Math.min(100 - leftPct, range));
  const dotPct = Math.max(0, Math.min(100, avg));
  return (
    <div className="rr-dv-row">
      <div className="rr-dv-name">{name}</div>
      <div className="rr-dv-track">
        <div
          className={`rr-dv-range${wide ? " wide" : ""}`}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        <div className="rr-dv-dot" style={{ left: `${dotPct}%` }} />
      </div>
      <div className={`rr-dv-tag ${wide ? "alta" : "mod"}`}>
        {wide ? "Alta" : "Moderada"}
        <span>
          {Math.round(min)}–{Math.round(max)}
        </span>
      </div>
    </div>
  );
}