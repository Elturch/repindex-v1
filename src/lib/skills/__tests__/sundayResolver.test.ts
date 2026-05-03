import { describe, it, expect } from "vitest";
import { computeLastClosedSundayPure, formatSundayLabel } from "../sundayResolver";
// Import the literal matrix shared with the Deno test. Path-only import,
// no Deno runtime needed at compile time.
import { MATRIX } from "../../../../supabase/functions/_shared/sundayResolver_matrix";

describe("sundayResolver — frontend wrapper matches Deno canonical", () => {
  for (const [label, isoNow, expectedSunday, expectedInProgress] of MATRIX) {
    it(`[vitest] ${label}`, () => {
      const r = computeLastClosedSundayPure(new Date(isoNow as string));
      expect(r.sundayISO).toBe(expectedSunday);
      expect(r.sweepInProgress).toBe(expectedInProgress);
    });
  }

  it("formatSundayLabel matches canonical strings", () => {
    expect(formatSundayLabel("2026-05-03")).toBe("Semana del 3 may 2026");
    expect(formatSundayLabel("2026-05-03", true)).toBe("Semana del 3 may 2026 (barrido en curso)");
  });
});