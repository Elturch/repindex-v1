import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeLastClosedSundayPure, formatSundayLabel } from "./sundayResolver.ts";
import { MATRIX } from "./sundayResolver_matrix.ts";

for (const [label, isoNow, expectedSunday, expectedInProgress] of MATRIX) {
  Deno.test(`[deno] sundayResolver: ${label}`, () => {
    const r = computeLastClosedSundayPure(new Date(isoNow as string));
    assertEquals(r.sundayISO, expectedSunday);
    assertEquals(r.sweepInProgress, expectedInProgress);
  });
}

Deno.test("[deno] formatSundayLabel basic", () => {
  assertEquals(formatSundayLabel("2026-05-03"), "Semana del 3 may 2026");
  assertEquals(formatSundayLabel("2026-05-03", true), "Semana del 3 may 2026 (barrido en curso)");
});