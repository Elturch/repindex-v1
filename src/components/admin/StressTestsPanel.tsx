import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Play, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  family: string;
  total_cases: number;
  passed: number;
  failed: number;
  errored: number;
  status: string;
  notes: string | null;
};

type Result = {
  id: string;
  case_id: string;
  family: string;
  scope: string;
  model_filter: string | null;
  status: string;
  asserts_failed: Array<{ id: string; msg?: string }> | null;
  asserts_passed: string[] | null;
  latency_ms: number | null;
  response_markdown: string | null;
  error_message: string | null;
  scope_contract: any | null;
  coverage_report: any | null;
  scope_audit: any | null;
  scope_validation: any | null;
};

type DiffKind = "fixed" | "regressed" | "still_failing" | "still_passing" | "new" | "removed";
type Filter = "all" | "failing" | "regressed" | "fixed";

const FAMILIES = [
  { value: "phase1-small", label: "Fase 1 · small (subsectores N≤3, multi)" },
  { value: "phase1-full", label: "Fase 1 · full (21 celdas hotels-reits)" },
  { value: "hotels-reits", label: "Hotels + REITs (foco fallo)" },
  { value: "small", label: "Subsectores ≤5 (small)" },
  { value: "sanity", label: "Sanity IBEX" },
  { value: "all", label: "Todos (small + sanity)" },
];

const MODELS = ["multi", "gemini", "deepseek", "grok", "qwen", "perplexity", "chatgpt"];

const isFail = (s: string) => s === "fail" || s === "error";

// ── Playbook: cada assert mapea a una instrucción de reparación accionable.
// Mantener corto, específico y orientado a archivo + acción concreta.
type RepairEntry = {
  title: string;
  cause: string;
  fix: string;
  files: string[];
  priority: "alta" | "media" | "baja";
};
const ASSERT_REPAIR_PLAYBOOK: Record<string, RepairEntry> = {
  A1_scope_integrity: {
    title: "URLs en §6 fuera de scope",
    cause: "La bibliografía cita URLs cuyo dominio/línea no contiene ningún ticker (ni nombre) del ranking.",
    fix: "Restringir fetchSectorSourceRows a tickers del ranking, y antes de imprimir cada URL exigir que la línea contenga el ticker o el issuer_name.",
    files: ["supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts (cited_sources_substitution + fetchSectorSourceRows)"],
    priority: "alta",
  },
  A2_single_model_lang: {
    title: "Lenguaje multi-modelo en vista single-model",
    cause: "La síntesis con un único modelo aún cita 'consenso multi', 'rix medio', 'los demás modelos' o promedios.",
    fix: "Ampliar sanitizeFinalMarkdown con modelFilter activo y reforzar buildSingleModelRankingRules para prohibir esas frases también en footnotes/tablas.",
    files: [
      "supabase/functions/chat-intelligence-v2/guards/outputGuard.ts (SM_* regex)",
      "supabase/functions/chat-intelligence-v2/prompts/rankingMode.ts (buildSingleModelRankingRules)",
    ],
    priority: "alta",
  },
  A3_anti_fabrication: {
    title: "Entregables/fechas inventadas",
    cause: "El LLM coló términos como 'nota de prensa', 'roadshow', 'Q1-2027', 'AGM', 'target N'.",
    fix: "Ampliar regex en sanitizeFinalMarkdown y reforzar la sección 7 del prompt para prohibir explícitamente cada término.",
    files: [
      "supabase/functions/chat-intelligence-v2/guards/outputGuard.ts",
      "supabase/functions/chat-intelligence-v2/prompts/antiHallucination.ts",
    ],
    priority: "media",
  },
  A4_small_n: {
    title: "Top-5 mencionado con N≤3",
    cause: "El prompt no se adapta al tamaño real del subsector y el LLM dice 'top-5' aunque solo haya 1-3 emisores.",
    fix: "En sectorRanking, sustituir 'top-5' por 'ranking completo' cuando ranking.length ≤ 3 y reforzar la regla en el prompt.",
    files: ["supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts"],
    priority: "media",
  },
  A5_hotels_edge: {
    title: "Hoteles no declara unicidad",
    cause: "El skill no garantiza una frase determinista declarando que el subsector tiene 1 único emisor cotizado (MEL).",
    fix: "Inyectar antes de la sección 1 una línea canónica: 'El subsector Hoteles contiene 1 único emisor cotizado: Meliá Hotels International (MEL).' cuando ranking.length === 1.",
    files: ["supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts (buildUniquenessLine)"],
    priority: "alta",
  },
  A6_anti_mediana: {
    title: "Aparece la palabra 'mediana'",
    cause: "El LLM ignora la regla anti-mediana en algún párrafo o footnote.",
    fix: "Confirmar que sanitizeFinalMarkdown se aplica al markdown persistido (orchestrator + skill) y reforzar la prohibición explícita en el prompt base.",
    files: [
      "supabase/functions/chat-intelligence-v2/guards/outputGuard.ts",
      "supabase/functions/chat-intelligence-v2/prompts/antiHallucination.ts",
    ],
    priority: "alta",
  },
  A7_period_coherence: {
    title: "Fechas previas a 2026-01-01",
    cause: "Aparece una fecha ISO anterior al floor de datos.",
    fix: "Validar/recortar todas las fechas en el sanitizer y asegurar que el prompt mencione el floor 2026-01-01 como límite duro.",
    files: ["supabase/functions/chat-intelligence-v2/guards/outputGuard.ts"],
    priority: "media",
  },
  A8_models_coverage: {
    title: "Algún modelo no citado en multi-modelo",
    cause: "Faltan referencias explícitas a uno o más de los 6 modelos en la narrativa.",
    fix: "Forzar tabla pre-renderizada con columna por modelo (ya existe) y añadir un párrafo determinista listando los 6 modelos cuando alguno no aparece.",
    files: ["supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts"],
    priority: "media",
  },
  A9_ranking_enrichment: {
    title: "Faltan sub-métricas canónicas",
    cause: "La salida no incluye alguna de NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM.",
    fix: "El skill ya añade una tabla determinista de 8 sub-métricas si falta alguna; verificar que también se aplica en el fallback 'sin datos suficientes'.",
    files: ["supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts (buildDeterministicDimensionsTable + fallback)"],
    priority: "alta",
  },
  A10_biblio_min: {
    title: "Bibliografía sin URL por ticker",
    cause: "No existe sección de fuentes detectable, o falta una entrada por cada ticker del ranking.",
    fix: "Garantizar que buildTickerCitedSourcesBlock se concatena SIEMPRE al final (incluyendo fallback) con al menos website oficial por ticker.",
    files: ["supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts (buildTickerCitedSourcesBlock)"],
    priority: "alta",
  },
};

