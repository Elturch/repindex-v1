interface Props {
  configLabel: string;
}

export function BrandFooter({ configLabel }: Props) {
  return (
    <div className="rr-foot">
      <div className="rr-foot-brand">
        <div className="rr-foot-logo">
          Rep<span>Index</span>
        </div>
        <div className="rr-foot-tag">
          Análisis determinista sobre datos verificados de los 6 modelos de IA.
          El experto no consulta fuentes externas.
        </div>
      </div>
      <div className="rr-foot-conf">{configLabel}</div>
    </div>
  );
}