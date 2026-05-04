import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateSkillOutput, scrubCitedSourcesMarker } from "./outputGuard.ts";

const LONG = "x".repeat(500);

Deno.test("[outputGuard] empty output → EMPTY_OUTPUT error", () => {
  const r = validateSkillOutput("");
  assertEquals(r.ok, false);
  assert(r.issues.some((i) => i.code === "EMPTY_OUTPUT"));
});

Deno.test("[outputGuard] short output → TRUNCATED_OUTPUT error", () => {
  const r = validateSkillOutput("contenido corto");
  assertEquals(r.ok, false);
  assert(r.issues.some((i) => i.code === "TRUNCATED_OUTPUT"));
});

Deno.test("[outputGuard] literal marker leak detected", () => {
  const txt = LONG + "<!--CITEDSOURCESHERE-->";
  const r = validateSkillOutput(txt);
  assertEquals(r.ok, false);
  assert(r.issues.some((i) => i.code === "MARKER_NOT_STRIPPED"));
});

Deno.test("[outputGuard] anti-mediana wording flagged", () => {
  const txt = LONG + " La mediana del RIX del IBEX-35 es 70.";
  const r = validateSkillOutput(txt);
  assert(r.issues.some((i) => i.code === "CONSOLIDATED_AVERAGE"));
});

Deno.test("[outputGuard] anti-mediana variant 'media inter-modelo' flagged", () => {
  const txt = LONG + " La media inter-modelo del sector es alta.";
  const r = validateSkillOutput(txt);
  assert(r.issues.some((i) => i.code === "CONSOLIDATED_AVERAGE"));
});

Deno.test("[outputGuard] clean output passes", () => {
  const txt = LONG + " RIX de referencia: rango 62-78 entre los seis modelos.";
  const r = validateSkillOutput(txt);
  assertEquals(r.ok, true);
});

Deno.test("[outputGuard] requireSection7 warning when missing", () => {
  const r = validateSkillOutput(LONG, { requireSection7: true });
  assert(r.issues.some((i) => i.code === "MISSING_SECTION_7"));
});

Deno.test("[outputGuard] scrubCitedSourcesMarker removes literal marker", () => {
  const out = scrubCitedSourcesMarker("hello <!--CITEDSOURCESHERE--> world");
  assertEquals(out.scrubbed, true);
  assertEquals(out.text, "hello  world");
});

Deno.test("[outputGuard] scrubCitedSourcesMarker idempotent on clean text", () => {
  const out = scrubCitedSourcesMarker("nothing to scrub");
  assertEquals(out.scrubbed, false);
});