import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeDrift, IBEX35_EXPECTED_COUNT, assertIbex35Invariant } from "./ibexInvariant.ts";

const CANON_35 = [
  "ABE.MC","ACS","ACX","AENA","AMS","ANA","ANE.MC","BBVA","BKT","CABK",
  "CLNX","COL","ELE","ENG","FER","GCO.MC","IAG","IBE","IDR","ITX",
  "LOG","MAP","MRL","MTS","NTGY","PUIG","RED","REP","ROVI","SAB",
  "SAN","SCYR","SLR","TEF","UNI",
];

Deno.test("computeDrift: exact 35 reports ok=true, drift=0", () => {
  const r = computeDrift(CANON_35);
  assertEquals(r.ok, true);
  assertEquals(r.actual, 35);
  assertEquals(r.drift, 0);
  assertEquals(r.expected, IBEX35_EXPECTED_COUNT);
});

Deno.test("computeDrift: 37 (over) reports +2 drift", () => {
  const r = computeDrift([...CANON_35, "GRF", "FDR"]);
  assertEquals(r.ok, false);
  assertEquals(r.drift, 2);
});

Deno.test("computeDrift: 33 (under) reports -2 drift", () => {
  const r = computeDrift(CANON_35.slice(0, 33));
  assertEquals(r.ok, false);
  assertEquals(r.drift, -2);
});

Deno.test("computeDrift: empty list reports -35 drift", () => {
  const r = computeDrift([]);
  assertEquals(r.ok, false);
  assertEquals(r.actual, 0);
  assertEquals(r.drift, -35);
});

Deno.test("assertIbex35Invariant: integration with mock supabase returns ok when 35", async () => {
  const mockSupabase = {
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_col: string, _val: string) => Promise.resolve({
          data: CANON_35.map((t) => ({ ticker: t })),
          error: null,
        }),
      }),
    }),
  };
  const r = await assertIbex35Invariant(mockSupabase, "test");
  assert(r.ok);
  assertEquals(r.actual, 35);
  assertEquals(r.drift, 0);
});