import type { ReactNode } from "react";

export type KpiTone = "red" | "amber" | "green" | "blue" | "navy";

interface Props {
  tone: KpiTone;
  icon: ReactNode;
  title: string;
  text: string;
}

export function KpiCard({ tone, icon, title, text }: Props) {
  return (
    <div className={`rr-kpi ${tone}`}>
      <div className="rr-kpi-ico">{icon}</div>
      <div className="rr-kpi-k">{title}</div>
      <div className="rr-kpi-t">{text}</div>
    </div>
  );
}