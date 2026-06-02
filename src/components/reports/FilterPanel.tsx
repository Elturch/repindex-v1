import { useMemo } from "react";
import { format } from "date-fns";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { features } from "@/lib/featureFlags";
import {
  FilterState,
  setFilter,
  unlockDerived,
  ALL_MODELS,
  IntentType,
  Universe,
  Granularity,
  AxisMetric,
  SortOrder,
  SourceTier,
  ModelName,
  reanchorWindow,
  windowNeedsReanchor,
  todayISO,
} from "@/lib/reports/filterState";
import { CompanyMeta } from "@/lib/reports/coherenceEngine";
import { FilterBlock } from "./FilterBlock";
import { IntentChips } from "./IntentChips";
import { MultiChipSelect } from "./MultiChipSelect";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const UNIVERSES: { value: Universe; label: string }[] = [
  { value: "IBEX-35", label: "IBEX-35" },
  { value: "IBEX-MC", label: "IBEX Medium Cap" },
  { value: "IBEX-SC", label: "IBEX Small Cap" },
  { value: "BME-GROWTH", label: "BME Growth" },
  { value: "MC-OTHER", label: "MC Other" },
];

const METRICS: {
  value: AxisMetric;
  label: string;
  fullName: string;
  description: string;
}[] = [
  {
    value: "RIX",
    label: "RIXc",
    fullName: "RepIndex Composite",
    description:
      "Índice compuesto de reputación algorítmica. Agrega las 8 métricas en una sola puntuación.",
  },
  {
    value: "NVM",
    label: "NVM",
    fullName: "Narrative Visibility Metric",
    description:
      "Cuánto aparece la entidad en las respuestas de los modelos de IA.",
  },
  {
    value: "DRM",
    label: "DRM",
    fullName: "Disagreement & Risk Metric",
    description:
      "Riesgo reputacional y nivel de desacuerdo entre los modelos.",
  },
  {
    value: "SIM",
    label: "SIM",
    fullName: "Sentiment Intensity Metric",
    description: "Tono y polaridad del sentimiento que generan los modelos.",
  },
  {
    value: "RMM",
    label: "RMM",
    fullName: "Reputational Mention Metric",
    description: "Calidad y contexto de las menciones de marca detectadas.",
  },
  {
    value: "CEM",
    label: "CEM",
    fullName: "Citation & Evidence Metric",
    description: "Evidencias y fuentes citadas por los modelos.",
  },
  {
    value: "GAM",
    label: "GAM",
    fullName: "Governance Alignment Metric",
    description: "Alineación con prácticas de buen gobierno y ESG-G.",
  },
  {
    value: "DCM",
    label: "DCM",
    fullName: "Diversity & Coverage Metric",
    description: "Diversidad de fuentes y amplitud de cobertura temática.",
  },
  {
    value: "CXM",
    label: "CXM",
    fullName: "Customer Experience Metric",
    description:
      "Experiencia de cliente percibida. Solo aplica a empresas B2C; 'N/A' en el resto.",
  },
];

interface Props {
  state: FilterState;
  setState: (s: FilterState) => void;
  companies: CompanyMeta[];
  hiddenFilters: string[];
  /** Última fecha de barrido canónico (YYYY-MM-DD). Si está disponible,
   *  los presets temporales se anclan a ella en lugar de a `new Date()`. */
  lastBatchDate?: string | null;
}

