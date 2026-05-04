import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { __test__ } from "./orchestrator.ts";

const { MULTI_SECTOR_THESAURUS } = __test__;

function findLabel(question: string): string | null {
  for (const { re, label } of MULTI_SECTOR_THESAURUS) {
    if (re.test(question)) return label;
  }
  return null;
}

Deno.test("[orchestrator] thesaurus matches 'energía'", () => {
  assertEquals(findLabel("ranking sector energía"), "energía");
});

Deno.test("[orchestrator] thesaurus matches 'retail' and 'gran consumo'", () => {
  assertEquals(findLabel("top retail"), "retail");
  assertEquals(findLabel("ranking gran consumo"), "retail");
});

Deno.test("[orchestrator] thesaurus matches utilities → energía sectors", () => {
  const m = MULTI_SECTOR_THESAURUS.find((x) => x.label === "utilities")!;
  assert(m.re.test("ranking utilities"));
  assert(m.sectors.includes("Energía y Gas"));
});

Deno.test("[orchestrator] thesaurus matches 'tecnología' and 'telecos'", () => {
  assertEquals(findLabel("ranking tecnología"), "tecnología/telecos");
  assertEquals(findLabel("comparativa telecos"), "tecnología/telecos");
});

Deno.test("[orchestrator] thesaurus matches 'turismo' and 'aerolíneas'", () => {
  assertEquals(findLabel("top turismo"), "turismo");
  assertEquals(findLabel("ranking aerolíneas"), "turismo");
});

Deno.test("[orchestrator] thesaurus matches 'construcción' and 'infraestructuras'", () => {
  assertEquals(findLabel("top construcción"), "construcción");
  assertEquals(findLabel("ranking infraestructuras"), "construcción");
});

Deno.test("[orchestrator] thesaurus matches 'salud' and 'farma'", () => {
  assertEquals(findLabel("ranking salud"), "salud/farma");
  assertEquals(findLabel("top farmacéuticas"), "salud/farma");
});

Deno.test("[orchestrator] thesaurus matches 'seguros' and 'aseguradoras'", () => {
  assertEquals(findLabel("ranking seguros"), "seguros");
  assertEquals(findLabel("top aseguradoras"), "seguros");
});

Deno.test("[orchestrator] thesaurus matches 'materias primas' and 'siderurgia'", () => {
  assertEquals(findLabel("ranking materias primas"), "materias primas");
  assertEquals(findLabel("top siderurgia"), "materias primas");
});

Deno.test("[orchestrator] thesaurus matches 'alimentación'", () => {
  assertEquals(findLabel("ranking alimentación"), "alimentación");
});

Deno.test("[orchestrator] thesaurus does NOT match unrelated query", () => {
  assertEquals(findLabel("analiza Iberdrola"), null);
});