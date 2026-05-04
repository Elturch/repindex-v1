import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { __test__ } from "./entityResolver.ts";

const { tryHardcodedAlias, HARDCODED_ALIAS_MAP } = __test__;

Deno.test("[entityResolver] 'Caixa' → CABK", () => {
  assertEquals(tryHardcodedAlias("Analiza Caixa")?.ticker, "CABK");
});

Deno.test("[entityResolver] 'Santander' → SAN", () => {
  assertEquals(tryHardcodedAlias("Cómo va Santander")?.ticker, "SAN");
});

Deno.test("[entityResolver] 'Telefónica' → TEF", () => {
  assertEquals(tryHardcodedAlias("Analiza Telefónica")?.ticker, "TEF");
});

Deno.test("[entityResolver] 'Movistar' → TEF (Telefónica)", () => {
  assertEquals(tryHardcodedAlias("reputación de Movistar")?.ticker, "TEF");
});

Deno.test("[entityResolver] 'Zara' → ITX (Inditex)", () => {
  assertEquals(tryHardcodedAlias("ranking de Zara")?.ticker, "ITX");
});

Deno.test("[entityResolver] 'Inditex' → ITX", () => {
  assertEquals(tryHardcodedAlias("Analiza Inditex")?.ticker, "ITX");
});

Deno.test("[entityResolver] BBVA / Iberdrola / Endesa / Repsol / Mapfre / Ferrovial / ACS / AENA / Naturgy mapped", () => {
  const cases: Array<[string, string]> = [
    ["Analiza BBVA", "BBVA"],
    ["reputación Iberdrola", "IBE"],
    ["analiza Endesa", "ELE"],
    ["analiza Repsol", "REP"],
    ["analiza Mapfre", "MAP"],
    ["analiza Ferrovial", "FER"],
    ["analiza ACS", "ACS"],
    ["analiza Aena", "AENA"],
    ["analiza Naturgy", "NTGY"],
  ];
  for (const [q, t] of cases) {
    assertEquals(tryHardcodedAlias(q)?.ticker, t, `query="${q}"`);
  }
});

Deno.test("[entityResolver] 'la caixa' (multi-token) prefers CABK", () => {
  assertEquals(tryHardcodedAlias("histórico de la caixa")?.ticker, "CABK");
});

Deno.test("[entityResolver] unrelated query returns null", () => {
  assertEquals(tryHardcodedAlias("¿qué tal el tiempo en Madrid?"), null);
});

Deno.test("[entityResolver] alias map all values reference valid ticker shape", () => {
  for (const [k, v] of Object.entries(HARDCODED_ALIAS_MAP)) {
    assert(v.ticker && v.ticker.length >= 2, `alias "${k}" missing ticker`);
    assert(v.name && v.name.length > 0, `alias "${k}" missing name`);
  }
});