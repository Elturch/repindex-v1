import { useState } from "react";
import { SKILLS_REGISTRY, type RixSkill } from "@/lib/rixSkills";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, Loader2 } from "lucide-react";

const layerColors: Record<string, string> = {
  data: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  logic: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  presentation: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  beta: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  disabled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const sampleInputs: Record<string, string> = {
  skillGetCompanyScores: '{"ticker": "TEF.MC"}',
  skillGetCompanyRanking: '{"top_n": 10}',
  skillGetCompanyEvolution: '{"ticker": "TEF.MC", "weeks_back": 4}',
  skillGetCompanyDetail: '{"ticker": "TEF.MC"}',
  skillGetSectorComparison: '{"sector_category": "Banca"}',
  skillGetDivergenceAnalysis: '{"ticker": "TEF.MC"}',
  skillGetRawTexts: '{"ticker": "TEF.MC"}',
  skillInterpretQuery: '{"question": "¿Cómo está Telefónica en el ranking del IBEX 35?"}',
};

export default function SkillsAdmin() {
  const [testSkill, setTestSkill] = useState<RixSkill | null>(null);
  const [inputJson, setInputJson] = useState("");
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);

  const skills = Array.from(SKILLS_REGISTRY.values());

  const openTest = (skill: RixSkill) => {
    setTestSkill(skill);
    setInputJson(sampleInputs[skill.id] || "{}");
    setOutput("");
  };

  const runTest = async () => {
    if (!testSkill) return;
    setRunning(true);
    setOutput("");
    try {
      const params = JSON.parse(inputJson);
      const start = Date.now();
      const result = await testSkill.execute(params, supabase);
      const elapsed = Date.now() - start;
      setOutput(JSON.stringify({ ...result, _elapsed_ms: elapsed }, null, 2));
    } catch (e: unknown) {
      setOutput(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }, null, 2));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span className="text-2xl">🧠</span>
              Skills Registry — Phase 1
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {skills.length} skills registered · {skills.filter((s) => s.status === "active").length} active
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Layer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead className="text-right">Test</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skills.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell className="font-mono text-sm">{skill.id}</TableCell>
                    <TableCell>
                      <Badge className={layerColors[skill.layer]} variant="outline">
                        {skill.layer}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[skill.status]} variant="outline">
                        {skill.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                      {skill.description}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openTest(skill)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Test
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Test Dialog */}
        <Dialog open={!!testSkill} onOpenChange={(open) => !open && setTestSkill(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Test: {testSkill?.id}</DialogTitle>
              <DialogDescription>{testSkill?.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Input JSON</label>
                <Textarea
                  value={inputJson}
                  onChange={(e) => setInputJson(e.target.value)}
                  className="font-mono text-xs mt-1"
                  rows={4}
                />
              </div>

              <Button onClick={runTest} disabled={running} className="w-full">
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Execute Skill
                  </>
                )}
              </Button>

              {output && (
                <div>
                  <label className="text-sm font-medium">Output</label>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                    {output}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
