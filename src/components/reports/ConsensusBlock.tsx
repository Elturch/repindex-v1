import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Users, Eye, AlertCircle, CheckCircle2 } from "lucide-react";
import { useConsensus, type ConsensusLevel } from "@/hooks/useConsensus";

interface Props {
  ticker: string;
}

const LEVEL_META: Record<string, { label: string; tone: string; bar: string }> = {
  unanime: {
    label: "Unánime",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
  fuerte: {
    label: "Fuerte",
    tone: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    bar: "bg-blue-500",
  },
  debil: {
    label: "Débil",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  disperso: {
    label: "Disperso",
    tone: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
    bar: "bg-red-500",
  },
};

function levelMeta(level: ConsensusLevel) {
  return LEVEL_META[level] ?? LEVEL_META.debil;
}

export function ConsensusBlock({ ticker }: Props) {
  const { data, isLoading } = useConsensus(ticker);

  if (isLoading) return null;
  if (!data) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground italic">
          Consenso no disponible para esta semana.
        </CardContent>
      </Card>
    );
  }

  const meta = levelMeta(data.level);
  const value = Math.max(0, Math.min(100, Math.round(data.consenso)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Consenso de las IAs</CardTitle>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            Semana en curso
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          En qué grado las {data.models_count} IAs coinciden temáticamente esta semana. No es una media de notas.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-6">
        {/* Gauge */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] items-center">
          <div>
            <div className="flex items-baseline gap-3">
              <div className="text-5xl font-bold tabular-nums">{value}</div>
              <div className="text-xs text-muted-foreground">/ 100</div>
              <Badge variant="outline" className={cn("gap-1.5", meta.tone)}>
                {meta.label}
              </Badge>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", meta.bar)}
                style={{ width: `${value}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Dispersión de notas entre IAs: <span className="font-mono">{data.dispersion}</span> pts ·{" "}
              {data.distinct_themes} temas distintos identificados
            </div>
          </div>
        </div>

        {/* Núcleo de coincidencia */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Núcleo de coincidencia
          </div>
          {data.core.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Sin temas comunes esta semana.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.core.map((c, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  title={c.models.join(", ")}
                  className="border-primary/30 bg-primary/5 text-foreground gap-1.5 py-1"
                >
                  <span>{c.theme}</span>
                  <span className="font-mono text-primary">— {c.coverage}/{data.models_count} IAs</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Hechos compartidos */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Hechos compartidos
          </div>
          {data.shared_events.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Las IAs no comparten ningún hecho concreto esta semana.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.shared_events.map((ev, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border/60 p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{ev.label}</div>
                    {ev.protagonists && ev.protagonists.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ev.protagonists.map((p, j) => (
                          <span
                            key={j}
                            className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                    {ev.theme && (
                      <div className="mt-1 text-[11px] text-muted-foreground">{ev.theme}</div>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap text-right">
                    {ev.models.join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Puntos ciegos */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Puntos ciegos
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Hechos vistos por una sola IA. Pueden ser señal temprana… o imprecisión de ese modelo.
          </p>
          {data.blind_spots.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Ninguna IA reporta hechos exclusivos esta semana.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.blind_spots.map((bs, i) => {
                const corroborated = bs.corroboration === "corroborado";
                const badgeClass = corroborated
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
                const badgeLabel = corroborated ? "a vigilar · con respaldo" : "no confirmado";
                return (
                  <li
                    key={i}
                    className="rounded-lg border border-border/60 p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{bs.label}</span>
                        <Badge variant="outline" className={cn("gap-1.5 text-[10px]", badgeClass)}>
                          {corroborated ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {badgeLabel}
                        </Badge>
                      </div>
                      {bs.protagonists && bs.protagonists.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {bs.protagonists.map((p, j) => (
                            <span
                              key={j}
                              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                      {bs.theme && (
                        <div className="mt-1 text-[11px] text-muted-foreground">{bs.theme}</div>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                      {bs.model}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ConsensusBlock;