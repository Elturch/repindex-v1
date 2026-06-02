import { cn } from "@/lib/utils";
import { IntentType } from "@/lib/reports/filterState";
import {
  Eye,
  ListOrdered,
  GitCompare,
  TrendingUp,
  Sparkles,
  User,
} from "lucide-react";

const INTENTS: { id: IntentType; label: string; icon: any; hint: string }[] = [
  { id: "vision_general", label: "Visión general", icon: Eye, hint: "Resumen 360º del alcance" },
  { id: "ranking", label: "Ranking", icon: ListOrdered, hint: "Top N por métrica" },
  { id: "comparativa", label: "Comparativa", icon: GitCompare, hint: "Enfrenta 2+ entidades" },
  { id: "evolucion", label: "Evolución", icon: TrendingUp, hint: "Serie temporal" },
  { id: "divergencia", label: "Divergencia", icon: Sparkles, hint: "Disenso entre IAs" },
  { id: "perfil", label: "Perfil", icon: User, hint: "Análisis 360º de UNA empresa vs. sus competidores" },
];

interface Props {
  value: IntentType;
  onChange: (v: IntentType) => void;
}

export function IntentChips({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {INTENTS.map((it) => {
        const Icon = it.icon;
        const active = value === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            title={it.hint}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-accent border-border text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}