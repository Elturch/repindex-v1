interface Stat {
  label: string;
  value: string;
  variant?: "default" | "best" | "worst" | "flat";
}

interface Props {
  header: string;
  big: string;
  bigUnit?: string;
  sub: string;
  stats: Stat[];
}

export function Scorecard({ header, big, bigUnit = "/ 100", sub, stats }: Props) {
  return (
    <div className="rr-scorecard">
      <div className="rr-sc-h">{header}</div>
      <div className="rr-sc-big">
        {big}
        <span> {bigUnit}</span>
      </div>
      <div className="rr-sc-sub">{sub}</div>
      <div className="rr-sc-stats">
        {stats.map((s, i) => (
          <div
            key={i}
            className={`rr-sc-stat${s.variant && s.variant !== "default" ? ` ${s.variant}` : ""}`}
          >
            <span className="rr-lo">{s.label}</span>
            <b className={s.variant === "flat" ? "rr-flatv" : undefined}>{s.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}