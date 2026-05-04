import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkTemporal } from "./temporalGuard.ts";

const baseTemporal = {
  from: "2026-01-05",
  to: "2026-01-26",
  snapshots_available: 4,
  snapshots_expected: 4,
  coverage_ratio: 1,
  requested_label: "enero 2026",
} as any;

Deno.test("[temporalGuard] predictive 'cómo será' rejected", () => {
  const r = checkTemporal(baseTemporal, "¿Cómo será la reputación de Iberdrola?");
  assertEquals(r.pass, false);
  assert(r.reply!.toLowerCase().includes("futuro"));
});

Deno.test("[temporalGuard] predictive far-future year rejected", () => {
  const r = checkTemporal(baseTemporal, "Reputación esperada en 2030");
  assertEquals(r.pass, false);
});

Deno.test("[temporalGuard] no snapshots → reject", () => {
  const r = checkTemporal({ ...baseTemporal, snapshots_available: 0 }, "histórico");
  assertEquals(r.pass, false);
  assert(r.reply!.toLowerCase().includes("no hay datos"));
});

Deno.test("[temporalGuard] partial coverage → pass with warning", () => {
  const r = checkTemporal(
    { ...baseTemporal, snapshots_available: 2, snapshots_expected: 4, coverage_ratio: 0.5 },
    "histórico",
  );
  assertEquals(r.pass, true);
  assert((r.warnings ?? []).some((w) => w.toLowerCase().includes("cobertura parcial")));
});

Deno.test("[temporalGuard] full coverage past window passes clean", () => {
  const r = checkTemporal(baseTemporal, "evolución pasada de Iberdrola");
  assertEquals(r.pass, true);
  assertEquals(r.warnings, undefined);
});

Deno.test("[temporalGuard] question without future verbs passes", () => {
  const r = checkTemporal(baseTemporal, "Analiza la reputación actual de Iberdrola");
  assertEquals(r.pass, true);
});