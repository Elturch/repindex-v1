import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Play, RefreshCw, ChevronRight } from "lucide-react";

const DIMENSIONS = [
  { key: "grounding", label: "Grounding" },
  { key: "temporal", label: "Temporal" },
  { key: "anti_mediana", label: "Anti-mediana" },
  { key: "competidores", label: "Competidores" },
  { key: "estructura", label: "Estructura" },
  { key: "sanitizacion", label: "Sanitización" },
  { key: "fiabilidad", label: "Fiabilidad" },
] as const;

type Dim = typeof DIMENSIONS[number]["key"];

interface AuditRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  total_queries: number;
  completed_queries: number;
  failed_queries: number;
  notes: string | null;
}

interface AuditResult {
  id: string;
  query_id: string;
  family: string;
  question: string;
  output: string | null;
  latency_ms: number | null;
  auto_checks: Record<string, { pass: boolean; detail?: string }>;
  error: string | null;
  datapack: any;
}

interface AuditScore {
  id: string;
  result_id: string;
  dimension: Dim;
  score: number;
  note: string | null;
}

export function QualityAuditPanel() {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [results, setResults] = useState<AuditResult[]>([]);
  const [scores, setScores] = useState<AuditScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [notes, setNotes] = useState("");
  const [openResultId, setOpenResultId] = useState<string | null>(null);

  async function loadRuns() {
    const { data, error } = await supabase
      .from("audit_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) {
      toast({ title: "Error cargando runs", description: error.message, variant: "destructive" });
      return;
    }
    setRuns((data ?? []) as AuditRun[]);
    if (!selectedRunId && data && data.length > 0) setSelectedRunId(data[0].id);
  }

  async function loadResults(runId: string) {
    setLoading(true);
    const { data: resData } = await supabase
      .from("audit_results")
      .select("*")
      .eq("run_id", runId)
      .order("query_id");
    setResults((resData ?? []) as AuditResult[]);
    const ids = (resData ?? []).map((r: any) => r.id);
    if (ids.length > 0) {
      const { data: scoreData } = await supabase
        .from("audit_scores")
        .select("*")
        .in("result_id", ids);
      setScores((scoreData ?? []) as AuditScore[]);
    } else {
      setScores([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRuns();
  }, []);

  useEffect(() => {
    if (selectedRunId) loadResults(selectedRunId);
  }, [selectedRunId]);

  // Auto-refresh while a run is active
  useEffect(() => {
    const active = runs.find((r) => r.id === selectedRunId);
    if (!active || active.status !== "running") return;
    const t = setInterval(() => {
      loadRuns();
      if (selectedRunId) loadResults(selectedRunId);
    }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, selectedRunId]);

  async function startRun() {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("quality-audit-runner", {
        body: { notes },
      });
      if (error) throw error;
      toast({
        title: "Auditoría iniciada",
        description: `Run ${data.run_id?.slice(0, 8)}… (${data.total} queries)`,
      });
      setNotes("");
      await loadRuns();
      if (data.run_id) setSelectedRunId(data.run_id);
    } catch (e: any) {
      toast({ title: "No se pudo iniciar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  async function setScore(resultId: string, dimension: Dim, score: number, note?: string) {
    const existing = scores.find((s) => s.result_id === resultId && s.dimension === dimension);
    const payload = { result_id: resultId, dimension, score, note: note ?? existing?.note ?? null };
    const { data, error } = await supabase
      .from("audit_scores")
      .upsert(payload, { onConflict: "result_id,dimension" })
      .select()
      .single();
    if (error) {
      toast({ title: "Error guardando puntuación", description: error.message, variant: "destructive" });
      return;
    }
    setScores((prev) => {
      const filtered = prev.filter((s) => !(s.result_id === resultId && s.dimension === dimension));
      return [...filtered, data as AuditScore];
    });
  }

  const summary = useMemo(() => {
    const totalChecks = results.reduce((acc, r) => acc + Object.keys(r.auto_checks ?? {}).length, 0);
    const passedChecks = results.reduce(
      (acc, r) => acc + Object.values(r.auto_checks ?? {}).filter((c) => c.pass).length,
      0,
    );
    const totalScore = scores.reduce((acc, s) => acc + s.score, 0);
    const maxScore = results.length * DIMENSIONS.length * 2;
    return { totalChecks, passedChecks, totalScore, maxScore };
  }, [results, scores]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Quality Audit — Agente RIX V2</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Batería de 24 queries canónicas evaluadas con 7 dimensiones. Auto-checks programáticos + scoring manual.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Notas de este run (opcional, ej: tras cambio en outputGuard)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex-1"
          />
          <Button onClick={startRun} disabled={starting} className="gap-2">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Ejecutar batería
          </Button>
          <Button variant="outline" size="icon" onClick={loadRuns}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ~24 queries × ~30-60s c/u + throttling 3s = entre 12 y 25 min por batería completa.
        </p>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        {/* Lista de runs */}
        <Card className="col-span-3 p-3 max-h-[700px] overflow-auto">
          <h3 className="text-sm font-semibold mb-2">Runs recientes</h3>
          <div className="space-y-1">
            {runs.map((r) => {
              const active = r.id === selectedRunId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedRunId(r.id)}
                  className={`w-full text-left p-2 rounded text-xs border transition ${
                    active ? "bg-primary/10 border-primary" : "hover:bg-muted border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{r.id.slice(0, 8)}</span>
                    <Badge
                      variant={
                        r.status === "completed" ? "default" : r.status === "running" ? "secondary" : "destructive"
                      }
                      className="text-[10px]"
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-1">
                    {new Date(r.started_at).toLocaleString()}
                  </div>
                  <div className="text-muted-foreground">
                    {r.completed_queries}/{r.total_queries}
                    {r.failed_queries > 0 ? ` · ${r.failed_queries} err` : ""}
                  </div>
                  {r.notes && <div className="text-muted-foreground italic mt-1 truncate">{r.notes}</div>}
                </button>
              );
            })}
            {runs.length === 0 && <p className="text-xs text-muted-foreground">Sin runs aún.</p>}
          </div>
        </Card>

        {/* Detalle */}
        <Card className="col-span-9 p-4 max-h-[700px] overflow-auto">
          {!selectedRunId && <p className="text-sm text-muted-foreground">Selecciona un run.</p>}
          {selectedRunId && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-muted-foreground">
                  Auto-checks: <strong>{summary.passedChecks}/{summary.totalChecks}</strong> ·
                  Score manual: <strong>{summary.totalScore}/{summary.maxScore}</strong>
                </div>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>

              <div className="space-y-2">
                {results.map((r) => {
                  const open = openResultId === r.id;
                  const checks = Object.entries(r.auto_checks ?? {});
                  const passed = checks.filter(([, c]) => c.pass).length;
                  return (
                    <div key={r.id} className="border rounded">
                      <button
                        onClick={() => setOpenResultId(open ? null : r.id)}
                        className="w-full p-3 text-left hover:bg-muted/50 flex items-start gap-3"
                      >
                        <ChevronRight
                          className={`h-4 w-4 mt-0.5 transition-transform ${open ? "rotate-90" : ""}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{r.query_id}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{r.family}</Badge>
                            <span className="text-xs font-medium truncate">{r.question}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                            <span>
                              Checks: <strong className={passed === checks.length ? "text-green-600" : "text-amber-600"}>
                                {passed}/{checks.length}
                              </strong>
                            </span>
                            {r.latency_ms != null && <span>{(r.latency_ms / 1000).toFixed(1)}s</span>}
                            {r.error && <span className="text-destructive">⚠ error</span>}
                          </div>
                        </div>
                      </button>

                      {open && (
                        <div className="border-t p-3 space-y-3 bg-muted/30">
                          {r.error && (
                            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                              {r.error}
                            </div>
                          )}

                          {/* Auto-checks */}
                          <div>
                            <div className="text-xs font-semibold mb-1">Auto-checks</div>
                            <div className="flex flex-wrap gap-1">
                              {checks.map(([k, v]) => (
                                <Badge
                                  key={k}
                                  variant={v.pass ? "default" : "destructive"}
                                  className="text-[10px]"
                                  title={v.detail || ""}
                                >
                                  {v.pass ? "✓" : "✗"} {k}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Output */}
                          <div>
                            <div className="text-xs font-semibold mb-1">Output</div>
                            <Textarea
                              value={r.output ?? ""}
                              readOnly
                              className="font-mono text-[11px] h-40"
                            />
                          </div>

                          {/* Manual scoring */}
                          <div>
                            <div className="text-xs font-semibold mb-1">Puntuación manual</div>
                            <div className="grid grid-cols-7 gap-2">
                              {DIMENSIONS.map((d) => {
                                const sc = scores.find(
                                  (s) => s.result_id === r.id && s.dimension === d.key,
                                );
                                return (
                                  <div key={d.key} className="space-y-1">
                                    <div className="text-[10px] text-muted-foreground truncate">{d.label}</div>
                                    <Select
                                      value={sc ? String(sc.score) : ""}
                                      onValueChange={(v) => setScore(r.id, d.key, parseInt(v))}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder="-" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="0">0</SelectItem>
                                        <SelectItem value="1">1</SelectItem>
                                        <SelectItem value="2">2</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {results.length === 0 && !loading && (
                  <p className="text-xs text-muted-foreground">Sin resultados todavía.</p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}