import { Lock } from "lucide-react";

interface Props {
  kind: "sector" | "evolucion";
  subtitle: string;
  topLimit?: number | null;
}

export function Ribbon({ kind, subtitle, topLimit }: Props) {
  return (
    <div className="rr-ribbon">
      <div className="rr-ribbon-left">
        <span className="rr-ribbon-badge">Agente Rix</span>
        <div className="rr-ribbon-title">
          Análisis del Experto · {kind === "sector" ? "Sector" : "Evolución"}
          {topLimit ? <> · <b>Top {topLimit}</b></> : null}
          <small>{subtitle}</small>
        </div>
      </div>
      <span className="rr-lock">
        <Lock aria-hidden />
        Universo cerrado · sin fuentes externas
      </span>
    </div>
  );
}