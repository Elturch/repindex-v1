import { Lock } from "lucide-react";

interface Props {
  kind: "sector" | "evolucion";
  subtitle: string;
}

export function Ribbon({ kind, subtitle }: Props) {
  return (
    <div className="rr-ribbon">
      <div className="rr-ribbon-left">
        <span className="rr-ribbon-badge">Agente Rix</span>
        <div className="rr-ribbon-title">
          Análisis del Experto · {kind === "sector" ? "Sector" : "Evolución"}
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