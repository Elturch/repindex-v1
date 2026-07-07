import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useConsensus, type ConsensusLevel } from "@/hooks/useConsensus";

const LEVEL_META: Record<string, { label: string; tone: string; bar: string }> = {
  unanime: { label: "Unánime", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" },
  fuerte: { label: "Fuerte", tone: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400", bar: "bg-blue-500" },
  debil: { label: "Débil", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", bar: "bg-amber-500" },
  disperso: { label: "Disperso", tone: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400", bar: "bg-red-500" },
};

function metaOf(level: ConsensusLevel) {
  return LEVEL_META[level] ?? LEVEL_META.debil;
}

function ConsensusCard({ ticker, name }: { ticker: string; name: string }) {
  const { data, isLoading } = useConsensus(ticker);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/60 p-4 text-sm text-muted-foreground">
        Cargando consenso de {name}…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-4">
        <div className="text-sm font-semibold">{name}</div>
        <div className="text-[11px] text-muted-foreground">{ticker}</div>
        <div className="mt-2 text-xs italic text-muted-foreground">
          Consenso no disponible esta semana.
        </div>
      </div>
    );
  }

  const meta = metaOf(data.level);
  const value = Math.max(0, Math.min(100, Math.round(data.consenso)));
  const topCore = (data.core ?? []).slice(0, 3);

  return (
    <div className="rounded-lg border border-border/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{name}</div>
          <div className="text-[11px] text-muted-foreground">{ticker}</div>
        </div>
        <Badge variant="outline" className={cn("gap-1", meta.tone)}>
          {meta.label}
        </Badge>
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-bold tabular-nums">{value}</div>
          <div className="text-[11px] text-muted-foreground">/ 100</div>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full", meta.bar)} style={{ width: `${value}%` }} />
        </div>
      </div>

      {topCore.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topCore.map((c, i) => (
            <span
              key={i}
              title={c.models.join(", ")}
              className="text-[10px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/5 text-foreground"
            >
              {c.theme} <span className="font-mono text-primary">{c.coverage}/{data.models_count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
        <span>Hechos compartidos: <b className="text-foreground">{data.shared_events?.length ?? 0}</b></span>
        <span>Puntos ciegos: <b className="text-foreground">{data.blind_spots?.length ?? 0}</b></span>
      </div>
    </div>
  );
}

interface Props {
  entities: Array<{ ticker: string; name: string }>;
}

export function ConsensusCompact({ entities }: Props) {
  if (!entities || entities.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Consenso de las IAs</CardTitle>
        <p className="text-xs text-muted-foreground">
          En qué grado las 6 IAs coinciden temáticamente sobre cada empresa esta semana.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((e) => (
            <ConsensusCard key={e.ticker} ticker={e.ticker} name={e.name} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default ConsensusCompact;