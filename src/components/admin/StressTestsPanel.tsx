import { useEffect, useState } from "react";
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
import { Loader2, Play, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

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
};

const FAMILIES = [
  { value: "hotels-reits", label: "Hotels + REITs (foco fallo)" },
  { value: "small", label: "Subsectores ≤5 (small)" },
  { value: "sanity", label: "Sanity IBEX" },
  { value: "all", label: "Todos (small + sanity)" },
];

const MODELS = ["multi", "gemini", "deepseek", "grok", "qwen", "perplexity", "chatgpt"];

export function StressTestsPanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [family, setFamily] = useState("hotels-reits");
  const [launching, setLaunching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drillOpen, setDrillOpen] = useState<Result | null>(null);

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

  const loadResults = async (runId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stress_results" as any)
      .select("id,case_id,family,scope,model_filter,status,asserts_failed,asserts_passed,latency_ms,response_markdown,error_message")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setResults((data ?? []) as any);
  };

  useEffect(() => { loadRuns(); }, []);
  useEffect(() => { if (selectedRun) loadResults(selectedRun); }, [selectedRun]);

  // Auto-refresh while a run is in progress.
  useEffect(() => {
    const current = runs.find((r) => r.id === selectedRun);
    if (!current || current.status !== "running") return;
    const t = setInterval(() => {
      loadRuns();
      if (selectedRun) loadResults(selectedRun);
    }, 5000);
    return () => clearInterval(t);
  }, [runs, selectedRun]);

  const launch = async () => {
    setLaunching(true);
    const { data, error } = await supabase.functions.invoke("stress-matrix-runner", {
      body: { family },
    });
    setLaunching(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Run lanzado: ${(data as any)?.total_cases} casos`);
    setTimeout(() => { loadRuns(); }, 1000);
  };

  // Heatmap aggregation: scope × model.
  const heatmap: Record<string, Record<string, { pass: number; fail: number; error: number; total: number }>> = {};
  for (const r of results) {
    const m = r.model_filter ?? "multi";
    heatmap[r.scope] ??= {};
    heatmap[r.scope][m] ??= { pass: 0, fail: 0, error: 0, total: 0 };
    heatmap[r.scope][m].total++;
    if (r.status === "pass") heatmap[r.scope][m].pass++;
    else if (r.status === "fail") heatmap[r.scope][m].fail++;
    else if (r.status === "error") heatmap[r.scope][m].error++;
  }
  const scopes = Object.keys(heatmap).sort();

  const cellColor = (cell?: { pass: number; fail: number; error: number; total: number }) => {
    if (!cell || cell.total === 0) return "bg-muted/30 text-muted-foreground";
    if (cell.error > 0) return "bg-orange-500/30 text-orange-50";
    if (cell.fail > 0) return "bg-red-500/40 text-red-50";
    return "bg-emerald-500/40 text-emerald-50";
  };

  return (
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
            <Button variant="outline" onClick={() => { loadRuns(); if (selectedRun) loadResults(selectedRun); }} className="gap-2">
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
          <Card>
            <CardHeader>
              <CardTitle>Heatmap subsector × modelo</CardTitle>
            </CardHeader>
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
                        return (
                          <td key={m} className={`px-2 py-1 text-center ${cellColor(cell)}`}>
                            {cell ? `${cell.pass}/${cell.total}` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Resultados {loading && <Loader2 className="h-4 w-4 animate-spin" />}
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
                    <TableHead>Asserts fallados</TableHead>
                    <TableHead className="text-right">Latencia</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
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
                        {(r.asserts_failed ?? []).map((a) => (
                          <Badge key={a.id} variant="outline" className="mr-1 mb-1 text-[10px]">{a.id}</Badge>
                        ))}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">{r.latency_ms ?? "—"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setDrillOpen(r)}>Detalle</Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
          {drillOpen && (
            <div className="space-y-3 text-sm">
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
              {drillOpen.error_message && (
                <div className="p-3 bg-orange-500/10 rounded text-xs">{drillOpen.error_message}</div>
              )}
              <pre className="p-3 bg-muted rounded text-xs whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                {drillOpen.response_markdown ?? "(sin respuesta)"}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}