const PRIORITY_COLOR: Record<RepairEntry["priority"], string> = {
  alta: "border-red-500/40 bg-red-500/5",
  media: "border-amber-500/40 bg-amber-500/5",
  baja: "border-muted bg-muted/20",
};

const median = (arr: number[]) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};

export function StressTestsPanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [prevResults, setPrevResults] = useState<Result[]>([]);
  const [prevRun, setPrevRun] = useState<Run | null>(null);
  const [family, setFamily] = useState("hotels-reits");
  const [launching, setLaunching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drillOpen, setDrillOpen] = useState<Result | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const loadRuns = async () => {
    const { data, error } = await supabase
      .from("stress_runs" as any)
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) { toast.error(error.message); return; }
    setRuns((data ?? []) as any);
    if ((data ?? []).length > 0 && !selectedRun) {
      setSelectedRun((data as any)[0].id);
    }
  };

  const loadResultsAndDiff = async (runId: string) => {
    setLoading(true);
    const current = runs.find((r) => r.id === runId);

    // Find previous run with same family
    const prev = current
      ? runs.find((r) =>
          r.family === current.family &&
          r.id !== current.id &&
          new Date(r.started_at) < new Date(current.started_at),
        ) ?? null
      : null;
    setPrevRun(prev);

    const fields = "id,case_id,family,scope,model_filter,status,asserts_failed,asserts_passed,latency_ms,response_markdown,error_message,scope_contract,coverage_report,scope_audit,scope_validation";

    const [curQ, prevQ] = await Promise.all([
      supabase.from("stress_results" as any).select(fields).eq("run_id", runId).order("created_at", { ascending: true }),
      prev
        ? supabase.from("stress_results" as any).select(fields).eq("run_id", prev.id)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    setLoading(false);
    if (curQ.error) { toast.error(curQ.error.message); return; }
    setResults((curQ.data ?? []) as any);
    setPrevResults((prevQ.data ?? []) as any);
  };

  useEffect(() => { loadRuns(); }, []);
  useEffect(() => { if (selectedRun) loadResultsAndDiff(selectedRun); }, [selectedRun, runs.length]);

  // Auto-refresh while running
  useEffect(() => {
    const current = runs.find((r) => r.id === selectedRun);
    if (!current || current.status !== "running") return;
    const t = setInterval(() => {
      loadRuns();
      if (selectedRun) loadResultsAndDiff(selectedRun);
    }, 5000);
    return () => clearInterval(t);
  }, [runs, selectedRun]);

  const launch = async () => {
    setLaunching(true);
    const { data, error } = await supabase.functions.invoke("stress-matrix-runner", { body: { family } });
    setLaunching(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Run lanzado: ${(data as any)?.total_cases} casos`);
    setTimeout(() => { loadRuns(); }, 1000);
  };

  // Index prev by case_id
  const prevByCase = useMemo(() => {
    const m: Record<string, Result> = {};
    for (const r of prevResults) m[r.case_id] = r;
    return m;
  }, [prevResults]);

  const diffByCase = useMemo(() => {
    const m: Record<string, DiffKind> = {};
    for (const r of results) {
      const p = prevByCase[r.case_id];
      if (!p) m[r.case_id] = "new";
      else if (isFail(p.status) && r.status === "pass") m[r.case_id] = "fixed";
      else if (p.status === "pass" && isFail(r.status)) m[r.case_id] = "regressed";
      else if (isFail(p.status) && isFail(r.status)) m[r.case_id] = "still_failing";
      else m[r.case_id] = "still_passing";
    }
    return m;
  }, [results, prevByCase]);

  const summary = useMemo(() => {
    const fixed: Result[] = [];
    const regressed: Result[] = [];
    const stillFailing: Result[] = [];
    for (const r of results) {
      const k = diffByCase[r.case_id];
      if (k === "fixed") fixed.push(r);
      else if (k === "regressed") regressed.push(r);
      else if (k === "still_failing") stillFailing.push(r);
    }
    const passNow = results.filter((r) => r.status === "pass").length;
    const failNow = results.filter((r) => r.status === "fail").length;
    const errNow = results.filter((r) => r.status === "error").length;
    const passPrev = prevResults.filter((r) => r.status === "pass").length;
    const latNow = median(results.map((r) => r.latency_ms ?? 0).filter((n) => n > 0));
    const latPrev = median(prevResults.map((r) => r.latency_ms ?? 0).filter((n) => n > 0));

    // Assert ranking
    const failsNow: Record<string, number> = {};
    const failsPrev: Record<string, number> = {};
    for (const r of results) for (const a of r.asserts_failed ?? []) failsNow[a.id] = (failsNow[a.id] ?? 0) + 1;
    for (const r of prevResults) for (const a of r.asserts_failed ?? []) failsPrev[a.id] = (failsPrev[a.id] ?? 0) + 1;
    const assertRanking = Object.entries(failsNow)
      .map(([id, n]) => ({ id, now: n, prev: failsPrev[id] ?? 0, delta: n - (failsPrev[id] ?? 0) }))
      .sort((a, b) => b.now - a.now)
      .slice(0, 5);

    return {
      fixed, regressed, stillFailing,
      passNow, failNow, errNow,
      passDelta: passNow - passPrev,
      latNow, latDelta: latNow - latPrev,
      total: results.length,
      assertRanking,
    };
  }, [results, prevResults, diffByCase]);

  const verdict: { label: string; color: string; Icon: typeof TrendingUp } =
    !prevRun
      ? { label: "Sin run previo de esta familia", color: "text-muted-foreground", Icon: Minus }
      : summary.passDelta > 0
        ? { label: `Mejora: +${summary.passDelta} casos pasan`, color: "text-emerald-600", Icon: TrendingUp }
        : summary.passDelta < 0
          ? { label: `Regresión: ${summary.passDelta} casos`, color: "text-red-600", Icon: TrendingDown }
          : { label: "Sin cambios netos en pass/fail", color: "text-muted-foreground", Icon: Minus };

  // Heatmap with delta markers
  const heatmap: Record<string, Record<string, { pass: number; fail: number; error: number; total: number; prevPass: number; prevTotal: number }>> = {};
  for (const r of results) {
    const m = r.model_filter ?? "multi";
    heatmap[r.scope] ??= {};
    heatmap[r.scope][m] ??= { pass: 0, fail: 0, error: 0, total: 0, prevPass: 0, prevTotal: 0 };
    const cell = heatmap[r.scope][m];
    cell.total++;
    if (r.status === "pass") cell.pass++;
    else if (r.status === "fail") cell.fail++;
    else if (r.status === "error") cell.error++;
    const p = prevByCase[r.case_id];
    if (p) {
      cell.prevTotal++;
      if (p.status === "pass") cell.prevPass++;
    }
  }
  const scopes = Object.keys(heatmap).sort();

  const cellColor = (cell?: { pass: number; fail: number; error: number; total: number }) => {
    if (!cell || cell.total === 0) return "bg-muted/30 text-muted-foreground";
    if (cell.error > 0) return "bg-orange-500/30 text-orange-50";
    if (cell.fail > 0) return "bg-red-500/40 text-red-50";
    return "bg-emerald-500/40 text-emerald-50";
  };

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      const k = diffByCase[r.case_id];
      if (filter === "all") return true;
      if (filter === "failing") return isFail(r.status);
      if (filter === "regressed") return k === "regressed";
      if (filter === "fixed") return k === "fixed";
      return true;
    });
  }, [results, diffByCase, filter]);

  const renderDelta = (delta: number, invert = false) => {
    if (delta === 0) return <span className="text-muted-foreground text-xs">±0</span>;
    const good = invert ? delta < 0 : delta > 0;
    const color = good ? "text-emerald-600" : "text-red-600";
    const sign = delta > 0 ? "+" : "";
    return <span className={`text-xs font-semibold ${color}`}>{sign}{delta}</span>;
  };

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Lanzar matriz de estrés</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Familia</label>
              <Select value={family} onValueChange={setFamily}>
                <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FAMILIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={launch} disabled={launching} className="gap-2">
              {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Lanzar
            </Button>
            <Button variant="outline" onClick={() => { loadRuns(); if (selectedRun) loadResultsAndDiff(selectedRun); }} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refrescar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            SDD v1 · concurrencia 3 · ventana 4 semanas · asserts deterministas.
            <strong className="ml-2">hotels-reits</strong> = 3 subsectores × 7 vistas (multi + 6 modelos) ≈ 21 celdas.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de runs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inicio</TableHead>
                <TableHead>Familia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pass</TableHead>
                <TableHead className="text-right">Fail</TableHead>
                <TableHead className="text-right">Error</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} className={selectedRun === r.id ? "bg-muted/40" : ""}>
                  <TableCell className="font-mono text-xs">{new Date(r.started_at).toLocaleString("es-ES")}</TableCell>
                  <TableCell><Badge variant="secondary">{r.family}</Badge></TableCell>
                  <TableCell>
                    {r.status === "running" && <Badge className="bg-amber-500/20 text-amber-700"><Loader2 className="h-3 w-3 mr-1 animate-spin" />running</Badge>}
                    {r.status === "completed" && <Badge className="bg-emerald-500/20 text-emerald-700">completed</Badge>}
                    {r.status === "error" && <Badge variant="destructive">error</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{r.total_cases}</TableCell>
                  <TableCell className="text-right text-emerald-600">{r.passed}</TableCell>
                  <TableCell className="text-right text-red-600">{r.failed}</TableCell>
                  <TableCell className="text-right text-orange-600">{r.errored}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedRun(r.id)}>Ver</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedRun && (
        <>
          {/* RESUMEN EJECUTIVO */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <verdict.Icon className={`h-5 w-5 ${verdict.color}`} />
                <span className={verdict.color}>{verdict.label}</span>
                {prevRun && (
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    vs run {new Date(prevRun.started_at).toLocaleString("es-ES")}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Pass</div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {summary.passNow}<span className="text-sm text-muted-foreground">/{summary.total}</span>
                  </div>
                  <div className="mt-1">{prevRun && renderDelta(summary.passDelta)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Fail</div>
                  <div className="text-2xl font-bold text-red-600">{summary.failNow}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Error</div>
                  <div className="text-2xl font-bold text-orange-600">{summary.errNow}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Latencia mediana</div>
                  <div className="text-2xl font-bold font-mono">{Math.round(summary.latNow)}<span className="text-sm text-muted-foreground"> ms</span></div>
                  <div className="mt-1">{prevRun && renderDelta(Math.round(summary.latDelta), true)}</div>
                </div>
              </div>

              {/* Qué cambió */}
              {prevRun && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-emerald-500/30 p-3 bg-emerald-500/5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-emerald-700 flex items-center gap-1">
                        <ArrowUp className="h-4 w-4" /> Arreglados ({summary.fixed.length})
                      </div>
                      {summary.fixed.length > 0 && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setFilter("fixed")}>filtrar</Button>
                      )}
                    </div>
                    {summary.fixed.length === 0 ? (
                      <div className="text-xs text-muted-foreground">Ningún caso pasó de fail a pass.</div>
                    ) : (
                      <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                        {summary.fixed.slice(0, 8).map((r) => (
                          <li key={r.id} className="font-mono truncate">✓ {r.case_id}</li>
                        ))}
                        {summary.fixed.length > 8 && <li className="text-muted-foreground">+{summary.fixed.length - 8} más</li>}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-lg border border-red-500/30 p-3 bg-red-500/5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-red-700 flex items-center gap-1">
                        <ArrowDown className="h-4 w-4" /> Regresiones ({summary.regressed.length})
                      </div>
                      {summary.regressed.length > 0 && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setFilter("regressed")}>filtrar</Button>
                      )}
                    </div>
                    {summary.regressed.length === 0 ? (
                      <div className="text-xs text-muted-foreground">Ningún caso pasó de pass a fail.</div>
                    ) : (
                      <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                        {summary.regressed.slice(0, 8).map((r) => (
                          <li key={r.id} className="font-mono truncate">⚠ {r.case_id}</li>
                        ))}
                        {summary.regressed.length > 8 && <li className="text-muted-foreground">+{summary.regressed.length - 8} más</li>}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Sigue roto */}
              {summary.stillFailing.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 p-3 bg-amber-500/5 flex items-center justify-between">
                  <div className="text-sm">
                    <strong className="text-amber-700">{summary.stillFailing.length} casos</strong> siguen fallando igual que antes.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setFilter("failing")}>Ver sólo los rotos</Button>
                </div>
              )}

              {/* Top asserts fallados */}
              {summary.assertRanking.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">Asserts más fallados ahora</div>
                  <div className="space-y-1">
                    {summary.assertRanking.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 text-xs">
                        <code className="font-mono bg-muted px-2 py-0.5 rounded">{a.id}</code>
                        <span className="text-red-600 font-semibold">{a.now} fallos</span>
                        {prevRun && renderDelta(a.delta, true)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PLAN DE REPARACIÓN */}
          {summary.assertRanking.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-amber-600" />
                  Plan de reparación accionable
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Una entrada por assert fallido, ordenadas por número de fallos. Cada bloque indica causa probable, qué tocar y dónde.
                </p>
                {summary.assertRanking.map((a) => {
                  const playbook = ASSERT_REPAIR_PLAYBOOK[a.id];
                  if (!playbook) return null;
                  const example = (results.find((r) => (r.asserts_failed ?? []).some((x) => x.id === a.id))?.asserts_failed ?? [])
                    .find((x) => x.id === a.id)?.msg;
                  return (
                    <div key={a.id} className={`rounded-lg border p-3 ${PRIORITY_COLOR[playbook.priority]}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs bg-background px-2 py-0.5 rounded border">{a.id}</code>
                          <span className="text-sm font-semibold">{playbook.title}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">{playbook.priority}</Badge>
                        </div>
                        <span className="text-xs text-red-600 font-semibold">{a.now} fallos</span>
                      </div>
                      <div className="text-xs space-y-1.5 mt-2">
                        <div><strong>Causa probable:</strong> {playbook.cause}</div>
                        <div><strong>Reparación:</strong> {playbook.fix}</div>
                        <div>
                          <strong>Archivos:</strong>
                          <ul className="list-disc list-inside font-mono text-[11px] mt-0.5">
                            {playbook.files.map((f) => <li key={f}>{f}</li>)}
                          </ul>
                        </div>
                        {example && (
                          <div className="text-muted-foreground"><strong>Ejemplo:</strong> {example}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* HEATMAP */}
          <Card>
            <CardHeader><CardTitle>Heatmap subsector × modelo</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left">Scope</th>
                    {MODELS.map((m) => (
                      <th key={m} className="px-2 py-1 text-center font-mono">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scopes.map((s) => (
                    <tr key={s}>
                      <td className="px-2 py-1 font-medium">{s}</td>
                      {MODELS.map((m) => {
                        const cell = heatmap[s]?.[m];
                        if (!cell) return <td key={m} className={`px-2 py-1 text-center ${cellColor()}`}>—</td>;
                        const wasOK = cell.prevTotal > 0 && cell.prevPass === cell.prevTotal;
                        const nowOK = cell.pass === cell.total;
                        const delta = nowOK && !wasOK && cell.prevTotal > 0
                          ? "up"
                          : !nowOK && wasOK
                            ? "down"
                            : null;
                        return (
                          <Tooltip key={m}>
                            <TooltipTrigger asChild>
                              <td className={`px-2 py-1 text-center ${cellColor(cell)} relative`}>
                                {cell.pass}/{cell.total}
                                {delta === "up" && <span className="ml-1 text-emerald-200">▲</span>}
                                {delta === "down" && <span className="ml-1 text-red-200">▼</span>}
                              </td>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div>Ahora: {cell.pass}/{cell.total} pass</div>
                                {cell.prevTotal > 0 && <div>Antes: {cell.prevPass}/{cell.prevTotal} pass</div>}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* RESULTADOS */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  Resultados {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                </span>
                <div className="flex gap-1">
                  {(["all", "failing", "regressed", "fixed"] as Filter[]).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filter === f ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setFilter(f)}
                    >
                      {f === "all" ? "Todos" : f === "failing" ? "Sólo fail/error" : f === "regressed" ? "Regresiones" : "Arreglados"}
                    </Button>
                  ))}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caso</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Δ</TableHead>
                    <TableHead>Asserts fallados</TableHead>
                    <TableHead className="text-right">Latencia</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResults.map((r) => {
                    const k = diffByCase[r.case_id];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.case_id}</TableCell>
                        <TableCell className="text-xs">{r.scope}</TableCell>
                        <TableCell className="text-xs">{r.model_filter ?? "multi"}</TableCell>
                        <TableCell>
                          {r.status === "pass" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          {r.status === "fail" && <XCircle className="h-4 w-4 text-red-600" />}
                          {r.status === "error" && <AlertCircle className="h-4 w-4 text-orange-600" />}
                          {r.status === "pending" && <Loader2 className="h-4 w-4 animate-spin" />}
                        </TableCell>
                        <TableCell className="text-xs">
                          {k === "fixed" && <Badge className="bg-emerald-500/20 text-emerald-700 text-[10px]">arreglado</Badge>}
                          {k === "regressed" && <Badge className="bg-red-500/20 text-red-700 text-[10px]">regresión</Badge>}
                          {k === "still_failing" && <Badge variant="outline" className="text-[10px]">sigue roto</Badge>}
                          {k === "new" && <Badge variant="outline" className="text-[10px]">nuevo</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(r.asserts_failed ?? []).map((a) => (
                            <Badge key={a.id} variant="outline" className="mr-1 mb-1 text-[10px]">{a.id}</Badge>
                          ))}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">{r.latency_ms ?? "—"}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => setDrillOpen(r)}>Detalle</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!drillOpen} onOpenChange={(o) => !o && setDrillOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{drillOpen?.case_id}</DialogTitle>
          </DialogHeader>
          {drillOpen && (() => {
            const prev = prevByCase[drillOpen.case_id];
            return (
              <div className="space-y-3 text-sm">
                {prevRun && (
                  <div className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
                    {!prev
                      ? "Caso nuevo (no existía en el run anterior)."
                      : prev.status === "pass"
                        ? "Estado anterior: ✅ pass"
                        : `Estado anterior: ❌ ${prev.status} (${(prev.asserts_failed ?? []).length} asserts fallados)`}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {(drillOpen.asserts_failed ?? []).map((a) => (
                    <Badge key={a.id} variant="destructive" className="text-[11px]">
                      {a.id}: {a.msg ?? "fail"}
                    </Badge>
                  ))}
                  {(drillOpen.asserts_passed ?? []).map((a) => (
                    <Badge key={a} variant="outline" className="text-[11px] border-emerald-500/50 text-emerald-700">{a}</Badge>
                  ))}
                </div>
                {(drillOpen.asserts_failed ?? []).length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold flex items-center gap-1">
                      <Wrench className="h-3 w-3" /> Cómo arreglar este caso
                    </div>
                    {(drillOpen.asserts_failed ?? []).map((a) => {
                      const p = ASSERT_REPAIR_PLAYBOOK[a.id];
                      if (!p) return null;
                      return (
                        <div key={a.id} className={`rounded border p-2 text-xs ${PRIORITY_COLOR[p.priority]}`}>
                          <div className="font-semibold mb-0.5">{a.id} — {p.title}</div>
                          <div><strong>Reparación:</strong> {p.fix}</div>
                          <div className="font-mono text-[10px] text-muted-foreground mt-1">{p.files.join(" · ")}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {drillOpen.error_message && (
                  <div className="p-3 bg-orange-500/10 rounded text-xs">{drillOpen.error_message}</div>
                )}
                <pre className="p-3 bg-muted rounded text-xs whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                  {drillOpen.response_markdown ?? "(sin respuesta)"}
                </pre>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