export function FilterPanel({ state, setState, companies, hiddenFilters, lastBatchDate }: Props) {
  const isHidden = (id: string) => hiddenFilters.includes(id);

  // Derive available sub-options based on parent selections
  const sectorOptions = useMemo(() => {
    let pool = companies;
    if (state.universe.value.length > 0 && state.universe.origin === "user-set") {
      pool = pool.filter(
        (c) =>
          c.ibex_family_code &&
          state.universe.value.includes(c.ibex_family_code as Universe),
      );
    }
    return Array.from(
      new Set(pool.map((c) => c.sector_category).filter((s): s is string => !!s)),
    )
      .sort()
      .map((s) => ({ value: s, label: s }));
  }, [companies, state.universe.value, state.universe.origin]);

  const subsectorOptions = useMemo(() => {
    let pool = companies;
    if (state.sector.value.length > 0) {
      pool = pool.filter(
        (c) => c.sector_category && state.sector.value.includes(c.sector_category),
      );
    }
    return Array.from(
      new Set(pool.map((c) => c.subsector ?? null).filter((s): s is string => !!s)),
    )
      .sort()
      .map((s) => ({ value: s, label: s }));
  }, [companies, state.sector.value]);

  const tickerOptions = useMemo(() => {
    let pool = companies;
    if (state.universe.value.length > 0 && state.universe.origin === "user-set") {
      pool = pool.filter(
        (c) =>
          c.ibex_family_code &&
          state.universe.value.includes(c.ibex_family_code as Universe),
      );
    }
    if (state.sector.value.length > 0) {
      pool = pool.filter(
        (c) => c.sector_category && state.sector.value.includes(c.sector_category),
      );
    }
    if (state.subsector.value.length > 0) {
      pool = pool.filter(
        (c) => c.subsector && state.subsector.value.includes(c.subsector),
      );
    }
    return pool
      .sort((a, b) => a.issuer_name.localeCompare(b.issuer_name))
      .map((c) => ({
        value: c.ticker,
        label: c.issuer_name,
        hint: c.ticker,
      }));
  }, [companies, state.universe.value, state.universe.origin, state.sector.value, state.subsector.value]);

  // Competidores verificados sugeridos a partir de la selección actual.
  // Sólo usa la columna `verified_competitors` (regla anti-fallback de sector).
  const byTicker = useMemo(
    () => new Map(companies.map((c) => [c.ticker, c])),
    [companies],
  );
  const competitorSuggestions = useMemo(() => {
    if (state.tickers.value.length === 0) return [] as string[];
    const selected = new Set(state.tickers.value);
    const out = new Set<string>();
    for (const t of state.tickers.value) {
      const comp = byTicker.get(t)?.verified_competitors;
      if (!Array.isArray(comp)) continue;
      for (const c of comp) {
        if (!c || selected.has(c)) continue;
        if (!byTicker.has(c)) continue; // ignora tickers obsoletos
        out.add(c);
      }
    }
    return Array.from(out);
  }, [state.tickers.value, byTicker]);

  return (
    <div className="flex flex-col gap-3">
      {/* Filter 0 — Intent */}
      <FilterBlock title="¿Qué quieres hacer?" defaultOpen>
        <IntentChips
          value={state.intent.value}
          onChange={(v: IntentType) =>
            setState(setFilter(state, "intent", v))
          }
        />
      </FilterBlock>

      {/* Alcance */}
      <FilterBlock
        title="Universo / Índice"
        origin={state.universe.origin}
        derivedFrom={state.universe.derivedFrom}
        onUnlock={() => setState(unlockDerived(state, "universe", []))}
      >
        <MultiChipSelect
          options={UNIVERSES.map((u) => ({ value: u.value, label: u.label }))}
          value={state.universe.value}
          onChange={(v) => setState(setFilter(state, "universe", v as Universe[]))}
          placeholder="Todos los universos"
        />
      </FilterBlock>

      <FilterBlock
        title="Sector"
        origin={state.sector.origin}
        derivedFrom={state.sector.derivedFrom}
        onUnlock={() => setState(unlockDerived(state, "sector", []))}
      >
        <MultiChipSelect
          options={sectorOptions}
          value={state.sector.value}
          onChange={(v) => setState(setFilter(state, "sector", v))}
          placeholder="Todos los sectores"
        />
      </FilterBlock>

      <FilterBlock
        title="Subsector"
        origin={state.subsector.origin}
        derivedFrom={state.subsector.derivedFrom}
        onUnlock={() => setState(unlockDerived(state, "subsector", []))}
      >
        <MultiChipSelect
          options={subsectorOptions}
          value={state.subsector.value}
          onChange={(v) => setState(setFilter(state, "subsector", v))}
          placeholder="Todos los subsectores"
        />
      </FilterBlock>

      <FilterBlock
        title="Empresa / Ticker"
        origin={state.tickers.origin}
        derivedFrom={state.tickers.derivedFrom}
        onUnlock={() => setState(unlockDerived(state, "tickers", []))}
      >
        <MultiChipSelect
          options={tickerOptions}
          value={state.tickers.value}
          onChange={(v) => setState(setFilter(state, "tickers", v))}
          placeholder="Todas las empresas del alcance"
        />
        {competitorSuggestions.length > 0 && (
          <div className="mt-2 rounded-md border border-border bg-muted/40 p-2">
            <p className="text-[11px] text-muted-foreground mb-1.5">
              Competencia directa verificada de tu selección:
            </p>
            <div className="flex flex-wrap gap-1 mb-2">
              {competitorSuggestions.map((t) => {
                const c = byTicker.get(t);
                return (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded text-[11px] border border-border bg-card text-foreground"
                    title={c?.issuer_name ?? t}
                  >
                    {c?.issuer_name ?? t}{" "}
                    <span className="text-muted-foreground">({t})</span>
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                setState(
                  setFilter(state, "tickers", [
                    ...state.tickers.value,
                    ...competitorSuggestions,
                  ]),
                )
              }
              className="px-2 py-0.5 rounded text-xs border border-primary bg-primary text-primary-foreground hover:opacity-90"
            >
              + Añadir competencia directa ({competitorSuggestions.length})
            </button>
          </div>
        )}
      </FilterBlock>

      {/* Modelos IA */}
      <FilterBlock
        title="Modelos IA"
        origin={state.models.origin}
      >
        <div className="flex flex-wrap gap-1.5">
          {ALL_MODELS.map((m) => {
            const active = state.models.value.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  const next = active
                    ? state.models.value.filter((x) => x !== m)
                    : [...state.models.value, m];
                  setState(setFilter(state, "models", next as ModelName[]));
                }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs border",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground hover:bg-accent",
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </FilterBlock>

      {/* Tiempo */}
      <FilterBlock title="Ventana temporal" origin={state.window.origin}>
        <div className="grid grid-cols-2 gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-start font-normal">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {state.window.value.from || "Desde"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(state.window.value.from)}
                onSelect={(d) =>
                  d &&
                  setState(
                    setFilter(state, "window", {
                      ...state.window.value,
                      preset: "custom",
                      from: format(d, "yyyy-MM-dd"),
                    }),
                  )
                }
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-start font-normal">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {state.window.value.to || "Hasta"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(state.window.value.to)}
                onSelect={(d) =>
                  d &&
                  setState(
                    setFilter(state, "window", {
                      ...state.window.value,
                      preset: "custom",
                      to: format(d, "yyyy-MM-dd"),
                    }),
                  )
                }
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(
            [
              { id: "last_week", label: "7d" },
              { id: "last_month", label: "30d" },
              { id: "last_quarter", label: "90d" },
              { id: "ytd", label: "YTD" },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              title={
                lastBatchDate
                  ? `Anclado al último barrido (${lastBatchDate})`
                  : undefined
              }
              onClick={() => {
                // Anclar al último barrido canónico (último domingo con datos).
                // Si aún no se ha cargado, fallback a hoy (UTC-safe).
                const anchor = lastBatchDate ?? todayISO();
                const next = reanchorWindow(
                  { preset: p.id, from: anchor, to: anchor },
                  anchor,
                );
                setState(setFilter(state, "window", next));
              }}
              className={cn(
                "px-2 py-0.5 rounded text-xs border",
                state.window.value.preset === p.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:bg-accent",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {windowNeedsReanchor(state.window.value, lastBatchDate) && (
          <button
            type="button"
            onClick={() =>
              setState(
                setFilter(
                  state,
                  "window",
                  reanchorWindow(state.window.value, lastBatchDate as string),
                  "user-set",
                ),
              )
            }
            className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            title="Re-ancla el preset al último domingo con datos disponibles"
          >
            <RefreshCw className="h-3 w-3" />
            Actualizar al último barrido ({lastBatchDate})
          </button>
        )}
      </FilterBlock>

      <FilterBlock title="Granularidad" origin={state.granularity.origin}>
        <Select
          value={state.granularity.value}
          onValueChange={(v: Granularity) =>
            setState(setFilter(state, "granularity", v))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="snapshot">Snapshot (último)</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="monthly">Mensual</SelectItem>
            <SelectItem value="quarterly">Trimestral</SelectItem>
          </SelectContent>
        </Select>
      </FilterBlock>

      {/* Métricas */}
      <FilterBlock title="Métricas a analizar" origin={state.axisMetrics.origin}>
        <TooltipProvider delayDuration={150}>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() =>
                    setState(
                      setFilter(
                        state,
                        "axisMetrics",
                        METRICS.map((m) => m.value),
                      ),
                    )
                  }
                  className="px-2 py-0.5 rounded text-xs border bg-card border-border hover:bg-accent"
                >
                  Todas
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Selecciona las 9 métricas (RIXc + 8 sub-métricas).
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setState(setFilter(state, "axisMetrics", ["RIX"]))}
                  className="px-2 py-0.5 rounded text-xs border bg-card border-border hover:bg-accent"
                >
                  Solo RIXc
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Analiza únicamente el índice compuesto RIXc.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((m) => {
              const active = state.axisMetrics.value.includes(m.value);
              return (
                <Tooltip key={m.value}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        const next = active
                          ? state.axisMetrics.value.filter((x) => x !== m.value)
                          : [...state.axisMetrics.value, m.value];
                        setState(
                          setFilter(
                            state,
                            "axisMetrics",
                            next.length === 0 ? ["RIX"] : next,
                          ),
                        );
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs border",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-foreground hover:bg-accent",
                      )}
                    >
                      {m.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="font-semibold text-xs mb-0.5">
                      {m.label} — {m.fullName}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-snug">
                      {m.description}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Pasa el ratón sobre cada sigla para ver qué mide. Puedes elegir varias.
          </p>
        </TooltipProvider>
      </FilterBlock>

      {!isHidden("topN") && (
        <FilterBlock title="Top N" origin={state.topN.origin}>
          <Input
            type="number"
            min={1}
            max={100}
            placeholder="Top N (opcional)"
            value={state.topN.origin === "free" ? "" : state.topN.value}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setState(setFilter(state, "topN", 10, "free"));
              } else {
                setState(setFilter(state, "topN", Number(raw) || 10));
              }
            }}
          />
        </FilterBlock>
      )}

      {!isHidden("order") && (
        <FilterBlock title="¿Qué quieres ver?" origin={state.order.origin}>
          <Select
            value={state.order.origin === "free" ? "__free__" : state.order.value}
            onValueChange={(v) => {
              if (v === "__free__") {
                setState(setFilter(state, "order", "desc", "free"));
              } else {
                setState(setFilter(state, "order", v as SortOrder));
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="— sin restricción —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__free__">— sin restricción —</SelectItem>
              <SelectItem value="desc">Los mejores (top)</SelectItem>
              <SelectItem value="asc">Los peores (bottom)</SelectItem>
              <SelectItem value="divergence">Los más divergentes entre IAs</SelectItem>
            </SelectContent>
          </Select>
        </FilterBlock>
      )}

      {features.sourceTypeFilter && (
        <FilterBlock
          title="Tipo de fuente"
          origin={state.sourceTier.origin}
          defaultOpen={false}
        >
          <Select
            value={state.sourceTier.value}
            onValueChange={(v: SourceTier) =>
              setState(setFilter(state, "sourceTier", v))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fuentes</SelectItem>
              <SelectItem value="regulatory">Regulatorias</SelectItem>
              <SelectItem value="media">Medios</SelectItem>
              <SelectItem value="owned">Propias</SelectItem>
            </SelectContent>
          </Select>
        </FilterBlock>
      )}
    </div>
  );
}